import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { diffChars as referenceDiffChars, diffJson as referenceDiffJson } from 'diff';

const require = createRequire(import.meta.url);
const requiredPackage = require('diff-native');
const importedPackage = await import('diff-native');

const expected = referenceDiffChars('ab', 'ac', {});

assert.deepStrictEqual(requiredPackage.diffChars('ab', 'ac', {}), expected);
assert.deepStrictEqual(importedPackage.diffChars('ab', 'ac', {}), expected);

function jsonInputs() {
  return [
    { nested: undefined, payload: { toJSON: () => ({ z: 2, a: 1 }) } },
    { nested: null, payload: { a: 1, z: 3 } },
    { undefinedReplacement: 'missing' },
  ];
}

assert.deepStrictEqual(
  requiredPackage.diffJson(...jsonInputs()),
  referenceDiffJson(...jsonInputs())
);
assert.deepStrictEqual(
  importedPackage.default.diffJson(...jsonInputs()),
  referenceDiffJson(...jsonInputs())
);

console.log('Package-root Node require and import verification passed.');
