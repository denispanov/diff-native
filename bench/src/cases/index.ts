import type { BenchCase } from '../types.js';
import { buildFixtureCases } from './fixtures.js';
import { buildSyntheticPatchCases } from './patch.js';
import { buildSyntheticDiffCases } from './synthetic.js';

export type SuiteKind = 'full' | 'quick';

export function buildCases(seed: number, suite: SuiteKind): BenchCase[] {
  const cases: BenchCase[] = [];
  cases.push(...buildSyntheticDiffCases(seed, suite));
  cases.push(...buildSyntheticPatchCases(seed, suite));
  cases.push(...buildFixtureCases());
  return cases;
}
