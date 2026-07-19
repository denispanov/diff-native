import { beforeAll, describe, it } from 'bun:test';
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
});
