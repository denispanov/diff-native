import { generateExampleJsonObjects } from '../generators/json-generator.js';
import { generateExampleDiffTexts } from '../generators/text-generator.js';
import type { BenchCase, CaseMeta, DiffMode, Granularity } from '../types.js';
import { createRng, hashString } from '../utils.js';

interface LengthConfig {
  length: number;
  densities: number[];
  prefixes: number[];
  modes: DiffMode[];
}

const TEXT_LEVELS: Granularity[] = ['char', 'word', 'sentence', 'line'];

export type SuiteKind = 'full' | 'quick';

export function buildSyntheticDiffCases(seed: number, suite: SuiteKind): BenchCase[] {
  const cases: BenchCase[] = [];

  for (const level of TEXT_LEVELS) {
    const configs = getLengthConfigs(level, suite);
    for (const cfg of configs) {
      const prefixPairs = buildPrefixSuffixPairs(cfg.prefixes);
      for (const density of cfg.densities) {
        for (const [prefix, suffix] of prefixPairs) {
          for (const mode of cfg.modes) {
            const diffCount = Math.max(1, Math.floor((cfg.length * density) / 100));
            const caseInfo = buildTextCaseMeta({
              level,
              oldLength: cfg.length,
              diffCount,
              densityPct: density,
              mode,
              prefix,
              suffix,
            });
            if (!caseInfo) continue;

            cases.push(buildDiffCase(caseInfo, seed));
          }
        }
      }
    }

    // Explicit small-diff in large files (synthetic, to mimic small edits in big files)
    if (suite === 'full' && level !== 'sentence') {
      const smallDiffs = [4, 24];
      for (const diffCount of smallDiffs) {
        for (const prefix of [0, 500]) {
          const caseInfo = buildTextCaseMeta({
            level,
            oldLength: 3000,
            diffCount,
            densityPct: undefined,
            mode: 'mixed',
            prefix,
            suffix: prefix,
            note: 'small-diff-large',
          });
          if (caseInfo) cases.push(buildDiffCase(caseInfo, seed));
        }
      }
    }

    // Super-large line files with tiny diffs (10k+ lines)
    if (suite === 'full' && level === 'line') {
      const hugeLengths = [10000, 20000];
      const tinyDiffs = [4, 20];
      for (const length of hugeLengths) {
        const prefixLarge = Math.floor(length * 0.4);
        for (const diffCount of tinyDiffs) {
          for (const prefix of [0, prefixLarge]) {
            const caseInfo = buildTextCaseMeta({
              level,
              oldLength: length,
              diffCount,
              densityPct: undefined,
              mode: 'mixed',
              prefix,
              suffix: prefix,
              note: 'small-diff-huge',
            });
            if (caseInfo) cases.push(buildDiffCase(caseInfo, seed));
          }
        }
      }
    }
  }

  cases.push(...buildJsonCases(seed, suite));
  return cases;
}

