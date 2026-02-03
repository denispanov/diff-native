import * as jsdiff from 'diff';
import type { DiffNativeExports } from '../types.js';

export function createDiffTargets(diffNative: DiffNativeExports) {
  return {
    char: { js: jsdiff.diffChars, wasm: diffNative.diffChars },
    word: { js: jsdiff.diffWords, wasm: diffNative.diffWords },
    sentence: { js: jsdiff.diffSentences, wasm: diffNative.diffSentences },
    line: { js: jsdiff.diffLines, wasm: diffNative.diffLines },
    json: { js: jsdiff.diffJson, wasm: diffNative.diffJson },
  } as const;
}

export type DiffTargetMap = ReturnType<typeof createDiffTargets>;
