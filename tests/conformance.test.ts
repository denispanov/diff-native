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
