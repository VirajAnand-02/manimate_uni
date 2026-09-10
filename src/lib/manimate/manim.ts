import fs from 'fs/promises';
import path from 'path';
import { correctManimCode } from './llm';
import { runCommand } from './process';

export type SceneOutput = {
  module_index: number;
  scene_id: string;
  scene: any;
  code: string;
};

export type RenderedScene = {
  module_index: number;
  scene_id: string;
  scene: any;
  video: string;
  corrections: number;
};

export type FailedScene = {
  module_index: number;
  scene_id: string;
  error: string;
  corrections: number;
};

export type ModuleRenderResult = {
  rendered: RenderedScene[];
  failed: FailedScene[];
  /** True when the whole module came out of a single Manim invocation. */
  batched: boolean;
};

function classNameFromCode(code: string) {
  return code.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*Scene\s*\)/)?.[1] || 'GeneratedScene';
}

function stripCodeFences(code: string) {
  const match = code.match(/```(?:python)?\s*\n?([\s\S]*?)```/);
  if (match) return match[1].trim();
  return code.trim().replace(/^```(?:python)?/i, '').replace(/```$/i, '').trim();
}

export function defaultManimPython() {
  if (process.env.MANIM_PYTHON) return process.env.MANIM_PYTHON;
  // venv layout differs by platform: Scripts/python.exe on Windows, bin/python elsewhere.
  const venv = path.join(process.cwd(), 'manim-env');
  return process.platform === 'win32'
    ? path.join(venv, 'Scripts', 'python.exe')
    : path.join(venv, 'bin', 'python');
}

/**
 * -ql (480p15) | -qm (720p30) | -qh (1080p60).
 * Defaults to -qm: 1080p60 renders roughly 4x slower and produces files that
 * exceed Supabase Storage's default 50 MB per-object limit.
 */
export function manimQuality() {
  const value = (process.env.MANIM_QUALITY || '-qm').trim();
  return /^-q[lmhpk]$/.test(value) ? value : '-qm';
}

/** Manim nests rendered video under a directory named for the quality preset. */
const QUALITY_DIRS: Record<string, string> = {
  '-ql': '480p15',
  '-qm': '720p30',
  '-qh': '1080p60',
  '-qp': '1440p60',
  '-qk': '2160p60',
};

function qualityDir() {
  return QUALITY_DIRS[manimQuality()] ?? '720p30';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A Python-safe identifier derived from a module index and an LLM-supplied id. */
export function sceneClassName(moduleIndex: number, sceneId: string) {
  const cleaned = sceneId.replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'scene';
  return `M${moduleIndex}_${/^[0-9]/.test(cleaned) ? `s${cleaned}` : cleaned}`;
}

/**
 * Give every scene a unique Scene subclass name.
 *
 * Batching a module into one file means two scenes that both call their class
 * `GeneratedScene` would shadow each other, and only the last would render.
 */
function renameSceneClass(code: string, newName: string) {
  const current = classNameFromCode(code);
  if (current === newName) return code;
  return code.replace(new RegExp(`\\b${escapeRegExp(current)}\\b`, 'g'), newName);
}

/**
 * Point Manim's LaTeX and text caches at one directory for the whole job.
 *
 * These caches live under --media_dir by default, so the per-scene media dirs
 * meant every scene recompiled identical formulae from scratch. Manim reads
 * manim.cfg from its working directory, which is why every invocation runs with
 * cwd set to the job dir.
 */
export async function ensureJobManimConfig(baseDir: string) {
  const cachePath = path.join(baseDir, 'manim_cache');
  await fs.mkdir(cachePath, { recursive: true });
  const cfg = [
    '[CLI]',
    `tex_dir = ${path.join(cachePath, 'tex').replace(/\\/g, '/')}`,
    `text_dir = ${path.join(cachePath, 'text').replace(/\\/g, '/')}`,
    '',
  ].join('\n');
  await fs.writeFile(path.join(baseDir, 'manim.cfg'), cfg, 'utf-8');
}

async function findByName(root: string, fileName: string, sinceMs: number): Promise<string | null> {
  const matches: { file: string; mtime: number }[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name === fileName) {
        const stat = await fs.stat(full).catch(() => null);
        if (stat && stat.mtimeMs >= sinceMs) matches.push({ file: full, mtime: stat.mtimeMs });
      }
    }
  }
  await walk(root);
  matches.sort((a, b) => b.mtime - a.mtime);
  return matches[0]?.file ?? null;
}

