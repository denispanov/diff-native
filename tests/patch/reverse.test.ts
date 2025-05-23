import { describe, it, expect, beforeAll } from 'bun:test';
import { getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;
beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('patch.reverse', () => {
  it('produces inverse patch that restores the file', () => {
    const file1 = 'line1\nline2\nline3\nline4\n';
    const file2 = 'line1\nline2\nline5\nline4\n';

    const f1to2 = wasm.structuredPatch('file1', 'file2', file1, file2);
    const reversed = wasm.reversePatch(f1to2);

    const restored = wasm.applyPatch(file2, reversed);
    expect(restored).toBe(file1);
  });
});
