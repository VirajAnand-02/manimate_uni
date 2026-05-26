import fs from 'fs/promises';
import path from 'path';
import type { ManimateJobRequest } from '@/src/types/manimate';
import { finishActiveJob, startActiveJob } from './activeJobs';
import { jobDir, patchMetadata, updateStage, writeMetadata, readMetadata, finishJob } from './jobStore';
import { fetchWebResearch } from './webResearch';
import { generateLecturePlan, generateManimForModule, resolveProviderAndModel } from './llm';
import { renderSceneWithCorrections, type SceneOutput } from './manim';
import { generateTtsAudio } from './tts';
import { muxVoiceover, stitchFinal } from './video';
import { acquireJobSlot, releaseJobSlot } from './queue';

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

function normalizeRequest(input: Partial<ManimateJobRequest>): ManimateJobRequest {
  return {
    topic: String(input.topic || '').trim(),
    model: input.model || process.env.MANIMATE_MODEL || 'mistral-large-2512',
    model_provider: input.model_provider || 'mistralai',
    topic_depth: input.topic_depth || 'normal',
    render_dir: input.render_dir,
    max_correction_attempts: Number(input.max_correction_attempts ?? process.env.MAX_CORRECTION_ATTEMPTS ?? 3),
    render_timeout_per_scene: Number(input.render_timeout_per_scene ?? process.env.RENDER_TIMEOUT_SECONDS ?? 120),
    skip_voiceovers: Boolean(input.skip_voiceovers ?? false),
    manim_python: input.manim_python,
    tts_voice: input.tts_voice,
    tts_lang: input.tts_lang,
    tts_output_dir: input.tts_output_dir,
    tts_timeout: Number(input.tts_timeout ?? 120),
    tts_poll_seconds: Number(input.tts_poll_seconds ?? 5),
    llm_timeout: Number(input.llm_timeout ?? process.env.LLM_TIMEOUT_SECONDS ?? 180),
    skip_websearch: Boolean(input.skip_websearch ?? false),
    websearch_results: input.websearch_results,
  };
}

