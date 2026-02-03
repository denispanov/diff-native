import * as jsdiff from 'diff';
import type { DiffNativeExports } from '../types.js';

export function createPatchTargets(diffNative: DiffNativeExports) {
  return {
    createTwoFilesPatch: {
      js: jsdiff.createTwoFilesPatch,
      wasm: diffNative.createTwoFilesPatch,
    },
  } as const;
}

export type PatchTargetMap = ReturnType<typeof createPatchTargets>;
