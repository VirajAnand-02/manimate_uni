import { NextResponse } from 'next/server';
import { generateQuizQuestions, resolveProviderAndModel } from '@/src/lib/manimate/llm';
import { readLecturePlan, readMetadata, readQuiz, writeQuiz } from '@/src/lib/manimate/jobStore';
import { isValidJobId } from '@/src/lib/manimate/workspace';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Resolves the caller and rejects ids that could not have come from us. */
async function requireJob(jobId: string) {
  if (!isValidJobId(jobId)) {
    return { error: NextResponse.json({ error: 'Invalid job id' }, { status: 400 }) };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) };
  }
  // RLS makes another user's job indistinguishable from a missing one.
  const metadata = await readMetadata(jobId, supabase);
  if (!metadata) {
    return { error: NextResponse.json({ error: 'Job not found' }, { status: 404 }) };
  }
  return { supabase, metadata };
}

function withTracking(questions: any[]) {
  return (questions || []).map((q: any) => ({ ...q, userResponse: null, isCorrect: null }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const ctx = await requireJob(jobId);
  if (ctx.error) return ctx.error;
  const { supabase, metadata } = ctx;

  try {
    const existing = await readQuiz(jobId, supabase);
    if (existing) return NextResponse.json(existing);

    const lecturePlan = await readLecturePlan(jobId, supabase);
    if (!lecturePlan) {
      return NextResponse.json(
        { error: 'This lecture has no plan yet — generate the video first.' },
        { status: 409 },
      );
    }

    const llmOptions = resolveProviderAndModel(
      metadata.options?.model_provider,
      metadata.options?.model,
    );
    const result = await generateQuizQuestions(lecturePlan, 1, 5, llmOptions);
    const quizData = { difficultyLevel: 1, questions: withTracking(result.questions) };

    await writeQuiz(jobId, quizData, supabase);
    return NextResponse.json(quizData);
  } catch (err) {
    console.error('Quiz GET API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to retrieve or generate quiz' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const ctx = await requireJob(jobId);
  if (ctx.error) return ctx.error;
  const { supabase, metadata } = ctx;

  try {
    const quizData = (await readQuiz(jobId, supabase)) as any;
    if (!quizData) {
      return NextResponse.json({ error: 'No quiz to extend yet' }, { status: 404 });
    }
    const lecturePlan = await readLecturePlan(jobId, supabase);
    if (!lecturePlan) {
      return NextResponse.json({ error: 'This lecture has no plan' }, { status: 409 });
    }

    const llmOptions = resolveProviderAndModel(
      metadata.options?.model_provider,
      metadata.options?.model,
    );

    const nextDifficulty = (quizData.difficultyLevel || 1) + 1;
    const result = await generateQuizQuestions(lecturePlan, nextDifficulty, 5, llmOptions);

    quizData.difficultyLevel = nextDifficulty;
    quizData.questions = [...(quizData.questions || []), ...withTracking(result.questions)];

    await writeQuiz(jobId, quizData, supabase);
    return NextResponse.json(quizData);
  } catch (err) {
    console.error('Quiz POST API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate more questions' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const ctx = await requireJob(jobId);
  if (ctx.error) return ctx.error;
  const { supabase } = ctx;

  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.questions)) {
      return NextResponse.json({ error: 'Invalid payload: questions array expected' }, { status: 400 });
    }

    const quizData = ((await readQuiz(jobId, supabase)) as any) ?? { difficultyLevel: 1 };
    quizData.questions = body.questions;
    if (typeof body.difficultyLevel === 'number') {
      quizData.difficultyLevel = body.difficultyLevel;
    }

    await writeQuiz(jobId, quizData, supabase);
    return NextResponse.json(quizData);
  } catch (err) {
    console.error('Quiz PATCH API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save quiz progress' },
      { status: 500 }
    );
  }
}
