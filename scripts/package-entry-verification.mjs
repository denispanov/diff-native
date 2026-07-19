import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as reference from 'diff';
import { diffChars as referenceDiffChars } from 'diff';

const require = createRequire(import.meta.url);
const requiredPackage = require('diff-native');
const importedPackage = await import('diff-native');

const expected = referenceDiffChars('ab', 'ac', {});

assert.deepStrictEqual(requiredPackage.diffChars('ab', 'ac', {}), expected);
assert.deepStrictEqual(importedPackage.diffChars('ab', 'ac', {}), expected);

function thrown(call) {
  try {
    call();
  } catch (error) {
    return { constructor: error.constructor.name, message: error.message };
  }
  assert.fail('Expected call to throw');
}

const malformedCalls = [
  implementation => implementation.formatPatch('x'),
  implementation => implementation.formatPatch({}),
  implementation => implementation.applyPatch('x', {}),
  implementation => implementation.applyPatch('x', []),
  implementation => implementation.applyPatch('x', 1),
  implementation => implementation.applyPatch('x', [{}, {}]),
  implementation => implementation.applyPatch('a', '@@ -1,1 +1,1 @@\n?'),
  implementation => implementation.applyPatch('a', '--- old.txt\n@@ -1 +1 @@\n-old\n+new\n'),
  implementation =>
    implementation.applyPatch(
      'a',
      { hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [' a'] }] },
      { fuzzFactor: Number.POSITIVE_INFINITY }
    ),
  implementation =>
    implementation.structuredPatch('x', 'x', 'a', 'b', undefined, undefined, {
      newlineIsToken: true,
    }),
];
for (const implementation of [requiredPackage, importedPackage.default]) {
  for (const call of malformedCalls) {
    assert.deepStrictEqual(
      thrown(() => call(implementation)),
      thrown(() => call(reference))
    );
  }

  const coercionPatch = {
    hunks: [{ oldStart: '2', oldLines: '0', newStart: '2', newLines: '0', lines: [null] }],
  };
  assert.deepStrictEqual(
    implementation.formatPatch(coercionPatch),
    reference.formatPatch(coercionPatch)
  );
  const headerPatch = { oldFileName: 'x', newFileName: 'x', hunks: [] };
  for (const name of ['INCLUDE_HEADERS', 'FILE_HEADERS_ONLY', 'OMIT_HEADERS']) {
    assert.deepStrictEqual(implementation[name], reference[name]);
    assert.deepStrictEqual(
      implementation.formatPatch(headerPatch, implementation[name]),
      reference.formatPatch(headerPatch, reference[name])
    );
  }
  assert.deepStrictEqual(
    implementation.createPatch('x', 'a', 'b', undefined, undefined, {
      headerOptions: implementation.OMIT_HEADERS,
    }),
    reference.createPatch('x', 'a', 'b', undefined, undefined, {
      headerOptions: reference.OMIT_HEADERS,
    })
  );
  const implementationUnderline = implementation.INCLUDE_HEADERS.includeUnderline;
  const referenceUnderline = reference.INCLUDE_HEADERS.includeUnderline;
  implementation.INCLUDE_HEADERS.includeUnderline = false;
  reference.INCLUDE_HEADERS.includeUnderline = false;
  assert.deepStrictEqual(
    implementation.formatPatch(headerPatch),
    reference.formatPatch(headerPatch)
  );
  assert.deepStrictEqual(
    implementation.createPatch('x', 'a', 'b'),
    reference.createPatch('x', 'a', 'b')
  );
  implementation.INCLUDE_HEADERS.includeUnderline = implementationUnderline;
  reference.INCLUDE_HEADERS.includeUnderline = referenceUnderline;

  const lineEndingPatch = {
    hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }],
  };
  const applyWithAutoConvertGetter = (target, value) => {
    const events = [];
    const options = Object.defineProperty({}, 'autoConvertLineEndings', {
      get() {
        events.push('autoConvertLineEndings');
        return value;
      },
    });
    return { result: target.applyPatch('a\r\n', lineEndingPatch, options), events };
  };
  for (const value of [false, 0, '', Number.NaN, true, 1, 'yes', null, undefined]) {
    assert.deepStrictEqual(
      applyWithAutoConvertGetter(implementation, value),
      applyWithAutoConvertGetter(reference, value)
    );
  }

  const runLiveHunks = (target, autoConvertLineEndings) => {
    let reads = 0;
    const events = [];
    const patch = Object.defineProperty({}, 'hunks', {
      get() {
        events.push(`hunks:${reads}`);
        return reads++ === 0 ? [] : lineEndingPatch.hunks;
      },
    });
    const options = Object.defineProperty({}, 'autoConvertLineEndings', {
      get() {
        events.push('autoConvertLineEndings');
        return autoConvertLineEndings;
      },
    });
    return { events, value: target.applyPatch('a\r\n', patch, options) };
  };
  for (const value of [false, true, undefined]) {
    assert.deepStrictEqual(runLiveHunks(implementation, value), runLiveHunks(reference, value));
  }

  const runOptions = (target, options) => {
    const events = [];
    const patch = Object.defineProperty({}, 'hunks', {
      get() {
        events.push('hunks');
        return [];
      },
    });
    try {
      return { events, value: target.applyPatch('a', patch, options) };
    } catch (error) {
      return { events, error: { name: error.name, message: error.message } };
    }
  };
  for (const options of [undefined, null, 0, false, '']) {
    assert.deepStrictEqual(runOptions(implementation, options), runOptions(reference, options));
  }

  for (const hunks of [0, 1, '', { length: 0 }]) {
    const runHunks = target => {
      const events = [];
      const patch = Object.defineProperty({}, 'hunks', {
        get() {
          events.push('hunks');
          return hunks;
        },
      });
      return {
        events,
        value: target.applyPatch('a', patch, { autoConvertLineEndings: false }),
      };
    };
    assert.deepStrictEqual(runHunks(implementation), runHunks(reference));
  }

  const formatWithIsGitGetter = target => {
    const events = [];
    const patch = { oldFileName: 'old', newFileName: 'new', hunks: [] };
    Object.defineProperty(patch, 'isGit', {
      get() {
        events.push('isGit');
        return false;
      },
    });
    return { result: target.formatPatch(patch), events };
  };
  assert.deepStrictEqual(formatWithIsGitGetter(implementation), formatWithIsGitGetter(reference));
}

console.log('Package-root Node require and import diffChars verification passed.');
