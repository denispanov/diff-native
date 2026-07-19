import { beforeAll, describe, it } from 'bun:test';
import * as reference from 'diff';
import type * as DiffNative from 'diff-native';
import * as fc from 'fast-check';
import { getWasmModule } from '../setup';
import { expectSameObservableBehavior } from '../utils/conformance';

const SEED = 0x4d374c31;
const CASES = 100;

const lineEndingArbitrary = fc.constantFrom('\n', '\r\n', '\r');
const linePartArbitrary = fc.constantFrom(
  'alpha',
  'beta',
  'same',
  '0',
  ' ',
  '  ',
  '\t',
  ' \t',
  'é',
  '漢字',
  '🙂',
  'e\u0301'
);
const lineArbitrary = fc.array(linePartArbitrary, { maxLength: 4 }).map(parts => parts.join(''));

function buildWellFormedLineTextArbitrary(maxLines: number): fc.Arbitrary<string> {
  const linesArbitrary = fc.oneof(
    fc.array(lineArbitrary, { maxLength: maxLines }),
    fc
      .tuple(lineArbitrary, fc.integer({ min: 1, max: maxLines }))
      .map(([line, count]) => Array.from({ length: count }, () => line))
  );

  return fc
    .tuple(
      linesArbitrary,
      fc.array(lineEndingArbitrary, { minLength: 1, maxLength: maxLines }),
      fc.boolean()
    )
    .map(([lines, endings, hasFinalNewline]) => {
      if (lines.length === 0) return '';

      let text = lines[0];
      for (let index = 1; index < lines.length; index++) {
        text += endings[(index - 1) % endings.length] + lines[index];
      }
      if (hasFinalNewline) text += endings[(lines.length - 1) % endings.length];
      return text;
    });
}

// Keep this well-formed: the JS→WASM `&str` boundary maps identity input "\uD800" to U+FFFD, unlike diff@9.0.0.
const wellFormedLineTextArbitrary = buildWellFormedLineTextArbitrary(12);
const relatedLineTextPairArbitrary = fc
  .tuple(buildWellFormedLineTextArbitrary(10), lineEndingArbitrary, lineArbitrary, fc.boolean())
  .map(([text, ending, line, reverse]) => {
    const changed = `${text}${ending}${line}`;
    return reverse ? [changed, text] : [text, changed];
  });
const lineTextPairArbitrary = fc.oneof(
  fc.constant(['', '']),
  wellFormedLineTextArbitrary.map(text => [text, text]),
  relatedLineTextPairArbitrary,
  fc.tuple(wellFormedLineTextArbitrary, wellFormedLineTextArbitrary)
);

const lineOptionsArbitrary = fc.oneof(
  fc.constant(undefined),
  fc.record(
    {
      ignoreWhitespace: fc.boolean(),
      ignoreCase: fc.boolean(),
      newlineIsToken: fc.boolean(),
      stripTrailingCr: fc.boolean(),
      oneChangePerToken: fc.boolean(),
    },
    { requiredKeys: [] }
  )
);

let local: typeof DiffNative;

beforeAll(async () => {
  local = await getWasmModule();
});

describe('diffLines differential', () => {
  it('matches diff@9.0.0 for bounded line inputs and options', () => {
    fc.assert(
      fc.property(lineTextPairArbitrary, lineOptionsArbitrary, ([oldText, newText], options) => {
        expectSameObservableBehavior(
          () => local.diffLines(oldText, newText, options),
          () => reference.diffLines(oldText, newText, options)
        );
      }),
      { seed: SEED, numRuns: CASES }
    );
  });
});
