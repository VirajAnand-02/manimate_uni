import { NextResponse } from 'next/server';
import { generateTtsAudio } from '@/src/lib/manimate/tts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, voice, file_base } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'text is required and must be a non-empty string' }, { status: 400 });
    }

    const data = await generateTtsAudio(text, {
      voice: typeof voice === 'string' ? voice : undefined,
      fileBase: typeof file_base === 'string' ? file_base : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TTS request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
