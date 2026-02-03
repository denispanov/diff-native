import type { BenchResult, CaseResult } from '../types.js';
import { mean, median, ratioOfMeans } from '../utils.js';

export function printSummary(result: BenchResult): void {
  console.log('\n=== Speedup Summary (jsdiff vs diff-native) ===');

  const diffCases = result.results.filter(r => r.kind === 'diff');
  const patchCases = result.results.filter(r => r.kind === 'patch');

  if (diffCases.length > 0) {
    console.log('\nDiff Overall');
    printGroupSummary('diff', diffCases);
    printLevelSummary(diffCases);
    printLengthBucketSummary(diffCases);
    printDiffBucketSummary(diffCases);
    printFixtureSummary(diffCases);
  }

  if (patchCases.length > 0) {
    console.log('\nPatch Overall');
    printGroupSummary('patch', patchCases);
    printFixtureSummary(patchCases);
  }
}

function printGroupSummary(label: string, cases: CaseResult[]): void {
  const meanSpeedup = mean(cases.map(c => c.speedup));
  const medianSpeedup = median(cases.map(c => c.speedup));
  const ratio = ratioOfMeans(
    cases.map(c => c.js.meanMs),
    cases.map(c => c.wasm.meanMs)
  );

  console.table([
    {
      group: label,
      cases: cases.length,
      mean_speedup: meanSpeedup.toFixed(2),
      median_speedup: medianSpeedup.toFixed(2),
      ratio_of_means: ratio.toFixed(2),
    },
  ]);
}

function printLevelSummary(cases: CaseResult[]): void {
  const byLevel = groupBy(cases, c => c.level ?? 'unknown');
  const rows = Object.entries(byLevel).map(([level, group]) => ({
    level,
    cases: group.length,
    mean_speedup: mean(group.map(c => c.speedup)).toFixed(2),
    median_speedup: median(group.map(c => c.speedup)).toFixed(2),
    ratio_of_means: ratioOfMeans(
      group.map(c => c.js.meanMs),
      group.map(c => c.wasm.meanMs)
    ).toFixed(2),
  }));

  console.log('\nBy Level');
  console.table(rows);
}

function printLengthBucketSummary(cases: CaseResult[]): void {
  const synthetic = cases.filter(c => !c.meta.fixture && c.meta.oldLength);
  if (synthetic.length === 0) return;

  const buckets = [
    { label: '<= 100', max: 100 },
    { label: '<= 500', max: 500 },
    { label: '<= 1000', max: 1000 },
    { label: '<= 3000', max: 3000 },
    { label: '> 3000', max: Number.POSITIVE_INFINITY },
  ];

  const rows = buckets
    .map(bucket => {
      const group = synthetic.filter(c => (c.meta.oldLength ?? 0) <= bucket.max);
      if (group.length === 0) return null;
      return {
        bucket: bucket.label,
        cases: group.length,
        mean_speedup: mean(group.map(c => c.speedup)).toFixed(2),
        ratio_of_means: ratioOfMeans(
          group.map(c => c.js.meanMs),
          group.map(c => c.wasm.meanMs)
        ).toFixed(2),
      };
    })
    .filter(Boolean);

  console.log('\nBy Length Bucket (synthetic only)');
  console.table(rows);
}

function printDiffBucketSummary(cases: CaseResult[]): void {
  const synthetic = cases.filter(c => !c.meta.fixture && c.meta.diffCount);
  if (synthetic.length === 0) return;

  const buckets = [
    { label: '<= 5', max: 5 },
    { label: '<= 25', max: 25 },
    { label: '<= 100', max: 100 },
    { label: '<= 500', max: 500 },
    { label: '> 500', max: Number.POSITIVE_INFINITY },
  ];

  const rows = buckets
    .map(bucket => {
      const group = synthetic.filter(c => (c.meta.diffCount ?? 0) <= bucket.max);
      if (group.length === 0) return null;
      return {
        bucket: bucket.label,
        cases: group.length,
        mean_speedup: mean(group.map(c => c.speedup)).toFixed(2),
        ratio_of_means: ratioOfMeans(
          group.map(c => c.js.meanMs),
          group.map(c => c.wasm.meanMs)
        ).toFixed(2),
      };
    })
    .filter(Boolean);

  console.log('\nBy Diff Bucket (synthetic only)');
  console.table(rows);
}

function printFixtureSummary(cases: CaseResult[]): void {
  const fixtures = cases.filter(c => c.meta.fixture);
  if (fixtures.length === 0) return;

  const byFixture = groupBy(fixtures, c => c.meta.fixture ?? 'unknown');
  const rows = Object.entries(byFixture).map(([fixture, group]) => ({
    fixture,
    cases: group.length,
    mean_speedup: mean(group.map(c => c.speedup)).toFixed(2),
    ratio_of_means: ratioOfMeans(
      group.map(c => c.js.meanMs),
      group.map(c => c.wasm.meanMs)
    ).toFixed(2),
  }));

  console.log('\nFixtures Summary');
  console.table(rows);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce(
    (acc, item) => {
      const key = keyFn(item);
      acc[key] = acc[key] ?? [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}