export async function runPipeline(jobId: string, rawRequest: Partial<ManimateJobRequest>) {
  const request = normalizeRequest(rawRequest);
  const baseDir = jobDir(jobId);
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

    await fs.mkdir(baseDir, { recursive: true });

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
    await fs.writeFile(path.join(baseDir, 'lecture_plan.json'), JSON.stringify(lecturePlan, null, 2), 'utf-8');
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

    await updateStage(jobId, 'code_generation', { status: 'running', message: 'Generating Manim scene code...', pct: 5 });
    const sceneOutputs: SceneOutput[] = [];
    const codeGenLog: string[] = [];
    const codeDir = path.join(baseDir, 'scene_code');
    await fs.mkdir(codeDir, { recursive: true });
    for (const [moduleOffset, module] of lecturePlan.modules.entries()) {
      const moduleIndex = moduleOffset + 1;
      const result = await generateManimForModule(lecturePlan, moduleIndex, module, llmOptions, active.controller.signal);
      for (const [generatedIndex, item] of (result.scenes || []).entries()) {
        const scene = findPlannedScene(module, item.scene_id, generatedIndex);
        const matched = scene ? `matched to plan scene "${scene.id}"` : `no match in plan (index ${generatedIndex})`;
        codeGenLog.push(`module_${moduleIndex}/${item.scene_id}: ${matched}${scene?.voiceover ? ' [has VO]' : ' [no VO]'}`);
        const output: SceneOutput = {
          module_index: moduleIndex,
          scene_id: String(item.scene_id),
          scene: scene || {},
          code: String(item.code || ''),
        };
        sceneOutputs.push(output);
        await fs.writeFile(path.join(codeDir, `module_${moduleIndex}_${output.scene_id}.py`), output.code, 'utf-8');
      }
      const codePct = Math.min(100, Math.round((sceneOutputs.length / plannedScenes.length) * 100));
      await updateStage(jobId, 'code_generation', {
        status: 'running',
        message: `Generated code for ${sceneOutputs.length}/${plannedScenes.length} scenes...`,
        pct: codePct,
        detail: { scenes_generated: sceneOutputs.length, code_dir: codeDir, pct: codePct, log: codeGenLog },
      });
    }
    if (!sceneOutputs.length) throw new Error('Manim generator returned no scene code.');
    await updateStage(jobId, 'code_generation', {
      status: 'done',
      message: `Generated code for ${sceneOutputs.length} scenes.`,
      pct: 100,
      detail: { scenes_generated: sceneOutputs.length, code_dir: codeDir, pct: 100, log: codeGenLog },
    });

    await updateStage(jobId, 'rendering', { status: 'running', message: `Rendering ${sceneOutputs.length} scenes...`, pct: 0 });
    const rendered: { module_index: number; scene_id: string; video: string; scene: any }[] = [];
    const failedScenes: { module_index: number; scene_id: string; error: string }[] = [];
    const renderLog: string[] = [];
    let corrections = 0;
    for (const [index, sceneOutput] of sceneOutputs.entries()) {
      const result = await renderSceneWithCorrections(
        jobId,
        sceneOutput,
        baseDir,
        request.max_correction_attempts || 3,
        request.render_timeout_per_scene || 120,
        llmOptions,
        active.controller.signal,
      );
      corrections += result.corrections;
      if (result.success) {
        rendered.push({ module_index: sceneOutput.module_index, scene_id: sceneOutput.scene_id, video: result.video, scene: sceneOutput.scene });
        renderLog.push(`module_${sceneOutput.module_index}/${sceneOutput.scene_id}: OK (corrections: ${result.corrections})`);
      } else {
        failedScenes.push({
          module_index: sceneOutput.module_index,
          scene_id: sceneOutput.scene_id,
          error: result.error.slice(0, 800),
        });
        renderLog.push(`module_${sceneOutput.module_index}/${sceneOutput.scene_id}: FAILED after ${result.corrections} correction(s) — ${result.error.slice(0, 200)}`);
      }
      const pct = Math.round(((index + 1) / sceneOutputs.length) * 100);
      await updateStage(jobId, 'rendering', {
        status: 'running',
        message: `Rendered ${rendered.length}/${sceneOutputs.length} scenes.`,
        pct,
        detail: { total: sceneOutputs.length, rendered: rendered.length, failed: failedScenes.length, corrections, pct, failed_scenes: failedScenes, log: renderLog },
      });
    }
    if (!rendered.length) throw new Error(`No scenes rendered successfully. First error: ${failedScenes[0]?.error || 'unknown'}`);
    await updateStage(jobId, 'rendering', {
      status: 'done',
      message: `Rendered ${rendered.length}/${sceneOutputs.length} scenes.`,
      pct: 100,
      detail: { total: sceneOutputs.length, rendered: rendered.length, failed: failedScenes.length, corrections, pct: 100, failed_scenes: failedScenes, log: renderLog },
    });

    const moduleVideos = new Map<number, string[]>();
    if (request.skip_voiceovers) {
      for (const item of rendered) {
        const list = moduleVideos.get(item.module_index) || [];
        list.push(item.video);
        moduleVideos.set(item.module_index, list);
      }
      await updateStage(jobId, 'voiceover', { status: 'skipped', message: 'Voiceovers skipped.', pct: 100, detail: { total: rendered.length, ok: 0, failed: 0, skipped: rendered.length, pct: 100 } });
    } else {
      await updateStage(jobId, 'voiceover', { status: 'running', message: 'Generating Kokoro voiceovers...', pct: 0 });
      let ok = 0;
      let failed = 0;
      let skipped = 0;
      const voLog: string[] = [];
      for (const [index, item] of rendered.entries()) {
        let video = item.video;
        const voiceover = String(item.scene?.voiceover || '').trim();
        const scopedir = `module_${item.module_index}/${item.scene_id}`;
        if (voiceover) {
          try {
            const audio = await generateTtsAudio(voiceover, {
              voice: request.tts_voice,
              fileBase: `module_${item.module_index}_${item.scene_id}`,
              outputDir: request.tts_output_dir || path.join(baseDir, 'tts'),
            });
            video = await muxVoiceover(jobId, item.video, audio.file_path, path.join(baseDir, 'voiceover_videos', `module_${item.module_index}_${item.scene_id}_vo.mp4`));
            ok += 1;
            voLog.push(`${scopedir}: OK (vo_chars: ${voiceover.length})`);
          } catch (err) {
            failed += 1;
            voLog.push(`${scopedir}: FAILED (vo_chars: ${voiceover.length}) — ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`);
          }
        } else {
          skipped += 1;
          voLog.push(`${scopedir}: SKIPPED — ${item.scene?.id ? `plan scene has no voiceover text` : 'no matching plan scene found'}`);
        }
        const list = moduleVideos.get(item.module_index) || [];
        list.push(video);
        moduleVideos.set(item.module_index, list);
        const pct = Math.round(((index + 1) / rendered.length) * 100);
        await updateStage(jobId, 'voiceover', {
          status: 'running',
          message: `Generated ${ok}/${rendered.length} voiceovers.`,
          pct,
          detail: { total: rendered.length, ok, failed, skipped, pct, log: voLog },
        });
      }
      await updateStage(jobId, 'voiceover', {
        status: 'done',
        message: `Voiceover complete: ${ok} ok, ${failed} failed, ${skipped} skipped.`,
        pct: 100,
        detail: { total: rendered.length, ok, failed, skipped, pct: 100, log: voLog },
      });
    }

    await updateStage(jobId, 'stitching', { status: 'running', message: 'Stitching module videos...', pct: 30 });
    const finalVideo = await stitchFinal(jobId, moduleVideos, baseDir);
    let finalSizeMb = 0;
    try { const s = await fs.stat(finalVideo); finalSizeMb = Math.round(s.size / (1024 * 1024) * 10) / 10; } catch { /* ignore */ }
    await updateStage(jobId, 'stitching', {
      status: 'done',
      message: 'Final video ready.',
      pct: 100,
      detail: { final_video: `/api/generate/${jobId}/video`, modules_stitched: moduleVideos.size, size_mb: finalSizeMb },
    });

    const current = await readMetadata(jobId);
    if (current) {
      current.status = 'completed';
      current.overall_progress = 100;
      current.current_stage = null;
      current.final_video = `/api/generate/${jobId}/video`;
      current.finished_at = new Date().toISOString();
      current.elapsed_seconds = current.started_at ? (Date.now() - new Date(current.started_at).getTime()) / 1000 : current.elapsed_seconds;
      await writeMetadata(jobId, current);
    }
    return finalVideo;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJob(jobId, 'failed', message);
    throw error;
  } finally {
    if (acquired) releaseJobSlot();
    finishActiveJob(jobId);
  }
}
