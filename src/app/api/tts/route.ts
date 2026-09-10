import { NextResponse } from 'next/server';
import { generateTtsAudio } from '@/src/lib/manimate/tts';
import { createClient } from '@/src/lib/supabase/server';
import { requestUser } from '@/src/lib/supabase/requestUser';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    // Synthesis is real CPU work; don't hand it out anonymously.
    const supabase = await createClient();
    const user = await requestUser();
    if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

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
