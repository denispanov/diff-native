import { describe, it, expect, beforeAll } from 'bun:test';
import { getWasmModule } from '../setup';
import type { StructuredPatch, ApplyOptions } from 'diff-native';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;
beforeAll(async () => {
  wasm = await getWasmModule();
});

function applyPatchesShim(
  patch: string | StructuredPatch[],
  handlers: {
    loadFile(idx: StructuredPatch, cb: (err?: Error, contents?: string) => void): void;
    patched(idx: StructuredPatch, content: string, cb: (err?: Error) => void): void;
    complete(err?: Error): void;
  }
): void {
  const list: StructuredPatch[] = typeof patch === 'string' ? wasm.parsePatch(patch) : patch;

  let remaining = list.length;
  let finished = false;

  const done = (err?: Error) => {
    if (!finished) {
      finished = true;
      handlers.complete(err);
    }
  };

  for (const idx of list) {
    handlers.loadFile(idx, (loadErr, contents = '') => {
      if (loadErr) return done(loadErr);

      const res = wasm.applyPatch(contents, [idx]);
      if (res === false) return done(new Error('applyPatch failed'));

      handlers.patched(idx, res, patchErr => {
        if (patchErr) return done(patchErr);
        if (--remaining === 0) done();
      });
    });
  }
}

