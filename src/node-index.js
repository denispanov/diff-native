const diffNative = require('./diff_native');

const INCLUDE_HEADERS = { includeIndex: true, includeUnderline: true, includeFileHeaders: true };
const FILE_HEADERS_ONLY = {
  includeIndex: false,
  includeUnderline: false,
  includeFileHeaders: true,
};
const OMIT_HEADERS = { includeIndex: false, includeUnderline: false, includeFileHeaders: false };
const formatPatch = (patch, headerOptions) =>
  diffNative.formatPatch(patch, headerOptions || INCLUDE_HEADERS);
const createTwoFilesPatch = (
  oldFileName,
  newFileName,
  oldStr,
  newStr,
  oldHeader,
  newHeader,
  options
) =>
  formatPatch(
    diffNative.structuredPatch(
      oldFileName,
      newFileName,
      oldStr,
      newStr,
      oldHeader,
      newHeader,
      options
    ),
    options?.headerOptions
  );
const createPatch = (fileName, oldStr, newStr, oldHeader, newHeader, options) =>
  createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options);

module.exports = {
  diffChars: diffNative.diffChars,
  diffWordsWithSpace: diffNative.diffWordsWithSpace,
  diffWords: diffNative.diffWords,
  diffLines: diffNative.diffLines,
  diffTrimmedLines: diffNative.diffTrimmedLines,
  diffSentences: diffNative.diffSentences,
  diffCss: diffNative.diffCss,
  diffJson: diffNative.diffJson,

  convertChangesToXML: diffNative.convertChangesToXML,

  parsePatch: diffNative.parsePatch,
  createPatch,
  createTwoFilesPatch,
  structuredPatch: diffNative.structuredPatch,
  formatPatch,
  INCLUDE_HEADERS,
  FILE_HEADERS_ONLY,
  OMIT_HEADERS,
  applyPatch: diffNative.applyPatch,
  applyPatches: diffNative.applyPatches,
  reversePatch: diffNative.reversePatch,

  isUnix: diffNative.isUnix,
  isWin: diffNative.isWin,
  unixToWin: diffNative.unixToWin,
  winToUnix: diffNative.winToUnix,

  wordDiff: diffNative.wordDiff,
  sentenceDiff: diffNative.sentenceDiff,
  canonicalize: diffNative.canonicalize,

  // Debug utilities (for development only)
  debug: {
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
  },
};
