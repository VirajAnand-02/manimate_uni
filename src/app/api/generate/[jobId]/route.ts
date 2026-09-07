import { NextResponse } from 'next/server';
import { cancelActiveJob } from '@/src/lib/manimate/activeJobs';
import { deleteJob, patchMetadata, readMetadata } from '@/src/lib/manimate/jobStore';
import { removeJobArtifacts } from '@/src/lib/manimate/storage';
import { removeJobWorkDir, isValidJobId } from '@/src/lib/manimate/workspace';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

  // RLS returns nothing for another user's job, so this 404s rather than leaking.
  const metadata = await readMetadata(jobId, supabase);
  if (!metadata) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  return NextResponse.json(metadata);
}

export async function DELETE(
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

  const { searchParams } = new URL(request.url);
  const discard = searchParams.get('discard') === 'true';

  try {
    const metadata = await readMetadata(jobId, supabase);
    if (!metadata) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    cancelActiveJob(jobId);

    if (discard) {
      await removeJobArtifacts(user.id, jobId);
      await removeJobWorkDir(jobId);
      await deleteJob(jobId, supabase);
      return new Response(null, { status: 204 });
    }

    if (metadata.status === 'completed' || metadata.status === 'failed') {
      return NextResponse.json({ message: `Job already ${metadata.status}` }, { status: 200 });
    }

    await patchMetadata(
      jobId,
      {
        status: 'failed',
        current_stage: null,
        error: 'Job cancelled by user',
        finished_at: new Date().toISOString(),
      },
      supabase,
    );

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('Cancel job error:', err);
    const message = err instanceof Error ? err.message : 'Failed to cancel job';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
