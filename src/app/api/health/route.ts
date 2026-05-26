import { NextResponse } from 'next/server';
import { listJobs } from '@/src/lib/manimate/jobStore';
import { queueStats } from '@/src/lib/manimate/queue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const jobs = await listJobs().catch(() => []);
  const stats = queueStats();
  const queued = Math.max(stats.queued, jobs.filter((job) => job.status === 'pending' || job.status === 'queued').length);
  return NextResponse.json({
    status: 'ok',
    running_jobs: stats.running,
    queued_jobs: queued,
    worker_slots: stats.workerSlots,
    available_slots: stats.availableSlots,
  });
}
