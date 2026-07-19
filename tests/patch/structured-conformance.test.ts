import { beforeAll, describe, expect, it } from 'bun:test';
import * as reference from 'diff';
import type * as DiffNative from 'diff-native';
import {
  isUnix as referenceIsUnix,
  isWin as referenceIsWin,
  unixToWin as referenceUnixToWin,
  winToUnix as referenceWinToUnix,
} from '../../node_modules/diff/libesm/patch/line-endings.js';
import { getWasmModule } from '../setup';
import { expectSameObservableBehavior } from '../utils/conformance';

let local: typeof DiffNative;
type ObservableStructuredPatch = Record<string, unknown> & { hunks: Record<string, unknown>[] };

beforeAll(async () => {
  local = await getWasmModule();
});

function observePatch(patch: Record<string, unknown>) {
  const hunks = patch.hunks as Record<string, unknown>[];
  return {
    patch,
    keys: Object.keys(patch),
    hasIndex: Object.hasOwn(patch, 'index'),
    hasOldHeader: Object.hasOwn(patch, 'oldHeader'),
    hasNewHeader: Object.hasOwn(patch, 'newHeader'),
    hunkKeys: hunks.map(hunk => Object.keys(hunk)),
  };
}

function observeReversedPatch(patch: Record<string, unknown>) {
  const hunks = patch.hunks as Record<string, unknown>[];
  return {
    oldFileName: patch.oldFileName,
    newFileName: patch.newFileName,
    oldHeader: patch.oldHeader,
    newHeader: patch.newHeader,
    hasOldHeader: Object.hasOwn(patch, 'oldHeader'),
    hasNewHeader: Object.hasOwn(patch, 'newHeader'),
    keys: Reflect.ownKeys(patch),
    hunks,
    hunkKeys: hunks.map(hunk => Object.keys(hunk)),
  };
}

