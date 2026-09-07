// Held on globalThis (like activeJobs) so a dev HMR module reload cannot reset
// the counter and let more renders through than MAX_CONCURRENT_JOBS allows.
type QueueState = { running: number; waiters: Array<() => void> };

const store = globalThis as typeof globalThis & { __manimateQueue?: QueueState };
const state: QueueState = store.__manimateQueue ?? { running: 0, waiters: [] };
store.__manimateQueue = state;

function maxConcurrentJobs() {
  return Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 1));
}

export async function acquireJobSlot() {
  if (state.running >= maxConcurrentJobs()) {
    await new Promise<void>((resolve) => state.waiters.push(resolve));
  }
  state.running += 1;
}

export function releaseJobSlot() {
  state.running = Math.max(0, state.running - 1);
  const next = state.waiters.shift();
  if (next) next();
}

export function queueStats() {
  const slots = maxConcurrentJobs();
  return {
    running: state.running,
    queued: state.waiters.length,
    workerSlots: slots,
    availableSlots: Math.max(0, slots - state.running),
  };
}
