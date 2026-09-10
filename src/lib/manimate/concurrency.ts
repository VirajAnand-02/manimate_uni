import os from 'os';

/**
 * Run `fn` over `items` with at most `limit` in flight, preserving input order
 * in the returned array.
 *
 * Results are settled, not thrown: one scene failing must not abandon the other
 * renders already running, and the pipeline reports per-item failures itself.
 */
export type Settled<R> = { ok: boolean; value?: R; error?: unknown };

export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<Settled<R>>> {
  const width = Math.max(1, Math.floor(limit));
  const results = new Array<Settled<R>>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try {
        results[index] = { ok: true, value: await fn(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return results;
}

/**
 * How many Manim renders to run at once.
 *
 * Cairo rendering is effectively single-threaded, so concurrency scales with
 * cores — but each render holds a few hundred MB, so the default stays
 * deliberately conservative and leaves a core for Next itself.
 */
export function renderConcurrency() {
  const configured = Number(process.env.MANIM_RENDER_CONCURRENCY);
  if (Number.isFinite(configured) && configured >= 1) return Math.floor(configured);
  return Math.max(1, Math.min(4, (os.cpus()?.length ?? 2) - 1));
}

/**
 * Parallel LLM calls. Independent per module, but every provider rate-limits on
 * tokens per minute, so this defaults low — raise it only alongside a
 * multi-key *_API_KEYS rotation or a paid tier.
 */
export function llmConcurrency() {
  const configured = Number(process.env.LLM_CONCURRENCY);
  if (Number.isFinite(configured) && configured >= 1) return Math.floor(configured);
  return 2;
}

/** Kokoro synthesis is CPU-bound ONNX; it competes with Manim for the same cores. */
export function ttsConcurrency() {
  const configured = Number(process.env.TTS_CONCURRENCY);
  if (Number.isFinite(configured) && configured >= 1) return Math.floor(configured);
  return 2;
}

/**
 * A standalone concurrency gate for work that must start now but be awaited
 * later — TTS is kicked off as soon as the lecture plan exists and collected
 * once rendering is done, so it cannot use the all-at-once `pool` above.
 */
export function createLimiter(limit: number) {
  const width = Math.max(1, Math.floor(limit));
  let active = 0;
  const queue: Array<() => void> = [];

  const release = () => {
    active -= 1;
    queue.shift()?.();
  };

  return function run<R>(fn: () => Promise<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      const start = () => {
        active += 1;
        fn().then(resolve, reject).finally(release);
      };
      if (active < width) start();
      else queue.push(start);
    });
  };
}
