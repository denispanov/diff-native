import init, * as diffNative from './diff_native.js';

await init();

export const diffChars = diffNative.diffChars;
export const diffWordsWithSpace = diffNative.diffWordsWithSpace;
export const diffWords = diffNative.diffWords;
export const diffLines = diffNative.diffLines;
export const diffTrimmedLines = diffNative.diffTrimmedLines;
export const diffSentences = diffNative.diffSentences;
export const diffCss = diffNative.diffCss;
export const diffJson = diffNative.diffJson;

export const convertChangesToXML = diffNative.convertChangesToXML;

export const parsePatch = diffNative.parsePatch;
export const structuredPatch = diffNative.structuredPatch;
export const INCLUDE_HEADERS = {
  includeIndex: true,
  includeUnderline: true,
  includeFileHeaders: true,
};
export const FILE_HEADERS_ONLY = {
  includeIndex: false,
  includeUnderline: false,
  includeFileHeaders: true,
};
export const OMIT_HEADERS = {
  includeIndex: false,
  includeUnderline: false,
  includeFileHeaders: false,
};
export const formatPatch = (patch, headerOptions) =>
  diffNative.formatPatch(patch, headerOptions || INCLUDE_HEADERS);
export const createTwoFilesPatch = (
  oldFileName,
  newFileName,
  oldStr,
  newStr,
  oldHeader,
  newHeader,
  options
) =>
  formatPatch(
    structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options),
    options?.headerOptions
  );
export const createPatch = (fileName, oldStr, newStr, oldHeader, newHeader, options) =>
  createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options);
export const applyPatch = diffNative.applyPatch;
export const applyPatches = diffNative.applyPatches;
export const reversePatch = diffNative.reversePatch;

export const isUnix = diffNative.isUnix;
export const isWin = diffNative.isWin;
export const unixToWin = diffNative.unixToWin;
export const winToUnix = diffNative.winToUnix;

export const wordDiff = diffNative.wordDiff;
export const sentenceDiff = diffNative.sentenceDiff;
export const canonicalize = diffNative.canonicalize;

// Debug utilities (for development only)
export const debug = {
  /**
   * Initialize better error reporting for Rust panics
   * Only use this in development - adds a small overhead
   * When called, Rust panics will show detailed error messages in the console
   * instead of generic "RuntimeError: Unreachable executed" messages
   */
  enablePanicReporting: () => {
    try {
      diffNative.set_panic_hook();
      return true;
    } catch (e) {
      console.warn('Could not set panic hook:', e);
      return false;
    }
  },
};
