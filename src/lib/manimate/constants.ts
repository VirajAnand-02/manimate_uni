import path from 'path';
import type { LocalStageProgress, StageName } from '@/src/types/manimate';

export const GENERATIONS_DIR = path.join(process.cwd(), 'generations');

export const STAGE_NAMES: StageName[] = [
  'web_research',
  'lecture_planning',
  'code_generation',
  'rendering',
  'voiceover',
  'stitching',
];

export const STAGE_WEIGHTS: Record<StageName, number> = {
  web_research: 5,
  lecture_planning: 15,
  code_generation: 20,
  rendering: 35,
  voiceover: 15,
  stitching: 10,
};

export function defaultStages(): Record<StageName, LocalStageProgress> {
  return {
    web_research: { status: 'pending', message: 'Waiting for factual research...', pct: 0 },
    lecture_planning: { status: 'pending', message: 'Waiting to plan lecture...', pct: 0 },
    code_generation: { status: 'pending', message: 'Waiting for Manim code generation...', pct: 0 },
    rendering: { status: 'pending', message: 'Waiting for Manim renderer...', pct: 0 },
    voiceover: { status: 'pending', message: 'Waiting for Kokoro voiceover...', pct: 0 },
    stitching: { status: 'pending', message: 'Waiting for ffmpeg stitching...', pct: 0 },
  };
}

export function envFlag(name: string, fallback = true): boolean {
  const value = process.env[name];
  if (value == null) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}
