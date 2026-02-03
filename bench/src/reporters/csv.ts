import type { BenchResult } from '../types.js';

export function toCsv(result: BenchResult): string {
  const header = [
    'id',
    'kind',
    'level',
    'js_mean_ms',
    'js_p95_ms',
    'wasm_mean_ms',
    'wasm_p95_ms',
    'js_mean_heap_bytes',
    'wasm_mean_heap_bytes',
    'js_mean_rss_bytes',
    'wasm_mean_rss_bytes',
    'speedup',
    'fixture',
    'old_length',
    'diff_count',
    'density_pct',
    'mode',
  ];

  const rows = result.results.map(r => [
    r.id,
    r.kind,
    r.level ?? '',
    r.js.meanMs.toFixed(3),
    r.js.p95Ms.toFixed(3),
    r.wasm.meanMs.toFixed(3),
    r.wasm.p95Ms.toFixed(3),
    Math.round(r.js.meanHeapBytes).toString(),
    Math.round(r.wasm.meanHeapBytes).toString(),
    Math.round(r.js.meanRssBytes).toString(),
    Math.round(r.wasm.meanRssBytes).toString(),
    r.speedup.toFixed(3),
    r.meta.fixture ?? '',
    r.meta.oldLength?.toString() ?? '',
    r.meta.diffCount?.toString() ?? '',
    r.meta.densityPct?.toString() ?? '',
    r.meta.mode ?? '',
  ]);

  return [header.join(','), ...rows.map(r => r.join(','))].join('\n');
}
