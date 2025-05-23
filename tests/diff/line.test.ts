import { describe, it, expect, beforeAll } from 'bun:test';
import { Change, DiffLinesOptions, getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('diffLines', () => {
  it('should return no changes for identical lines', () => {
    const oldStr = 'line1\nline2\nline3';
    const newStr = 'line1\nline2\nline3';
    const options: DiffLinesOptions = {};
    const result = wasm.diffLines(oldStr, newStr, options);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].added).toBe(false);
    expect(result[0].removed).toBe(false);
    expect(result[0].value).toBe(oldStr);
  });

  it('should detect a changed line', () => {
    const oldStr = 'line1\nline2\nline3';
    const newStr = 'line1\nline_changed\nline3';
    const options: DiffLinesOptions = {};
    const result = wasm.diffLines(oldStr, newStr, options);

    expect(Array.isArray(result)).toBe(true);
    result.forEach((change: Change) => {
      expect(change).toHaveProperty('value');
      expect(typeof change.value).toBe('string');
      expect(change).toHaveProperty('added');
      expect(typeof change.added).toBe('boolean');
      expect(change).toHaveProperty('removed');
      expect(typeof change.removed).toBe('boolean');
      expect(change).toHaveProperty('count');
      expect(typeof change.count).toBe('number');
    });
    expect(result.some(change => change.added || change.removed)).toBe(true);
  });
});
