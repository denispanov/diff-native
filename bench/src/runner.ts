import { performance } from 'node:perf_hooks';
import { measure } from './measure.js';
import type { DiffTargetMap } from './targets/diff.js';
import type { PatchTargetMap } from './targets/patch.js';
import type { BenchCase, CaseResult, DiffInput, PatchInput } from './types.js';
import { validateDiff, validatePatch } from './validate.js';

export interface RunConfig {
  iterationsBase: number;
  validate: boolean;
}

export async function runCases(
  cases: BenchCase[],
  diffTargets: DiffTargetMap,
  patchTargets: PatchTargetMap,
  config: RunConfig
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (let idx = 0; idx < cases.length; idx++) {
    const benchCase = cases[idx];
    const tCase = performance.now();
    process.stdout.write(`[${idx + 1}/${cases.length}] ${benchCase.id} … `);

    const input = benchCase.buildInput();
    const iterations = iterationsForCase(config.iterationsBase, benchCase);

    if (benchCase.kind === 'diff') {
      const diffInput = input as DiffInput;
      const level = benchCase.level ?? 'char';

      switch (level) {
        case 'char': {
          const jsFn = diffTargets.char.js;
          const wasmFn = diffTargets.char.wasm;
          const args: Parameters<typeof jsFn> = buildStringArgs(diffInput, benchCase.id);
          results.push(buildDiffResult(benchCase, jsFn, wasmFn, args, iterations, config.validate));
          break;
        }
        case 'word': {
          const jsFn = diffTargets.word.js;
          const wasmFn = diffTargets.word.wasm;
          const args: Parameters<typeof jsFn> = buildStringArgs(diffInput, benchCase.id);
          results.push(buildDiffResult(benchCase, jsFn, wasmFn, args, iterations, config.validate));
          break;
        }
        case 'sentence': {
          const jsFn = diffTargets.sentence.js;
          const wasmFn = diffTargets.sentence.wasm;
          const args: Parameters<typeof jsFn> = buildStringArgs(diffInput, benchCase.id);
          results.push(buildDiffResult(benchCase, jsFn, wasmFn, args, iterations, config.validate));
          break;
        }
        case 'line': {
          const jsFn = diffTargets.line.js;
          const wasmFn = diffTargets.line.wasm;
          const args: Parameters<typeof jsFn> = buildStringArgs(diffInput, benchCase.id);
          results.push(buildDiffResult(benchCase, jsFn, wasmFn, args, iterations, config.validate));
          break;
        }
        case 'json': {
          const jsFn = diffTargets.json.js;
          const wasmFn = diffTargets.json.wasm;
          const args: Parameters<typeof jsFn> = buildJsonArgs(diffInput, benchCase.id);
          results.push(buildDiffResult(benchCase, jsFn, wasmFn, args, iterations, config.validate));
          break;
        }
      }
    } else {
      const patch = patchTargets.createTwoFilesPatch;
      const jsFn = patch.js;
      const wasmFn = patch.wasm;
      const patchInput = input as PatchInput;

      const args: Parameters<typeof jsFn> = [
        patchInput.oldFileName,
        patchInput.newFileName,
        patchInput.oldStr,
        patchInput.newStr,
        patchInput.oldHeader,
        patchInput.newHeader,
      ];

      results.push(buildPatchResult(benchCase, jsFn, wasmFn, args, iterations, config.validate));
    }

    console.log(`done (${(performance.now() - tCase).toFixed(1)} ms)`);
  }

  return results;
}

function buildStringArgs(input: DiffInput, id: string): [string, string] {
  assertString(input.oldValue, `${id}.oldValue`);
  assertString(input.newValue, `${id}.newValue`);
  return [input.oldValue, input.newValue];
}

function buildJsonArgs(input: DiffInput, id: string): [string | object, string | object] {
  assertJsonValue(input.oldValue, `${id}.oldValue`);
  assertJsonValue(input.newValue, `${id}.newValue`);
  return [input.oldValue, input.newValue];
}

function buildDiffResult<Args extends readonly unknown[], R>(
  benchCase: BenchCase,
  jsFn: (...args: Args) => R,
  wasmFn: (...args: Args) => R,
  args: Args,
  iterations: number,
  validate: boolean
): CaseResult {
  if (validate) {
    const jsOut = jsFn(...args);
    const wasmOut = wasmFn(...args);
    validateDiff(jsOut, wasmOut);
  }

  const jsMetrics = measure(jsFn, args, iterations);
  const wasmMetrics = measure(wasmFn, args, iterations);

  return {
    id: benchCase.id,
    kind: 'diff',
    level: benchCase.level,
    meta: benchCase.meta,
    js: jsMetrics,
    wasm: wasmMetrics,
    speedup: jsMetrics.meanMs === 0 ? 0 : jsMetrics.meanMs / wasmMetrics.meanMs,
  };
}

function buildPatchResult<Args extends readonly unknown[], R>(
  benchCase: BenchCase,
  jsFn: (...args: Args) => R,
  wasmFn: (...args: Args) => R,
  args: Args,
  iterations: number,
  validate: boolean
): CaseResult {
  if (validate) {
    const jsOut = jsFn(...args);
    const wasmOut = wasmFn(...args);
    validatePatch(jsOut, wasmOut);
  }

  const jsMetrics = measure(jsFn, args, iterations);
  const wasmMetrics = measure(wasmFn, args, iterations);

  return {
    id: benchCase.id,
    kind: 'patch',
    level: benchCase.level,
    meta: benchCase.meta,
    js: jsMetrics,
    wasm: wasmMetrics,
    speedup: jsMetrics.meanMs === 0 ? 0 : jsMetrics.meanMs / wasmMetrics.meanMs,
  };
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Expected ${label} to be a string for diff benchmark`);
  }
}

function assertJsonValue(value: unknown, label: string): asserts value is string | object {
  if (typeof value === 'string') return;
  if (typeof value === 'object' && value !== null) return;
  throw new Error(`Expected ${label} to be a JSON string or object for diff benchmark`);
}

function iterationsForCase(base: number, benchCase: BenchCase): number {
  const meta = benchCase.meta;
  const size = Math.max(meta.oldLength ?? 0, meta.newLength ?? 0);
  const diff = meta.diffCount ?? 0;

  let iter = base;

  if (benchCase.level === 'sentence') {
    iter = Math.min(iter, 4);
  }

  if (size >= 3000 || diff >= 1000) {
    iter = Math.min(iter, 2);
  } else if (size >= 1000 || diff >= 500) {
    iter = Math.min(iter, 3);
  } else if (size >= 500 || diff >= 200) {
    iter = Math.min(iter, 4);
  }

  return Math.max(2, iter);
}
