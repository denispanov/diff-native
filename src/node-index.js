const diffNative = require('./diff_native');
const json = require('./json.cjs');

function diffJson(oldValue, newValue, options) {
  return json.diffJson(diffNative.diffJson, oldValue, newValue, options);
}

module.exports = {
  diffChars: diffNative.diffChars,
  diffWordsWithSpace: diffNative.diffWordsWithSpace,
  diffWords: diffNative.diffWords,
  diffLines: diffNative.diffLines,
  diffTrimmedLines: diffNative.diffTrimmedLines,
  diffSentences: diffNative.diffSentences,
  diffCss: diffNative.diffCss,
  diffJson,

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
  canonicalize: json.canonicalize,

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
