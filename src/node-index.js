const diffNative = require('./diff_native');

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
  createPatch: diffNative.createPatch,
  createTwoFilesPatch: diffNative.createTwoFilesPatch,
  structuredPatch: diffNative.structuredPatch,
  formatPatch: diffNative.formatPatch,
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
    enablePanicReporting: function () {
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
