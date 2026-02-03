import type { BenchResult } from '../types.js';
import { formatBytes } from '../utils.js';

export interface CompareOptions {
  warnPct: number;
  strongPct: number;
  maxRows?: number;
}

interface DeltaRow {
  id: string;
  kind: string;
  level: string;
  deltaMeanPct: number;
  deltaP95Pct: number;
  deltaHeapBytes: number;
  deltaRssBytes: number;
  speedup: number;
  baselineSpeedup: number;
  currentMeanMs: number;
  baselineMeanMs: number;
}

function pctChange(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

export function printComparison(
  current: BenchResult,
  baseline: BenchResult,
  opts: CompareOptions
): void {
  const baseById = new Map(baseline.results.map(r => [r.id, r]));
  const rows: DeltaRow[] = [];

  for (const cur of current.results) {
    const base = baseById.get(cur.id);
    if (!base) continue;

    rows.push({
      id: cur.id,
      kind: cur.kind,
      level: cur.level ?? 'unknown',
      deltaMeanPct: pctChange(cur.wasm.meanMs, base.wasm.meanMs),
      deltaP95Pct: pctChange(cur.wasm.p95Ms, base.wasm.p95Ms),
      deltaHeapBytes: cur.wasm.meanHeapBytes - base.wasm.meanHeapBytes,
      deltaRssBytes: cur.wasm.meanRssBytes - base.wasm.meanRssBytes,
      speedup: cur.speedup,
      baselineSpeedup: base.speedup,
      currentMeanMs: cur.wasm.meanMs,
      baselineMeanMs: base.wasm.meanMs,
    });
  }

  const regressions = rows
    .filter(r => r.deltaMeanPct >= opts.warnPct)
    .sort((a, b) => b.deltaMeanPct - a.deltaMeanPct);
  const improvements = rows
    .filter(r => r.deltaMeanPct <= -opts.warnPct)
    .sort((a, b) => a.deltaMeanPct - b.deltaMeanPct);

  const strongRegressions = regressions.filter(r => r.deltaMeanPct >= opts.strongPct);

  console.log('\n=== Benchmark Comparison vs Baseline ===');
  console.log(
    `Regressions (mean >= ${opts.warnPct}%): ${regressions.length} (strong >= ${opts.strongPct}%: ${strongRegressions.length})`
  );
  console.log(`Improvements (mean <= -${opts.warnPct}%): ${improvements.length}`);

  const maxRows = opts.maxRows ?? 10;

  if (regressions.length > 0) {
    console.log('\nTop Regressions (by wasm mean ms)');
    console.table(
      regressions.slice(0, maxRows).map(r => ({
        id: r.id,
        kind: r.kind,
        lvl: r.level,
        'Δmean%': r.deltaMeanPct.toFixed(2),
        'Δp95%': r.deltaP95Pct.toFixed(2),
        Δheap: formatBytes(r.deltaHeapBytes),
        Δrss: formatBytes(r.deltaRssBytes),
        speedup: r.speedup.toFixed(2),
      }))
    );
  }

  if (improvements.length > 0) {
    console.log('\nTop Improvements (by wasm mean ms)');
    console.table(
      improvements.slice(0, maxRows).map(r => ({
        id: r.id,
        kind: r.kind,
        lvl: r.level,
        'Δmean%': r.deltaMeanPct.toFixed(2),
        'Δp95%': r.deltaP95Pct.toFixed(2),
        Δheap: formatBytes(r.deltaHeapBytes),
        Δrss: formatBytes(r.deltaRssBytes),
        speedup: r.speedup.toFixed(2),
      }))
    );
  }

  if (rows.length === 0) {
    console.log('No overlapping cases between current run and baseline.');
  }
}
