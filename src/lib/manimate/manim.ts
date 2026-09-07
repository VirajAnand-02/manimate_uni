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

function classNameFromCode(code: string) {
  return code.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*Scene\s*\)/)?.[1] || 'GeneratedScene';
}

function stripCodeFences(code: string) {
  const match = code.match(/```(?:python)?\s*\n?([\s\S]*?)```/);
  if (match) return match[1].trim();
  return code.trim().replace(/^```(?:python)?/i, '').replace(/```$/i, '').trim();
}

async function newestMp4(dir: string): Promise<string | null> {
  const found: { file: string; mtime: number }[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
        const stat = await fs.stat(full);
        found.push({ file: full, mtime: stat.mtimeMs });
      }
    }
  }
  await walk(dir);
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.file ?? null;
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

export type RenderResult = {
  success: boolean;
  video: string | null;
  corrections: number;
  code: string;
  error: string;
};

export async function renderSceneWithCorrections(
  jobId: string,
  sceneOutput: SceneOutput,
  baseDir: string,
  maxAttempts: number,
  timeoutSeconds: number,
  llmOptions: { provider: string; model: string },
  signal?: AbortSignal,
): Promise<RenderResult> {
  const sceneDir = path.join(baseDir, 'scene_code');
  const sceneMediaRoot = path.join(baseDir, 'media', `scene_${sceneOutput.module_index}_${sceneOutput.scene_id}`);
  await fs.mkdir(sceneDir, { recursive: true });
  let code = sceneOutput.code;
  let corrections = 0;
  let lastError = '';

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) return { success: false, video: null, corrections, code, error: 'Job cancelled' };
    // Each attempt gets a clean media dir: newestMp4 picks the newest .mp4 it can
    // find, and a previous attempt's partial_movie_files would poison that choice.
    const mediaDir = path.join(sceneMediaRoot, `attempt_${attempt}`);
    await fs.mkdir(mediaDir, { recursive: true });
    const pyFile = path.join(sceneDir, `module_${sceneOutput.module_index}_${sceneOutput.scene_id}.py`);
    const cleanCode = stripCodeFences(code);
    await fs.writeFile(pyFile, cleanCode, 'utf-8');
    const className = classNameFromCode(cleanCode);
    try {
      await runCommand(jobId, defaultManimPython(), [
        '-m', 'manim',
        manimQuality(),
        '--media_dir', mediaDir,
        pyFile,
        className,
      ], { timeoutMs: timeoutSeconds * 1000 });
      const video = await newestMp4(mediaDir);
      if (!video) throw new Error('Manim completed but no MP4 was found.');
      return { success: true, video, corrections, code, error: '' };
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
