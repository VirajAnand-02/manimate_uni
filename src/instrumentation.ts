/**
 * Runs once when the Next.js server boots (Node runtime only).
 * See src/lib/manimate/reaper.ts for why orphaned jobs need clearing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reapOrphanedJobs } = await import('./lib/manimate/reaper');
  await reapOrphanedJobs();
}
