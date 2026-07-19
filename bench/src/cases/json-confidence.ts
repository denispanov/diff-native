/** Inputs and metadata for the standalone JSON confidence runner. */
export type JsonConfidenceSuite = 'quick' | 'confidence';
export type JsonExpectedOutcome = 'return' | 'throw';
export type JsonInputMode = 'object' | 'raw-string' | 'serialized-lf' | 'serialized-crlf';
export type JsonShape =
  | 'flat-object'
  | 'deep-object'
  | 'wide-array'
  | 'array-of-objects'
  | 'mixed'
  | 'package-like'
  | 'special';
export type JsonEditClass = 'none' | 'sparse' | 'dense' | 'failure';

export interface JsonConfidenceOptions {
  undefinedReplacement?: unknown;
  stringifyReplacer?: (key: string, value: unknown) => unknown;
  oneChangePerToken?: boolean;
  ignoreCase?: boolean;
}

export interface JsonConfidenceInput {
  oldValue: unknown;
  newValue: unknown;
  options: JsonConfidenceOptions;
}

export interface JsonConfidenceMeta {
  group: string;
  feature: string;
  logicalEntries: number;
  maxDepth: number;
  inputMode: JsonInputMode;
  shape: JsonShape;
  editClass: JsonEditClass;
  /** Approximate JSON payload size; absent when JSON.stringify cannot produce a string. */
  oldSerializedUtf16?: number;
  newSerializedUtf16?: number;
  oldSerializedUtf8?: number;
  newSerializedUtf8?: number;
}

export interface JsonConfidenceCase {
  id: string;
  group: string;
  feature: string;
  expected: JsonExpectedOutcome;
  meta: JsonConfidenceMeta;
  buildInput: () => JsonConfidenceInput;
}

interface CaseSpec {
  id: string;
  group: string;
  feature: string;
  logicalEntries: number;
  maxDepth: number;
  inputMode?: JsonInputMode;
  shape: JsonShape;
  editClass: JsonEditClass;
  expected?: JsonExpectedOutcome;
  quick?: boolean;
  buildInput: () => JsonConfidenceInput;
}

export function buildJsonConfidenceCases(suite: JsonConfidenceSuite): JsonConfidenceCase[] {
  return buildSpecs()
    .filter(spec => suite === 'confidence' || spec.quick)
    .map(spec => {
      const sizes = serializedSizes(spec.buildInput);
      return {
        id: spec.id,
        group: spec.group,
        feature: spec.feature,
        expected: spec.expected ?? 'return',
        meta: {
          group: spec.group,
          feature: spec.feature,
          logicalEntries: spec.logicalEntries,
          maxDepth: spec.maxDepth,
          inputMode: spec.inputMode ?? 'object',
          shape: spec.shape,
          editClass: spec.editClass,
          ...sizes,
        },
        buildInput: spec.buildInput,
      };
    });
}

