// ─── Manimate API Types ───────────────────────────────────────────────
// Manimate local Next.js backend types.

// ─── POST /jobs — Request ────────────────────────────────────────────

export interface ManimateJobRequest {
  // Required
  topic: string;

  // Optional — LLM
  model?: string;
  model_provider?: 'mistralai' | 'openai' | 'deepseek' | '';
  topic_depth?: 'brief' | 'normal' | 'deep';

  // Optional — output
  render_dir?: string;

  // Optional — rendering
  max_correction_attempts?: number; // 1–10, default 3
  render_timeout_per_scene?: number; // seconds ≥ 10
  manim_python?: string;

  // Optional — voiceover
  skip_voiceovers?: boolean;
  tts_voice?: string;
  tts_lang?: string;
  tts_output_dir?: string;
  tts_timeout?: number; // seconds ≥ 10
  tts_poll_seconds?: number; // seconds ≥ 5

  // Optional — timeouts
  llm_timeout?: number; // seconds ≥ 30

  // Optional — web research
  skip_websearch?: boolean;
  websearch_results?: number; // 1–20
}

// ─── POST /jobs — Response (202) ─────────────────────────────────────

export interface ManimateJobCreated {
  job_id: string;
  status: 'queued';
  topic: string;
  created_at: number; // Unix timestamp
  queue_depth: number;
}

// ─── Stage Detail Types ──────────────────────────────────────────────

export interface WebResearchDetail {
  found?: boolean;
  chars?: number;
}

export interface LecturePlanningDetail {
  modules?: number;
  scenes?: number;
  total_minutes?: number;
  module_titles?: string[];
}

export interface CodeGenerationDetail {
  scenes_generated?: number;
  code_dir?: string;
  pct?: number;
}

export interface FailedScene {
  module_index: number;
  scene_id: string;
  error: string;
}

export interface RenderingDetail {
  total?: number;
  rendered?: number;
  failed?: number;
  corrections?: number;
  pct?: number;
  failed_scenes?: FailedScene[];
}

export interface VoiceoverDetail {
  total?: number;
  ok?: number;
  failed?: number;
  skipped?: number;
  pct?: number;
}

export interface StitchingDetail {
  final_video?: string;
  modules_stitched?: number;
}

export type StageDetailMap = {
  web_research: WebResearchDetail;
  lecture_planning: LecturePlanningDetail;
  code_generation: CodeGenerationDetail;
  rendering: RenderingDetail;
  voiceover: VoiceoverDetail;
  stitching: StitchingDetail;
};

// ─── Stage Progress ──────────────────────────────────────────────────

export type StageStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface StageProgress<K extends StageName = StageName> {
  status: StageStatus;
  message: string;
  started_at: number | null;
  finished_at: number | null;
  elapsed_seconds: number | null;
  detail: StageDetailMap[K];
}

export type StageName = keyof StageDetailMap;

export const STAGE_NAMES: StageName[] = [
  'web_research',
  'lecture_planning',
  'code_generation',
  'rendering',
  'voiceover',
  'stitching',
];

// ─── Stage Weights (for overall_progress calculation) ────────────────

export const STAGE_WEIGHTS: Record<StageName, number> = {
  web_research: 5,
  lecture_planning: 15,
  code_generation: 20,
  rendering: 35,
  voiceover: 15,
  stitching: 10,
};

// ─── GET /jobs/{job_id} — Response ───────────────────────────────────

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ManimateJobStatus {
  job_id: string;
  status: JobStatus;
  topic: string;
  overall_progress: number; // 0–100
  current_stage: StageName | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  elapsed_seconds: number | null;
  error: string | null;
  final_video: string | null;
  stages: {
    [K in StageName]: StageProgress<K>;
  };
}

// ─── GET /health — Response ──────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
  running_jobs: number;
  queued_jobs: number;
  worker_slots: number;
  available_slots: number;
}

// ─── POST /tts — Request / Response ──────────────────────────────────

export interface TTSRequest {
  text: string;
  voice?: string;
  lang_code?: string;
  file_base?: string;
}

export interface TTSResponse {
  file_path: string;
  sample_rate: number;
  mime_type: string;
}

// ─── Local Metadata (stored in ./generations/{jobId}/metadata.json) ──

export interface LocalStageProgress {
  status: StageStatus;
  message: string;
  pct: number;
  started_at?: number | null;
  finished_at?: number | null;
  elapsed_seconds?: number | null;
  detail?: Record<string, unknown>;
}

export interface LocalMetadata {
  jobId: string;
  backendJobId?: string | null;
  topic: string;
  status: JobStatus | 'pending';
  overall_progress: number;
  current_stage: StageName | null;
  created_at: string; // ISO string
  updated_at: string; // ISO string
  started_at?: string | null;
  finished_at?: string | null;
  elapsed_seconds?: number | null;
  error: string | null;
  final_video: string | null;

  // Job request options (saved for reference)
  options?: Partial<ManimateJobRequest>;

  stages: Record<StageName, LocalStageProgress>;
}
