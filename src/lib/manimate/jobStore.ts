import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  JobStatus,
  LocalMetadata,
  LocalStageProgress,
  ManimateJobRequest,
  StageName,
} from '@/src/types/manimate';
import { adminClient } from '@/src/lib/supabase/admin';
import { defaultStages, STAGE_NAMES, STAGE_WEIGHTS } from './constants';

const TABLE = 'jobs';

/**
 * Row shape of public.jobs. Kept close to LocalMetadata so the frontend needs
 * no changes; the only divergences are `id`/`jobId` and the fact that we store
 * a Storage object key rather than a (necessarily expiring) video URL.
 */
type JobRow = {
  id: string;
  user_id: string;
  topic: string;
  status: LocalMetadata['status'];
  overall_progress: number;
  current_stage: StageName | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_seconds: number | null;
  error: string | null;
  final_video_path: string | null;
  options: Partial<ManimateJobRequest>;
  stages: Record<StageName, LocalStageProgress>;
};

/**
 * Route handlers pass their request-scoped client so RLS enforces ownership.
 * The pipeline has no request context and falls back to the service role.
 */
function db(client?: SupabaseClient): SupabaseClient {
  return client ?? adminClient();
}

export function createJobId() {
  return crypto.randomUUID();
}

const COLUMNS =
  'id,user_id,topic,status,overall_progress,current_stage,created_at,updated_at,' +
  'started_at,finished_at,elapsed_seconds,error,final_video_path,options,stages';

function rowToMetadata(row: JobRow): LocalMetadata {
  return {
    jobId: row.id,
    backendJobId: null,
    topic: row.topic,
    status: row.status,
    overall_progress: row.overall_progress,
    current_stage: row.current_stage,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    elapsed_seconds: row.elapsed_seconds,
    error: row.error,
    // The client always fetches through our API, which mints a fresh signed URL.
    final_video: row.final_video_path ? `/api/generate/${row.id}/video` : null,
    options: row.options ?? {},
    stages: row.stages ?? defaultStages(),
  };
}

/** Columns a caller may patch, keyed by their LocalMetadata field name. */
const PATCHABLE = [
  'topic',
  'status',
  'overall_progress',
  'current_stage',
  'started_at',
  'finished_at',
  'elapsed_seconds',
  'error',
  'options',
  'stages',
] as const;

function metadataToRow(updates: Partial<LocalMetadata>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const field of PATCHABLE) {
    if (field in updates) row[field] = (updates as Record<string, unknown>)[field];
  }
  return row;
}

