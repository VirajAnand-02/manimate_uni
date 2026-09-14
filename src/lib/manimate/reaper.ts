import 'server-only';
import { adminClient } from '@/src/lib/supabase/admin';

/**
 * How long a job may go without a heartbeat before it is considered orphaned.
 *
 * Must comfortably exceed HEARTBEAT_MS in the pipeline; the gap absorbs a slow
 * database write or a long render tick without declaring a healthy job dead.
 */
const STALE_AFTER_MS = 3 * 60 * 1000;

/**
 * Fail jobs whose owning process died.
 *
 * This used to fail *every* pending/queued/running row at boot, on the
 * assumption that a single always-on instance was the only thing writing to the
 * table. That stopped being true the moment a local dev server and a deployed
 * container shared one Supabase project: each boot killed the other's in-flight
 * render, and in dev merely editing next.config.ts was enough to do it.
 *
 * A live job heartbeats; an orphaned one goes silent. So staleness is the signal,
 * not status — and because a freshly orphaned job is not yet stale, this runs on
 * a sweep rather than only at boot.
 */
export async function reapStaleJobs() {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data, error } = await adminClient()
      .from('jobs')
      .update({
        status: 'failed',
        current_stage: null,
        error: 'Generation stopped responding — the server restarted or the render crashed. Please run it again.',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('status', ['pending', 'queued', 'running'])
      .lt('updated_at', cutoff)
      .select('id');

    if (error) {
      console.error('[reaper] could not reap stale jobs:', error.message);
      return 0;
    }
    const count = data?.length ?? 0;
    if (count) console.log(`[reaper] failed ${count} stale job(s) (no heartbeat for ${STALE_AFTER_MS / 60000}m)`);
    return count;
  } catch (err) {
    // Never let a bad/absent Supabase config stop the server from booting.
    console.error('[reaper] skipped:', err instanceof Error ? err.message : err);
    return 0;
  }
}
