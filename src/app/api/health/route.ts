import { NextResponse } from 'next/server';
import { listJobs } from '@/src/lib/manimate/jobStore';
import { queueStats } from '@/src/lib/manimate/queue';
import { createClient } from '@/src/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const stats = queueStats();

  // Queue stats are process-wide, but the pending count is scoped to the caller
  // so this endpoint never reports on other users' work.
  let ownPending = 0;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const jobs = await listJobs(supabase);
      ownPending = jobs.filter((j) => j.status === 'pending' || j.status === 'queued').length;
    }
  } catch {
    // Health must answer even when Supabase is unreachable.
  }

  return NextResponse.json({
    status: 'ok',
    running_jobs: stats.running,
    queued_jobs: Math.max(stats.queued, ownPending),
    worker_slots: stats.workerSlots,
    available_slots: stats.availableSlots,
  });
}
