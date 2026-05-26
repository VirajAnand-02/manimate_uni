import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { JobStatus, LocalMetadata, LocalStageProgress, ManimateJobRequest, StageName } from '@/src/types/manimate';
import { defaultStages, GENERATIONS_DIR, STAGE_NAMES, STAGE_WEIGHTS } from './constants';

export async function ensureGenerationsDir() {
  await fs.mkdir(GENERATIONS_DIR, { recursive: true });
}

export function createJobId() {
  return crypto.randomUUID();
}

export function jobDir(jobId: string) {
  return path.join(GENERATIONS_DIR, jobId);
}

export function metadataPath(jobId: string) {
  return path.join(jobDir(jobId), 'metadata.json');
}

export async function readMetadata(jobId: string): Promise<LocalMetadata | null> {
  try {
    return JSON.parse(await fs.readFile(metadataPath(jobId), 'utf-8')) as LocalMetadata;
  } catch {
    return null;
  }
}

export async function writeMetadata(jobId: string, data: LocalMetadata) {
  data.updated_at = new Date().toISOString();
  await fs.mkdir(jobDir(jobId), { recursive: true });
  await fs.writeFile(metadataPath(jobId), JSON.stringify(data, null, 2), 'utf-8');
}

export async function patchMetadata(jobId: string, updates: Partial<LocalMetadata>) {
  const current = await readMetadata(jobId);
  if (!current) return;
  await writeMetadata(jobId, { ...current, ...updates });
}

export async function listJobs(): Promise<LocalMetadata[]> {
  await ensureGenerationsDir();
  const entries = await fs.readdir(GENERATIONS_DIR, { withFileTypes: true });
  const jobs: LocalMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const data = await readMetadata(entry.name);
    if (data) jobs.push(data);
  }
  return jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createInitialMetadata(jobId: string, topic: string, options: Partial<ManimateJobRequest>) {
  const now = new Date().toISOString();
  const data: LocalMetadata = {
    jobId,
    backendJobId: null,
    topic,
    status: 'pending',
    overall_progress: 0,
    current_stage: 'web_research',
    created_at: now,
    updated_at: now,
    started_at: null,
    finished_at: null,
    elapsed_seconds: null,
    error: null,
    final_video: null,
    options,
    stages: defaultStages(),
  };
  await writeMetadata(jobId, data);
  return data;
}

export async function updateStage(
  jobId: string,
  name: StageName,
  patch: Partial<LocalStageProgress>,
) {
  const current = await readMetadata(jobId);
  if (!current) return;
  const stage = current.stages[name] ?? defaultStages()[name];
  const startedAt = patch.status === 'running' && !stage.started_at ? Date.now() / 1000 : stage.started_at;
  const finishedAt = ['done', 'failed', 'skipped'].includes(String(patch.status)) ? Date.now() / 1000 : patch.finished_at ?? stage.finished_at;
  current.stages[name] = {
    ...stage,
    ...patch,
    started_at: startedAt ?? null,
    finished_at: finishedAt ?? null,
    elapsed_seconds: startedAt && finishedAt ? Math.max(0, finishedAt - startedAt) : stage.elapsed_seconds ?? null,
  };
  current.current_stage = patch.status === 'running' ? name : current.current_stage;
  current.overall_progress = computeOverallProgress(current.stages);
  if (current.started_at) {
    current.elapsed_seconds = (Date.now() - new Date(current.started_at).getTime()) / 1000;
  }
  await writeMetadata(jobId, current);
}

export function computeOverallProgress(stages: Record<StageName, LocalStageProgress>) {
  let total = 0;
  for (const name of STAGE_NAMES) {
    const stage = stages[name];
    const weight = STAGE_WEIGHTS[name];
    if (stage.status === 'done' || stage.status === 'skipped') total += weight;
    else if (stage.status === 'running') total += Math.round(weight * Math.max(0, Math.min(100, stage.pct || 0)) / 100);
  }
  return Math.min(100, total);
}

export async function finishJob(jobId: string, status: JobStatus | 'failed', error?: string | null) {
  const current = await readMetadata(jobId);
  const now = new Date().toISOString();
  await patchMetadata(jobId, {
    status,
    current_stage: null,
    error: error ?? current?.error ?? null,
    finished_at: now,
    elapsed_seconds: current?.started_at ? (Date.now() - new Date(current.started_at).getTime()) / 1000 : current?.elapsed_seconds ?? null,
  });
}
