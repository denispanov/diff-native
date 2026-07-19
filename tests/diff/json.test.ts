import { beforeAll, describe, expect, it } from 'bun:test';
import * as reference from 'diff';
import type * as DiffNative from 'diff-native';
import { getWasmModule } from '../setup';
import { expectSameObservableBehavior } from '../utils/conformance';

let wasm: typeof DiffNative;
type JsonDiffFunction = (
  oldValue: unknown,
  newValue: unknown,
  options?: Record<string, unknown> | null
) => unknown;
const referenceDiffJson = reference.diffJson as JsonDiffFunction;
const referenceCanonicalize = reference.canonicalize as (...args: unknown[]) => unknown;
type RuntimeCanonicalize = (value: unknown) => unknown;

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
    const obj = (wasm.canonicalize as RuntimeCanonicalize)({ b: 2, a: 1 }) as object;
    expect(Object.keys(obj)).toEqual(['a', 'b']);
  });

  it('distinguishes undefined from null using JavaScript serialization rules', () => {
    expectSameObservableBehavior(
      () => wasm.diffJson({ nested: undefined }, { nested: null }),
      () => referenceDiffJson({ nested: undefined }, { nested: null })
    );
    expectSameObservableBehavior(
      () => wasm.diffJson([undefined], [null]),
      () => referenceDiffJson([undefined], [null])
    );
    expectSameObservableBehavior(
      () =>
        wasm.diffJson({ nested: undefined }, { nested: null }, { undefinedReplacement: 'missing' }),
      () =>
        referenceDiffJson(
          { nested: undefined },
          { nested: null },
          { undefinedReplacement: 'missing' }
        )
    );
    expectSameObservableBehavior(
      () => (wasm.diffJson as JsonDiffFunction)(undefined, null),
      () => referenceDiffJson(undefined, null)
    );
  });

  it('matches replacer and toJSON invocation semantics', () => {
    const run = (diffJson: JsonDiffFunction) => {
      const calls: string[] = [];
      const oldValue = {
        data: {
          value: 2,
          toJSON(...args: unknown[]) {
            calls.push(`toJSON:${this.value}:${args.length}`);
            return { z: this.value, a: 1 };
          },
        },
      };
      const newValue = { data: { a: 1, z: 6 } };
      const result = diffJson(oldValue, newValue, {
        undefinedReplacement: 'unused',
        stringifyReplacer(key: string, value: unknown) {
          calls.push(`replacer:${key}`);
          return key === 'z' && typeof value === 'number' ? value * 3 : value;
        },
      });
      return { calls, result };
    };

    expectSameObservableBehavior(
      () => run(wasm.diffJson as JsonDiffFunction),
      () => run(referenceDiffJson)
    );
  });

  it('rejects null options before invoking object hooks', () => {
    const run = (diffJson: JsonDiffFunction) => {
      let calls = 0;
      const value = {
        toJSON() {
          calls += 1;
          return {};
        },
      };
      try {
        diffJson(value, value, null);
      } catch (error) {
        return { calls, error };
      }
      return { calls };
    };

    expectSameObservableBehavior(
      () => run(wasm.diffJson as JsonDiffFunction),
      () => run(referenceDiffJson)
    );
  });

  it('matches values rejected by JSON.stringify', () => {
    expectSameObservableBehavior(
      () => wasm.diffJson({ value: 1n }, { value: 2n }),
      () => referenceDiffJson({ value: 1n }, { value: 2n })
    );
  });

  it('matches root non-JSON values and serializes the old value first', () => {
    for (const makeValue of [() => () => 1, () => Symbol('root')]) {
      expectSameObservableBehavior(
        () => (wasm.diffJson as JsonDiffFunction)(makeValue(), null),
        () => referenceDiffJson(makeValue(), null)
      );
    }

    const run = (diffJson: JsonDiffFunction) => {
      const calls: string[] = [];
      const newValue = {
        toJSON() {
          calls.push('new');
          return 1;
        },
      };
      try {
        diffJson(1n, newValue);
      } catch (error) {
        return { calls, error };
      }
      return { calls };
    };
    expectSameObservableBehavior(
      () => run(wasm.diffJson as JsonDiffFunction),
      () => run(referenceDiffJson)
    );
  });

  it('matches omission and null conversion for unsupported nested values', () => {
    const makeValue = () => ({
      object: { fn: () => 1, symbol: Symbol('member'), kept: 1 },
      array: [() => 1, Symbol('item'), undefined],
    });
    expectSameObservableBehavior(
      () => wasm.diffJson(makeValue(), {}),
      () => referenceDiffJson(makeValue(), {})
    );
    expectSameObservableBehavior(
      () =>
        (wasm.diffJson as JsonDiffFunction)(
          { value: undefined },
          {},
          {
            undefinedReplacement: null,
          }
        ),
      () => referenceDiffJson({ value: undefined }, {}, { undefinedReplacement: null })
    );
  });

  it('matches replacer precedence, traversal, keys, and receivers', () => {
    const run = (diffJson: JsonDiffFunction) => {
      const calls: Array<[string, boolean, string]> = [];
      const root = { object: { missing: undefined }, array: [undefined] };
      const result = diffJson(
        root,
        {},
        {
          undefinedReplacement: 'fallback',
          stringifyReplacer(this: unknown, key: string, value: unknown) {
            calls.push([key, this === undefined, Array.isArray(value) ? 'array' : typeof value]);
            return value === undefined ? 'replaced' : value;
          },
        }
      );
      return { calls, result };
    };
    expectSameObservableBehavior(
      () => run(wasm.diffJson as JsonDiffFunction),
      () => run(referenceDiffJson)
    );
  });

  it('matches falsey replacers and rejects truthy nonfunctions', () => {
    for (const replacer of [false, 0, '', null, undefined]) {
      expectSameObservableBehavior(
        () => (wasm.diffJson as JsonDiffFunction)({ a: 1 }, {}, { stringifyReplacer: replacer }),
        () => referenceDiffJson({ a: 1 }, {}, { stringifyReplacer: replacer })
      );
    }
    for (const replacer of [true, 1, 'yes', {}]) {
      expectSameObservableBehavior(
        () => (wasm.diffJson as JsonDiffFunction)({}, {}, { stringifyReplacer: replacer }),
        () => referenceDiffJson({}, {}, { stringifyReplacer: replacer })
      );
    }
  });

  it('matches toJSON return values, receiver, and arguments', () => {
    const run = (diffJson: JsonDiffFunction) => {
      const calls: Array<[boolean, number]> = [];
      const object = {
        marker: 1,
        toJSON(...args: unknown[]) {
          calls.push([this === object, args.length]);
          return [3, undefined, { b: 2, a: 1 }];
        },
      };
      const array = [object] as unknown[] & { toJSON?: () => unknown };
      array.toJSON = () => ['ignored'];
      return { calls, result: diffJson({ array, object }, {}) };
    };
    expectSameObservableBehavior(
      () => run(wasm.diffJson as JsonDiffFunction),
      () => run(referenceDiffJson)
    );

    for (const returned of [undefined, 3n]) {
      const makeValue = () => ({ toJSON: () => returned });
      expectSameObservableBehavior(
        () => wasm.diffJson(makeValue(), null),
        () => referenceDiffJson(makeValue(), null)
      );
    }
  });

  it('preserves shared non-ancestor references', () => {
    const shared = () => {
      const child = { n: 1 };
      return { a: child, b: child };
    };
    expectSameObservableBehavior(
      () => wasm.diffJson(shared(), {}),
      () => referenceDiffJson(shared(), {})
    );
  });

  it('matches unusual object keys, prototypes, and sorted getter access', () => {
    const run = (diffJson: JsonDiffFunction) => {
      const reads: string[] = [];
      const inherited = { inherited: 1 };
      const value = Object.create(inherited) as Record<PropertyKey, unknown>;
      Object.defineProperties(value, {
        z: {
          enumerable: true,
          get: () => {
            reads.push('z');
            return 2;
          },
        },
        a: {
          enumerable: true,
          get: () => {
            reads.push('a');
            return 1;
          },
        },
      });
      Object.defineProperty(value, '__proto__', { enumerable: true, value: 'own' });
      value[Symbol('hidden')] = 3;
      return { reads, result: diffJson(value, {}) };
    };
    expectSameObservableBehavior(
      () => run(wasm.diffJson as JsonDiffFunction),
      () => run(referenceDiffJson)
    );

    const makeNullPrototype = () => Object.assign(Object.create(null), { b: 2, a: 1 });
    expectSameObservableBehavior(
      () => wasm.diffJson(makeNullPrototype(), {}),
      () => referenceDiffJson(makeNullPrototype(), {})
    );
  });

  it('matches nonfinite numbers, negative zero, holes, and explicit undefined options', () => {
    const makeValue = () => {
      const holes = new Array(2);
      holes[1] = 1;
      return {
        numbers: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0],
        holes,
      };
    };
    expectSameObservableBehavior(
      () => (wasm.diffJson as JsonDiffFunction)(makeValue(), {}, undefined),
      () => referenceDiffJson(makeValue(), {}, undefined)
    );
  });

  it('matches CRLF token splitting and escaped Unicode/control formatting', () => {
    const oldText = '{\r\n  "text": "\\u2028\\t\\b😀",\r\n  "n": 1\r\n}';
    const newText = '{\r\n  "text": "é\\n\\f\\\\\\"",\r\n  "n": 2\r\n}';
    expectSameObservableBehavior(
      () =>
        (wasm.diffJson as JsonDiffFunction)(oldText, newText, {
          oneChangePerToken: true,
        }),
      () => referenceDiffJson(oldText, newText, { oneChangePerToken: true })
    );
  });

  it('matches canonical formatting, comma placement, and CRLF input', () => {
    expectSameObservableBehavior(
      () => wasm.diffJson({ z: -0, a: '</script>', omitted: undefined }, { a: '</script>', z: 1 }),
      () =>
        referenceDiffJson({ z: -0, a: '</script>', omitted: undefined }, { a: '</script>', z: 1 })
    );

    const oldText = '{\r\n  "a": 1,\r\n  "b": 2\r\n}';
    const newText = '{\r\n  "a": 1\r\n}';
    expectSameObservableBehavior(
      () => wasm.diffJson(oldText, newText),
      () => referenceDiffJson(oldText, newText)
    );

    expectSameObservableBehavior(
      () => wasm.diffJson('a,\rb,\rc\n', 'a\rb\rc\n'),
      () => referenceDiffJson('a,\rb,\rc\n', 'a\rb\rc\n')
    );
  });

  it('matches JavaScript case folding and UTF-16 longest-token selection', () => {
    for (const [oldText, newText] of [
      ['A\n', 'a\n'],
      ['É\n', 'é\n'],
      ['ΟΣ\n', 'ος\n'],
      ['K\n', 'k\n'],
    ]) {
      expectSameObservableBehavior(
        () => (wasm.diffJson as JsonDiffFunction)(oldText, newText, { ignoreCase: true }),
        () => referenceDiffJson(oldText, newText, { ignoreCase: true })
      );
    }
  });

  it('preserves malformed UTF-16 in raw strings', () => {
    for (const [oldText, newText, options] of [
      ['\ud800', '\ud801', {}],
      ['\ud800\n', '\ud801\n', {}],
      ['\ud800\n', '\udc00\n', {}],
      ['\ud800\n\ue000\n', '\ud801\n\ue001\n', {}],
      ['\ud800\n𐐀\nİ\n', '\ud801\n𐐨\ni̇\n', { ignoreCase: true }],
    ] as const) {
      expectSameObservableBehavior(
        () => (wasm.diffJson as JsonDiffFunction)(oldText, newText, options),
        () => referenceDiffJson(oldText, newText, options)
      );
    }

    const oldLong = `\ud800${'A'.repeat(9000)}\n`;
    const newLong = `\ud801${'a'.repeat(9000)}\n`;
    expectSameObservableBehavior(
      () => (wasm.diffJson as JsonDiffFunction)(oldLong, newLong, { ignoreCase: true }),
      () => referenceDiffJson(oldLong, newLong, { ignoreCase: true })
    );
  });

  it('matches per-token output and component property order', () => {
    const oldValue = { a: 1, b: 2 };
    const newValue = { a: 1, b: 3 };
    expectSameObservableBehavior(
      () => (wasm.diffJson as JsonDiffFunction)(oldValue, newValue, { oneChangePerToken: true }),
      () => referenceDiffJson(oldValue, newValue, { oneChangePerToken: true })
    );

    expect(JSON.stringify(wasm.diffJson(oldValue, newValue))).toBe(
      JSON.stringify(referenceDiffJson(oldValue, newValue))
    );
  });

  it('matches per-token output when one side has no tokens', () => {
    for (const [oldValue, newValue] of [
      ['', 'a\nb\n'],
      ['a\nb\n', ''],
      ['', '\ud800\na\n\ud801\n'],
      ['\ud800\na\n\ud801\n', ''],
    ]) {
      const options = { oneChangePerToken: true };
      expectSameObservableBehavior(
        () => (wasm.diffJson as JsonDiffFunction)(oldValue, newValue, options),
        () => referenceDiffJson(oldValue, newValue, options)
      );
      expect(JSON.stringify(wasm.diffJson(oldValue, newValue, options))).toBe(
        JSON.stringify(referenceDiffJson(oldValue, newValue, options))
      );
    }
  });

  it('canonicalizes object hooks', () => {
    const source = {
      z: 2,
      toJSON() {
        return { z: this.z, a: 1 };
      },
    };
    expectSameObservableBehavior(
      () => (wasm.canonicalize as RuntimeCanonicalize)(source),
      () => referenceCanonicalize(source, null, null, undefined)
    );
  });

  it('reconstructs ancestor cycles and rejects them during JSON serialization', () => {
    const replaceCycle = () => {
      const value: { count: bigint; self?: unknown } = { count: 2n };
      value.self = value;
      return value;
    };
    const options = {
      stringifyReplacer(key: string, value: unknown) {
        if (key === 'self') return undefined;
        return typeof value === 'bigint' ? value.toString() : value;
      },
    };
    expectSameObservableBehavior(
      () => (wasm.diffJson as JsonDiffFunction)(replaceCycle(), {}, options),
      () => referenceDiffJson(replaceCycle(), {}, options)
    );

    const cyclic = () => {
      const value: { label: string; self?: unknown } = { label: 'root' };
      value.self = value;
      return value;
    };

    expectSameObservableBehavior(
      () => wasm.diffJson(cyclic(), { label: 'root' }),
      () => referenceDiffJson(cyclic(), { label: 'root' })
    );

    const ancestorFromHook = () => {
      const root: { child?: unknown } = {};
      root.child = { toJSON: () => root };
      return root;
    };
    expectSameObservableBehavior(
      () => wasm.diffJson(ancestorFromHook(), {}),
      () => referenceDiffJson(ancestorFromHook(), {})
    );

    const localCycle: { self?: unknown } = {};
    localCycle.self = localCycle;
    const referenceCycle: { self?: unknown } = {};
    referenceCycle.self = referenceCycle;
    const localCanonical = (wasm.canonicalize as RuntimeCanonicalize)(localCycle) as {
      self: unknown;
    };
    const referenceCanonical = referenceCanonicalize(referenceCycle, null, null, undefined) as {
      self: unknown;
    };
    expect(localCanonical.self === localCanonical).toBe(
      referenceCanonical.self === referenceCanonical
    );
  });
});
