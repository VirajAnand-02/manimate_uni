import { NextResponse } from 'next/server';
import type { ManimateJobRequest } from '@/src/types/manimate';
import { createInitialMetadata, createJobId, listJobs } from '@/src/lib/manimate/jobStore';
import { runPipeline } from '@/src/lib/manimate/pipeline';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function buildPayload(body: Record<string, unknown>): Partial<ManimateJobRequest> {
  const payload: Partial<ManimateJobRequest> = { topic: body.topic as string };
  // render_dir and manim_python were never read; tts_output_dir was a
  // caller-controlled write path. None of the three are accepted any more.
  const optionalFields: (keyof ManimateJobRequest)[] = [
    'model',
    'model_provider',
    'topic_depth',
    'max_correction_attempts',
    'render_timeout_per_scene',
    'skip_voiceovers',
    'tts_voice',
    'tts_lang',
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    // RLS on public.jobs scopes this to the caller's own rows.
    return NextResponse.json(await listJobs(supabase));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

    const body = await request.json();
    if (!body.topic || typeof body.topic !== 'string' || !body.topic.trim()) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const jobId = createJobId();
    const payload = buildPayload(body);
    await createInitialMetadata(jobId, user.id, body.topic.trim(), payload, supabase);

    // Detached on purpose: the render outlives this request by minutes.
    runPipeline(jobId, user.id, payload).catch((error) => {
      console.error(`[Job ${jobId}] Pipeline failed:`, error);
    });

    return NextResponse.json({ jobId, status: 'pending' }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
