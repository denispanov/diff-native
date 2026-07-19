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