/**
 * Locate a scene's output.
 *
 * Manim's layout is deterministic — media/videos/<file stem>/<quality>/<Class>.mp4
 * — so this no longer guesses at "the newest mp4 anywhere", which is what forced
 * every attempt into a throwaway media dir and threw the render cache away with it.
 * `sinceMs` guards against picking up a previous attempt's output.
 */
async function resolveSceneVideo(
  mediaDir: string,
  pyStem: string,
  className: string,
  sinceMs: number,
): Promise<string | null> {
  const direct = path.join(mediaDir, 'videos', pyStem, qualityDir(), `${className}.mp4`);
  const stat = await fs.stat(direct).catch(() => null);
  if (stat?.isFile() && stat.mtimeMs >= sinceMs) return direct;
  return findByName(mediaDir, `${className}.mp4`, sinceMs);
}

function manimArgs(pyFile: string, classNames: string[], mediaDir: string) {
  return [
    '-m', 'manim',
    manimQuality(),
    // Progress bars stream a line per frame to stderr. That output is captured,
    // and on failure it is forwarded to the corrector LLM as input tokens.
    '--progress_bar', 'none',
    '-v', 'error',
    '--media_dir', mediaDir,
    pyFile,
    ...classNames,
  ];
}

/**
 * Render every scene of a module in ONE Manim process.
 *
 * `import manim` alone costs ~3.4s, paid per invocation — for a module of three
 * scenes that is most of the wall time. Scenes that the batch does not produce
 * (a syntax error takes the whole file down, and two scenes can collide on a
 * module-level helper name) fall back to individual renders with corrections.
 */
export async function renderModule(
  jobId: string,
  moduleIndex: number,
  scenes: SceneOutput[],
  baseDir: string,
  maxAttempts: number,
  timeoutSeconds: number,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
  onSceneSettled?: () => void,
): Promise<ModuleRenderResult> {
  const codeDir = path.join(baseDir, 'scene_code');
  const mediaDir = path.join(baseDir, 'media', `module_${moduleIndex}`);
  await fs.mkdir(codeDir, { recursive: true });
  await fs.mkdir(mediaDir, { recursive: true });

  // Each scene keeps its own file (uploaded as a build artifact, and the unit the
  // correction loop rewrites); the combined file is what the batch renders.
  const prepared = scenes.map((scene) => {
    const className = sceneClassName(moduleIndex, scene.scene_id);
    return { scene, className, code: renameSceneClass(stripCodeFences(scene.code), className) };
  });

  await Promise.all(prepared.map((item) =>
    fs.writeFile(scenePyFile(codeDir, moduleIndex, item.scene.scene_id), item.code, 'utf-8')));

  const rendered: RenderedScene[] = [];
  const failed: FailedScene[] = [];
  let batched = false;

  if (prepared.length > 1) {
    const batchStem = `module_${moduleIndex}_all`;
    const batchFile = path.join(codeDir, `${batchStem}.py`);
    await fs.writeFile(batchFile, prepared.map((item) => item.code).join('\n\n\n'), 'utf-8');

    const startedAt = Date.now() - 1000;
    try {
      if (signal?.aborted) throw new Error('Job cancelled');
      await runCommand(
        jobId,
        defaultManimPython(),
        manimArgs(batchFile, prepared.map((item) => item.className), mediaDir),
        // One process renders every scene, so it gets the whole module's budget.
        { cwd: baseDir, timeoutMs: timeoutSeconds * prepared.length * 1000 },
      );
      batched = true;
    } catch {
      // Fall through — whatever the batch did produce is still collected below.
    }

    for (const item of prepared) {
      const video = await resolveSceneVideo(mediaDir, batchStem, item.className, startedAt);
      if (video) {
        rendered.push({
          module_index: moduleIndex,
          scene_id: item.scene.scene_id,
          scene: item.scene.scene,
          video,
          corrections: 0,
        });
        onSceneSettled?.();
      }
    }
  }

  // Anything the batch did not produce gets its own render, with corrections.
  const done = new Set(rendered.map((item) => item.scene_id));
  for (const item of prepared) {
    if (done.has(item.scene.scene_id)) continue;
    if (signal?.aborted) {
      failed.push({ module_index: moduleIndex, scene_id: item.scene.scene_id, error: 'Job cancelled', corrections: 0 });
      continue;
    }
    const result = await renderSceneWithCorrections(
      jobId,
      { ...item.scene, code: item.code },
      item.className,
      baseDir,
      mediaDir,
      maxAttempts,
      timeoutSeconds,
      llmOptions,
      signal,
    );
    if (result.success && result.video) {
      rendered.push({
        module_index: moduleIndex,
        scene_id: item.scene.scene_id,
        scene: item.scene.scene,
        video: result.video,
        corrections: result.corrections,
      });
    } else {
      failed.push({
        module_index: moduleIndex,
        scene_id: item.scene.scene_id,
        error: result.error,
        corrections: result.corrections,
      });
    }
    onSceneSettled?.();
  }

  return { rendered, failed, batched };
}

