import { describe, it, expect, beforeAll } from 'bun:test';
import { Change, DiffOptions, getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('diffChars', () => {
  it('should return one chunk for identical strings', () => {
    const str = 'abc';
    const options: DiffOptions = {};
    const result = wasm.diffChars(str, str, options);
    const expected: Change[] = [{ value: str, count: str.length, added: false, removed: false }];
    expect(result).toEqual(expected);
    expect(wasm.convertChangesToXML(result)).toBe(str);
  });

  it('should diff characters', () => {
    const oldStr = 'Old Value.';
    const newStr = 'New ValueMoreData.';
    const options: DiffOptions = {};
    const result = wasm.diffChars(oldStr, newStr, options);
    const expectedXML = '<del>Old</del><ins>New</ins> Value<ins>MoreData</ins>.';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
    expect(result.length).toBe(5);
    expect(result[0]).toMatchObject({ count: 3, removed: true });
    expect(result[1]).toMatchObject({ count: 3, added: true });
    expect(result[2]).toMatchObject({ count: 6, added: false, removed: false });
    expect(result[3]).toMatchObject({ count: 8, added: true });
    expect(result[4]).toMatchObject({ count: 1, added: false, removed: false });
  });

  it('should handle empty old string', () => {
    const result = wasm.diffChars('', 'abc', {});
    const expectedXML = '<ins>abc</ins>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ count: 3, added: true });
  });

  it('should handle empty new string', () => {
    const result = wasm.diffChars('abc', '', {});
    const expectedXML = '<del>abc</del>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ count: 3, removed: true });
  });

  it('should handle both strings empty', () => {
    const result = wasm.diffChars('', '', {});
    expect(result).toEqual([]);
    expect(wasm.convertChangesToXML(result)).toBe('');
  });

  it('should diff whitespace only strings', () => {
    const result = wasm.diffChars(' ', '  ', {});
    const expectedXML = ' <ins> </ins>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
  });

  it('should handle differing whitespace', () => {
    const result = wasm.diffChars('a b c', 'a  b  c', {});
    const expectedXML = 'a <ins> </ins>b <ins> </ins>c';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
    expect(result.length).toBe(5);
    expect(result[0]).toMatchObject({ count: 2, value: 'a ', added: false, removed: false });
    expect(result[1]).toMatchObject({ count: 1, value: ' ', added: true });
    expect(result[2]).toMatchObject({ count: 2, value: 'b ', added: false, removed: false });
    expect(result[3]).toMatchObject({ count: 1, value: ' ', added: true });
    expect(result[4]).toMatchObject({ count: 1, value: 'c', added: false, removed: false });
  });

  it('should handle leading/trailing whitespace changes', () => {
    const result = wasm.diffChars(' abc ', 'abc', {});
    const expectedXML = '<del> </del>abc<del> </del>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);

    const result2 = wasm.diffChars('abc', ' abc ', {});
    const expectedXML2 = '<ins> </ins>abc<ins> </ins>';
    expect(wasm.convertChangesToXML(result2)).toBe(expectedXML2);
  });

  it('should diff differing newline characters', () => {
    const result = wasm.diffChars('a\nb', 'a\r\nb', {});
    const expectedXML = 'a<ins>\r</ins>\nb';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({ count: 1, value: 'a', added: false, removed: false });
    expect(result[1]).toMatchObject({ count: 1, value: '\r', added: true });
    expect(result[2]).toMatchObject({ count: 2, value: '\nb', added: false, removed: false });
  });

  describe('oneChangePerToken option', () => {
    it('emits one change per character when diffing', () => {
      const oldStr = 'Old Value.';
      const newStr = 'New ValueMoreData.';
      const options: DiffOptions = { oneChangePerToken: true };
      const result = wasm.diffChars(oldStr, newStr, options);
      const expectedXML =
        '<del>O</del><del>l</del><del>d</del><ins>N</ins><ins>e</ins><ins>w</ins> Value<ins>M</ins><ins>o</ins><ins>r</ins><ins>e</ins><ins>D</ins><ins>a</ins><ins>t</ins><ins>a</ins>.';
      expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
      expect(result.length).toBe(21);
    });

    it('correctly handles identical texts', () => {
      const str = 'foo bar baz qux';
      const options: DiffOptions = { oneChangePerToken: true };
      const result = wasm.diffChars(str, str, options);
      const expected: Change[] = [...str].map(char => ({
        value: char,
        count: 1,
        added: false,
        removed: false,
      }));
      expect(result).toEqual(expected);
      expect(wasm.convertChangesToXML(result)).toBe(str);
    });
  });

  it('should handle multi-code-unit characters (UTF-16)', () => {
    const oldStr = '𝟘𝟙𝟚𝟛';
    const newStr = '𝟘𝟙𝟚𝟜𝟝𝟞';
    const options: DiffOptions = {};
    const result = wasm.diffChars(oldStr, newStr, options);
    const expectedXML = '𝟘𝟙𝟚<del>𝟛</del><ins>𝟜𝟝𝟞</ins>';
    expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
    expect(result.length).toBe(3);
    expect(result[0].count).toBe(3);
    expect(result[1].count).toBe(1);
    expect(result[2].count).toBe(3);
  });

  describe('case insensitivity', () => {
    it('is considered when texts are identical ignoring case', () => {
      const oldStr = 'New Value.';
      const newStr = 'New value.';
      const options: DiffOptions = { ignoreCase: true };
      const result = wasm.diffChars(oldStr, newStr, options);
      const expectedXML = 'New value.';
      expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
      expect(result.length).toBe(1);
      expect(result[0].count).toBe(newStr.length);
    });

    it('is considered when texts differ ignoring case', () => {
      const oldStr = 'New Values.';
      const newStr = 'New value.';
      const options: DiffOptions = { ignoreCase: true };
      const result = wasm.diffChars(oldStr, newStr, options);
      const expectedXML = 'New value<del>s</del>.';
      expect(wasm.convertChangesToXML(result)).toBe(expectedXML);
      expect(result.length).toBe(3);
    });
  });
});
