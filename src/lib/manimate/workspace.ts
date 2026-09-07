import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * Scratch root for a render.
 *
 * Everything under here is disposable: Manim needs real files on a real disk,
 * but only the finished video and the generated Python are uploaded to Supabase
 * Storage. The job directory is removed once the pipeline finishes.
 */
export const WORK_DIR =
  process.env.MANIMATE_WORK_DIR || path.join(os.tmpdir(), 'manimate');

export function jobWorkDir(jobId: string) {
  return path.join(WORK_DIR, sanitizeSegment(jobId));
}

export async function ensureJobWorkDir(jobId: string) {
  const dir = jobWorkDir(jobId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function removeJobWorkDir(jobId: string) {
  await fs.rm(jobWorkDir(jobId), { recursive: true, force: true }).catch(() => {});
}

/**
 * Make a value safe to interpolate into a path segment.
 *
 * scene_id arrives straight out of LLM JSON and is used to build filenames, so
 * a value like "../../etc" would otherwise escape the job directory.
 */
export function sanitizeSegment(value: string, fallback = 'unnamed') {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || fallback;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Job ids are always crypto.randomUUID(); reject anything else up front. */
export function isValidJobId(jobId: string): boolean {
  return UUID_RE.test(String(jobId ?? ''));
}
