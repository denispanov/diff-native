import { describe, it, expect, beforeAll } from 'bun:test';
import { getWasmModule } from '../setup';
import * as DiffNative from 'diff-native';

let wasm: typeof DiffNative;

beforeAll(async () => {
  wasm = await getWasmModule();
});

describe('WordDiff', () => {
  describe('#tokenize', () => {
    it('should return an empty array for an empty string', () => {
      expect(wasm.wordDiff.tokenize('')).toEqual([]);
    });

    it('should return a single token for a string with only whitespace', () => {
      expect(wasm.wordDiff.tokenize('   ')).toEqual(['   ']);
      expect(wasm.wordDiff.tokenize('\n\t ')).toEqual(['\n\t ']);
    });

    it('should handle leading whitespace correctly', () => {
      expect(wasm.wordDiff.tokenize(' foo')).toEqual([' foo']);
      expect(wasm.wordDiff.tokenize('\tbar')).toEqual(['\tbar']);
    });

    it('should handle trailing whitespace correctly', () => {
      expect(wasm.wordDiff.tokenize('foo ')).toEqual(['foo ']);
      expect(wasm.wordDiff.tokenize('bar\n')).toEqual(['bar\n']);
    });

    it('should handle consecutive punctuation', () => {
      expect(wasm.wordDiff.tokenize('foo.,bar')).toEqual(['foo', '.', ',', 'bar']);
    });

    it('should handle whitespace between punctuation', () => {
      expect(wasm.wordDiff.tokenize('foo. , bar')).toEqual(['foo', '. ', ' , ', ' bar']);
    });

    it('should handle mixed word/non-word characters', () => {
      expect(wasm.wordDiff.tokenize('$%^& hello 123 world !@#')).toEqual([
        '$',
        '%',
        '^',
        '& ',
        ' hello ',
        ' 123 ',
        ' world ',
        ' !',
        '@',
        '#',
      ]);
    });

    it('should correctly tokenize basic words and punctuation with various whitespaces', () => {
      expect(
        wasm.wordDiff.tokenize(
          'foo bar baz jurídica wir üben    bla\t\t \txyzáxyz  \n\n\n  animá-los\r\n\r\n(wibbly wobbly)().'
        )
      ).toEqual([
        'foo ',
        ' bar ',
        ' baz ',
        ' jurídica ',
        ' wir ',
        ' üben    ',
        '    bla\t\t \t',
        '\t\t \txyzáxyz  \n\n\n  ',
        '  \n\n\n  animá',
        '-',
        'los\r\n\r\n',
        '\r\n\r\n(',
        'wibbly ',
        ' wobbly',
        ')',
        '(',
        ')',
        '.',
      ]);
    });

    it('should treat numbers as part of a word if not separated by whitespace or punctuation', () => {
      expect(
        wasm.wordDiff.tokenize('Tea Too, also known as T2, had revenue of 57m AUD in 2012-13.')
      ).toEqual([
        'Tea ',
        ' Too',
        ', ',
        ' also ',
        ' known ',
        ' as ',
        ' T2',
        ', ',
        ' had ',
        ' revenue ',
        ' of ',
        ' 57m ',
        ' AUD ',
        ' in ',
        ' 2012',
        '-',
        '13',
        '.',
      ]);
    });
  });

  describe('#diffWords', () => {
    it("should ignore whitespace changes between tokens that aren't added or deleted", () => {
      const oldStr = 'New    Value';
      const newStr = 'New \n \t Value';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('New \n \t Value');
    });

    describe('whitespace changes that border inserted/deleted tokens should be included in the diff as far as is possible...', () => {
      it('(add+del at end of text)', () => {
        const oldStr = 'New Value  ';
        const newStr = 'New  ValueMoreData ';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe(
          'New <del>Value  </del><ins> ValueMoreData </ins>'
        );
      });

      it('(add+del in middle of text)', () => {
        const oldStr = 'New Value End';
        const newStr = 'New  ValueMoreData End';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe(
          'New <del>Value</del><ins> ValueMoreData</ins> End'
        );
      });

      it('(add+del at start of text)', () => {
        const oldStr = '\tValue End';
        const newStr = ' ValueMoreData   End';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe(
          '<del>\tValue</del><ins> ValueMoreData  </ins> End'
        );
      });

      it('(add at start of text)', () => {
        const oldStr = '\t Value';
        const newStr = 'More  Value';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('<ins>More  </ins>Value');
      });

      it('(del at start of text)', () => {
        const oldStr = 'More  Value';
        const newStr = '\t Value';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('<del>More  </del>\t Value');
      });

      it('(add in middle of text)', () => {
        const oldStr = 'Even Value';
        const newStr = 'Even    More    Value';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('Even    <ins>More    </ins>Value');
      });

      it('(del in middle of text)', () => {
        let oldStr = 'Even    More    Value';
        let newStr = 'Even Value';
        let result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('Even <del>   More    </del>Value');

        oldStr = 'foo\nbar baz';
        newStr = 'foo baz';
        result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('foo<del>\nbar</del> baz');

        oldStr = 'foo bar baz';
        newStr = 'foo baz';
        result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('foo <del>bar </del>baz');

        oldStr = 'foo\nbar baz';
        newStr = 'foo\n baz';
        result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('foo\n<del>bar</del> baz');
      });

      it('(add at end of text)', () => {
        const oldStr = 'Foo\n';
        const newStr = 'Foo Bar\n';
        const result = wasm.diffWords(oldStr, newStr, {});
        expect(wasm.convertChangesToXML(result)).toBe('Foo <ins>Bar\n</ins>');
      });

      it('(del at end of text)', () => {
        const oldStr = 'Foo   Bar';
        const newStr = 'Foo ';
        const result = wasm.diffWords(oldStr, newStr);
        expect(wasm.convertChangesToXML(result)).toBe('Foo <del>  Bar</del>');
      });
    });

    it('should skip postprocessing of change objects in one-change-object-per-token mode', () => {
      const result = wasm.diffWords('Foo Bar', 'Foo Baz', { oneChangePerToken: true });
      expect(wasm.convertChangesToXML(result)).toBe('Foo <del> Bar</del><ins> Baz</ins>');
    });

    it('should respect options.ignoreCase', () => {
      const oldStr = 'foo bar baz';
      const newStr = 'FOO BAR QUX';
      const options = { ignoreCase: true };
      const result = wasm.diffWords(oldStr, newStr, options);
      expect(wasm.convertChangesToXML(result)).toBe('FOO BAR <del>baz</del><ins>QUX</ins>');
    });

    it('should treat punctuation characters as tokens', () => {
      const oldStr = 'New:Value:Test';
      const newStr = 'New,Value,More,Data ';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe(
        'New<del>:</del><ins>,</ins>Value<del>:Test</del><ins>,More,Data </ins>'
      );
    });

    it('should handle identity', () => {
      const oldStr = 'New Value';
      const newStr = 'New Value';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('New Value');
    });
    it('should handle empty', () => {
      const oldStr = '';
      const newStr = '';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('');
    });
    it('should diff has identical content', () => {
      const oldStr = 'New Value';
      const newStr = 'New  Value';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('New  Value');
    });

    it('should diff empty new content', () => {
      const oldStr = 'New Value';
      const newStr = '';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('<del>New Value</del>');
    });
    it('should diff empty old content', () => {
      const oldStr = '';
      const newStr = 'New Value';
      const result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('<ins>New Value</ins>');
    });

    it('should include count with identity cases', () => {
      let oldStr = 'foo';
      let newStr = 'foo';
      let result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([{ value: 'foo', count: 1, removed: false, added: false }]);

      oldStr = 'foo bar';
      newStr = 'foo bar';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([{ value: 'foo bar', count: 2, removed: false, added: false }]);
    });
    it('should include count with empty cases', () => {
      let oldStr = 'foo';
      let newStr = '';
      let result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([{ value: 'foo', count: 1, added: false, removed: true }]);

      oldStr = 'foo bar';
      newStr = '';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([{ value: 'foo bar', count: 2, added: false, removed: true }]);

      oldStr = '';
      newStr = 'foo';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([{ value: 'foo', count: 1, added: true, removed: false }]);

      oldStr = '';
      newStr = 'foo bar';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([{ value: 'foo bar', count: 2, added: true, removed: false }]);
    });

    it('should ignore whitespace', () => {
      let oldStr = 'hase igel fuchs';
      let newStr = 'hase igel fuchs';
      let result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([
        { count: 3, value: 'hase igel fuchs', removed: false, added: false },
      ]);

      oldStr = 'hase igel fuchs\n';
      newStr = 'hase igel fuchs\n';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([
        { count: 3, value: 'hase igel fuchs\n', removed: false, added: false },
      ]);

      oldStr = 'hase igel fuchs\n';
      newStr = 'hase igel fuchs';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([
        { count: 3, value: 'hase igel fuchs', removed: false, added: false },
      ]);

      oldStr = 'hase igel fuchs';
      newStr = 'hase igel\nfuchs';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([
        { count: 3, value: 'hase igel\nfuchs', removed: false, added: false },
      ]);

      oldStr = 'hase igel\nfuchs';
      newStr = 'hase igel fuchs';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(result).toEqual([
        { count: 3, value: 'hase igel fuchs', removed: false, added: false },
      ]);
    });

    it('should diff with only whitespace', () => {
      let oldStr = '';
      let newStr = ' ';
      let result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('<ins> </ins>');

      oldStr = ' ';
      newStr = '';
      result = wasm.diffWords(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('<del> </del>');
    });

    it('calls #diffWordsWithSpace if you pass ignoreWhitespace: false', () => {
      const oldStr = 'foo bar';
      const newStr = 'foo\tbar';
      const options = { ignoreWhitespace: false };
      const result = wasm.diffWords(oldStr, newStr, options);
      expect(wasm.convertChangesToXML(result)).toBe('foo<del> </del><ins>\t</ins>bar');
    });
  });

  describe('#diffWordsWithSpace', () => {
    it('should diff whitespace', () => {
      const oldStr = 'New Value';
      const newStr = 'New  ValueMoreData';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe(
        'New<del> Value</del><ins>  ValueMoreData</ins>'
      );
    });

    it('should diff multiple whitespace values', () => {
      const oldStr = 'New Value  ';
      const newStr = 'New  ValueMoreData ';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe(
        'New<del> Value</del>  <ins>ValueMoreData </ins>'
      );
    });

    it('should insert values in parenthesis', () => {
      const oldStr = '()';
      const newStr = '(word)';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('(<ins>word</ins>)');
    });

    it('should insert values in brackets', () => {
      const oldStr = '[]';
      const newStr = '[word]';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('[<ins>word</ins>]');
    });

    it('should insert values in curly braces', () => {
      const oldStr = '{}';
      const newStr = '{word}';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('{<ins>word</ins>}');
    });

    it('should insert values in quotes', () => {
      const oldStr = "''";
      const newStr = "'word'";
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe("'<ins>word</ins>'");
    });

    it('should insert values in double quotes', () => {
      const oldStr = '""';
      const newStr = '"word"';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('&quot;<ins>word</ins>&quot;');
    });

    it('should treat newline as separate token', () => {
      let oldStr = 'foo\nbar';
      let newStr = 'foo\n\n\nbar';
      let result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('foo\n<ins>\n\n</ins>bar');

      oldStr = 'A\n\nB\n';
      newStr = 'A\nB\n';
      result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('A\n<del>\n</del>B\n');

      oldStr = 'foo\r\nbar';
      newStr = 'foo  \r\n\r\n\r\nbar';
      result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('foo<ins>  </ins>\r\n<ins>\r\n\r\n</ins>bar');

      oldStr = 'A\r\n\r\nB\r\n';
      newStr = 'A\r\nB\r\n';
      result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('A\r\n<del>\r\n</del>B\r\n');
    });

    it('should diff when there is no anchor value', () => {
      const oldStr = 'New Value New Value';
      const newStr = 'Value Value New New';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});

      expect(wasm.convertChangesToXML(result)).toBe(
        '<del>New</del><ins>Value</ins> Value New <del>Value</del><ins>New</ins>'
      );
    });

    it('should handle empty', () => {
      const oldStr = '';
      const newStr = '';
      const result = wasm.diffWordsWithSpace(oldStr, newStr, {});
      expect(wasm.convertChangesToXML(result)).toBe('');
    });

    describe('case insensitivity', () => {
      it("is considered when there's a difference", () => {
        const oldStr = 'new value';
        const newStr = 'New  ValueMoreData';
        const options = { ignoreCase: true };
        const result = wasm.diffWordsWithSpace(oldStr, newStr, options);
        expect(wasm.convertChangesToXML(result)).toBe(
          'New<del> value</del><ins>  ValueMoreData</ins>'
        );
      });

      it("is considered when there's no difference", () => {
        const oldStr = 'new value';
        const newStr = 'New Value';
        const options = { ignoreCase: true };
        const result = wasm.diffWordsWithSpace(oldStr, newStr, options);
        expect(wasm.convertChangesToXML(result)).toBe('New Value');
      });
    });
  });
});
