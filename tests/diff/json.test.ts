import { beforeAll, describe, expect, it } from 'bun:test';
import type * as DiffNative from 'diff-native';
import { getWasmModule } from '../setup';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('diffJson (WASM)', () => {
  it('accepts plain objects', () => {
    const diff = wasm.diffJson({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 }, {});
    expect(diff.length).toBe(3);
  });

  it('keeps output identical for dangling-comma case', () => {
    const xml = wasm.convertChangesToXML(wasm.diffJson({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 }, {}));
    expect(xml.includes('&quot;c&quot;')).toBe(true);
  });

  it('canonicalize orders keys', () => {
    const obj = wasm.canonicalize({ b: 2, a: 1 });
    expect(Object.keys(obj)).toEqual(['a', 'b']);
  });
});
