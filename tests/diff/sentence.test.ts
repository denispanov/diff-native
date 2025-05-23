import { describe, it, expect, beforeAll } from 'bun:test';
import { getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('diffSentences', () => {
  it('Should diff Sentences', () => {
    const oldStr = 'New Value.';
    const newStr = 'New ValueMoreData.';
    const result = wasm.diffSentences(oldStr, newStr, {});
    const expectedXML = '<del>New Value.</del><ins>New ValueMoreData.</ins>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
  });

  it('should diff only the last sentence', () => {
    const oldStr = 'Here im. Rock you like old man.';
    const newStr = 'Here im. Rock you like hurricane.';
    const result = wasm.diffSentences(oldStr, newStr, {});
    const expectedXML =
      'Here im. <del>Rock you like old man.</del><ins>Rock you like hurricane.</ins>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
  });
});
