let running = 0;
const waiters: Array<() => void> = [];

function maxConcurrentJobs() {
  return Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS || 1));
}

export async function acquireJobSlot() {
  if (running >= maxConcurrentJobs()) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  running += 1;
}

export function releaseJobSlot() {
  running = Math.max(0, running - 1);
  const next = waiters.shift();
  if (next) next();
}

export function queueStats() {
  const slots = maxConcurrentJobs();
  return {
    running,
    queued: waiters.length,
    workerSlots: slots,
    availableSlots: Math.max(0, slots - running),
  };
}
