import { performance } from 'node:perf_hooks';
import type { Metrics } from './types.js';
import { mean, p95 } from './utils.js';

export function measure<Args extends readonly unknown[]>(
  fn: (...args: Args) => unknown,
  args: Args,
  runs: number
): Metrics {
  const times: number[] = [];
  const heap: number[] = [];
  const rss: number[] = [];

  for (let i = 0; i < runs; i++) {
    if (globalThis.gc) {
      globalThis.gc();
    }
    const mem0 = process.memoryUsage();
    const t0 = performance.now();
    fn(...args);
    const t1 = performance.now();
    const mem1 = process.memoryUsage();

    times.push(t1 - t0);
    heap.push(mem1.heapUsed - mem0.heapUsed);
    rss.push(mem1.rss - mem0.rss);
  }

  return {
    meanMs: mean(times),
    p95Ms: p95(times),
    meanHeapBytes: mean(heap),
    p95HeapBytes: p95(heap),
    meanRssBytes: mean(rss),
    p95RssBytes: p95(rss),
  };
}
