import { NextResponse } from 'next/server';
import type { ManimateJobRequest } from '@/src/types/manimate';
import { createInitialMetadata, createJobId, ensureGenerationsDir, listJobs } from '@/src/lib/manimate/jobStore';
import { runPipeline } from '@/src/lib/manimate/pipeline';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildPayload(body: Record<string, unknown>): Partial<ManimateJobRequest> {
  const payload: Partial<ManimateJobRequest> = { topic: body.topic as string };
  const optionalFields: (keyof ManimateJobRequest)[] = [
    'model',
    'model_provider',
    'topic_depth',
    'render_dir',
    'max_correction_attempts',
    'render_timeout_per_scene',
    'manim_python',
    'skip_voiceovers',
    'tts_voice',
    'tts_lang',
    'tts_output_dir',
    'tts_timeout',
    'tts_poll_seconds',
    'llm_timeout',
    'skip_websearch',
    'websearch_results',
  ];
  for (const key of optionalFields) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') {
      (payload as Record<string, unknown>)[key] = body[key];
    }
  }
  return payload;
}

export async function GET() {
  try {
    return NextResponse.json(await listJobs());
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await ensureGenerationsDir();
  try {
    const body = await request.json();
    if (!body.topic || typeof body.topic !== 'string' || !body.topic.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const jobId = createJobId();
    const payload = buildPayload(body);
    await createInitialMetadata(jobId, body.topic.trim(), payload);

    runPipeline(jobId, payload).catch((error) => {
      console.error(`[Job ${jobId}] Pipeline failed:`, error);
    });

    return NextResponse.json({ jobId, status: 'pending' }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