function buildSpecs(): CaseSpec[] {
  const specs: CaseSpec[] = [];
  for (const size of [10, 100, 1000, 10000]) {
    for (const editClass of ['none', 'sparse', 'dense'] as const) {
      if (size === 10000 && editClass === 'dense') continue;
      specs.push({
        id: `flat-${size}-${editClass}`,
        group: 'flat-scale',
        feature: `${editClass}-edits`,
        logicalEntries: size,
        maxDepth: 1,
        shape: 'flat-object',
        editClass,
        quick:
          (size === 10 && editClass === 'none') ||
          (size === 100 && editClass === 'sparse') ||
          (size === 1000 && editClass === 'dense') ||
          (size === 10000 && editClass === 'sparse'),
        buildInput: () => flatInput(size, editClass),
      });
    }
  }

  specs.push(
    normal('deep-sparse', 'shapes', 'nested-leaf-edit', 24, 24, 'deep-object', 'sparse', true, () =>
      deepInput(24, false)
    ),
    normal(
      'wide-array-sparse',
      'shapes',
      'indexed-array-edits',
      2048,
      1,
      'wide-array',
      'sparse',
      true,
      () => arrayInput(2048, false)
    ),
    normal(
      'records-sparse',
      'shapes',
      'array-of-objects',
      300,
      2,
      'array-of-objects',
      'sparse',
      true,
      () => recordsInput(100, false)
    ),
    normal('mixed-sparse', 'shapes', 'mixed-containers', 18, 4, 'mixed', 'sparse', true, () =>
      mixedInput(false)
    ),
    normal(
      'package-small',
      'realistic',
      'package-manifest',
      14,
      3,
      'package-like',
      'sparse',
      true,
      packageInput
    ),
    serialized(100, 'serialized-lf', false),
    serialized(100, 'serialized-crlf', true),
    serialized(5000, 'serialized-lf', false),
    serialized(5000, 'serialized-crlf', false),
    special('undefined-default', 'options', 'undefined-default', 'sparse', false, undefinedInput),
    special('undefined-replacement', 'options', 'undefinedReplacement', 'sparse', true, () =>
      undefinedInput('<missing>')
    ),
    special('replacer-noop', 'replacers', 'no-op-replacer', 'sparse', false, () =>
      replacerInput('noop')
    ),
    special('replacer-transform', 'replacers', 'transform-replacer', 'dense', true, () =>
      replacerInput('transform')
    ),
    special('replacer-filter', 'replacers', 'filter-replacer', 'sparse', false, () =>
      replacerInput('filter')
    ),
    special('tojson-heavy', 'serialization', 'toJSON', 'dense', true, toJsonInput),
    special('shared-references', 'serialization', 'shared-reference', 'sparse', false, sharedInput),
    special('one-change-per-token', 'options', 'oneChangePerToken', 'dense', true, tokenInput),
    {
      ...special(
        'one-change-per-token-empty-old',
        'options',
        'oneChangePerToken-empty-old',
        'dense',
        true,
        () => emptySideTokenInput(false)
      ),
      inputMode: 'raw-string',
    },
    {
      ...special(
        'one-change-per-token-empty-new',
        'options',
        'oneChangePerToken-empty-new',
        'dense',
        true,
        () => emptySideTokenInput(true)
      ),
      inputMode: 'raw-string',
    },
    special('ignore-case-ascii', 'options', 'ignoreCase-ascii', 'sparse', false, () =>
      ignoreCaseInput(false)
    ),
    special('ignore-case-unicode', 'options', 'ignoreCase-unicode', 'sparse', true, () =>
      ignoreCaseInput(true)
    ),
    special('content-ascii-short', 'content', 'ascii-short', 'dense', false, () =>
      contentInput('ascii-short')
    ),
    special('content-ascii-long', 'content', 'ascii-long', 'dense', false, () =>
      contentInput('ascii-long')
    ),
    special('content-escaped', 'content', 'escaped-control', 'dense', true, () =>
      contentInput('escaped')
    ),
    special('content-unicode', 'content', 'bmp-supplementary', 'dense', false, () =>
      contentInput('unicode')
    ),
    {
      ...special('malformed-utf16', 'content', 'lone-surrogates', 'dense', true, malformedInput),
      inputMode: 'raw-string',
    },
    failure('bigint-throws', 'serialization', 'BigInt', 1, 1, () => ({
      oldValue: { value: 1n },
      newValue: { value: 2n },
      options: {},
    })),
    failure('ancestor-cycle-throws', 'serialization', 'ancestor-cycle', 2, 2, cycleInput)
  );
  return specs;
}

function normal(
  id: string,
  group: string,
  feature: string,
  logicalEntries: number,
  maxDepth: number,
  shape: JsonShape,
  editClass: JsonEditClass,
  quick: boolean,
  buildInput: () => JsonConfidenceInput
): CaseSpec {
  return { id, group, feature, logicalEntries, maxDepth, shape, editClass, quick, buildInput };
}

function special(
  id: string,
  group: string,
  feature: string,
  editClass: JsonEditClass,
  quick: boolean,
  buildInput: () => JsonConfidenceInput
): CaseSpec {
  return normal(id, group, feature, 6, 2, 'special', editClass, quick, buildInput);
}

function failure(
  id: string,
  group: string,
  feature: string,
  logicalEntries: number,
  maxDepth: number,
  buildInput: () => JsonConfidenceInput
): CaseSpec {
  return {
    id,
    group,
    feature,
    logicalEntries,
    maxDepth,
    shape: 'special',
    editClass: 'failure',
    expected: 'throw',
    quick: true,
    buildInput,
  };
}