describe('patch/apply - #applyPatch basics', () => {
  it('accepts parsed patches', () => {
    const parsed = wasm.parsePatch(
      [
        'Index: test',
        '===================================================================',
        '--- test\theader1',
        '+++ test\theader2',
        '@@ -1,3 +1,4 @@',
        ' line2',
        ' line3',
        '+line4',
        ' line5',
        '',
      ].join('\n')
    );

    const src = ['line2', 'line3', 'line5', ''].join('\n');
    const expected = ['line2', 'line3', 'line4', 'line5', ''].join('\n');

    expect(wasm.applyPatch(src, parsed)).toBe(expected);
    expect(wasm.applyPatch(src, parsed[0])).toBe(expected);
  });

  it('throws when multiple indexes are supplied', () => {
    const invalid = [1, 2] as unknown as StructuredPatch[];
    expect(() => wasm.applyPatch('', invalid)).toThrow(/only works with a single input/i);
  });

  it('applies patches that change the last line', () => {
    const patch1 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,3 +1,4 @@',
      ' line2',
      ' line3',
      '+line4',
      ' line5',
    ].join('\n');
    const src1 = ['line2', 'line3', 'line5', ''].join('\n');
    const exp1 = ['line2', 'line3', 'line4', 'line5', ''].join('\n');
    expect(wasm.applyPatch(src1, patch1)).toBe(exp1);

    const patch2 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,3 +1,4 @@',
      ' line2',
      ' line3',
      ' line4',
      '+line5',
    ].join('\n');
    const src2 = 'line2\nline3\nline4\n';
    expect(wasm.applyPatch(src2, patch2)).toBe('line2\nline3\nline4\nline5\n');

    const patch3 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,4 +1,4 @@',
      ' line1',
      ' line2',
      ' line3',
      '+line44',
      '-line4',
    ].join('\n');
    const src3 = 'line1\nline2\nline3\nline4\n';
    expect(wasm.applyPatch(src3, patch3)).toBe('line1\nline2\nline3\nline44\n');

    const patch4 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,4 +1,5 @@',
      ' line1',
      ' line2',
      ' line3',
      '+line44',
      '+line5',
      '-line4',
    ].join('\n');
    expect(wasm.applyPatch(src3, patch4)).toBe('line1\nline2\nline3\nline44\nline5\n');
  });

  it('merges EOFNL', () => {
    const base = 'line1\nline2\nline3\nline4\n';
    const patch1 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,4 +1,4 @@',
      ' line1',
      ' line2',
      ' line3',
      '+line4',
      '\\ No newline at end of file',
      '-line4',
    ].join('\n');
    expect(wasm.applyPatch(base, patch1)).toBe('line1\nline2\nline3\nline4');

    const patch2 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,4 +1,4 @@',
      ' line1',
      ' line2',
      ' line3',
      '+line4',
      '-line4',
      '\\ No newline at end of file',
    ].join('\n');
    expect(wasm.applyPatch('line1\nline2\nline3\nline4', patch2)).toBe(
      'line1\nline2\nline3\nline4\n'
    );

    const patch3 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,4 +1,4 @@',
      '+line1',
      '-line11',
      ' line2',
      ' line3',
      ' line4',
      '\\ No newline at end of file',
    ].join('\n');
    expect(wasm.applyPatch('line11\nline2\nline3\nline4', patch3)).toBe(
      'line1\nline2\nline3\nline4'
    );

    const patch4 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,5 +1,5 @@',
      '+line1',
      '-line11',
      ' line2',
      ' line3',
      ' line4',
      ' line4',
    ].join('\n');
    const src4 = 'line11\nline2\nline3\nline4\nline4\nline4\nline4';
    expect(wasm.applyPatch(src4, patch4)).toBe('line1\nline2\nline3\nline4\nline4\nline4\nline4');

    const patch5 = [
      'Index: test',
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,4 +1,4 @@',
      '+line1',
      '-line11',
      ' line2',
      '',
      ' line4',
      '\\ No newline at end of file',
    ].join('\n');
    expect(wasm.applyPatch('line11\nline2\n\nline4', patch5)).toBe('line1\nline2\n\nline4');
  });

  it('should apply patches', () => {
    const oldFile =
      'value\n' +
      'context\n'.repeat(9) +
      'remove value\n' +
      'context\n'.repeat(13) +
      'remove value\n' +
      'context\n'.repeat(12);
    const newFile =
      'new value\n' +
      'new value 2\n' +
      'context\n'.repeat(19) +
      'add value\n' +
      'context\n'.repeat(4) +
      'new value\n' +
      'new value 2\n' +
      'context\n'.repeat(2);
    const diffFile =
      'Index: testFileName\n' +
      '===================================================================\n' +
      '--- testFileName\tOld Header\n' +
      '+++ testFileName\tNew Header\n' +
      '@@ -1,5 +1,6 @@\n' +
      '+new value\n' +
      '+new value 2\n' +
      '-value\n' +
      ' context\n'.repeat(4) +
      '@@ -7,9 +8,8 @@\n' +
      ' context\n'.repeat(4) +
      '-remove value\n' +
      ' context\n'.repeat(3) +
      '@@ -17,20 +17,21 @@\n' +
      ' context\n'.repeat(3) +
      '-remove value\n' +
      ' context\n'.repeat(7) +
      '+add value\n' +
      ' context\n'.repeat(4) +
      '+new value\n' +
      '+new value 2\n' +
      '-value\n' +
      ' context\n'.repeat(2) +
      '\\ No newline at end of file\n';

    expect(wasm.applyPatch(oldFile, diffFile)).toBe(newFile);

    const identityFile =
      'Index: testFileName\n' +
      '===================================================================\n' +
      '--- testFileName\tOld Header\n' +
      '+++ testFileName\tNew Header\n';
    expect(wasm.applyPatch(oldFile, identityFile)).toBe(oldFile);
  });

  it('should apply patches that lack an index header', () => {
    const patch =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line2\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    const src = 'line2\nline3\nline5\n';
    const exp = 'line2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should apply single line patches with zero context and zero removed', () => {
    const patch = '--- test\theader1\n' + '+++ test\theader2\n' + '@@ -2,0 +3 @@\n' + '+line4\n';
    const src = 'line2\nline3\nline5\n';
    const exp = 'line2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should apply multiline patches with zero context and zero removed', () => {
    const patch =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -2,0 +3,3 @@\n' +
      '+line4\n' +
      '+line5\n' +
      '+line6\n';
    const src = 'line2\nline3\nline7\n';
    const exp = 'line2\nline3\nline4\nline5\nline6\nline7\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should apply single line patches with zero context and zero removed at start of file', () => {
    const patch = '--- test\theader1\n' + '+++ test\theader2\n' + '@@ -0,0 +1 @@\n' + '+line1\n';
    const src = 'line2\nline3\n';
    const exp = 'line1\nline2\nline3\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should apply multi line patches with zero context and zero removed at start of file', () => {
    const patch =
      '--- test\theader1\n' + '+++ test\theader2\n' + '@@ -0,0 +1,2 @@\n' + '+line1\n' + '+line2\n';
    const src = 'line3\nline4\n';
    const exp = 'line1\nline2\nline3\nline4\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should apply multi line patches with zero context and zero removed at end of file', () => {
    const patch = '--- test\theader1\n' + '+++ test\theader2\n' + '@@ -1,0 +2 @@\n' + '+line2\n';
    const src = 'line1\n';
    const exp = 'line1\nline2\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should apply multi line patches with zero context and zero removed at end of file', () => {
    const patch =
      '--- test\theader1\n' + '+++ test\theader2\n' + '@@ -1,0 +2,2 @@\n' + '+line2\n' + '+line3\n';
    const src = 'line1\n';
    const exp = 'line1\nline2\nline3\n';
    expect(wasm.applyPatch(src, patch)).toBe(exp);
  });

  it('should fail on mismatch', () => {
    const patch =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line2\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    const src = 'line2\nline2\nline5\n';
    expect(wasm.applyPatch(src, patch)).toBe(false);
  });

  it("should fail if a line to delete doesn't match, even with fuzz factor", () => {
    const patch =
      'Index: foo.txt\n' +
      '===================================================================\n' +
      '--- foo.txt\n' +
      '+++ foo.txt\n' +
      '@@ -1,4 +1,3 @@\n' +
      ' foo\n' +
      '-bar\n' +
      ' baz\n' +
      ' qux\n';
    const result1 = wasm.applyPatch('foo\nbar\nbaz\nqux\n', patch, { fuzzFactor: 99 });
    expect(result1).toBe('foo\nbaz\nqux\n');
    const result2 = wasm.applyPatch('foo\nSOMETHING ENTIRELY DIFFERENT\nbaz\nqux\n', patch, {
      fuzzFactor: 99,
    });
    expect(result2).toBe(false);
  });

  it("should fail if either line immediately next to an insertion doesn't match, regardless of fuzz factor", () => {
    const base = 'lineA\nlineB\nlineC\nlineD\nlineE\n';
    const patchA =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,5 +1,6 @@\n' +
      ' lineA\n' +
      ' lineB\n' +
      ' lineC\n' +
      '+lineNEW\n' +
      ' lineX\n' +
      ' lineE\n';
    expect(wasm.applyPatch(base, patchA, { fuzzFactor: 10 })).toBe(false);
    const patchB =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,5 +1,6 @@\n' +
      ' lineA\n' +
      ' lineB\n' +
      ' lineX\n' +
      '+lineNEW\n' +
      ' lineD\n' +
      ' lineE\n';
    expect(wasm.applyPatch(base, patchB, { fuzzFactor: 10 })).toBe(false);
  });

  it('should, given a fuzz factor, allow mismatches caused by presence of extra lines', () => {
    const patchExtra =
      '--- foo.txt\t2024-07-19 09:58:02.489059795 +0100\n' +
      '+++ bar.txt\t2024-07-19 09:58:24.768153252 +0100\n' +
      '@@ -2,8 +2,8 @@\n' +
      ' line2\n' +
      ' line3\n' +
      ' line4\n' +
      '+line5\n' +
      ' line6\n' +
      ' line7\n' +
      ' line8\n' +
      '-line9\n' +
      ' line10\n';
    const srcExtra =
      'line1\nline2\nline2.5\nline3\nline4\nline6\nline7\nline8\nline8.5\nline9\nline10\n';
    const expExtra =
      'line1\nline2\nline2.5\nline3\nline4\nline5\nline6\nline7\nline8\nline8.5\nline10\n';
    expect(wasm.applyPatch(srcExtra, patchExtra, { fuzzFactor: 2 })).toBe(expExtra);
  });

  it('should, given a fuzz factor, allow mismatches due to missing lines', () => {
    const patchMissing =
      '--- foo.txt\t2024-07-19 09:58:02.489059795 +0100\n' +
      '+++ bar.txt\t2024-07-19 09:58:24.768153252 +0100\n' +
      '@@ -2,8 +2,8 @@\n' +
      ' line2\n' +
      ' line3\n' +
      ' line4\n' +
      '+line5\n' +
      ' line6\n' +
      ' line7\n' +
      ' line8\n' +
      '-line9\n' +
      ' line10\n';
    const srcMissing = 'line1\nline2\nline4\nline6\nline7\nline9\nline10\n';
    const expMissing = 'line1\nline2\nline4\nline5\nline6\nline7\nline10\n';
    expect(wasm.applyPatch(srcMissing, patchMissing, { fuzzFactor: 2 })).toBe(expMissing);
  });

  it('should, given a fuzz factor, allow mismatches caused by lines being changed', () => {
    const patchChanged =
      '--- foo.txt\t2024-07-19 09:58:02.489059795 +0100\n' +
      '+++ bar.txt\t2024-07-19 09:58:24.768153252 +0100\n' +
      '@@ -2,8 +2,8 @@\n' +
      ' line2\n' +
      ' line3\n' +
      ' line4\n' +
      '+line5\n' +
      ' line6\n' +
      ' line7\n' +
      ' line8\n' +
      '-line9\n' +
      ' line10\n';
    const srcChanged = 'line1\nline2\nlineTHREE\nline4\nline6\nline7\nlineEIGHT\nline9\nline10\n';
    const expChanged = 'line1\nline2\nlineTHREE\nline4\nline5\nline6\nline7\nlineEIGHT\nline10\n';
    expect(wasm.applyPatch(srcChanged, patchChanged, { fuzzFactor: 2 })).toBe(expChanged);
  });

  it('should, given a fuzz factor, allow mismatches caused by a mixture of ins/sub/del', () => {
    const patchMix =
      '--- foo.txt\t2024-07-19 09:58:02.489059795 +0100\n' +
      '+++ bar.txt\t2024-07-19 09:58:24.768153252 +0100\n' +
      '@@ -2,8 +2,8 @@\n' +
      ' line2\n' +
      ' line3\n' +
      ' line4\n' +
      '+line5\n' +
      ' line6\n' +
      ' line7\n' +
      ' line8\n' +
      '-line9\n' +
      ' line10\n';
    const srcMix = 'line1\nline2\nline2.5\nlineTHREE\nline4\nline6\nline7\nline9\nline10\n';
    const expMix = 'line1\nline2\nline2.5\nlineTHREE\nline4\nline5\nline6\nline7\nline10\n';
    expect(wasm.applyPatch(srcMix, patchMix, { fuzzFactor: 3 })).toBe(expMix);
  });

  it('should fail if number of lines of context mismatch is greater than fuzz factor', () => {
    const patchLimit =
      '--- foo.txt\t2024-07-19 09:58:02.489059795 +0100\n' +
      '+++ bar.txt\t2024-07-19 09:58:24.768153252 +0100\n' +
      '@@ -2,8 +2,8 @@\n' +
      ' line2\n' +
      ' line3\n' +
      ' line4\n' +
      '+line5\n' +
      ' line6\n' +
      ' line7\n' +
      ' line8\n' +
      '-line9\n' +
      ' line10\n';
    const src1Limit =
      'line1\nline2\nline2.5\nline3\nline4\nline6\nline6.5\nline7\nline8\nline8.5\nline9\nline10\n';
    expect(wasm.applyPatch(src1Limit, patchLimit, { fuzzFactor: 2 })).toBe(false);

    const src2Limit = 'line1\nline2\nline4\nline6\nline7\nline9\nline10\n';
    expect(wasm.applyPatch(src2Limit, patchLimit, { fuzzFactor: 1 })).toBe(false);

    const src3Limit = 'line1\nlineTWO\nlineTHREE\nline4\nline6\nline7\nlineEIGHT\nline9\nline10\n';
    expect(wasm.applyPatch(src3Limit, patchLimit, { fuzzFactor: 2 })).toBe(false);

    const src4Limit = 'line1\nline2\nline2.5\nlineTHREE\nline4\nline6\nline7\nline9\nline10\n';
    expect(wasm.applyPatch(src4Limit, patchLimit, { fuzzFactor: 2 })).toBe(false);
  });

  it('should succeed when hunk needs a negative offset', () => {
    const patchNegOffset =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -3,2 +3,3 @@\n' +
      ' line1\n' +
      '+line2\n' +
      ' line3\n';
    const srcNegOffset = 'line1\nline3\nline4\nline5\n';
    const expNegOffset = 'line1\nline2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(srcNegOffset, patchNegOffset)).toBe(expNegOffset);
  });

  it('can handle an insertion before the first line', () => {
    const patchInsertBefore =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,2 +1,3 @@\n' +
      '+line1\n' +
      ' line2\n' +
      ' line3\n';
    const srcInsertBefore = 'line2\nline3\nline4\nline5\n';
    const expInsertBefore = 'line1\nline2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(srcInsertBefore, patchInsertBefore)).toBe(expInsertBefore);
  });

  it('can handle an insertion after the first line', () => {
    const patchInsertAfter =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -3,2 +3,3 @@\n' +
      ' line3\n' +
      ' line4\n' +
      '+line5\n';
    const srcInsertAfter = 'line1\nline2\nline3\nline4\n';
    const expInsertAfter = 'line1\nline2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(srcInsertAfter, patchInsertAfter)).toBe(expInsertAfter);
  });

  it('should succeed when hunk needs a positive offset', () => {
    const patchPosOffset =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,2 +1,3 @@\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    const srcPosOffset = 'line1\nline2\nline3\nline5\n';
    const expPosOffset = 'line1\nline2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(srcPosOffset, patchPosOffset)).toBe(expPosOffset);
  });

  it('should succeed when 1st hunk specifies invalid newStart', () => {
    const patchInvalidNewStart1 =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,2 +2,3 @@\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    const srcInvalidNewStart1 = 'line1\nline2\nline3\nline5\n';
    const expInvalidNewStart1 = 'line1\nline2\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(srcInvalidNewStart1, patchInvalidNewStart1)).toBe(expInvalidNewStart1);
  });

  it('should succeed when 2nd hunk specifies invalid newStart', () => {
    const patchInvalidNewStart2 =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,2 @@\n' +
      ' line1\n' +
      '-line2\n' +
      ' line3\n' +
      '@@ -3,2 +3,3 @@\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    const srcInvalidNewStart2 = 'line1\nline2\nline3\nline5\n';
    const expInvalidNewStart2 = 'line1\nline3\nline4\nline5\n';
    expect(wasm.applyPatch(srcInvalidNewStart2, patchInvalidNewStart2)).toBe(expInvalidNewStart2);
  });

  it('should create a file', () => {
    const patchCreateFile =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -0,0 +1,4 @@\n' +
      '+line1\n' +
      '+line2\n' +
      '+line3\n' +
      '+line4\n';
    expect(wasm.applyPatch('', patchCreateFile)).toBe(
      'line1\n' + 'line2\n' + 'line3\n' + 'line4\n'
    );
  });

  it('should erase a file', () => {
    const patchErase =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,4 +0,0 @@\n' +
      '-line1\n' +
      '-line2\n' +
      '-line3\n' +
      '-line4\n';
    const srcErase = 'line1\nline2\nline3\nline4\n';
    expect(wasm.applyPatch(srcErase, patchErase)).toBe('');
  });

  it('should allow custom line comparison', () => {
    const patchCompare =
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line2\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    const srcCompare = 'line2\nline2\nline5\n';
    const expCompare = 'line2\nline2\nline4\nline5\n';
    const resultCompare = wasm.applyPatch(srcCompare, patchCompare, {
      compareLine(
        lineNumber: number,
        line: string,
        operation: '+' | '-' | ' ',
        patchContent: string
      ) {
        expect(typeof lineNumber).toBe('number');
        if (lineNumber === 2) {
          expect(line).toBe('line2');
          expect(operation).toBe(' ');
          expect(patchContent).toBe('line3');
        }
        return true;
      },
    } as ApplyOptions);
    expect(resultCompare).toBe(expCompare);
  });

  it('should work with unicode newline characters', () => {
    const oldtext = 'AAAAAAAAAAAAAAAA\n\n';
    const newtext =
      'AAAAAAAAAAAAAAAA\nBBBBBB' + String.fromCharCode(0x2028) + '\nCCCCCCCCCCCCCCCCCC\n\n';
    const diffed = wasm.createPatch('test', oldtext, newtext);
    expect(wasm.applyPatch(oldtext, diffed)).toBe(newtext);
  });

  it('handle empty text', () => {
    const oldtext = '';
    const newtext = 'asdasd\n';
    const diffed = wasm.createPatch('test', oldtext, newtext);
    expect(wasm.applyPatch(oldtext, diffed)).toBe(newtext);
  });

  it('handle two common text', () => {
    const oldtext = 's';
    const newtext = 'sdfsdf\n';
    const diffed = wasm.createPatch('test', oldtext, newtext);
    expect(wasm.applyPatch(oldtext, diffed)).toBe(newtext);
  });

  it('should accept structured patches', () => {
    const oldContent = ['line1', 'line2', ''].join('\n');
    const newContent = ['line1', 'line02'].join('\n');
    const patchStruct = wasm.structuredPatch('test.txt', 'test.txt', oldContent, newContent);
    expect(wasm.applyPatch(oldContent, patchStruct)).toBe(newContent);
  });

  it('should correctly apply a patch that truncates an entire file', () => {
    const patchTruncate = wasm.parsePatch(
      '===================================================================\n' +
        '--- index.js\n' +
        '+++ index.js\n' +
        '@@ -1,3 +1,0 @@\n' +
        '-this\n' +
        '-\n' +
        '-tos\n' +
        '\\ No newline at end of file\n'
    );
    const fileContents = 'this\n\ntos';
    expect(wasm.applyPatch(fileContents, patchTruncate)).toBe('');
  });

  it('should automatically convert a patch with Unix file endings to Windows when patching a Windows file', () => {
    const oldFile = 'foo\r\nbar\r\nbaz\r\nqux\r\n';
    const diffFile =
      'Index: testFileName\n' +
      '===================================================================\n' +
      '--- testFileName\tOld Header\n' +
      '+++ testFileName\tNew Header\n' +
      '@@ -2,2 +2,3 @@\n' +
      '-bar\n' +
      '-baz\n' +
      '+new\n' +
      '+two\n' +
      '+three\n';
    expect(wasm.applyPatch(oldFile, diffFile)).toBe('foo\r\nnew\r\ntwo\r\nthree\r\nqux\r\n');
  });

  it('should automatically convert a patch with Windows file endings to Unix when patching a Unix file', () => {
    const oldFile = 'foo\nbar\nbaz\nqux\n';
    const diffFile =
      'Index: testFileName\r\n' +
      '===================================================================\r\n' +
      '--- testFileName\tOld Header\r\n' +
      '+++ testFileName\tNew Header\r\n' +
      '@@ -2,2 +2,3 @@\r\n' +
      '-bar\r\n' +
      '-baz\r\n' +
      '+new\r\n' +
      '+two\r\n' +
      '+three\r\n';
    expect(wasm.applyPatch(oldFile, diffFile)).toBe('foo\nnew\ntwo\nthree\nqux\n');
  });

  it('should leave line endings in the patch alone if the target file has mixed file endings, even if this means the patch does not apply', () => {
    const oldFile1 = 'foo\r\nbar\nbaz\nqux\n';
    const oldFile2 = 'foo\nbar\r\nbaz\r\nqux\n';
    const diffFileMix =
      'Index: testFileName\r\n' +
      '===================================================================\r\n' +
      '--- testFileName\tOld Header\r\n' +
      '+++ testFileName\tNew Header\r\n' +
      '@@ -2,2 +2,3 @@\r\n' +
      '-bar\r\n' +
      '-baz\r\n' +
      '+new\r\n' +
      '+two\r\n' +
      '+three\r\n';
    expect(wasm.applyPatch(oldFile1, diffFileMix)).toBe(false);
    expect(wasm.applyPatch(oldFile2, diffFileMix)).toBe('foo\nnew\r\ntwo\r\nthree\r\nqux\n');
  });

  it('should leave patch file endings alone if autoConvertLineEndings=false', () => {
    const oldFile = 'foo\r\nbar\r\nbaz\r\nqux\r\n';
    const diffFileNoConv =
      'Index: testFileName\n' +
      '===================================================================\n' +
      '--- testFileName\tOld Header\n' +
      '+++ testFileName\tNew Header\n' +
      '@@ -2,2 +2,3 @@\n' +
      '-bar\n' +
      '-baz\n' +
      '+new\n' +
      '+two\n' +
      '+three\n';
    expect(
      wasm.applyPatch(oldFile, diffFileNoConv, { autoConvertLineEndings: false } as ApplyOptions)
    ).toBe(false);
  });

  it('fails if asked to remove a non-existent trailing newline with fuzzFactor 0', () => {
    const oldFile = 'foo\nbar\nbaz\nqux';
    const diffFileFailRemove =
      'Index: bla\n' +
      '===================================================================\n' +
      '--- bla\tOld Header\n' +
      '+++ bla\tNew Header\n' +
      '@@ -4,1 +4,1 @@\n' +
      '-qux\n' +
      '+qux\n' +
      '\\ No newline at end of file\n';
    expect(wasm.applyPatch(oldFile, diffFileFailRemove)).toBe(false);
  });

  it('fails if asked to add an EOF newline, with fuzzFactor 0, when one already exists', () => {
    const oldFile = 'foo\nbar\nbaz\nqux\n';
    const diffFileFailAdd =
      'Index: bla\n' +
      '===================================================================\n' +
      '--- bla\tOld Header\n' +
      '+++ bla\tNew Header\n' +
      '@@ -4,1 +4,1 @@\n' +
      '-qux\n' +
      '\\ No newline at end of file\n' +
      '+qux\n';
    expect(wasm.applyPatch(oldFile, diffFileFailAdd)).toBe(false);
  });

  it('ignores being asked to remove a non-existent trailing newline if fuzzFactor >0', () => {
    const oldFile = 'foo\nbar\nbaz\nqux';
    const diffFileIgnoreRemove =
      'Index: bla\n' +
      '===================================================================\n' +
      '--- bla\tOld Header\n' +
      '+++ bla\tNew Header\n' +
      '@@ -4,1 +4,1 @@\n' +
      '-qux\n' +
      '+qux\n' +
      '\\ No newline at end of file\n';
    expect(wasm.applyPatch(oldFile, diffFileIgnoreRemove, { fuzzFactor: 1 })).toBe(oldFile);
  });

  it('ignores being asked to add an EOF newline when one already exists if fuzzFactor>0', () => {
    const oldFile = 'foo\nbar\nbaz\nqux\n';
    const diffFileIgnoreAdd =
      'Index: bla\n' +
      '===================================================================\n' +
      '--- bla\tOld Header\n' +
      '+++ bla\tNew Header\n' +
      '@@ -4,1 +4,1 @@\n' +
      '-qux\n' +
      '\\ No newline at end of file\n' +
      '+qux\n';
    expect(wasm.applyPatch(oldFile, diffFileIgnoreAdd, { fuzzFactor: 1 })).toBe(oldFile);
  });

  describe('when the last line is changed but both old & new version have no trailing newline...', () => {
    const diffFileNoEOF =
      'Index: file.txt\n' +
      '===================================================================\n' +
      '--- file.txt\n' +
      '+++ file.txt\n' +
      '@@ -1,4 +1,4 @@\n' +
      ' foo\n' +
      ' bar\n' +
      ' baz\n' +
      '-banana\n' +
      '\\ No newline at end of file\n' +
      '+babaco\n' +
      '\\ No newline at end of file\n';

    it('correctly applies the patch to the original source file', () => {
      const oldFile = 'foo\nbar\nbaz\nbanana';
      expect(wasm.applyPatch(oldFile, diffFileNoEOF)).toBe('foo\nbar\nbaz\nbabaco');
    });

    it('fails if fuzzFactor=0 and the source file has an unexpected trailing newline', () => {
      const oldFile = 'foo\nbar\nbaz\nbanana\n';
      expect(wasm.applyPatch(oldFile, diffFileNoEOF)).toBe(false);
    });

    it('ignores an unexpected trailing newline if fuzzFactor > 0', () => {
      const oldFile = 'foo\nbar\nbaz\nbanana\n';
      expect(wasm.applyPatch(oldFile, diffFileNoEOF, { fuzzFactor: 1 })).toBe(
        'foo\nbar\nbaz\nbabaco\n'
      );
    });

    it("ignores extra lines, even with fuzzFactor = 0, as long as there's no newline at EOF", () => {
      const oldFile = 'foo\nbar\nbaz\nbanana\nqux';
      expect(wasm.applyPatch(oldFile, diffFileNoEOF)).toBe('foo\nbar\nbaz\nbabaco\nqux');
    });
  });

  it('rejects negative or non-integer fuzz factors', () => {
    const patchErr =
      'Index: test\n' +
      '===================================================================\n' +
      '--- test\theader1\n' +
      '+++ test\theader2\n' +
      '@@ -1,3 +1,4 @@\n' +
      ' line2\n' +
      ' line3\n' +
      '+line4\n' +
      ' line5\n';
    expect(() =>
      wasm.applyPatch('line2\nline3\nline5\n', patchErr, { fuzzFactor: -1 } as ApplyOptions)
    ).toThrow('fuzzFactor must be a non-negative integer');
    expect(() =>
      wasm.applyPatch('line2\nline3\nline5\n', patchErr, { fuzzFactor: 1.5 } as ApplyOptions)
    ).toThrow('fuzzFactor must be a non-negative integer');
  });
});

describe('patch/apply – #applyPatches multi-file', () => {
  const patchMulti = [
    'Index: test',
    '===================================================================',
    '--- test\theader1',
    '+++ test\theader2',
    '@@ -1,3 +1,4 @@',
    ' line2',
    ' line3',
    '+line4',
    ' line5',
    'Index: test2',
    '===================================================================',
    '--- test2\theader1',
    '+++ test2\theader2',
    '@@ -1,3 +1,4 @@',
    ' foo2',
    ' foo3',
    '+foo4',
    ' foo5',
    '',
  ].join('\n');

  const contents: Record<string, string> = {
    test: ['line2', 'line3', 'line5', ''].join('\n'),
    test2: ['foo2', 'foo3', 'foo5', ''].join('\n'),
  };

  const expected: Record<string, string> = {
    test: ['line2', 'line3', 'line4', 'line5', ''].join('\n'),
    test2: ['foo2', 'foo3', 'foo4', 'foo5', ''].join('\n'),
  };

  it('patches multiple files', done => {
    applyPatchesShim(patchMulti, {
      loadFile(idx, cb) {
        const name = idx.oldFileName!;
        cb(undefined, contents[name]);
      },
      patched(idx, content, cb) {
        const name = idx.oldFileName!;
        expect(content).toBe(expected[name]);
        cb();
      },
      complete: done,
    });
  });

  it('propagates loader errors', done => {
    applyPatchesShim(patchMulti, {
      loadFile(_idx, cb) {
        cb(new Error('loader fail'));
      },
      patched(_idx, _content, cb) {
        cb();
      },
      complete(err) {
        expect(err?.message).toMatch(/loader fail/);
        done();
      },
    });
  });
});

describe('patch/apply - #applyPatches full suite', () => {
  const patch = [
    'Index: test',
    '===================================================================',
    '--- test\theader1',
    '+++ test\theader2',
    '@@ -1,3 +1,4 @@',
    ' line2',
    ' line3',
    '+line4',
    ' line5',
    'Index: test2',
    '===================================================================',
    '--- test2\theader1',
    '+++ test2\theader2',
    '@@ -1,3 +1,4 @@',
    ' foo2',
    ' foo3',
    '+foo4',
    ' foo5',
  ].join('\n');

  const contents: Record<string, string> = {
    test: 'line2\nline3\nline5\n',
    test2: 'foo2\nfoo3\nfoo5\n',
  };

  const expected: Record<string, string> = {
    test: 'line2\nline3\nline4\nline5\n',
    test2: 'foo2\nfoo3\nfoo4\nfoo5\n',
  };

  it('should handle errors on complete', done => {
    const errExpected = new Error();

    applyPatchesShim(patch, {
      loadFile(index, cb) {
        cb(undefined, contents[index.oldFileName!]);
      },
      patched(index, _content, cb) {
        cb(errExpected);
      },
      complete(err) {
        expect(err).toBe(errExpected);
        done();
      },
    });
  });

  it('should handle multiple files', done => {
    applyPatchesShim(patch, {
      loadFile(index, cb) {
        cb(undefined, contents[index.oldFileName!]);
      },
      patched(idx, content, cb) {
        expect(content).toBe(expected[idx.oldFileName!]);
        cb();
      },
      complete: done,
    });
  });

  it('should handle parsed patches', done => {
    applyPatchesShim(wasm.parsePatch(patch), {
      loadFile(index, cb) {
        cb(undefined, contents[index.oldFileName!]);
      },
      patched(idx, content, cb) {
        expect(content).toBe(expected[idx.oldFileName!]);
        cb();
      },
      complete: done,
    });
  });

  it('should propagate errors', done => {
    applyPatchesShim(patch, {
      loadFile(_idx, cb) {
        cb(new Error('foo'));
      },
      patched(_idx, _content, cb) {
        cb();
      },
      complete(err) {
        expect(err?.message).toMatch(/foo/);
        done();
      },
    });
  });

  it('should handle patches without Index', done => {
    const patchNoIndex = [
      '===================================================================',
      '--- test\theader1',
      '+++ test\theader2',
      '@@ -1,3 +1,4 @@',
      ' line2',
      ' line3',
      '+line4',
      ' line5',
      '===================================================================',
      '--- test2\theader1',
      '+++ test2\theader2',
      '@@ -1,3 +1,4 @@',
      ' foo2',
      ' foo3',
      '+foo4',
      ' foo5',
    ].join('\n');

    applyPatchesShim(patchNoIndex, {
      loadFile(idx, cb) {
        cb(undefined, contents[idx.oldFileName!]);
      },
      patched(idx, content, cb) {
        expect(content).toBe(expected[idx.newFileName!]);
        cb();
      },
      complete: done,
    });
  });

  it('should handle file names containing spaces', done => {
    const patchSpaces =
      '===================================================================\n' +
      '--- test file\theader1\n' +
      '+++ test file\theader2\n' +
      '@@ -1,2 +1,3 @@\n' +
      ' line1\n' +
      '+line2\n' +
      ' line3\n' +
      '===================================================================\n' +
      '--- test file 2\theader1\n' +
      '+++ test file 2\theader2\n' +
      '@@ -1,2 +1,3 @@\n' +
      ' foo1\n' +
      '+foo2\n' +
      ' foo3\n';

    const contentsSpaces: Record<string, string> = {
      'test file': 'line1\nline3\n',
      'test file 2': 'foo1\nfoo3\n',
    };

    const expectedSpaces: Record<string, string> = {
      'test file': 'line1\nline2\nline3\n',
      'test file 2': 'foo1\nfoo2\nfoo3\n',
    };

    applyPatchesShim(patchSpaces, {
      loadFile(idx, cb) {
        cb(undefined, contentsSpaces[idx.oldFileName!]);
      },
      patched(idx, content, cb) {
        expect(content).toBe(expectedSpaces[idx.newFileName!]);
        cb();
      },
      complete: done,
    });
  });
});