function scenePyFile(codeDir: string, moduleIndex: number, sceneId: string) {
  return path.join(codeDir, `module_${moduleIndex}_${sceneId}.py`);
}

export type RenderResult = {
  success: boolean;
  video: string | null;
  corrections: number;
  code: string;
  error: string;
};

/**
 * Render one scene, asking the LLM to repair its own code on failure.
 *
 * The media dir is shared across the module rather than recreated per attempt,
 * so Manim's partial-movie and LaTeX caches survive a correction: an unchanged
 * animation in a repaired scene is not re-rendered from scratch.
 */
export async function renderSceneWithCorrections(
  jobId: string,
  sceneOutput: SceneOutput,
  className: string,
  baseDir: string,
  mediaDir: string,
  maxAttempts: number,
  timeoutSeconds: number,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
): Promise<RenderResult> {
  const codeDir = path.join(baseDir, 'scene_code');
  await fs.mkdir(codeDir, { recursive: true });
  const pyFile = scenePyFile(codeDir, sceneOutput.module_index, sceneOutput.scene_id);
  const pyStem = path.basename(pyFile, '.py');

  let code = sceneOutput.code;
  let corrections = 0;
  let lastError = '';

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return { success: false, video: null, corrections, code, error: 'Job cancelled' };

    const cleanCode = renameSceneClass(stripCodeFences(code), className);
    await fs.writeFile(pyFile, cleanCode, 'utf-8');
    const startedAt = Date.now() - 1000;

    try {
      await runCommand(jobId, defaultManimPython(), manimArgs(pyFile, [className], mediaDir), {
        cwd: baseDir,
        timeoutMs: timeoutSeconds * 1000,
      });
      const video = await resolveSceneVideo(mediaDir, pyStem, className, startedAt);
      if (!video) throw new Error('Manim completed but no MP4 was found.');
      return { success: true, video, corrections, code: cleanCode, error: '' };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt >= maxAttempts) {
        return { success: false, video: null, corrections, code, error: lastError || 'Scene render failed.' };
      }
      corrections += 1;
      code = await correctManimCode({ scene: sceneOutput.scene, erroredCode: code, error: lastError }, llmOptions, signal);
    }
  }

  return { success: false, video: null, corrections, code, error: lastError || 'Scene render failed.' };
}
