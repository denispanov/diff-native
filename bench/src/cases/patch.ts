import { generateExampleDiffTexts } from '../generators/text-generator.js';
import type { BenchCase, CaseMeta } from '../types.js';
import { createRng, hashString } from '../utils.js';

export type SuiteKind = 'full' | 'quick';

export function buildSyntheticPatchCases(seed: number, suite: SuiteKind): BenchCase[] {
  const cases: BenchCase[] = [];

  const configs =
    suite === 'quick'
      ? [
          { length: 100, density: 5, prefix: 0 },
          { length: 500, density: 5, prefix: 0 },
          { length: 1000, density: 1, prefix: 200 },
        ]
      : [
          { length: 100, density: 5, prefix: 0 },
          { length: 500, density: 5, prefix: 0 },
          { length: 1000, density: 1, prefix: 200 },
          { length: 1000, density: 5, prefix: 0 },
          { length: 3000, density: 1, prefix: 500 },
          { length: 3000, density: 5, prefix: 0 },
        ];

  for (const cfg of configs) {
    const normalized = normalizeDiffCount(
      cfg.length,
      cfg.prefix,
      Math.floor((cfg.length * cfg.density) / 100)
    );
    if (!normalized) continue;

    const id = `patch-line-L${cfg.length}-D${cfg.density}%-pre${cfg.prefix}`;
    cases.push(
      buildPatchCase({
        id,
        length: cfg.length,
        diffCount: normalized.diffCount,
        densityPct: cfg.density,
        prefix: cfg.prefix,
        seed,
      })
    );
  }

  if (suite === 'full') {
    const hugeLengths = [10000, 20000];
    const tinyDiffs = [4, 20];
    for (const length of hugeLengths) {
      const prefixLarge = Math.floor(length * 0.4);
      for (const diffCount of tinyDiffs) {
        for (const prefix of [0, prefixLarge]) {
          const normalized = normalizeDiffCount(length, prefix, diffCount);
          if (!normalized) continue;

          const id = `patch-line-L${length}-diff${normalized.diffCount}-small-diff-huge-pre${prefix}`;
          cases.push(
            buildPatchCase({
              id,
              length,
              diffCount: normalized.diffCount,
              densityPct: undefined,
              prefix,
              seed,
            })
          );
        }
      }
    }
  }

  return cases;
}

function buildPatchCase(params: {
  id: string;
  length: number;
  diffCount: number;
  densityPct?: number;
  prefix: number;
  seed: number;
}): BenchCase {
  const meta: CaseMeta = {
    kind: 'patch',
    level: 'line',
    oldLength: params.length,
    newLength: params.length,
    diffCount: params.diffCount,
    densityPct: params.densityPct,
    prefix: params.prefix,
    suffix: params.prefix,
  };

  return {
    id: params.id,
    kind: 'patch',
    level: 'line',
    meta,
    buildInput: () => {
      const rng = createRng(hashString(params.id) ^ params.seed);
      const { oldText, newText } = generateExampleDiffTexts({
        level: 'line',
        oldLength: params.length,
        newLength: params.length,
        diffCount: params.diffCount,
        diffMode: 'mixed',
        samePrefix: params.prefix,
        sameSuffix: params.prefix,
        rng,
      });

      return {
        oldFileName: 'synthetic.txt',
        newFileName: 'synthetic.txt',
        oldStr: oldText,
        newStr: newText,
        oldHeader: '',
        newHeader: '',
      };
    },
  };
}

function normalizeDiffCount(
  length: number,
  prefix: number,
  diffCount: number
): { diffCount: number } | null {
  const oldMid = length - prefix - prefix;
  if (oldMid <= 0) return null;

  let normalized = Math.max(1, diffCount);
  if (normalized % 2 === 1) normalized += 1;
  const maxDiff = 2 * oldMid;
  if (normalized > maxDiff) normalized = maxDiff - (maxDiff % 2);
  if (normalized <= 0) return null;

  return { diffCount: normalized };
}
