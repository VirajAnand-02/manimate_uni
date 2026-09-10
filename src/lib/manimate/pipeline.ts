import fs from 'fs/promises';
import path from 'path';
import type { ManimateJobRequest } from '@/src/types/manimate';
import { finishActiveJob, startActiveJob } from './activeJobs';
import { completeJob, patchMetadata, updateStage, writeLecturePlan, finishJob } from './jobStore';
import { fetchWebResearch } from './webResearch';
import { generateLecturePlan, generateManimForModule, resolveProviderAndModel } from './llm';
import {
  ensureJobManimConfig,
  renderModule,
  type FailedScene,
  type RenderedScene,
  type SceneOutput,
} from './manim';
import { generateTtsAudio, prewarmTts } from './tts';
import { addSilentAudio, muxVoiceover, stitchFinal } from './video';
import { acquireJobSlot, releaseJobSlot } from './queue';
import { uploadArtifact, uploadDirectory } from './storage';
import { ensureJobWorkDir, jobWorkDir, removeJobWorkDir, sanitizeSegment } from './workspace';
import { createLimiter, llmConcurrency, pool, renderConcurrency, ttsConcurrency } from './concurrency';

/** Progress `detail.log` arrays are rewritten on every tick; keep them bounded. */
const MAX_LOG_LINES = 200;

function tailLog(lines: string[]) {
  if (lines.length <= MAX_LOG_LINES) return lines;
  return [`... ${lines.length - MAX_LOG_LINES} earlier entries omitted ...`, ...lines.slice(-MAX_LOG_LINES)];
}

function getSceneList(lecturePlan: any): SceneOutput[] {
  const outputs: SceneOutput[] = [];
  for (const [moduleOffset, module] of (lecturePlan.modules || []).entries()) {
    const moduleIndex = moduleOffset + 1;
    for (const scene of module.scenes || []) {
      outputs.push({
        module_index: moduleIndex,
        scene_id: String(scene.id || `scene_${outputs.length + 1}`),
        scene,
        code: '',
      });
    }
  }
  return outputs;
}

function recalculateSceneDurations(lecturePlan: any) {
  let totalSeconds = 0;
  for (const module of lecturePlan.modules || []) {
    let moduleSeconds = 0;
    for (const scene of module.scenes || []) {
      const voiceover = String(scene.voiceover || '').trim();
      if (voiceover) {
        // ~15 characters per second spoken, plus a 3-second comfortable viewing/transition buffer
        const spokenDuration = Math.ceil(voiceover.length / 15) + 3;
        scene.durationSeconds = Math.max(5, Math.min(45, spokenDuration));
      } else {
        scene.durationSeconds = Math.max(5, Number(scene.durationSeconds || 5));
      }
      moduleSeconds += scene.durationSeconds;
    }
    module.durationMinutes = Math.round((moduleSeconds / 60) * 10) / 10 || 1;
    totalSeconds += moduleSeconds;
  }
  lecturePlan.totalMinutes = Math.round((totalSeconds / 60) * 10) / 10 || 1;
}