function serialized(
  size: number,
  inputMode: 'serialized-lf' | 'serialized-crlf',
  quick: boolean
): CaseSpec {
  const id = `${inputMode}-${size}`;
  return {
    ...normal(id, 'line-endings', inputMode, size, 1, 'flat-object', 'sparse', quick, () => {
      const oldValue = Object.fromEntries(
        Array.from({ length: size }, (_, index) => [`key${index}`, index])
      );
      const newValue = { ...oldValue, [`key${Math.floor(size / 2)}`]: -1 };
      const oldText = JSON.stringify(oldValue, null, 2);
      const newText = JSON.stringify(newValue, null, 2);
      const ending = inputMode === 'serialized-crlf' ? '\r\n' : '\n';
      return {
        oldValue: oldText.replaceAll('\n', ending),
        newValue: newText.replaceAll('\n', ending),
        options: {},
      };
    }),
    inputMode,
  };
}

function flatInput(size: number, editClass: JsonEditClass): JsonConfidenceInput {
  const oldValue: Record<string, number> = {};
  const newValue: Record<string, number> = {};
  for (let index = 0; index < size; index++) oldValue[`key${index}`] = index;
  Object.assign(newValue, oldValue);
  if (editClass === 'sparse') newValue[`key${Math.floor(size / 2)}`] = -1;
  if (editClass === 'dense') {
    for (let index = 0; index < size; index += 2) newValue[`key${index}`] = -index - 1;
  }
  return { oldValue, newValue, options: {} };
}

function deepInput(depth: number, dense: boolean): JsonConfidenceInput {
  const make = (changed: boolean) => {
    let value: Record<string, unknown> = { leaf: changed ? 'new' : 'old' };
    for (let level = depth - 1; level > 0; level--) {
      value = { level: dense && changed ? -level : level, child: value };
    }
    return value;
  };
  return { oldValue: make(false), newValue: make(true), options: {} };
}

function arrayInput(size: number, dense: boolean): JsonConfidenceInput {
  const oldValue = Array.from({ length: size }, (_, index) => index);
  const newValue = [...oldValue];
  if (dense) for (let index = 0; index < size; index += 3) newValue[index] = -index;
  else newValue[Math.floor(size / 2)] = -1;
  return { oldValue, newValue, options: {} };
}

function recordsInput(size: number, dense: boolean): JsonConfidenceInput {
  const make = () =>
    Array.from({ length: size }, (_, id) => ({ id, name: `item-${id}`, active: id % 2 === 0 }));
  const oldValue = make();
  const newValue = make();
  if (dense)
    for (let index = 0; index < size; index += 2) newValue[index].active = !newValue[index].active;
  else newValue[Math.floor(size / 2)].name = 'renamed';
  return { oldValue, newValue, options: {} };
}

function mixedInput(dense: boolean): JsonConfidenceInput {
  const make = () => ({
    title: 'catalog',
    groups: [
      { id: 1, tags: ['a', 'b'] },
      { id: 2, tags: ['c'] },
    ],
    flags: { stable: true, beta: false },
  });
  const oldValue = make();
  const newValue = make();
  newValue.groups[1].tags[0] = 'changed';
  if (dense) {
    newValue.title = 'next';
    newValue.flags = { stable: false, beta: true };
    newValue.groups[0].tags.push('d');
  }
  return { oldValue, newValue, options: {} };
}

function packageInput(workspace = false): JsonConfidenceInput {
  const make = () => ({
    name: 'demo',
    version: '1.0.0',
    scripts: { test: 'bun test', build: 'tsc' },
    dependencies: { alpha: '^1.0.0', beta: '^2.0.0' },
    workspaces: workspace ? ['packages/a', 'packages/b'] : undefined,
  });
  const oldValue = make();
  const newValue = make();
  newValue.version = '1.1.0';
  newValue.dependencies.beta = '^3.0.0';
  if (workspace) newValue.workspaces?.push('packages/c');
  return { oldValue, newValue, options: {} };
}

function undefinedInput(undefinedReplacement?: unknown): JsonConfidenceInput {
  return {
    oldValue: { kept: 1, missing: undefined, nested: [1, undefined, 3] },
    newValue: { kept: 2, missing: undefined, nested: [1, undefined, 3] },
    options: undefinedReplacement === undefined ? {} : { undefinedReplacement },
  };
}