function buildJsonCases(seed: number, suite: SuiteKind): BenchCase[] {
  const cases: BenchCase[] = [];
  const jsonConfigs =
    suite === 'quick'
      ? [
          { length: 10, ops: [1, 2], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
          { length: 100, ops: [5, 20], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
          { length: 500, ops: [5, 25], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
        ]
      : [
          { length: 10, ops: [1, 2], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
          { length: 100, ops: [5, 20, 50], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
          { length: 500, ops: [5, 25, 100], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
          { length: 1000, ops: [10, 50, 200], modes: ['mixed', 'ins', 'del'] as DiffMode[] },
          { length: 3000, ops: [30, 150, 600], modes: ['mixed'] as DiffMode[] },
        ];

  for (const cfg of jsonConfigs) {
    for (const ops of cfg.ops) {
      for (const mode of cfg.modes) {
        const id = `json-K${cfg.length}-Ops${ops}-${mode}`;
        const meta: CaseMeta = {
          kind: 'diff',
          level: 'json',
          oldLength: cfg.length,
          newLength: cfg.length,
          diffCount: ops,
          densityPct: undefined,
          mode,
        };

        cases.push({
          id,
          kind: 'diff',
          level: 'json',
          meta,
          buildInput: () => {
            const rng = createRng(hashString(id) ^ seed);
            const { oldJson, newJson } = generateExampleJsonObjects({
              oldLength: cfg.length,
              newLength: cfg.length,
              diffCount: ops,
              diffMode:
                mode === 'mixed' ? 'mixed' : mode === 'ins' ? 'onlyInsertions' : 'onlyDeletions',
              rng,
            });
            return {
              oldValue: JSON.parse(oldJson),
              newValue: JSON.parse(newJson),
            };
          },
        });
      }
    }
  }

  return cases;
}

function buildDiffCase(
  meta: CaseMeta & {
    level: Granularity;
    oldLength: number;
    newLength: number;
    diffCount: number;
    mode: DiffMode;
    prefix: number;
    suffix: number;
    densityPct?: number;
  },
  seed: number
): BenchCase {
  const id = meta.note
    ? `${meta.level}-L${meta.oldLength}-diff${meta.diffCount}-${meta.note}-pre${meta.prefix}-suf${meta.suffix}`
    : meta.densityPct
      ? `${meta.level}-L${meta.oldLength}-D${meta.densityPct}%-pre${meta.prefix}-suf${meta.suffix}-${meta.mode}`
      : `${meta.level}-L${meta.oldLength}-diff${meta.diffCount}-pre${meta.prefix}-suf${meta.suffix}-${meta.mode}`;

  const caseMeta: CaseMeta = {
    ...meta,
    kind: 'diff',
  };

  return {
    id,
    kind: 'diff',
    level: meta.level,
    meta: caseMeta,
    buildInput: () => {
      const rng = createRng(hashString(id) ^ seed);
      const { oldText, newText } = generateExampleDiffTexts({
        level: meta.level,
        oldLength: meta.oldLength,
        newLength: meta.newLength,
        diffCount: meta.diffCount,
        diffMode:
          meta.mode === 'mixed'
            ? 'mixed'
            : meta.mode === 'ins'
              ? 'onlyInsertions'
              : 'onlyDeletions',
        samePrefix: meta.prefix,
        sameSuffix: meta.suffix,
        rng,
      });

      return {
        oldValue: oldText,
        newValue: newText,
      };
    },
  };
}

function buildTextCaseMeta(input: {
  level: Granularity;
  oldLength: number;
  diffCount: number;
  densityPct?: number;
  mode: DiffMode;
  prefix: number;
  suffix: number;
  note?: string;
}):
  | (CaseMeta & {
      level: Granularity;
      oldLength: number;
      newLength: number;
      diffCount: number;
      mode: DiffMode;
      prefix: number;
      suffix: number;
      densityPct?: number;
      note?: string;
    })
  | null {
  const { level, oldLength, diffCount, mode, prefix, suffix, densityPct, note } = input;

  if (prefix + suffix > oldLength) return null;

  let newLength = oldLength;
  if (mode === 'ins') {
    newLength = oldLength + diffCount;
  } else if (mode === 'del') {
    if (oldLength - diffCount < 0) return null;
    newLength = oldLength - diffCount;
  } else {
    const delta = Math.floor(diffCount / 4);
    newLength = oldLength + (diffCount & 1 ? delta : -delta);
  }

  if (prefix + suffix > newLength) return null;

  let adjustedDiff = diffCount;
  if (mode === 'mixed') {
    const differenceLength = newLength - oldLength;
    if ((differenceLength + adjustedDiff) % 2 === 1) {
      adjustedDiff += 1;
    }
  }

  const oldMid = oldLength - prefix - suffix;
  const newMid = newLength - prefix - suffix;
  if (!isFeasible(oldMid, newMid, adjustedDiff, mode)) return null;

  return {
    kind: 'diff',
    level,
    oldLength,
    newLength,
    diffCount: adjustedDiff,
    densityPct,
    mode,
    prefix,
    suffix,
    note,
  };
}

function getLengthConfigs(level: Granularity, suite: SuiteKind): LengthConfig[] {
  const configs: LengthConfig[] = [];

  if (suite === 'quick') {
    configs.push({
      length: 10,
      densities: [5, 20],
      prefixes: [0],
      modes: ['mixed', 'ins', 'del'],
    });

    configs.push({
      length: 100,
      densities: [5, 20],
      prefixes: [0, 50],
      modes: ['mixed', 'ins', 'del'],
    });

    configs.push({
      length: 500,
      densities: level === 'char' || level === 'line' ? [5, 20] : [5, 20],
      prefixes: [0, 50],
      modes: ['mixed', 'ins', 'del'],
    });

    return configs;
  }

  configs.push({
    length: 10,
    densities: [1, 5, 20, 50],
    prefixes: [0],
    modes: ['mixed', 'ins', 'del'],
  });

  configs.push({
    length: 100,
    densities: [1, 5, 20, 50],
    prefixes: [0, 50],
    modes: ['mixed', 'ins', 'del'],
  });

  const midDensities = level === 'char' || level === 'line' ? [1, 5, 20, 50] : [1, 5, 20];
  configs.push({
    length: 500,
    densities: midDensities,
    prefixes: [0, 50],
    modes: ['mixed', 'ins', 'del'],
  });

  const modes1000: DiffMode[] = level === 'sentence' ? ['mixed'] : ['mixed', 'ins'];
  const prefixes1000 = level === 'sentence' ? [0] : [0, 500];
  configs.push({
    length: 1000,
    densities: [1, 5, 20],
    prefixes: prefixes1000,
    modes: modes1000,
  });

  const modes3000: DiffMode[] = level === 'sentence' ? ['mixed'] : ['mixed', 'ins'];
  const prefixes3000 = level === 'sentence' ? [0] : [0, 500];
  configs.push({
    length: 3000,
    densities: [1, 5, 20],
    prefixes: prefixes3000,
    modes: modes3000,
  });

  return configs;
}

function buildPrefixSuffixPairs(prefixes: number[]): Array<[number, number]> {
  if (prefixes.length <= 1) return [[prefixes[0] ?? 0, prefixes[0] ?? 0]];
  const unique = Array.from(new Set(prefixes));
  return [
    [unique[0], unique[0]],
    [unique[unique.length - 1], unique[unique.length - 1]],
  ];
}

function isFeasible(oldMid: number, newMid: number, diffCount: number, mode: DiffMode): boolean {
  if (diffCount < 0) return false;

  if (mode === 'ins') {
    return newMid === oldMid + diffCount;
  }
  if (mode === 'del') {
    return oldMid === newMid + diffCount;
  }

  const delta = newMid - oldMid;
  if ((diffCount + delta) & 1) return false;

  const total = (diffCount + delta) >> 1;
  const removed = (diffCount - delta) >> 1;
  return total >= 0 && removed >= 0 && total <= newMid && removed <= oldMid;
}
