import type { Granularity } from '../types.js';
import { defaultRng } from './rng.js';
import { applyOps, isFeasible, pickOperationMix } from './text-ops.js';
import { buildTokens, tokensToText } from './text-tokens.js';

export interface DiffParams {
  level: Granularity;
  oldLength: number;
  newLength: number;
  diffCount: number; // jsdiff blocks
  diffMode?: 'onlyInsertions' | 'onlyDeletions' | 'mixed';
  samePrefix?: number;
  sameSuffix?: number;
  rng?: () => number;
}

export interface TextTestCase {
  oldText: string;
  newText: string;
}

export function generateExampleDiffTexts(params: DiffParams): TextTestCase {
  const rng = params.rng ?? defaultRng();
  const prefix = params.samePrefix ?? 0;
  const suffix = params.sameSuffix ?? 0;
  const mode = params.diffMode ?? 'mixed';

  if ([params.oldLength, params.newLength, params.diffCount, prefix, suffix].some(n => n < 0)) {
    throw new Error('lengths, diffCount, prefix, suffix must be ≥ 0');
  }

  const oldMid = params.oldLength - prefix - suffix;
  const newMid = params.newLength - prefix - suffix;
  if (oldMid < 0 || newMid < 0) {
    throw new Error('samePrefix + sameSuffix exceeds one of the lengths');
  }

  if (!isFeasible(oldMid, newMid, params.diffCount, mode)) {
    throw new Error(
      `Impossible combination: oldMid=${oldMid}, newMid=${newMid}, ` +
        `diffCount=${params.diffCount}, mode=${mode}. (Remember: replacement counts as 2 blocks for mixed mode.)`
    );
  }

  const mix = pickOperationMix(oldMid, newMid, params.diffCount, rng, mode);

  const prefixTokens = buildTokens(prefix, params.level, rng);
  const suffixTokens = buildTokens(suffix, params.level, rng);
  const oldMidTokens = buildTokens(oldMid, params.level, rng);
  const newMidTokens = applyOps(oldMidTokens, mix, params.level, rng);

  const oldTokens = [...prefixTokens, ...oldMidTokens, ...suffixTokens];
  const newTokens = [...prefixTokens, ...newMidTokens, ...suffixTokens];

  return {
    oldText: tokensToText(oldTokens, params.level, rng),
    newText: tokensToText(newTokens, params.level, rng),
  };
}
