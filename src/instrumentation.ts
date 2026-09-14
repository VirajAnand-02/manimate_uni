/**
 * Runs once when the Next.js server boots (Node runtime only).
 * See src/lib/manimate/reaper.ts for why orphaned jobs need clearing.
 */
const SWEEP_MS = 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { reapStaleJobs } = await import('./lib/manimate/reaper');
  await reapStaleJobs();

  // A job orphaned by *this* restart is not stale yet, so one pass at boot can
  // never catch it — the sweep does. Guarded on globalThis because dev-mode
  // reloads call register() again and would otherwise stack timers.
  const store = globalThis as typeof globalThis & { __manimateReaperTimer?: NodeJS.Timeout };
  if (store.__manimateReaperTimer) clearInterval(store.__manimateReaperTimer);
  store.__manimateReaperTimer = setInterval(() => { void reapStaleJobs(); }, SWEEP_MS);
  store.__manimateReaperTimer.unref?.();
}
