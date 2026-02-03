import type { Granularity } from '../types.js';
import { pickIndices } from './text-indices.js';
import { buildInsertMap, randomToken } from './text-tokens.js';

interface Mix {
  ins: number;
  del: number;
  rep: number;
}

export function isFeasible(
  oldMid: number,
  newMid: number,
  diffCount: number,
  mode: 'onlyInsertions' | 'onlyDeletions' | 'mixed'
): boolean {
  const delta = newMid - oldMid;
  if (diffCount < 0) return false;

  if (mode === 'onlyInsertions') {
    return newMid === oldMid + diffCount;
  }
  if (mode === 'onlyDeletions') {
    return oldMid === newMid + diffCount;
  }

  if ((diffCount + delta) & 1) return false;
  const total = (diffCount + delta) >> 1;
  const removed = (diffCount - delta) >> 1;
  return total >= 0 && removed >= 0 && total <= newMid && removed <= oldMid;
}

/**
 * Randomly pick (ins, del, rep) satisfying all constraints.
 *
 *  ins + rep      = total   where  total = (diffC + d)/2
 *  ins - del      = d
 *  0 ≤ rep ≤ min(oldMid,newMid)
 *  0 ≤ del ≤ oldMid
 *  0 ≤ ins ≤ newMid
 */
export function pickOperationMix(
  oldMid: number,
  newMid: number,
  diffCount: number,
  rng: () => number,
  mode: 'onlyInsertions' | 'onlyDeletions' | 'mixed'
): Mix {
  if (mode === 'onlyInsertions') {
    if (newMid !== oldMid + diffCount) {
      throw new Error(
        `Internal: Inconsistent state for onlyInsertions. newMid=${newMid}, oldMid=${oldMid}, diffC=${diffCount}`
      );
    }
    return { ins: diffCount, del: 0, rep: 0 };
  }
  if (mode === 'onlyDeletions') {
    if (oldMid !== newMid + diffCount) {
      throw new Error(
        `Internal: Inconsistent state for onlyDeletions. oldMid=${oldMid}, newMid=${newMid}, diffC=${diffCount}`
      );
    }
    return { ins: 0, del: diffCount, rep: 0 };
  }

  const delta = newMid - oldMid;
  const total = (diffCount + delta) >> 1;
  const remMax = Math.min(oldMid, newMid);

  const repMin = Math.max(0, total - newMid, (diffCount - delta) / 2 - oldMid);
  const repMaxValid = Math.min(remMax, total - Math.max(0, delta));

  if (repMin > repMaxValid) {
    throw new Error(
      `Internal: no rep range for mixed mode. oldMid=${oldMid}, newMid=${newMid}, diffC=${diffCount}. ` +
        `d=${delta}, total=${total}, removed=${(diffCount - delta) >> 1}. ` +
        `repMin=${repMin}, repMaxValid=${repMaxValid}`
    );
  }

  const rep = repMin + Math.floor(rng() * (repMaxValid - repMin + 1));
  const ins = total - rep;
  const del = ins - delta;

  if (
    ins < 0 ||
    del < 0 ||
    rep < 0 ||
    ins + del + 2 * rep !== diffCount ||
    oldMid - del + ins !== newMid
  ) {
    throw new Error(
      'Internal consistency check failed for mixed mode ops calculation. ' +
        `Inputs: oldMid=${oldMid}, newMid=${newMid}, diffC=${diffCount}. ` +
        `Calculated: ins=${ins}, del=${del}, rep=${rep}.`
    );
  }

  return { ins, del, rep };
}

export function applyOps(
  oldTokens: string[],
  mix: Mix,
  level: Granularity,
  rng: () => number
): string[] {
  const n = oldTokens.length;
  const delPos = pickIndices(mix.del, n, rng);
  const repPos = pickIndices(mix.rep, n - mix.del, rng, delPos);
  const insMap = buildInsertMap(mix.ins, n, level, rng);

  const out: string[] = [];
  let di = 0;
  let ri = 0;

  for (let i = 0; i < n; i++) {
    flushInserts(i);

    if (di < delPos.length && delPos[di] === i) {
      di++;
      continue;
    }
    if (ri < repPos.length && repPos[ri] === i) {
      out.push(randomToken(level, rng));
      ri++;
      continue;
    }
    out.push(oldTokens[i]);
  }
  flushInserts(n);
  return out;

  function flushInserts(pos: number) {
    const list = insMap.get(pos);
    if (list) for (const t of list) out.push(t);
  }
}
