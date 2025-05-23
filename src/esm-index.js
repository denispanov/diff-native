import * as diffNative from './diff_native.js';

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
export const createPatch = diffNative.createPatch;
export const createTwoFilesPatch = diffNative.createTwoFilesPatch;
export const structuredPatch = diffNative.structuredPatch;
export const formatPatch = diffNative.formatPatch;
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
  enablePanicReporting: function () {
    try {
      diffNative.set_panic_hook();
      return true;
    } catch (e) {
      console.warn('Could not set panic hook:', e);
      return false;
    }
  },
};