export async function readMetadata(
  jobId: string,
  client?: SupabaseClient,
): Promise<LocalMetadata | null> {
  const { data, error } = await db(client)
    .from(TABLE)
    .select(COLUMNS)
    .eq('id', jobId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToMetadata(data as unknown as JobRow);
}

/** The owning user id, or null if the job does not exist. */
export async function readJobOwner(jobId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from(TABLE)
    .select('user_id')
    .eq('id', jobId)
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

export async function readFinalVideoPath(
  jobId: string,
  client?: SupabaseClient,
): Promise<string | null> {
  const { data } = await db(client)
    .from(TABLE)
    .select('final_video_path')
    .eq('id', jobId)
    .maybeSingle();
  return (data as { final_video_path: string | null } | null)?.final_video_path ?? null;
}

export async function writeMetadata(
  jobId: string,
  data: LocalMetadata,
  client?: SupabaseClient,
) {
  const { error } = await db(client)
    .from(TABLE)
    .update({ ...metadataToRow(data), updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Could not update job ${jobId}: ${error.message}`);
}

export async function patchMetadata(
  jobId: string,
  updates: Partial<LocalMetadata>,
  client?: SupabaseClient,
) {
  const row = metadataToRow(updates);
  if (!Object.keys(row).length) return;
  const { error } = await db(client)
    .from(TABLE)
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Could not patch job ${jobId}: ${error.message}`);
}

/** RLS scopes this to the caller's own jobs when a request client is passed. */
export async function listJobs(client?: SupabaseClient): Promise<LocalMetadata[]> {
  const { data, error } = await db(client)
    .from(TABLE)
    .select(COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not list jobs: ${error.message}`);
  return ((data ?? []) as unknown as JobRow[]).map(rowToMetadata);
}

export async function createInitialMetadata(
  jobId: string,
  userId: string,
  topic: string,
  options: Partial<ManimateJobRequest>,
  client?: SupabaseClient,
): Promise<LocalMetadata> {
  const now = new Date().toISOString();
  const { data, error } = await db(client)
    .from(TABLE)
    .insert({
      id: jobId,
      user_id: userId,
      topic,
      status: 'pending',
      overall_progress: 0,
      current_stage: 'web_research',
      created_at: now,
      updated_at: now,
      options,
      stages: defaultStages(),
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`Could not create job: ${error?.message ?? 'no row returned'}`);
  }
  return rowToMetadata(data as unknown as JobRow);
}

export async function deleteJob(jobId: string, client?: SupabaseClient) {
  const { error } = await db(client).from(TABLE).delete().eq('id', jobId);
  if (error) throw new Error(`Could not delete job ${jobId}: ${error.message}`);
}

/**
 * Advance one stage.
 *
 * Prefers the update_job_stage() RPC (migration 0002), which merges the patch
 * inside Postgres: one round trip instead of two, and — now that scenes render
 * concurrently — atomic, so two stages finishing at once cannot clobber each
 * other's progress. Falls back to the read-modify-write path when the function
 * is not installed yet, which keeps a deployment working before the migration
 * has been applied.
 */
let stageRpcAvailable = true;

export async function updateStage(
  jobId: string,
  name: StageName,
  patch: Partial<LocalStageProgress>,
  client?: SupabaseClient,
) {
  if (stageRpcAvailable) {
    const { error } = await db(client).rpc('update_job_stage', {
      p_job_id: jobId,
      p_stage: name,
      p_patch: patch,
    });
    if (!error) return;
    // PGRST202 = no such function in the schema cache; 42883 = undefined_function.
    const missing = error.code === 'PGRST202' || error.code === '42883';
    if (!missing) throw new Error(`Could not update stage ${name} on ${jobId}: ${error.message}`);
    stageRpcAvailable = false;
    console.warn(
      '[jobStore] update_job_stage() not found — falling back to read-modify-write. ' +
      'Apply supabase/migrations/0002_stage_progress_rpc.sql for atomic, single-round-trip progress.',
    );
  }
  return updateStageFallback(jobId, name, patch, client);
}

async function updateStageFallback(
  jobId: string,
  name: StageName,
  patch: Partial<LocalStageProgress>,
  client?: SupabaseClient,
) {
  const current = await readMetadata(jobId, client);
  if (!current) return;

  const stage = current.stages[name] ?? defaultStages()[name];
  const startedAt =
    patch.status === 'running' && !stage.started_at ? Date.now() / 1000 : stage.started_at;
  const finishedAt = ['done', 'failed', 'skipped'].includes(String(patch.status))
    ? Date.now() / 1000
    : patch.finished_at ?? stage.finished_at;

  const stages = {
    ...current.stages,
    [name]: {
      ...stage,
      ...patch,
      started_at: startedAt ?? null,
      finished_at: finishedAt ?? null,
      elapsed_seconds:
        startedAt && finishedAt
          ? Math.max(0, finishedAt - startedAt)
          : stage.elapsed_seconds ?? null,
    },
  } as Record<StageName, LocalStageProgress>;

  const update: Record<string, unknown> = {
    stages,
    overall_progress: computeOverallProgress(stages),
    updated_at: new Date().toISOString(),
  };
  if (patch.status === 'running') update.current_stage = name;
  if (current.started_at) {
    update.elapsed_seconds = (Date.now() - new Date(current.started_at).getTime()) / 1000;
  }

  const { error } = await db(client).from(TABLE).update(update).eq('id', jobId);
  if (error) throw new Error(`Could not update stage ${name} on ${jobId}: ${error.message}`);
}

/**
 * Heartbeat: proves the job is still owned by a live process.
 *
 * Progress ticks already touch updated_at, but a single batched module can
 * render for minutes without one — and the reaper uses staleness to tell an
 * orphaned job from one running elsewhere, so the gaps have to stay bounded.
 * Scoped to still-active rows so it can never resurrect a finished job.
 */
export async function touchJob(jobId: string, client?: SupabaseClient) {
  const { error } = await db(client)
    .from(TABLE)
    .update({ updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['pending', 'queued', 'running']);
  if (error) console.warn(`[jobStore] heartbeat failed for ${jobId}: ${error.message}`);
}

export function computeOverallProgress(stages: Record<StageName, LocalStageProgress>) {
  let total = 0;
  for (const name of STAGE_NAMES) {
    const stage = stages[name];
    if (!stage) continue;
    const weight = STAGE_WEIGHTS[name];
    if (stage.status === 'done' || stage.status === 'skipped') total += weight;
    else if (stage.status === 'running') {
      total += Math.round((weight * Math.max(0, Math.min(100, stage.pct || 0))) / 100);
    }
  }
  return Math.min(100, total);
}

export async function finishJob(
  jobId: string,
  status: JobStatus | 'failed',
  error?: string | null,
  client?: SupabaseClient,
) {
  const current = await readMetadata(jobId, client);
  await patchMetadata(
    jobId,
    {
      status,
      current_stage: null,
      error: error ?? current?.error ?? null,
      finished_at: new Date().toISOString(),
      elapsed_seconds: current?.started_at
        ? (Date.now() - new Date(current.started_at).getTime()) / 1000
        : current?.elapsed_seconds ?? null,
    },
    client,
  );
}

/** Marks the job complete and records where its video landed in Storage. */
export async function completeJob(
  jobId: string,
  finalVideoPath: string,
  client?: SupabaseClient,
) {
  const current = await readMetadata(jobId, client);
  const { error } = await db(client)
    .from(TABLE)
    .update({
      status: 'completed',
      overall_progress: 100,
      current_stage: null,
      final_video_path: finalVideoPath,
      finished_at: new Date().toISOString(),
      elapsed_seconds: current?.started_at
        ? (Date.now() - new Date(current.started_at).getTime()) / 1000
        : current?.elapsed_seconds ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) throw new Error(`Could not complete job ${jobId}: ${error.message}`);
}

// ─── Sidecar documents (were lecture_plan.json / quiz.json) ───────────

export async function writeLecturePlan(jobId: string, plan: unknown, client?: SupabaseClient) {
  const { error } = await db(client)
    .from(TABLE)
    .update({ lecture_plan: plan, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Could not save lecture plan for ${jobId}: ${error.message}`);
}

export async function readLecturePlan(jobId: string, client?: SupabaseClient) {
  const { data } = await db(client)
    .from(TABLE)
    .select('lecture_plan')
    .eq('id', jobId)
    .maybeSingle();
  return (data as { lecture_plan: unknown } | null)?.lecture_plan ?? null;
}

export async function writeQuiz(jobId: string, quiz: unknown, client?: SupabaseClient) {
  const { error } = await db(client)
    .from(TABLE)
    .update({ quiz, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`Could not save quiz for ${jobId}: ${error.message}`);
}

export async function readQuiz(jobId: string, client?: SupabaseClient) {
  const { data } = await db(client).from(TABLE).select('quiz').eq('id', jobId).maybeSingle();
  return (data as { quiz: unknown } | null)?.quiz ?? null;
}
