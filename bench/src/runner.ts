import { performance } from 'node:perf_hooks';
import { measure } from './measure.js';
import type { DiffTargetMap } from './targets/diff.js';
import type { PatchTargetMap } from './targets/patch.js';
import type { AnyFn, BenchCase, CaseResult, DiffInput, PatchInput } from './types.js';
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
      const targets = diffTargets[benchCase.level ?? 'char'];
      const jsFn: AnyFn = targets.js;
      const wasmFn: AnyFn = targets.wasm;

      if (config.validate) {
        const jsOut = jsFn((input as DiffInput).oldValue, (input as DiffInput).newValue);
        const wasmOut = wasmFn((input as DiffInput).oldValue, (input as DiffInput).newValue);
        validateDiff(jsOut, wasmOut);
      }

      const jsMetrics = measure(
        jsFn,
        [(input as DiffInput).oldValue, (input as DiffInput).newValue],
        iterations
      );
      const wasmMetrics = measure(
        wasmFn,
        [(input as DiffInput).oldValue, (input as DiffInput).newValue],
        iterations
      );

      results.push({
        id: benchCase.id,
        kind: 'diff',
        level: benchCase.level,
        meta: benchCase.meta,
        js: jsMetrics,
        wasm: wasmMetrics,
        speedup: jsMetrics.meanMs === 0 ? 0 : jsMetrics.meanMs / wasmMetrics.meanMs,
      });
    } else {
      const patch = patchTargets.createTwoFilesPatch;
      const jsFn = patch.js;
      const wasmFn = patch.wasm;
      const patchInput = input as PatchInput;

      if (config.validate) {
        const jsOut = jsFn(
          patchInput.oldFileName,
          patchInput.newFileName,
          patchInput.oldStr,
          patchInput.newStr,
          patchInput.oldHeader,
          patchInput.newHeader
        );
        const wasmOut = wasmFn(
          patchInput.oldFileName,
          patchInput.newFileName,
          patchInput.oldStr,
          patchInput.newStr,
          patchInput.oldHeader,
          patchInput.newHeader
        );
        validatePatch(jsOut, wasmOut);
      }

      const args = [
        patchInput.oldFileName,
        patchInput.newFileName,
        patchInput.oldStr,
        patchInput.newStr,
        patchInput.oldHeader,
        patchInput.newHeader,
      ];

      const jsMetrics = measure(jsFn, args, iterations);
      const wasmMetrics = measure(wasmFn, args, iterations);

      results.push({
        id: benchCase.id,
        kind: 'patch',
        level: benchCase.level,
        meta: benchCase.meta,
        js: jsMetrics,
        wasm: wasmMetrics,
        speedup: jsMetrics.meanMs === 0 ? 0 : jsMetrics.meanMs / wasmMetrics.meanMs,
      });
    }

    console.log(`done (${(performance.now() - tCase).toFixed(1)} ms)`);
  }

  return results;
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
