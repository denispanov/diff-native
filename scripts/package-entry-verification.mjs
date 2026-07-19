import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { diffChars as referenceDiffChars } from 'diff';

const require = createRequire(import.meta.url);
const requiredPackage = require('diff-native');
const importedPackage = await import('diff-native');

const expected = referenceDiffChars('ab', 'ac', {});

assert.deepStrictEqual(requiredPackage.diffChars('ab', 'ac', {}), expected);
assert.deepStrictEqual(importedPackage.diffChars('ab', 'ac', {}), expected);

console.log('Package-root Node require and import diffChars verification passed.');
