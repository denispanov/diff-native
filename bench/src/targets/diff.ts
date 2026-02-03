import * as jsdiff from 'diff';
import type {
  DiffCharsFn,
  DiffJsonFn,
  DiffLinesFn,
  DiffNativeExports,
  DiffSentencesFn,
  DiffWordsFn,
} from '../types.js';

export function createDiffTargets(diffNative: DiffNativeExports) {
  const jsChar: DiffCharsFn = (oldStr, newStr, options) =>
    jsdiff.diffChars(oldStr, newStr, options);
  const jsWord: DiffWordsFn = (oldStr, newStr, options) =>
    jsdiff.diffWords(oldStr, newStr, options);
  const jsSentence: DiffSentencesFn = (oldStr, newStr, options) =>
    jsdiff.diffSentences(oldStr, newStr, options);
  const jsLine: DiffLinesFn = (oldStr, newStr, options) =>
    jsdiff.diffLines(oldStr, newStr, options);
  const jsJson: DiffJsonFn = (oldObj, newObj, options) => jsdiff.diffJson(oldObj, newObj, options);

  return {
    char: { js: jsChar, wasm: diffNative.diffChars },
    word: { js: jsWord, wasm: diffNative.diffWords },
    sentence: { js: jsSentence, wasm: diffNative.diffSentences },
    line: { js: jsLine, wasm: diffNative.diffLines },
    json: { js: jsJson, wasm: diffNative.diffJson },
  } as const;
}

export type DiffTargetMap = ReturnType<typeof createDiffTargets>;
