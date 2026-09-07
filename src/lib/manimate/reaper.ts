import 'server-only';
import { adminClient } from '@/src/lib/supabase/admin';

/**
 * Fail jobs that were mid-render when the process died.
 *
 * Renders run as a detached promise inside this one container, so any row still
 * pending/running at boot was orphaned by a restart or crash. Without this they
 * stay "running" forever and the Studio page polls them every 2s indefinitely.
 */
export async function reapOrphanedJobs() {
  try {
    const { data, error } = await adminClient()
      .from('jobs')
      .update({
        status: 'failed',
        current_stage: null,
        error: 'Interrupted by a server restart. Please run this generation again.',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('status', ['pending', 'queued', 'running'])
      .select('id');

    if (error) {
      console.error('[reaper] could not reap orphaned jobs:', error.message);
      return 0;
    }
    const count = data?.length ?? 0;
    if (count) console.log(`[reaper] failed ${count} job(s) orphaned by a restart`);
    return count;
  } catch (err) {
    // Never let a bad/absent Supabase config stop the server from booting.
    console.error('[reaper] skipped:', err instanceof Error ? err.message : err);
    return 0;
  }
}