function replacerInput(kind: 'noop' | 'transform' | 'filter'): JsonConfidenceInput {
  const stringifyReplacer = (key: string, value: unknown) => {
    if (kind === 'filter' && key === 'secret') return undefined;
    if (kind === 'transform' && typeof value === 'number') return value * 10;
    return value;
  };
  return {
    oldValue: { value: 2, secret: 'a' },
    newValue: { value: 3, secret: 'b' },
    options: { stringifyReplacer },
  };
}

function toJsonInput(): JsonConfidenceInput {
  const make = (offset: number) => ({
    rows: Array.from({ length: 6 }, (_, index) => ({
      raw: index,
      toJSON() {
        return { id: index, rendered: `row-${index + offset}` };
      },
    })),
  });
  return { oldValue: make(0), newValue: make(1), options: {} };
}

function sharedInput(): JsonConfidenceInput {
  const oldShared = { value: 'old' };
  const newShared = { value: 'new' };
  return {
    oldValue: { a: oldShared, b: oldShared },
    newValue: { a: newShared, b: newShared },
    options: {},
  };
}

function tokenInput(): JsonConfidenceInput {
  return {
    oldValue: { a: 1, b: 2, c: 3 },
    newValue: { a: 10, b: 20, c: 30 },
    options: { oneChangePerToken: true },
  };
}

function emptySideTokenInput(reverse: boolean): JsonConfidenceInput {
  const content = Array.from({ length: 256 }, (_, index) => `line-${index}\n`).join('');
  return {
    oldValue: reverse ? content : '',
    newValue: reverse ? '' : content,
    options: { oneChangePerToken: true },
  };
}

function ignoreCaseInput(unicode: boolean): JsonConfidenceInput {
  return unicode
    ? {
        oldValue: { text: 'Ärger Σίσυφος' },
        newValue: { text: 'ärger σίσυφος' },
        options: { ignoreCase: true },
      }
    : {
        oldValue: { text: 'Alpha BETA' },
        newValue: { text: 'alpha beta' },
        options: { ignoreCase: true },
      };
}

function contentInput(
  kind: 'ascii-short' | 'ascii-long' | 'escaped' | 'unicode'
): JsonConfidenceInput {
  if (kind === 'ascii-short') {
    return { oldValue: { text: 'alpha' }, newValue: { text: 'omega' }, options: {} };
  }
  if (kind === 'ascii-long') {
    return {
      oldValue: { text: 'alpha '.repeat(3000) },
      newValue: { text: 'omega '.repeat(3000) },
      options: {},
    };
  }
  if (kind === 'escaped') {
    return {
      oldValue: { text: '\u0000\n\t\b\f\\"'.repeat(256) },
      newValue: { text: '\u0001\r\t\b\f\\"'.repeat(256) },
      options: {},
    };
  }
  return {
    oldValue: { text: '漢字 Ω 😀 𝄞'.repeat(256) },
    newValue: { text: '仮名 Ж 🚀 𐐷'.repeat(256) },
    options: {},
  };
}

function malformedInput(): JsonConfidenceInput {
  return {
    oldValue: '\ud800\n𐐀\nİ\n\ue000\n',
    newValue: '\ud801\n𐐨\ni̇\n\ue001\n',
    options: { ignoreCase: true },
  };
}

function cycleInput(): JsonConfidenceInput {
  const oldValue: Record<string, unknown> = { name: 'old' };
  const newValue: Record<string, unknown> = { name: 'new' };
  oldValue.child = { parent: oldValue };
  newValue.child = { parent: newValue };
  return { oldValue, newValue, options: {} };
}

function serializedSizes(buildInput: () => JsonConfidenceInput): Partial<JsonConfidenceMeta> {
  try {
    const { oldValue, newValue, options } = buildInput();
    const oldText =
      typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue, options.stringifyReplacer);
    const newText =
      typeof newValue === 'string' ? newValue : JSON.stringify(newValue, options.stringifyReplacer);
    if (oldText === undefined || newText === undefined) return {};
    return {
      oldSerializedUtf16: oldText.length,
      newSerializedUtf16: newText.length,
      oldSerializedUtf8: Buffer.byteLength(oldText, 'utf8'),
      newSerializedUtf8: Buffer.byteLength(newText, 'utf8'),
    };
  } catch {
    return {};
  }
}
