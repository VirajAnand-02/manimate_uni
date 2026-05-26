import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { generateQuizQuestions, resolveProviderAndModel } from '@/src/lib/manimate/llm';
import type { LocalMetadata } from '@/src/types/manimate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GENERATIONS_DIR = path.join(process.cwd(), 'generations');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const jobDir = path.join(GENERATIONS_DIR, jobId);
  const quizPath = path.join(jobDir, 'quiz.json');
  const metadataPath = path.join(jobDir, 'metadata.json');
  const lecturePlanPath = path.join(jobDir, 'lecture_plan.json');

  try {
    // 1. If quiz.json already exists, read and return it
    try {
      const content = await fs.readFile(quizPath, 'utf-8');
      return NextResponse.json(JSON.parse(content));
    } catch {
      // File doesn't exist, proceed to generate
    }

    // 2. Read metadata and lecture plan for configuration context
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as LocalMetadata;
    const lecturePlanContent = await fs.readFile(lecturePlanPath, 'utf-8');
    const lecturePlan = JSON.parse(lecturePlanContent);

    // 3. Resolve LLM options
    const llmOptions = resolveProviderAndModel(
      metadata.options?.model_provider,
      metadata.options?.model
    );

    // 4. Generate first 5 questions (Difficulty Level 1)
    const result = await generateQuizQuestions(lecturePlan, 1, 5, llmOptions);
    
    // Add user response tracking keys
    const questions = (result.questions || []).map((q: any) => ({
      ...q,
      userResponse: null,
      isCorrect: null,
    }));

    const quizData = {
      difficultyLevel: 1,
      questions,
    };

    await ensureDir(jobDir);
    await fs.writeFile(quizPath, JSON.stringify(quizData, null, 2), 'utf-8');

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
  const jobDir = path.join(GENERATIONS_DIR, jobId);
  const quizPath = path.join(jobDir, 'quiz.json');
  const metadataPath = path.join(jobDir, 'metadata.json');
  const lecturePlanPath = path.join(jobDir, 'lecture_plan.json');

  try {
    // 1. Read existing quiz data
    const quizContent = await fs.readFile(quizPath, 'utf-8');
    const quizData = JSON.parse(quizContent);

    // 2. Read metadata and lecture plan
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as LocalMetadata;
    const lecturePlanContent = await fs.readFile(lecturePlanPath, 'utf-8');
    const lecturePlan = JSON.parse(lecturePlanContent);

    // 3. Resolve LLM options
    const llmOptions = resolveProviderAndModel(
      metadata.options?.model_provider,
      metadata.options?.model
    );

    // 4. Increment difficulty level and generate 5 more questions
    const nextDifficulty = (quizData.difficultyLevel || 1) + 1;
    const result = await generateQuizQuestions(lecturePlan, nextDifficulty, 5, llmOptions);

    const newQuestions = (result.questions || []).map((q: any) => ({
      ...q,
      userResponse: null,
      isCorrect: null,
    }));

    // Append and save
    quizData.difficultyLevel = nextDifficulty;
    quizData.questions = [...(quizData.questions || []), ...newQuestions];

    await ensureDir(jobDir);
    await fs.writeFile(quizPath, JSON.stringify(quizData, null, 2), 'utf-8');

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
  const jobDir = path.join(GENERATIONS_DIR, jobId);
  const quizPath = path.join(jobDir, 'quiz.json');

  try {
    const body = await request.json();
    if (!body || !Array.isArray(body.questions)) {
      return NextResponse.json({ error: 'Invalid payload: questions array expected' }, { status: 400 });
    }

    const quizContent = await fs.readFile(quizPath, 'utf-8');
    const quizData = JSON.parse(quizContent);

    quizData.questions = body.questions;
    if (typeof body.difficultyLevel === 'number') {
      quizData.difficultyLevel = body.difficultyLevel;
    }

    await ensureDir(jobDir);
    await fs.writeFile(quizPath, JSON.stringify(quizData, null, 2), 'utf-8');

    return NextResponse.json(quizData);
  } catch (err) {
    console.error('Quiz PATCH API error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save quiz progress' },
      { status: 500 }
    );
  }
}
