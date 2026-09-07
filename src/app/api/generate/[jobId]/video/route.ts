import { NextResponse } from 'next/server';
import { readFinalVideoPath } from '@/src/lib/manimate/jobStore';
import { signedUrl } from '@/src/lib/manimate/storage';
import { isValidJobId } from '@/src/lib/manimate/workspace';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Redirects to a short-lived signed Storage URL rather than proxying bytes.
 *
 * Supabase's CDN honours Range requests, and browsers reissue them against the
 * redirect target, so seeking still works — while playback traffic bypasses this
 * container entirely.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  if (!isValidJobId(jobId)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Reading through the RLS client is the ownership check: another user's job
  // simply returns no row.
  const key = await readFinalVideoPath(jobId, supabase);
  if (!key) return NextResponse.json({ error: 'Video not found' }, { status: 404 });

  // The browser ignores <a download> across origins, so ask Storage to set
  // Content-Disposition instead.
  const wantsDownload = new URL(request.url).searchParams.get('download') === '1';
  const url = await signedUrl(
    key,
    SIGNED_URL_TTL_SECONDS,
    wantsDownload ? `manimate_${jobId.slice(0, 8)}.mp4` : undefined,
  );
  if (!url) return NextResponse.json({ error: 'Could not sign video URL' }, { status: 500 });

  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}
