import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { diffChars as referenceDiffChars, wordDiff as referenceWordDiff } from 'diff';

const require = createRequire(import.meta.url);
const requiredPackage = require('diff-native');
const importedPackage = await import('diff-native');
const importedApi = importedPackage.default ?? importedPackage;

const expected = referenceDiffChars('ab', 'ac', {});

assert.deepStrictEqual(requiredPackage.diffChars('ab', 'ac', {}), expected);
assert.deepStrictEqual(importedApi.diffChars('ab', 'ac', {}), expected);

const text = '我喜欢北京烤鸭';
const expectedWords = referenceWordDiff.tokenize(text, {
  intlSegmenter: new Intl.Segmenter('zh', { granularity: 'word' }),
});
assert.deepStrictEqual(
  requiredPackage.wordDiff.tokenize(text, {
    intlSegmenter: new Intl.Segmenter('zh', { granularity: 'word' }),
  }),
  expectedWords
);
assert.deepStrictEqual(
  importedApi.wordDiff.tokenize(text, {
    intlSegmenter: new Intl.Segmenter('zh', { granularity: 'word' }),
  }),
  expectedWords
);

console.log('Package-root Node require and import verification passed.');
