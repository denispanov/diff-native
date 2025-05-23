import { describe, it, expect, beforeAll } from 'bun:test';
import { getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

const SAMPLE =
  'Index: test\n' +
  '===================================================================\n' +
  '--- test\theader1\n' +
  '+++ test\theader2\n' +
  '@@ -1,3 +1,4 @@\n' +
  ' line2\n' +
  ' line3\r\n' +
  '+line4\r\n' +
  ' line5\n';

describe('unixToWin / winToUnix', () => {
  it('round-trips line endings correctly', () => {
    const patch = wasm.parsePatch(SAMPLE);
    const winPatch = wasm.unixToWin(patch);
    const expectedWin =
      'Index: test\n' +
      '===================================================================\n' +
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line2\r\n' +
      ' line3\r\n' +
      '+line4\r\n' +
      ' line5\r\n';
    expect(wasm.formatPatch(winPatch)).toBe(expectedWin);

    const unixPatch = wasm.winToUnix(winPatch);
    const expectedUnix =
      'Index: test\n' +
      '===================================================================\n' +
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line2\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    expect(wasm.formatPatch(unixPatch)).toBe(expectedUnix);

    expect(wasm.formatPatch(wasm.winToUnix(patch))).toBe(expectedUnix);
  });

  it('does not add CR to final line without EOF-NL', () => {
    const noNl =
      'Index: test\n' +
      '===================================================================\n' +
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,2 +1,3 @@\n' +
      ' line2\n' +
      ' line3\n' +
      '+line4\n' +
      '\\ No newline at end of file\n';

    const winPatch = wasm.unixToWin(wasm.parsePatch(noNl));
    const expected =
      'Index: test\n' +
      '===================================================================\n' +
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,2 +1,3 @@\n' +
      ' line2\r\n' +
      ' line3\r\n' +
      '+line4\n' +
      '\\ No newline at end of file\n';
    expect(wasm.formatPatch(winPatch)).toBe(expected);
  });
});

describe('isWin / isUnix', () => {
  it('detects pure CRLF patches', () => {
    const patch = wasm.parsePatch(SAMPLE.replace(/\n/g, '\r\n'));
    expect(wasm.isWin(patch)).toBe(true);
    expect(wasm.isUnix(patch)).toBe(false);
  });

  it('detects mixed endings properly', () => {
    const mixed = wasm.parsePatch(SAMPLE);
    expect(wasm.isWin(mixed)).toBe(false);
    expect(wasm.isUnix(mixed)).toBe(false);
  });
});