function normalizeSceneId(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function findPlannedScene(module: any, generatedSceneId: unknown, generatedIndex: number) {
  const scenes = Array.isArray(module.scenes) ? module.scenes : [];
  const generated = normalizeSceneId(generatedSceneId);
  const exact = scenes.find((scene: any) => normalizeSceneId(scene.id) === generated);
  if (exact) return exact;

  const prefix = scenes.find((scene: any) => {
    const planned = normalizeSceneId(scene.id);
    return planned && (generated.startsWith(`${planned}_`) || generated.startsWith(`${planned}-`));
  });
  if (prefix) return prefix;

  return scenes[generatedIndex] || null;
}

/** Identifies a *planned* scene, which is where voiceover text comes from. */
function voiceKey(moduleIndex: number, planSceneId: unknown) {
  return `${moduleIndex}::${normalizeSceneId(planSceneId)}`;
}

function normalizeRequest(input: Partial<ManimateJobRequest>): ManimateJobRequest {
  return {
    topic: String(input.topic || '').trim(),
    model: input.model || process.env.MANIMATE_MODEL || 'mistral-large-2512',
    model_provider: (input.model_provider || process.env.MANIMATE_MODEL_PROVIDER || 'mistralai') as ManimateJobRequest['model_provider'],
    topic_depth: input.topic_depth || 'normal',
    max_correction_attempts: Number(input.max_correction_attempts ?? process.env.MAX_CORRECTION_ATTEMPTS ?? 3),
    render_timeout_per_scene: Number(input.render_timeout_per_scene ?? process.env.RENDER_TIMEOUT_SECONDS ?? 180),
    skip_voiceovers: Boolean(input.skip_voiceovers ?? false),
    tts_voice: input.tts_voice,
    tts_lang: input.tts_lang,
    tts_timeout: Number(input.tts_timeout ?? 120),
    tts_poll_seconds: Number(input.tts_poll_seconds ?? 5),
    llm_timeout: Number(input.llm_timeout ?? process.env.LLM_TIMEOUT_SECONDS ?? 180),
    skip_websearch: Boolean(input.skip_websearch ?? false),
    websearch_results: input.websearch_results,
  };
}

export async function runPipeline(
  jobId: string,
  userId: string,
  rawRequest: Partial<ManimateJobRequest>,
) {
  const request = normalizeRequest(rawRequest);
  const baseDir = jobWorkDir(jobId);
  const active = startActiveJob(jobId);
  let acquired = false;

  try {
    await acquireJobSlot();
    acquired = true;
    if (active.controller.signal.aborted) throw new Error('Job cancelled');
    await patchMetadata(jobId, {
      status: 'running',
      started_at: new Date().toISOString(),
      options: request,
    });

    await ensureJobWorkDir(jobId);
    // Shares Manim's LaTeX/text caches across every scene in this job.
    await ensureJobManimConfig(baseDir);

    // The Kokoro weights take seconds to load and used to do it on the first
    // voiceover — i.e. the instant rendering finished. Start it now instead.
    if (!request.skip_voiceovers) prewarmTts();

    await updateStage(jobId, 'web_research', { status: 'running', message: 'Collecting optional Tavily context...', pct: 15 });
    let webContext: string | null = null;
    if (!request.skip_websearch) {
      webContext = await fetchWebResearch(request.topic, active.controller.signal).catch(() => null);
    }
    await updateStage(jobId, 'web_research', {
      status: webContext ? 'done' : 'skipped',
      message: webContext ? 'Web research context collected.' : 'Web research skipped or unavailable.',
      pct: 100,
      detail: { found: Boolean(webContext), chars: webContext?.length || 0 },
    });

    await updateStage(jobId, 'lecture_planning', { status: 'running', message: 'Generating lecture plan...', pct: 20 });
    const llmOptions = resolveProviderAndModel(request.model_provider, request.model);
    const lecturePlan = await generateLecturePlan(request.topic, request.topic_depth || 'normal', webContext, llmOptions, active.controller.signal);

    // Normalize scene durations dynamically to match voiceover spoken duration and avoid long silent freezes
    recalculateSceneDurations(lecturePlan);

    const plannedScenes = getSceneList(lecturePlan);
    if (!lecturePlan.modules?.length || !plannedScenes.length) {
      throw new Error('Lecture planner returned no modules or scenes.');
    }
    await writeLecturePlan(jobId, lecturePlan);
    await updateStage(jobId, 'lecture_planning', {
      status: 'done',
      message: `Lecture plan generated: ${lecturePlan.modules.length} modules, ${plannedScenes.length} scenes.`,
      pct: 100,
      detail: {
        modules: lecturePlan.modules.length,
        scenes: plannedScenes.length,
        total_minutes: lecturePlan.totalMinutes,
        module_titles: lecturePlan.modules.map((module: any) => String(module.title || 'Untitled')),
        plan_scenes: plannedScenes.map((s: any) => ({
          module_index: s.module_index,
          scene_id: s.scene_id,
          has_voiceover: Boolean(String(s.scene?.voiceover || '').trim()),
          voiceover_len: String(s.scene?.voiceover || '').length,
          title: String(s.scene?.sceneTitle || s.scene?.title || ''),
        })),
      },
    });

    // ─── Voiceover synthesis starts HERE, not after rendering ──────────
    // TTS input is the plan's voiceover text; it has no dependency on the
    // rendered video — only the mux does. Running it alongside code generation
    // and rendering takes a whole stage off the critical path.
    const ttsJobs = new Map<string, Promise<{ file_path: string }>>();
    if (!request.skip_voiceovers) {
      const ttsLimit = createLimiter(ttsConcurrency());
      for (const planned of plannedScenes) {
        const text = String(planned.scene?.voiceover || '').trim();
        if (!text) continue;
        const key = voiceKey(planned.module_index, planned.scene?.id ?? planned.scene_id);
        const task = ttsLimit(() => {
          if (active.controller.signal.aborted) throw new Error('Job cancelled');
          return generateTtsAudio(text, {
            voice: request.tts_voice,
            fileBase: `module_${planned.module_index}_${sanitizeSegment(String(planned.scene?.id ?? planned.scene_id))}`,
            outputDir: path.join(baseDir, 'tts'),
          });
        });
        // Awaited in the voiceover stage below; this only marks it handled so a
        // failure before then is not an unhandled rejection.
        task.catch(() => {});
        ttsJobs.set(key, task);
      }
    }

    // ─── Code generation: modules are independent ──────────────────────
    await updateStage(jobId, 'code_generation', { status: 'running', message: 'Generating Manim scene code...', pct: 5 });
    const codeGenLog: string[] = [];
    const codeDir = path.join(baseDir, 'scene_code');
    await fs.mkdir(codeDir, { recursive: true });

    const modules: any[] = lecturePlan.modules;
    let modulesGenerated = 0;
    const codeResults = await pool(modules, llmConcurrency(), async (module, moduleOffset) => {
      const moduleIndex = moduleOffset + 1;
      const result = await generateManimForModule(lecturePlan, moduleIndex, module, llmOptions, active.controller.signal);
      modulesGenerated += 1;
      await updateStage(jobId, 'code_generation', {
        status: 'running',
        message: `Generated code for ${modulesGenerated}/${modules.length} modules...`,
        pct: Math.min(100, Math.round((modulesGenerated / modules.length) * 100)),
        detail: { modules_generated: modulesGenerated, modules_total: modules.length, code_dir: codeDir },
      }).catch(() => { /* progress is advisory */ });
      return result;
    });

    // Rebuilt in module order so scene ordering never depends on completion order.
    const sceneOutputs: SceneOutput[] = [];
    for (const [moduleOffset, module] of modules.entries()) {
      const moduleIndex = moduleOffset + 1;
      const outcome = codeResults[moduleOffset];
      if (!outcome.ok) {
        codeGenLog.push(`module_${moduleIndex}: code generation FAILED — ${outcome.error instanceof Error ? outcome.error.message.slice(0, 200) : 'unknown'}`);
        continue;
      }
      for (const [generatedIndex, item] of ((outcome.value as any).scenes || []).entries()) {
        const scene = findPlannedScene(module, item.scene_id, generatedIndex);
        const matched = scene ? `matched to plan scene "${scene.id}"` : `no match in plan (index ${generatedIndex})`;
        codeGenLog.push(`module_${moduleIndex}/${item.scene_id}: ${matched}${scene?.voiceover ? ' [has VO]' : ' [no VO]'}`);
        sceneOutputs.push({
          module_index: moduleIndex,
          // scene_id comes straight from LLM JSON and becomes part of a filename,
          // so it must not be allowed to contain path separators.
          scene_id: sanitizeSegment(item.scene_id, `scene_${generatedIndex + 1}`),
          scene: scene || {},
          code: String(item.code || ''),
        });
      }
    }

    if (!sceneOutputs.length) throw new Error('Manim generator returned no scene code.');
    await updateStage(jobId, 'code_generation', {
      status: 'done',
      message: `Generated code for ${sceneOutputs.length} scenes.`,
      pct: 100,
      detail: { scenes_generated: sceneOutputs.length, code_dir: codeDir, pct: 100, log: tailLog(codeGenLog) },
    });

    // ─── Rendering: one Manim process per module, modules in parallel ───
    await updateStage(jobId, 'rendering', { status: 'running', message: `Rendering ${sceneOutputs.length} scenes...`, pct: 0 });

    const byModule = new Map<number, SceneOutput[]>();
    for (const output of sceneOutputs) {
      const list = byModule.get(output.module_index) || [];
      list.push(output);
      byModule.set(output.module_index, list);
    }
    const moduleGroups = [...byModule.entries()].sort((a, b) => a[0] - b[0]);

    const rendered: RenderedScene[] = [];
    const failedScenes: FailedScene[] = [];
    const renderLog: string[] = [];
    let settled = 0;

    const emitRenderProgress = () => {
      const pct = Math.round((settled / sceneOutputs.length) * 100);
      return updateStage(jobId, 'rendering', {
        status: 'running',
        message: `Rendered ${settled}/${sceneOutputs.length} scenes.`,
        pct,
        detail: { total: sceneOutputs.length, settled, pct },
      }).catch(() => { /* progress is advisory; never fail a render over it */ });
    };

    const moduleResults = await pool(moduleGroups, renderConcurrency(), async ([moduleIndex, scenes]) =>
      renderModule(
        jobId,
        moduleIndex,
        scenes,
        baseDir,
        request.max_correction_attempts || 3,
        request.render_timeout_per_scene || 180,
        llmOptions,
        active.controller.signal,
        () => { settled += 1; void emitRenderProgress(); },
      ));

    for (const [groupIndex, [moduleIndex]] of moduleGroups.entries()) {
      const outcome = moduleResults[groupIndex];
      if (!outcome.ok) {
        renderLog.push(`module_${moduleIndex}: render FAILED — ${outcome.error instanceof Error ? outcome.error.message.slice(0, 200) : 'unknown'}`);
        continue;
      }
      const { rendered: ok, failed, batched } = outcome.value;
      renderLog.push(`module_${moduleIndex}: ${batched ? 'batched into one Manim process' : 'rendered per scene'} — ${ok.length} ok, ${failed.length} failed`);
      for (const item of ok) renderLog.push(`module_${item.module_index}/${item.scene_id}: OK (corrections: ${item.corrections})`);
      for (const item of failed) renderLog.push(`module_${item.module_index}/${item.scene_id}: FAILED after ${item.corrections} correction(s) — ${item.error.slice(0, 200)}`);
      rendered.push(...ok);
      failedScenes.push(...failed.map((item) => ({ ...item, error: item.error.slice(0, 800) })));
    }

    // Completion order is nondeterministic under concurrency; restore plan order.
    rendered.sort((a, b) => a.module_index - b.module_index);

    const totalCorrections =
      rendered.reduce((n, r) => n + r.corrections, 0) + failedScenes.reduce((n, f) => n + f.corrections, 0);

    if (!rendered.length) throw new Error(`No scenes rendered successfully. First error: ${failedScenes[0]?.error || 'unknown'}`);
    await updateStage(jobId, 'rendering', {
      status: 'done',
      message: `Rendered ${rendered.length}/${sceneOutputs.length} scenes.`,
      pct: 100,
      detail: {
        total: sceneOutputs.length,
        rendered: rendered.length,
        failed: failedScenes.length,
        corrections: totalCorrections,
        pct: 100,
        failed_scenes: failedScenes.slice(-50),
        log: tailLog(renderLog),
      },
    });

    // ─── Voiceover: collect the audio started earlier, then mux ─────────
    const moduleVideos = new Map<number, string[]>();
    const withAudio: RenderedScene[] = [];
    const withoutAudio: RenderedScene[] = [];
    const finalVideoFor = new Map<RenderedScene, string>();

    if (request.skip_voiceovers) {
      for (const item of rendered) finalVideoFor.set(item, item.video);
      await updateStage(jobId, 'voiceover', { status: 'skipped', message: 'Voiceovers skipped.', pct: 100, detail: { total: rendered.length, ok: 0, failed: 0, skipped: rendered.length, pct: 100 } });
    } else {
      await updateStage(jobId, 'voiceover', { status: 'running', message: 'Muxing Kokoro voiceovers...', pct: 0 });
      let ok = 0;
      let failed = 0;
      let skipped = 0;
      let done = 0;
      const voLog: string[] = [];

      await pool(rendered, ttsConcurrency(), async (item) => {
        const scopedir = `module_${item.module_index}/${item.scene_id}`;
        const task = ttsJobs.get(voiceKey(item.module_index, item.scene?.id));
        const voiceover = String(item.scene?.voiceover || '').trim();

        if (!task || !voiceover) {
          skipped += 1;
          finalVideoFor.set(item, item.video);
          withoutAudio.push(item);
          voLog.push(`${scopedir}: SKIPPED — ${item.scene?.id ? 'plan scene has no voiceover text' : 'no matching plan scene found'}`);
        } else {
          try {
            const audio = await task;
            const muxed = await muxVoiceover(
              jobId,
              item.video,
              audio.file_path,
              path.join(baseDir, 'voiceover_videos', `module_${item.module_index}_${item.scene_id}_vo.mp4`),
            );
            finalVideoFor.set(item, muxed);
            withAudio.push(item);
            ok += 1;
            voLog.push(`${scopedir}: OK (vo_chars: ${voiceover.length})`);
          } catch (err) {
            failed += 1;
            finalVideoFor.set(item, item.video);
            withoutAudio.push(item);
            voLog.push(`${scopedir}: FAILED (vo_chars: ${voiceover.length}) — ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`);
          }
        }

        done += 1;
        const pct = Math.round((done / rendered.length) * 100);
        await updateStage(jobId, 'voiceover', {
          status: 'running',
          message: `Muxed ${ok}/${rendered.length} voiceovers.`,
          pct,
          detail: { total: rendered.length, ok, failed, skipped, pct, log: tailLog(voLog) },
        }).catch(() => { /* advisory */ });
      });

      // The concat demuxer copies streams, so every input has to agree on layout.
      // Mixing silent scenes with voiced ones otherwise yields a file that drops
      // audio partway through — or refuses to concat at all.
      if (withAudio.length && withoutAudio.length) {
        await pool(withoutAudio, ttsConcurrency(), async (item) => {
          try {
            const padded = await addSilentAudio(
              jobId,
              item.video,
              path.join(baseDir, 'voiceover_videos', `module_${item.module_index}_${item.scene_id}_silent.mp4`),
            );
            finalVideoFor.set(item, padded);
          } catch (err) {
            voLog.push(`module_${item.module_index}/${item.scene_id}: silent-track add failed — ${err instanceof Error ? err.message.slice(0, 160) : 'unknown'}`);
          }
        });
      }

      await updateStage(jobId, 'voiceover', {
        status: 'done',
        message: `Voiceover complete: ${ok} ok, ${failed} failed, ${skipped} skipped.`,
        pct: 100,
        detail: { total: rendered.length, ok, failed, skipped, pct: 100, log: tailLog(voLog) },
      });
    }

    for (const item of rendered) {
      const list = moduleVideos.get(item.module_index) || [];
      list.push(finalVideoFor.get(item) ?? item.video);
      moduleVideos.set(item.module_index, list);
    }

    await updateStage(jobId, 'stitching', { status: 'running', message: 'Stitching final video...', pct: 30 });
    const finalVideo = await stitchFinal(jobId, moduleVideos, baseDir);
    let finalSizeMb = 0;
    try { const s = await fs.stat(finalVideo); finalSizeMb = Math.round(s.size / (1024 * 1024) * 10) / 10; } catch { /* ignore */ }

    await updateStage(jobId, 'stitching', { status: 'running', message: 'Uploading final video...', pct: 70 });
    const storageKey = await uploadArtifact(userId, jobId, 'video.mp4', finalVideo, 'video/mp4');
    // Generated Python is small and useful for debugging a bad render; a failed
    // upload here is logged and ignored rather than failing a finished job.
    await uploadDirectory(userId, jobId, codeDir, 'scene_code', 'text/x-python');

    await updateStage(jobId, 'stitching', {
      status: 'done',
      message: 'Final video ready.',
      pct: 100,
      detail: { final_video: `/api/generate/${jobId}/video`, modules_stitched: moduleVideos.size, size_mb: finalSizeMb },
    });

    await completeJob(jobId, storageKey);
    return storageKey;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJob(jobId, 'failed', message);
    throw error;
  } finally {
    if (acquired) releaseJobSlot();
    finishActiveJob(jobId);
    // Scratch only — the video and scene code now live in Supabase Storage.
    await removeJobWorkDir(jobId);
  }
}
