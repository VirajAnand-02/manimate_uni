import type { ChildProcessWithoutNullStreams } from 'child_process';

type ActiveJob = {
  controller: AbortController;
  children: Set<ChildProcessWithoutNullStreams>;
};

const globalKey = '__manimateActiveJobs';
const store = globalThis as typeof globalThis & { __manimateActiveJobs?: Map<string, ActiveJob> };

export const activeJobs = store[globalKey] ?? new Map<string, ActiveJob>();
store[globalKey] = activeJobs;

export function startActiveJob(jobId: string) {
  const active: ActiveJob = { controller: new AbortController(), children: new Set() };
  activeJobs.set(jobId, active);
  return active;
}

export function getActiveJob(jobId: string) {
  return activeJobs.get(jobId);
}

export function finishActiveJob(jobId: string) {
  activeJobs.delete(jobId);
}

export function cancelActiveJob(jobId: string) {
  const active = activeJobs.get(jobId);
  if (!active) return false;
  active.controller.abort();
  for (const child of active.children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  activeJobs.delete(jobId);
  return true;
}
