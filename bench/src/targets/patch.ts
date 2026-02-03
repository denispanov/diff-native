import * as jsdiff from 'diff';
import type { CreateTwoFilesPatchFn, DiffNativeExports } from '../types.js';

export function createPatchTargets(diffNative: DiffNativeExports) {
  const jsPatch: CreateTwoFilesPatchFn = (
    oldFileName,
    newFileName,
    oldStr,
    newStr,
    oldHeader,
    newHeader,
    options
  ) =>
    jsdiff.createTwoFilesPatch(
      oldFileName,
      newFileName,
      oldStr,
      newStr,
      oldHeader,
      newHeader,
      options
    );

  return {
    createTwoFilesPatch: {
      js: jsPatch,
      wasm: diffNative.createTwoFilesPatch,
    },
  } as const;
}

export type PatchTargetMap = ReturnType<typeof createPatchTargets>;
