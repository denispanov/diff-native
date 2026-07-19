import { beforeAll, describe, expect, it } from 'bun:test';
import * as reference from 'diff';
import type * as DiffNative from 'diff-native';
import { getWasmModule } from './setup';
import { expectSameObservableBehavior } from './utils/conformance';

let local: typeof DiffNative;

beforeAll(async () => {
  local = await getWasmModule();
});

describe('jsdiff conformance', () => {
  it('matches a basic character diff exactly', () => {
    expectSameObservableBehavior(
      () => local.diffChars('kitten', 'sitting', {}),
      () => reference.diffChars('kitten', 'sitting', {})
    );
  });

  it('matches Unicode case-insensitive character and word diffs exactly', () => {
    for (const [oldText, newText] of [
      ['École', 'éCOLE'],
      ['ΟΣ', 'οσ'],
      ['Kelvin', 'kelvin'],
      ['ẞ', 'ß'],
      ['İ', 'i'],
    ]) {
      expectSameObservableBehavior(
        () => local.diffChars(oldText, newText, { ignoreCase: true }),
        () => reference.diffChars(oldText, newText, { ignoreCase: true })
      );
    }

    expectSameObservableBehavior(
      () => local.diffWords('ÉCOLE déjà', 'école DÉJÀ', { ignoreCase: true }),
      () => reference.diffWords('ÉCOLE déjà', 'école DÉJÀ', { ignoreCase: true })
    );
    expectSameObservableBehavior(
      () => local.diffWordsWithSpace('À bientôt', 'à BIENTÔT', { ignoreCase: true }),
      () => reference.diffWordsWithSpace('À bientôt', 'à BIENTÔT', { ignoreCase: true })
    );
  });

  it('matches exact non-ASCII word and whitespace boundaries', () => {
    const inputs = [
      'ab\u00adcd',
      'ab×cd',
      'ab÷cd',
      'ab\u0085cd',
      'cafe\u0301 noir',
      'alpha\u2003beta',
      'alpha\ufeffbeta',
    ];

    for (const input of inputs) {
      expectSameObservableBehavior(
        () => local.wordDiff.tokenize(input),
        () => reference.wordDiff.tokenize(input)
      );
    }

    for (const [oldText, newText] of [
      ['ab\u00adcd', 'ab\u00adXY'],
      ['ab×cd', 'ab×XY'],
      ['ab÷cd', 'ab÷XY'],
      ['ab\u0085cd', 'ab\u0085XY'],
      ['cafe\u0301 noir', 'cafe\u0300 noir'],
      ['alpha\u2003beta', 'alpha beta'],
      ['alpha\ufeffbeta', 'alpha beta'],
    ]) {
      expectSameObservableBehavior(
        () => local.diffWords(oldText, newText, {}),
        () => reference.diffWords(oldText, newText, {})
      );
    }

    expectSameObservableBehavior(
      () => local.diffWordsWithSpace('alpha\u2028beta', 'alpha\u2029beta', {}),
      () => reference.diffWordsWithSpace('alpha\u2028beta', 'alpha\u2029beta', {})
    );
  });

  it('matches real Intl.Segmenter word diffs exactly', () => {
    for (const [locale, oldText, newText] of [
      ['zh', '我喜欢北京烤鸭', '我喜欢上海烤鸭'],
      ['sv', 'k:a är fin', 'k:a var fin'],
    ]) {
      const localSegmenter = new Intl.Segmenter(locale, { granularity: 'word' });
      const referenceSegmenter = new Intl.Segmenter(locale, { granularity: 'word' });

      expectSameObservableBehavior(
        () => local.diffWords(oldText, newText, { intlSegmenter: localSegmenter }),
        () => reference.diffWords(oldText, newText, { intlSegmenter: referenceSegmenter })
      );
    }
  });

  it('uses a real Intl.Segmenter in wordDiff.tokenize', () => {
    const text = '我喜欢北京烤鸭';
    const localSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    const referenceSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });

    expectSameObservableBehavior(
      () => local.wordDiff.tokenize(text, { intlSegmenter: localSegmenter }),
      () => reference.wordDiff.tokenize(text, { intlSegmenter: referenceSegmenter })
    );
  });

  it('stops segmenter access at the first error', () => {
    function capture(operation: () => unknown) {
      try {
        return { kind: 'returned', value: operation() };
      } catch (error) {
        return {
          kind: 'threw',
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    function runWith(
      api: typeof local | typeof reference,
      operation: 'diffWords' | 'tokenize',
      failure: 'getter' | 'resolvedOptions' | 'granularity' | 'segment'
    ) {
      const events: string[] = [];
      const segmenter = {
        resolvedOptions() {
          events.push('resolvedOptions');
          if (failure === 'resolvedOptions') {
            throw new Error('resolved options failed');
          }
          return { granularity: failure === 'granularity' ? 'sentence' : 'word' };
        },
        segment(input: string) {
          events.push(`segment:${input}`);
          throw new Error('segment failed');
        },
      };
      const options = {
        get intlSegmenter() {
          events.push('intlSegmenter');
          if (failure === 'getter') {
            throw new Error('segmenter getter failed');
          }
          return segmenter;
        },
      };
      const outcome = capture(() =>
        operation === 'diffWords'
          ? api.diffWords('alpha', 'beta', options)
          : api.wordDiff.tokenize('alpha', options)
      );
      return { outcome, events };
    }

    for (const operation of ['diffWords', 'tokenize'] as const) {
      for (const failure of ['getter', 'resolvedOptions', 'granularity', 'segment'] as const) {
        expect(runWith(local, operation, failure)).toStrictEqual(
          runWith(reference, operation, failure)
        );
      }
    }
  });

  it('preserves duck-typed segment values and their access order', () => {
    function runWith(api: typeof local | typeof reference, value: string | number) {
      const events: string[] = [];
      const segmenter = {
        resolvedOptions() {
          events.push('resolvedOptions');
          return { granularity: 'word' };
        },
        segment(input: string) {
          events.push(`segment:${input}`);
          return [
            {
              get segment() {
                events.push(`value:${input}`);
                return value;
              },
            },
          ];
        },
      };

      try {
        return {
          outcome: {
            kind: 'returned',
            value: api.diffWords('alpha', 'beta', { intlSegmenter: segmenter }),
          },
          events,
        };
      } catch (error) {
        return {
          outcome: {
            kind: 'threw',
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
          },
          events,
        };
      }
    }

    for (const value of ['replacement', 7]) {
      expect(runWith(local, value)).toStrictEqual(runWith(reference, value));
    }
  });

  it('propagates segment value getter errors before tokenizing the new input', () => {
    function runWith(api: typeof local | typeof reference) {
      const events: string[] = [];
      const segmenter = {
        resolvedOptions() {
          events.push('resolvedOptions');
          return { granularity: 'word' };
        },
        segment(input: string) {
          events.push(`segment:${input}`);
          return [
            {
              get segment(): never {
                events.push(`value:${input}`);
                throw new Error('segment value failed');
              },
            },
          ];
        },
      };

      let message: string | undefined;
      try {
        api.diffWords('alpha', 'beta', { intlSegmenter: segmenter });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      return { message, events };
    }

    expect(runWith(local)).toStrictEqual(runWith(reference));
  });

  it('matches dynamic Myers tie-breaking and per-token changes', () => {
    const cases = [
      {
        oldTokens: ['a', 'b', 'a', 'c'],
        newTokens: ['a', 'a', 'b', 'c'],
      },
      {
        oldTokens: ['x', 'a', 'x', 'b', 'x'],
        newTokens: ['x', 'b', 'x', 'a', 'x'],
      },
      {
        oldTokens: ['same', 'left', 'same', 'right'],
        newTokens: ['same', 'right', 'same', 'left'],
      },
    ];

    for (const { oldTokens, newTokens } of cases) {
      for (const oneChangePerToken of [false, true]) {
        const segmenter = {
          resolvedOptions: () => ({ granularity: 'word' }),
          segment: (value: string) =>
            (value === 'old' ? oldTokens : newTokens).map(segment => ({ segment })),
        };
        const options = { intlSegmenter: segmenter, oneChangePerToken };

        expectSameObservableBehavior(
          () => local.diffWords('old', 'new', options),
          () => reference.diffWords('old', 'new', options)
        );
      }
    }
  });

  it('matches changing live segmenter values through postprocessing', () => {
    function runWith(api: typeof local | typeof reference) {
      const events: string[] = [];
      function trackingSegmenter(name: string) {
        return {
          resolvedOptions() {
            events.push(`${name}:resolvedOptions`);
            return { granularity: 'word' };
          },
          segment(value: string) {
            events.push(`${name}:segment:${value}`);
            return Array.from(value, segment => ({ segment }));
          },
        };
      }
      const oldSegmenter = trackingSegmenter('old');
      const cleanupSegmenter = trackingSegmenter('cleanup');
      const values = [oldSegmenter, oldSegmenter, null, cleanupSegmenter];
      const options = {
        get intlSegmenter() {
          events.push('intlSegmenter');
          return values.shift();
        },
      };

      return {
        changes: api.diffWords('abc', 'adc', options),
        events,
      };
    }

    expect(runWith(local)).toStrictEqual(runWith(reference));
  });

  it('matches segmenter accessor and iterator failures', () => {
    function runWith(api: typeof local | typeof reference, failure: string) {
      const events: string[] = [];
      const resolved = Object.defineProperty({}, 'granularity', {
        get() {
          events.push('granularity');
          if (failure === 'granularity') {
            throw new Error('granularity failed');
          }
          return 'word';
        },
      });
      const segmenter = Object.defineProperties(
        {},
        {
          resolvedOptions: {
            get() {
              events.push('resolvedOptions:get');
              if (failure === 'resolvedOptions') {
                throw new Error('resolvedOptions getter failed');
              }
              return () => resolved;
            },
          },
          segment: {
            get() {
              events.push('segment:get');
              if (failure === 'segment') {
                throw new Error('segment getter failed');
              }
              return (value: string) => {
                events.push(`segment:${value}`);
                return Object.defineProperty({}, Symbol.iterator, {
                  get() {
                    events.push('iterator:get');
                    throw new Error('iterator getter failed');
                  },
                });
              };
            },
          },
        }
      );

      let outcome: unknown;
      try {
        outcome = {
          kind: 'returned',
          value: api.diffWords('alpha', 'beta', { intlSegmenter: segmenter }),
        };
      } catch (error) {
        outcome = {
          kind: 'threw',
          name: error instanceof Error ? error.name : undefined,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      return { outcome, events };
    }

    for (const failure of ['resolvedOptions', 'granularity', 'segment', 'iterator']) {
      expect(runWith(local, failure)).toStrictEqual(runWith(reference, failure));
    }
  });

  it('matches all Intl.Segmenter whitespace cleanup shapes', () => {
    function runWith(api: typeof local | typeof reference, oldText: string, newText: string) {
      const calls: string[] = [];
      const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
      const trackingSegmenter = {
        resolvedOptions: () => segmenter.resolvedOptions(),
        segment(value: string) {
          calls.push(value);
          return segmenter.segment(value);
        },
      };
      return {
        changes: api.diffWords(oldText, newText, { intlSegmenter: trackingSegmenter }),
        calls,
      };
    }

    for (const [oldText, newText] of [
      ['foo baz', 'foo bar baz'],
      ['foo bar baz', 'foo baz'],
      ['bar baz', 'baz'],
      ['foo bar', 'foo'],
      ['foo \u0301 bar baz', 'foo \u0301 baz'],
    ]) {
      expect(runWith(local, oldText, newText)).toStrictEqual(runWith(reference, oldText, newText));
    }
  });

  it('uses Intl.Segmenter for change-boundary whitespace exactly', () => {
    function runWith(api: typeof local | typeof reference) {
      const calls: string[] = [];
      const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
      const trackingSegmenter = {
        resolvedOptions: () => segmenter.resolvedOptions(),
        segment(value: string) {
          calls.push(value);
          return segmenter.segment(value);
        },
      };

      return {
        changes: api.diffWords('foo\tbar\u0301 baz', 'foo bar\u0300 baz', {
          intlSegmenter: trackingSegmenter,
        }),
        calls,
      };
    }

    expect(runWith(local)).toStrictEqual(runWith(reference));
  });

  it('reads a live Intl.Segmenter option at the same points as jsdiff', () => {
    function runWith(api: typeof local | typeof reference) {
      const events: string[] = [];
      const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
      const trackingSegmenter = {
        resolvedOptions() {
          events.push('resolvedOptions');
          return segmenter.resolvedOptions();
        },
        segment(value: string) {
          events.push(`segment:${value}`);
          return segmenter.segment(value);
        },
      };
      const options = {
        get intlSegmenter() {
          events.push('intlSegmenter');
          return trackingSegmenter;
        },
      };

      return {
        changes: api.diffWords('foo bar', 'foo baz', options),
        events,
      };
    }

    expect(runWith(local)).toStrictEqual(runWith(reference));
  });

  it('matches jsdiff segment materialization and granularity coercion', () => {
    const segmenter = {
      resolvedOptions: () => ({ granularity: new String('word') }),
      segment(value: string) {
        return { 0: { segment: value }, length: 1 };
      },
    };

    expectSameObservableBehavior(
      () => local.diffWords('alpha', 'beta', { intlSegmenter: segmenter }),
      () => reference.diffWords('alpha', 'beta', { intlSegmenter: segmenter })
    );
  });

  it('matches Intl.Segmenter validation for changed, identical, and empty inputs', () => {
    for (const [oldText, newText] of [
      ['alpha', 'beta'],
      ['same', 'same'],
      ['', ''],
    ]) {
      const localSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
      const referenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

      expectSameObservableBehavior(
        () => local.diffWords(oldText, newText, { intlSegmenter: localSegmenter }),
        () => reference.diffWords(oldText, newText, { intlSegmenter: referenceSegmenter })
      );
    }
  });

  it('ignores Intl.Segmenter on whitespace-significant word diffs', () => {
    const localSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const referenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const referenceOptions = {
      ignoreWhitespace: false,
      intlSegmenter: referenceSegmenter,
    };

    expectSameObservableBehavior(
      () =>
        local.diffWordsWithSpace('alpha beta', 'alpha  beta', { intlSegmenter: localSegmenter }),
      () =>
        reference.diffWordsWithSpace('alpha beta', 'alpha  beta', {
          intlSegmenter: referenceSegmenter,
        })
    );
    expectSameObservableBehavior(
      () =>
        local.diffWords('alpha beta', 'alpha  beta', {
          ignoreWhitespace: false,
          intlSegmenter: localSegmenter,
        }),
      () => reference.diffWords('alpha beta', 'alpha  beta', referenceOptions)
    );
  });

  it('matches a changed line diff with explicit options exactly', () => {
    const oldText = 'alpha\nbeta\ngamma\n';
    const newText = 'alpha\ndelta\ngamma\n';

    expectSameObservableBehavior(
      () => local.diffLines(oldText, newText, {}),
      () => reference.diffLines(oldText, newText, {})
    );
  });

  it('matches identical non-empty line, sentence, and CSS diffs exactly', () => {
    expectSameObservableBehavior(
      () => local.diffLines('alpha\nbeta\n', 'alpha\nbeta\n'),
      () => reference.diffLines('alpha\nbeta\n', 'alpha\nbeta\n')
    );
    expectSameObservableBehavior(
      () => local.diffSentences('Ready! Set? Go.', 'Ready! Set? Go.'),
      () => reference.diffSentences('Ready! Set? Go.', 'Ready! Set? Go.')
    );
    expectSameObservableBehavior(
      () => local.diffCss('.item { color: red; }', '.item { color: red; }'),
      () => reference.diffCss('.item { color: red; }', '.item { color: red; }')
    );
  });

  it('matches identical empty line, sentence, and CSS diffs exactly', () => {
    expectSameObservableBehavior(
      () => local.diffLines('', ''),
      () => reference.diffLines('', '')
    );
    expectSameObservableBehavior(
      () => local.diffSentences('', ''),
      () => reference.diffSentences('', '')
    );
    expectSameObservableBehavior(
      () => local.diffCss('', ''),
      () => reference.diffCss('', '')
    );
  });

  it('matches token-sensitive identical line diffs exactly', () => {
    const text = 'alpha\nbeta\n';
    const options = { newlineIsToken: true, oneChangePerToken: true };

    expectSameObservableBehavior(
      () => local.diffLines(text, text, options),
      () => reference.diffLines(text, text, options)
    );
    expectSameObservableBehavior(
      () => local.diffLines('alpha\r\nbeta\r\n', 'alpha\r\nbeta\r\n', { stripTrailingCr: true }),
      () => reference.diffLines('alpha\r\nbeta\r\n', 'alpha\r\nbeta\r\n', { stripTrailingCr: true })
    );
  });

  it('matches token-sensitive identical sentence and CSS diffs exactly', () => {
    const sentence = 'Ready!  Set? Go.';
    const css = '.item { color: red; }';
    const options = { oneChangePerToken: true };

    expectSameObservableBehavior(
      () => local.diffSentences(sentence, sentence, options),
      () => reference.diffSentences(sentence, sentence, options)
    );
    expectSameObservableBehavior(
      () => local.diffCss(css, css, options),
      () => reference.diffCss(css, css, options)
    );
  });

  it('matches a basic patch round-trip exactly', () => {
    const oldText = 'one\ntwo\n';
    const newText = 'one\nthree\n';

    expectSameObservableBehavior(
      () => local.createPatch('notes.txt', oldText, newText, 'old', 'new', {}),
      () => reference.createPatch('notes.txt', oldText, newText, 'old', 'new', {})
    );

    expectSameObservableBehavior(
      () => {
        const patch = local.createPatch('notes.txt', oldText, newText, 'old', 'new', {});
        return local.applyPatch(oldText, patch, {});
      },
      () => {
        const patch = reference.createPatch('notes.txt', oldText, newText, 'old', 'new', {});
        return reference.applyPatch(oldText, patch, {});
      }
    );
  });

  it('matches whole-file deletion with a parsed single-file patch', () => {
    const source = 'alpha\n\nomega';
    const patch =
      '--- archive.txt\n' +
      '+++ archive.txt\n' +
      '@@ -1,3 +1,0 @@\n' +
      '-alpha\n' +
      '-\n' +
      '-omega\n' +
      '\\ No newline at end of file\n';

    expectSameObservableBehavior(
      () => local.applyPatch(source, patch, {}),
      () => reference.applyPatch(source, patch, {})
    );
  });

  it('matches a final-line replacement with an EOF marker and fuzz', () => {
    const source = 'foo\nbar\nbaz\nqux\n';
    const patch =
      '--- words.txt\n' +
      '+++ words.txt\n' +
      '@@ -4,1 +4,1 @@\n' +
      '-qux\n' +
      '+changed\n' +
      '\\ No newline at end of file\n';

    expectSameObservableBehavior(
      () => local.applyPatch(source, patch, { fuzzFactor: 1 }),
      () => reference.applyPatch(source, patch, { fuzzFactor: 1 })
    );
  });

  it('matches offset and context handling across multiple hunks', () => {
    const source =
      'seed\n' +
      'anchor\n'.repeat(9) +
      'remove first\n' +
      'anchor\n'.repeat(13) +
      'remove second\n' +
      'anchor\n'.repeat(12);
    const expected =
      'replacement\n' +
      'replacement two\n' +
      'anchor\n'.repeat(19) +
      'inserted\n' +
      'anchor\n'.repeat(4) +
      'replacement\n' +
      'replacement two\n' +
      'anchor\n'.repeat(2);
    const patch = reference.createPatch('renamed-data.txt', source, expected);
    const shiftedSource = `untracked prefix\n${source}`;

    expectSameObservableBehavior(
      () => local.applyPatch(shiftedSource, patch, {}),
      () => reference.applyPatch(shiftedSource, patch, {})
    );
  });

  it('leaves source unchanged when a patch contains only file metadata', () => {
    const identityPatch =
      'Index: testFileName\n' +
      '===================================================================\n' +
      '--- testFileName\told value\n' +
      '+++ testFileName\tnew value\n';

    for (const source of ['this\n\ntos', 'value\n' + 'context\n'.repeat(6)]) {
      expectSameObservableBehavior(
        () => local.applyPatch(source, identityPatch, {}),
        () => reference.applyPatch(source, identityPatch, {})
      );
    }
  });

  it('returns patch failures without writing to the console', () => {
    const source = 'present\n';
    const patch =
      '--- quiet.txt\n' + '+++ quiet.txt\n' + '@@ -1,1 +1,1 @@\n' + '-missing\n' + '+replacement\n';
    const messages: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => messages.push(args);

    try {
      expectSameObservableBehavior(
        () => local.applyPatch(source, patch, {}),
        () => reference.applyPatch(source, patch, {})
      );
    } finally {
      console.log = originalLog;
    }

    expect(messages).toEqual([]);
  });
});