describe('structured patch conformance', () => {
  it('matches created object shape and optional header presence', () => {
    expectSameObservableBehavior(
      () => observePatch(local.structuredPatch('old.txt', 'new.txt', 'α\n', 'β\n') as never),
      () => observePatch(reference.structuredPatch('old.txt', 'new.txt', 'α\n', 'β\n') as never)
    );
  });

  it('matches parsed metadata presence and camelCase hunk fields', () => {
    const patches = [
      '',
      'commentary only',
      '@@ -1 +1 @@\n-α\n+β\n',
      'Index: old.txt\n--- old.txt\tbefore\n+++ new.txt\tafter\n@@ -1 +1 @@\n-α\n+β\n',
    ];

    for (const patch of patches) {
      expectSameObservableBehavior(
        () => local.parsePatch(patch).map(value => observePatch(value as never)),
        () => reference.parsePatch(patch).map(value => observePatch(value as never))
      );
    }
  });

  it('matches malformed file-header and excess-hunk errors', () => {
    const patches = [
      '--- old.txt\n@@ -1 +1 @@\n-old\n+new\n',
      '+++ new.txt\n@@ -1 +1 @@\n-old\n+new\n',
      '--- old.txt\n+++ new.txt\n@@ -1 +1 @@\n-old\n+new\n+extra\n',
      '--- first.txt\n+++ first.txt\n@@ -1 +1 @@\n-a\n+b\nIndex: second.txt\n--- second.txt\n@@ -1 +1 @@\n-c\n+d\n',
      '--- "\n+++ x\n',
      '@@ nonsense @@\n',
      '@@ -1 +1 @@\n',
      '@@ -1,9007199254740993 +1,9007199254740993 @@\n',
    ];

    for (const patch of patches) {
      expectSameObservableBehavior(
        () => local.parsePatch(patch),
        () => reference.parsePatch(patch)
      );
    }
  });

  it('matches permissive malformed and large hunk headers without trapping', () => {
    const patches = [
      '@@ nonsense @@\n-old\n+new\n',
      '@@ -999999999999999999999999999999 +1 @@\n-old\n+new\n',
      `@@ -${'9'.repeat(400)} +1 @@\n-old\n+new\n`,
      '@@ -1 +1 @@',
    ];

    for (const patch of patches) {
      expectSameObservableBehavior(
        () => local.parsePatch(patch),
        () => reference.parsePatch(patch)
      );
    }
  });

  it('matches whitespace classifiers, empty indexes, and header tab handling', () => {
    const patches = [
      'Index:\t\n---\told.txt\tbefore\textra\n+++\tnew.txt\tafter\textra\n',
      '@@\tnonsense @@\n-old\n+new\n',
      '@@ -١ +1 @@\n-old\n+new\n',
      '---\u0085file',
      '---\uFEFFfile',
      '@@\u0085nonsense @@\n-a\n+b\n',
      '@@\uFEFFnonsense @@\n-a\n+b\n',
      'Index:\uFEFF\u0085 name \uFEFF\n',
    ];

    for (const patch of patches) {
      expectSameObservableBehavior(
        () => local.parsePatch(patch),
        () => reference.parsePatch(patch)
      );
    }
  });

  it('matches JavaScript number formatting for parsed hunk ranges', () => {
    const patch = `@@ -${'9'.repeat(400)} +1 @@\n-old\n+new\n`;
    expectSameObservableBehavior(
      () => local.formatPatch(local.parsePatch(patch)),
      () => reference.formatPatch(reference.parsePatch(patch))
    );
  });

  it('matches application of valid and malformed Unicode structured lines', () => {
    const patches = [
      {
        oldFileName: 'old.txt',
        newFileName: 'new.txt',
        oldHeader: undefined,
        newHeader: undefined,
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-α', '+β'] }],
      },
      { hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['é'] }] },
      { hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['😀'] }] },
    ];

    for (const patch of patches) {
      expectSameObservableBehavior(
        () => local.applyPatch('α\n', patch as never),
        () => reference.applyPatch('α\n', patch as never)
      );
    }
  });

  it('throws rather than trapping when structured hunks are missing', () => {
    for (const patch of [{}, [], 1, null]) {
      expectSameObservableBehavior(
        () => local.applyPatch('value', patch as never),
        () => reference.applyPatch('value', patch as never)
      );
    }
  });

  it('preserves parser Error values through applyPatch', () => {
    for (const patch of [
      '@@ -1,1 +1,1 @@\n?',
      '--- old.txt\n@@ -1 +1 @@\n-old\n+new\n',
      '@@ -1 +1 @@\n-old\n+new\n+extra\n',
    ]) {
      expectSameObservableBehavior(
        () => local.applyPatch('a', patch),
        () => reference.applyPatch('a', patch)
      );
    }
  });

  it('returns safely for non-operational structured numeric ranges', () => {
    for (const oldStart of [Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE, -1, 1.5]) {
      const patch = {
        hunks: [{ oldStart, oldLines: 1, newStart: 1, newLines: 1, lines: [' value'] }],
      };
      expect(local.applyPatch('value', patch as never)).toBe(false);
    }

    const hugeInsertion = {
      hunks: [
        {
          oldStart: 2_147_483_647,
          oldLines: 0,
          newStart: 2_147_483_647,
          newLines: 1,
          lines: ['+x'],
        },
      ],
    };
    expect(local.applyPatch('a', hugeInsertion as never)).toBe(false);
  });

  it('matches finite insertion coordinates beyond the source', () => {
    for (const [oldStart, oldLines] of [
      [10, 0],
      [1, -1],
      [1, 1.5],
      [1, Number.NaN],
      [1, Number.POSITIVE_INFINITY],
    ]) {
      const patch = {
        hunks: [{ oldStart, oldLines, newStart: oldStart, newLines: 1, lines: ['+x'] }],
      };
      expectSameObservableBehavior(
        () => local.applyPatch('a', patch as never),
        () => reference.applyPatch('a', patch as never)
      );
    }
  });

  it('matches ordinary work above the former safety cutoffs', () => {
    const identity = {
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [' a'] }],
    };
    expectSameObservableBehavior(
      () => local.applyPatch('a', identity as never, { fuzzFactor: 101 }),
      () => reference.applyPatch('a', identity as never, { fuzzFactor: 101 })
    );
    const nearby = {
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [' b'] }],
    };
    expectSameObservableBehavior(
      () => local.applyPatch('a\nb', nearby as never, { fuzzFactor: 101 }),
      () => reference.applyPatch('a\nb', nearby as never, { fuzzFactor: 101 })
    );

    const fuzzyContext = {
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [' z'] }],
    };
    expectSameObservableBehavior(
      () => local.applyPatch('a', fuzzyContext as never, { fuzzFactor: 101 }),
      () => reference.applyPatch('a', fuzzyContext as never, { fuzzFactor: 101 })
    );

    const fuzzyChange = {
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-z', '+changed'] }],
    };
    expectSameObservableBehavior(
      () => local.applyPatch('a', fuzzyChange as never, { fuzzFactor: 101 }),
      () => reference.applyPatch('a', fuzzyChange as never, { fuzzFactor: 101 })
    );

    const finiteInsertion = {
      hunks: [
        { oldStart: 1_000_003, oldLines: 0, newStart: 1_000_003, newLines: 1, lines: ['+x'] },
      ],
    };
    expectSameObservableBehavior(
      () => local.applyPatch('a', finiteInsertion as never),
      () => reference.applyPatch('a', finiteInsertion as never)
    );
  });

  it('matches fuzzFactor number semantics and thrown values', () => {
    const patch = {
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [' a'] }],
    };
    for (const fuzzFactor of ['', 0n, false, -0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expectSameObservableBehavior(
        () => local.applyPatch('a', patch as never, { fuzzFactor } as never),
        () => reference.applyPatch('a', patch as never, { fuzzFactor } as never)
      );
    }
  });

  it('matches autoConvertLineEndings truthiness and getter reads', () => {
    const patch = {
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }],
    };
    const applyWithGetter = (implementation: typeof local, value: unknown) => {
      const events: string[] = [];
      const options = Object.defineProperty({}, 'autoConvertLineEndings', {
        get() {
          events.push('autoConvertLineEndings');
          return value;
        },
      });
      return {
        result: implementation.applyPatch('a\r\n', patch as never, options as never),
        events,
      };
    };

    for (const value of [false, 0, '', Number.NaN, true, 1, 'yes', null, undefined]) {
      expectSameObservableBehavior(
        () => applyWithGetter(local, value),
        () => applyWithGetter(reference as never, value)
      );
    }

    const throwingOptions = () =>
      Object.defineProperty({}, 'autoConvertLineEndings', {
        get() {
          throw new Error('autoConvertLineEndings getter');
        },
      });
    expectSameObservableBehavior(
      () => local.applyPatch('a\r\n', patch as never, throwingOptions() as never),
      () => reference.applyPatch('a\r\n', patch as never, throwingOptions() as never)
    );
  });

  it('matches auto-conversion and live hunks getter ordering', () => {
    const change = [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b'] }];
    const runConstant = (implementation: typeof local, autoConvertLineEndings: unknown) => {
      const events: string[] = [];
      const patch = Object.defineProperty({}, 'hunks', {
        get() {
          events.push('hunks');
          return change;
        },
      });
      const options = Object.defineProperty({}, 'autoConvertLineEndings', {
        get() {
          events.push('autoConvertLineEndings');
          return autoConvertLineEndings;
        },
      });
      return {
        events,
        value: implementation.applyPatch('a\r\n', patch as never, options as never),
      };
    };
    for (const value of [false, true, undefined]) {
      expectSameObservableBehavior(
        () => runConstant(local, value),
        () => runConstant(reference as never, value)
      );
    }

    const runStateful = (implementation: typeof local, options?: Record<string, unknown>) => {
      let reads = 0;
      const events: string[] = [];
      const patch = Object.defineProperty({}, 'hunks', {
        get() {
          events.push(`hunks:${reads}`);
          return reads++ === 0 ? [] : change;
        },
      });
      return {
        events,
        value: implementation.applyPatch('a\r\n', patch as never, options as never),
      };
    };
    for (const options of [{ autoConvertLineEndings: false }, { autoConvertLineEndings: true }]) {
      expectSameObservableBehavior(
        () => runStateful(local, options),
        () => runStateful(reference as never, options)
      );
    }
    expectSameObservableBehavior(
      () => runStateful(local),
      () => runStateful(reference as never)
    );
  });

  it('matches primitive and null options semantics', () => {
    const run = (implementation: typeof local, options: unknown) => {
      const events: string[] = [];
      const patch = Object.defineProperty({}, 'hunks', {
        get() {
          events.push('hunks');
          return [];
        },
      });
      try {
        return {
          events,
          value: implementation.applyPatch('a', patch as never, options as never),
        };
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        return { events, error: { name: error.name, message: error.message } };
      }
    };

    for (const options of [undefined, null, 0, false, '']) {
      expect(run(local, options)).toStrictEqual(run(reference as never, options));
    }
  });

  it('returns source for cached hunks values with falsy length', () => {
    for (const hunks of [0, 1, '', { length: 0 }]) {
      const run = (implementation: typeof local) => {
        const events: string[] = [];
        const patch = Object.defineProperty({}, 'hunks', {
          get() {
            events.push('hunks');
            return hunks;
          },
        });
        return {
          events,
          value: implementation.applyPatch('a', patch as never, {
            autoConvertLineEndings: false,
          }),
        };
      };
      expectSameObservableBehavior(
        () => run(local),
        () => run(reference as never)
      );
    }
  });

  it('reads hunks once from callable structured patches', () => {
    const run = (implementation: typeof local) => {
      const events: string[] = [];
      const patch = Object.defineProperty(() => {}, 'hunks', {
        get() {
          events.push('hunks');
          return [];
        },
      });
      return {
        events,
        value: implementation.applyPatch('a', patch as never, {
          autoConvertLineEndings: false,
        }),
      };
    };
    expectSameObservableBehavior(
      () => run(local),
      () => run(reference as never)
    );
  });

  it('preserves sparse patch arrays', () => {
    const patches = Array(2) as Record<string, unknown>[];
    patches[1] = { hunks: [] };
    const observe = (value: unknown[]) => ({
      length: value.length,
      keys: Object.keys(value),
      value,
    });
    expectSameObservableBehavior(
      () => observe(local.unixToWin(patches as never) as never),
      () => observe(referenceUnixToWin(patches as never) as never)
    );
    expectSameObservableBehavior(
      () => observe(local.reversePatch(patches as never) as never),
      () => observe(reference.reversePatch(patches as never) as never)
    );
    expectSameObservableBehavior(
      () => local.isUnix(patches as never),
      () => referenceIsUnix(patches as never)
    );
    expectSameObservableBehavior(
      () => local.isWin(patches as never),
      () => referenceIsWin(patches as never)
    );
  });

  it('preserves sparse nested hunk and line arrays', () => {
    const hunks = Array(2) as Record<string, unknown>[];
    const lines = Array(2) as string[];
    lines[1] = ' value';
    hunks[1] = { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines };
    const patch = { hunks };
    const observe = (value: ObservableStructuredPatch) => ({
      patchKeys: Object.keys(value),
      hunkKeys: Object.keys(value.hunks),
      lineKeys: Object.keys(value.hunks[1].lines as string[]),
      value,
    });
    expectSameObservableBehavior(
      () => observe(local.unixToWin(patch as never) as unknown as ObservableStructuredPatch),
      () => observe(referenceUnixToWin(patch as never) as unknown as ObservableStructuredPatch)
    );
    expectSameObservableBehavior(
      () => observe(local.winToUnix(patch as never) as unknown as ObservableStructuredPatch),
      () => observe(referenceWinToUnix(patch as never) as unknown as ObservableStructuredPatch)
    );
  });

  it('matches live getter reads for public transforms', () => {
    function reads(transform: (patch: unknown) => unknown) {
      const events: string[] = [];
      const hunk = { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 } as Record<
        string,
        unknown
      >;
      Object.defineProperty(hunk, 'lines', {
        enumerable: true,
        get() {
          events.push('hunk.lines');
          return [' value'];
        },
      });
      const patch = {} as Record<string, unknown>;
      Object.defineProperty(patch, 'hunks', {
        enumerable: true,
        get() {
          events.push('patch.hunks');
          return [hunk];
        },
      });
      transform(patch);
      return events;
    }

    for (const [localTransform, referenceTransform] of [
      [local.isUnix, referenceIsUnix],
      [local.isWin, referenceIsWin],
      [local.reversePatch, reference.reversePatch],
      [local.unixToWin, referenceUnixToWin],
      [local.winToUnix, referenceWinToUnix],
    ] as const) {
      expect(reads(localTransform as never)).toStrictEqual(reads(referenceTransform as never));
    }

    function reverseReads(transform: (patch: unknown) => unknown) {
      const events: string[] = [];
      const patch = {} as Record<string, unknown>;
      for (const [property, value] of Object.entries({
        oldFileName: 'old',
        newFileName: 'new',
        oldHeader: 'before',
        newHeader: 'after',
        oldMode: '1',
        newMode: '2',
        isCreate: false,
        isDelete: false,
        hunks: [],
        isGit: false,
        isCopy: false,
      })) {
        Object.defineProperty(patch, property, {
          enumerable: !['isGit', 'isCopy'].includes(property),
          get() {
            events.push(property);
            return value;
          },
        });
      }
      transform(patch);
      return events;
    }
    expect(reverseReads(local.reversePatch as never)).toStrictEqual(
      reverseReads(reference.reversePatch as never)
    );
  });

  it('preserves structured shape through line-ending conversions', () => {
    const patchSymbol = Symbol('patch');
    const hunkSymbol = Symbol('hunk');
    const patch = {
      oldFileName: 'old.txt',
      newFileName: 'new.txt',
      oldHeader: undefined,
      newHeader: undefined,
      custom: 'preserved',
      hunks: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: [' value'],
          custom: 'preserved',
          [hunkSymbol]: 'preserved',
        },
      ],
      [patchSymbol]: 'preserved',
    };

    expectSameObservableBehavior(
      () => {
        const converted = local.unixToWin(patch as never) as unknown as ObservableStructuredPatch;
        return [
          observePatch(converted),
          Reflect.ownKeys(converted),
          Reflect.ownKeys(converted.hunks[0]),
        ];
      },
      () => {
        const converted = referenceUnixToWin(
          patch as never
        ) as unknown as ObservableStructuredPatch;
        return [
          observePatch(converted),
          Reflect.ownKeys(converted),
          Reflect.ownKeys(converted.hunks[0]),
        ];
      }
    );
    expectSameObservableBehavior(
      () => {
        const converted = local.winToUnix(patch as never) as unknown as ObservableStructuredPatch;
        return [
          observePatch(converted),
          Reflect.ownKeys(converted),
          Reflect.ownKeys(converted.hunks[0]),
        ];
      },
      () => {
        const converted = referenceWinToUnix(
          patch as never
        ) as unknown as ObservableStructuredPatch;
        return [
          observePatch(converted),
          Reflect.ownKeys(converted),
          Reflect.ownKeys(converted.hunks[0]),
        ];
      }
    );
  });

  it('rejects string formatting input like diff 9', () => {
    expectSameObservableBehavior(
      () => local.formatPatch('not a structured patch' as never),
      () => reference.formatPatch('not a structured patch' as never)
    );
  });

  it('matches non-Git formatting coercion and header modes', () => {
    const malformed = [
      {
        hunks: [{ oldStart: '2', oldLines: '0', newStart: '2', newLines: '0', lines: [null] }],
      },
      { hunks: [null] },
    ];
    for (const patch of malformed) {
      expectSameObservableBehavior(
        () => local.formatPatch(patch as never),
        () => reference.formatPatch(patch as never)
      );
    }

    const patch = { oldFileName: 'x', newFileName: 'x', hunks: [] };
    for (const options of [
      reference.INCLUDE_HEADERS,
      reference.FILE_HEADERS_ONLY,
      reference.OMIT_HEADERS,
    ]) {
      expectSameObservableBehavior(
        () => local.formatPatch(patch as never, options),
        () => reference.formatPatch(patch as never, options)
      );
    }
  });

  it('matches non-Git formatPatch isGit reads', () => {
    const formatWithGetter = (implementation: typeof local) => {
      const events: string[] = [];
      const patch = {
        oldFileName: 'old.txt',
        newFileName: 'new.txt',
        hunks: [],
      } as Record<string, unknown>;
      Object.defineProperty(patch, 'isGit', {
        get() {
          events.push('isGit');
          return false;
        },
      });
      return { result: implementation.formatPatch(patch as never), events };
    };
    expectSameObservableBehavior(
      () => formatWithGetter(local),
      () => formatWithGetter(reference as never)
    );

    const throwingPatch = () => {
      const patch = { hunks: [] } as Record<string, unknown>;
      Object.defineProperty(patch, 'isGit', {
        get() {
          throw new Error('isGit getter');
        },
      });
      return patch;
    };
    expectSameObservableBehavior(
      () => local.formatPatch(throwingPatch() as never),
      () => reference.formatPatch(throwingPatch() as never)
    );
  });

  it('matches the newlineIsToken structured-patch error', () => {
    for (const newlineIsToken of [true, 1, 'yes', {}, false, 0, '']) {
      expectSameObservableBehavior(
        () =>
          local.structuredPatch('x', 'x', 'a', 'b', undefined, undefined, {
            newlineIsToken,
          } as never),
        () =>
          reference.structuredPatch('x', 'x', 'a', 'b', undefined, undefined, {
            newlineIsToken,
          } as never)
      );
    }
  });

  it('matches formatting and reversal of structured values', () => {
    expectSameObservableBehavior(
      () => local.formatPatch({ hunks: [] } as never),
      () => reference.formatPatch({ hunks: [] } as never)
    );

    const patch = {
      oldFileName: 'old.txt',
      newFileName: 'new.txt',
      oldHeader: undefined,
      newHeader: 'after',
      oldMode: '100644',
      newMode: '100755',
      isCreate: true,
      isDelete: false,
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-α', '+β'] }],
      [Symbol.for('structured-conformance')]: 'preserved',
    };
    expectSameObservableBehavior(
      () => observeReversedPatch(local.reversePatch(patch as never) as never),
      () => observeReversedPatch(reference.reversePatch(patch) as never)
    );
  });
});
