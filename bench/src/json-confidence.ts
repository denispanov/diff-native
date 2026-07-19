import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { diffJson as pinnedDiffJson } from 'diff';
import { type JsonConfidenceCase, buildJsonConfidenceCases } from './cases/json-confidence.js';

type DiffJson = (oldValue: unknown, newValue: unknown, options?: object) => unknown;
const referenceDiffJson = pinnedDiffJson as unknown as DiffJson;
type Outcome =
  | { kind: 'return'; value: unknown }
  | { kind: 'throw'; name: string; message: string };
interface Target {
  label: string;
  fn: DiffJson;
}
interface Sample {
  block: number;
  pair: number;
  order: 'AB' | 'BA';
  iterations: number;
  candidateElapsedMs: number;
  referenceElapsedMs: number;
  ratio: number;
}

const args = parseArgs(process.argv.slice(2));
const suite = suiteValue(value('suite', 'confidence'));
const blocks = integer('blocks', suite === 'quick' ? 1 : 5);
const pairsPerBlock = integer('pairs-per-block', suite === 'quick' ? 2 : 6);
const warmupCalls = integer('warmup-calls', suite === 'quick' ? 3 : 10);
const targetBatchMs = numberValue('target-batch-ms', suite === 'quick' ? 10 : 20);
const bootstrapSamples = integer('bootstrap-samples', suite === 'quick' ? 1000 : 10000);
const orderSeed = integer('order-seed', 0x4a534f4e);
if (pairsPerBlock % 2 !== 0) throw new Error('--pairs-per-block must be even');
const candidatePath = required('candidate-module');
const candidate = await loadTarget(candidatePath, value('candidate-label', 'candidate'));
const reference: Target = args.has('aa')
  ? { label: `${candidate.label} (A/A)`, fn: candidate.fn }
  : { label: 'diff@9.0.0', fn: referenceDiffJson };
const baselinePath = args.get('baseline-module');
const baseline = baselinePath
  ? await loadTarget(baselinePath, value('baseline-label', 'baseline'))
  : undefined;
const cases = buildJsonConfidenceCases(suite);
const normal: { samples: Sample[] }[] = [];
const diagnostics: { samples: Sample[] }[] = [];
let _sink: unknown;

for (const testCase of cases) {
  const expected = invoke(referenceDiffJson, testCase.buildInput());
  if (expected.kind !== testCase.expected) {
    throw new Error(
      `${testCase.id}: case declares ${testCase.expected}, but diff@9.0.0 produced ${expected.kind}`
    );
  }
  const actual = invoke(candidate.fn, testCase.buildInput());
  assertEquivalent(testCase.id, actual, expected, candidate.label);
  const baselineOutcome = baseline ? invoke(baseline.fn, testCase.buildInput()) : undefined;
  const baselineCompatible = baselineOutcome ? equivalent(baselineOutcome, expected) : undefined;
  warm(candidate.fn, testCase, warmupCalls);
  warm(reference.fn, testCase, warmupCalls);
  const candidateIterations = calibrate(candidate.fn, testCase, targetBatchMs);
  const referenceIterations = calibrate(reference.fn, testCase, targetBatchMs);
  const iterations = Math.max(candidateIterations, referenceIterations);
  const samples: Sample[] = [];
  for (let block = 0; block < blocks; block++) {
    const orders = balancedOrders(pairsPerBlock, mix(orderSeed, testCase.id, block));
    for (let pair = 0; pair < pairsPerBlock; pair++) {
      const order = orders[pair];
      let candidateElapsedMs = 0;
      let referenceElapsedMs = 0;
      for (const which of order === 'AB'
        ? ['candidate', 'reference']
        : ['reference', 'candidate']) {
        const input = testCase.buildInput();
        const elapsed = time(
          which === 'candidate' ? candidate.fn : reference.fn,
          input,
          iterations,
          testCase.expected === 'throw'
        );
        if (which === 'candidate') candidateElapsedMs = elapsed;
        else referenceElapsedMs = elapsed;
      }
      samples.push({
        block,
        pair,
        order,
        iterations,
        candidateElapsedMs,
        referenceElapsedMs,
        ratio: candidateElapsedMs / referenceElapsedMs,
      });
    }
  }
  let baselineComparison: unknown;
  if (baseline && baselineCompatible) {
    warm(baseline.fn, testCase, warmupCalls);
    const baselineIterations = calibrate(baseline.fn, testCase, targetBatchMs);
    const comparisonIterations = Math.max(candidateIterations, baselineIterations);
    const baselineSamples: Sample[] = [];
    for (let block = 0; block < blocks; block++) {
      const orders = balancedOrders(
        pairsPerBlock,
        mix(orderSeed, `${testCase.id}:baseline`, block)
      );
      for (let pair = 0; pair < pairsPerBlock; pair++) {
        const order = orders[pair];
        let candidateElapsedMs = 0;
        let baselineElapsedMs = 0;
        for (const which of order === 'AB'
          ? ['candidate', 'baseline']
          : ['baseline', 'candidate']) {
          const elapsed = time(
            which === 'candidate' ? candidate.fn : baseline.fn,
            testCase.buildInput(),
            comparisonIterations,
            testCase.expected === 'throw'
          );
          if (which === 'candidate') candidateElapsedMs = elapsed;
          else baselineElapsedMs = elapsed;
        }
        baselineSamples.push({
          block,
          pair,
          order,
          iterations: comparisonIterations,
          candidateElapsedMs,
          referenceElapsedMs: baselineElapsedMs,
          ratio: candidateElapsedMs / baselineElapsedMs,
        });
      }
    }
    baselineComparison = {
      meaning: 'current/baseline',
      samples: baselineSamples,
      pairedRatio: ratioSummary(baselineSamples, mix(orderSeed, testCase.id, 101)),
    };
  }
  const record = {
    id: testCase.id,
    expected: testCase.expected,
    meta: testCase.meta,
    baselineCompatible,
    baselineOutcome: baselineOutcome && summarizeOutcome(baselineOutcome),
    baselineComparison,
    samples,
    candidate: metrics(samples.map(sample => sample.candidateElapsedMs / sample.iterations)),
    reference: metrics(samples.map(sample => sample.referenceElapsedMs / sample.iterations)),
    pairedRatio: ratioSummary(samples, mix(orderSeed, testCase.id, 99)),
  };
  (testCase.expected === 'throw' ? diagnostics : normal).push(record);
}

const result = {
  identity: 'diff-native-json-confidence-v1',
  suite,
  createdAt: new Date().toISOString(),
  runtime: {
    name: 'Bun' in globalThis ? 'bun' : 'node',
    version:
      'Bun' in globalThis
        ? (globalThis as unknown as { Bun: { version: string } }).Bun.version
        : process.version,
  },
  process: {
    pid: process.pid,
    index: Number(process.env.JSON_CONFIDENCE_PROCESS_INDEX ?? 0),
    orderSeed,
  },
  config: {
    blocks,
    pairsPerBlock,
    warmupCalls,
    targetBatchMs,
    bootstrapSamples,
    aa: args.has('aa'),
  },
  targets: {
    candidate: candidate.label,
    reference: reference.label,
    baseline: baseline?.label,
    candidateModule: resolve(candidatePath),
    baselineModule: baselinePath && resolve(baselinePath),
  },
  caseCounts: { total: cases.length, normal: normal.length, expectedThrow: diagnostics.length },
  aggregate: aggregateRatioSummary(normal, orderSeed),
  cases: normal,
  expectedThrowDiagnostics: diagnostics,
};
const output = resolve(
  value('output', `bench/results/json-confidence-${suite}-${Date.now()}.json`)
);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `JSON confidence: ${cases.length} cases; aggregate candidate/reference ${result.aggregate.geometricMean.toFixed(3)} [${result.aggregate.bootstrap95.low.toFixed(3)}, ${result.aggregate.bootstrap95.high.toFixed(3)}]`
);
console.log(`Raw results: ${output}`);

function invoke(fn: DiffJson, input: ReturnType<JsonConfidenceCase['buildInput']>): Outcome {
  try {
    return { kind: 'return', value: fn(input.oldValue, input.newValue, input.options) };
  } catch (error) {
    return {
      kind: 'throw',
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
function equivalent(a: Outcome, b: Outcome): boolean {
  return (
    a.kind === b.kind &&
    (a.kind === 'return' && b.kind === 'return'
      ? isDeepStrictEqual(a.value, b.value) && JSON.stringify(a.value) === JSON.stringify(b.value)
      : a.kind === 'throw' && b.kind === 'throw' && a.name === b.name && a.message === b.message)
  );
}
function assertEquivalent(id: string, actual: Outcome, expected: Outcome, label: string) {
  if (!equivalent(actual, expected))
    throw new Error(
      `${id}: ${label} is incompatible with diff@9.0.0\nactual=${JSON.stringify(summarizeOutcome(actual))}\nexpected=${JSON.stringify(summarizeOutcome(expected))}`
    );
}
function summarizeOutcome(outcome: Outcome) {
  return outcome.kind === 'throw' ? outcome : { kind: 'return', valueType: typeof outcome.value };
}
function run(
  fn: DiffJson,
  input: ReturnType<JsonConfidenceCase['buildInput']>,
  iterations: number,
  expectedThrow = false
) {
  for (let i = 0; i < iterations; i++) {
    if (expectedThrow) {
      let threw = false;
      try {
        fn(input.oldValue, input.newValue, input.options);
      } catch (error) {
        threw = true;
        _sink = error;
      }
      if (!threw) throw new Error('expected benchmark invocation to throw');
    } else _sink = fn(input.oldValue, input.newValue, input.options);
  }
}
function time(
  fn: DiffJson,
  input: ReturnType<JsonConfidenceCase['buildInput']>,
  iterations: number,
  expectedThrow = false
) {
  const start = performance.now();
  run(fn, input, iterations, expectedThrow);
  return performance.now() - start;
}
function warm(fn: DiffJson, testCase: JsonConfidenceCase, calls: number) {
  const input = testCase.buildInput();
  run(fn, input, calls, testCase.expected === 'throw');
}
function calibrate(fn: DiffJson, testCase: JsonConfidenceCase, target: number) {
  let iterations = 1;
  for (;;) {
    const elapsed = time(fn, testCase.buildInput(), iterations, testCase.expected === 'throw');
    if (elapsed >= target || iterations >= 1_048_576) return iterations;
    iterations = Math.min(
      1_048_576,
      Math.max(iterations + 1, Math.ceil((iterations * target) / Math.max(elapsed, 0.01)))
    );
  }
}
function metrics(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / Math.max(1, values.length - 1);
  const stddev = Math.sqrt(variance);
  return {
    unit: 'ms/call',
    mean,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    stddev,
    cv: stddev / mean,
  };
}
function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
function geometricMean(values: number[]) {
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}
function ratioSummary(samples: Sample[], seed: number) {
  const values = samples.map(sample => sample.ratio);
  const blocks = groupByBlock(samples);
  const random = rng(seed);
  const boot = Array.from({ length: bootstrapSamples }, () => {
    const resampled = Array.from(
      { length: blocks.length },
      () => blocks[Math.floor(random() * blocks.length)]
    ).flatMap(block => block.map(sample => sample.ratio));
    return geometricMean(resampled);
  }).sort((a, b) => a - b);
  return ratioResult(values, boot, blocks.length > 1);
}
function aggregateRatioSummary(records: { samples: Sample[] }[], seed: number) {
  const values = records.map(record => geometricMean(record.samples.map(sample => sample.ratio)));
  const blocksByCase = records.map(record => groupByBlock(record.samples));
  const random = rng(seed);
  const boot = Array.from({ length: bootstrapSamples }, () =>
    geometricMean(
      blocksByCase.map(blocks => {
        const resampled = Array.from(
          { length: blocks.length },
          () => blocks[Math.floor(random() * blocks.length)]
        ).flatMap(block => block.map(sample => sample.ratio));
        return geometricMean(resampled);
      })
    )
  ).sort((a, b) => a - b);
  return ratioResult(
    values,
    boot,
    blocksByCase.every(blocks => blocks.length > 1)
  );
}
function ratioResult(values: number[], boot: number[], interpret: boolean) {
  const low = percentile(boot, 0.025);
  const high = percentile(boot, 0.975);
  return {
    geometricMean: geometricMean(values),
    bootstrap95: { low, high },
    interpretation: !interpret
      ? 'diagnostic'
      : high < 0.95
        ? 'candidate-faster'
        : low > 1.05
          ? 'candidate-slower'
          : 'inconclusive',
    sampleCount: values.length,
  };
}
function groupByBlock(samples: Sample[]) {
  return Array.from(new Set(samples.map(sample => sample.block))).map(block =>
    samples.filter(sample => sample.block === block)
  );
}
function balancedOrders(count: number, seed: number): ('AB' | 'BA')[] {
  const result = Array.from({ length: count }, (_, i) =>
    i < count / 2 ? ('AB' as const) : ('BA' as const)
  );
  const random = rng(seed);
  for (let i = result.length - 1; i; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(seed: number, id: string, block: number) {
  let hash = seed ^ block;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
async function loadTarget(path: string, label: string): Promise<Target> {
  const module = await import(pathToFileURL(resolve(path)).href);
  const fn = module.diffJson ?? module.default?.diffJson ?? module.default;
  if (typeof fn !== 'function') throw new Error(`${path} does not export diffJson`);
  return { label, fn };
}
function parseArgs(argv: string[]) {
  const map = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const name = key.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) map.set(name, argv[++i]);
    else map.set(name, 'true');
  }
  return map;
}
function value(name: string, fallback: string) {
  return args.get(name) ?? fallback;
}
function required(name: string) {
  const result = args.get(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
}
function suiteValue(input: string): 'quick' | 'confidence' {
  if (input === 'quick' || input === 'confidence') return input;
  throw new Error('--suite must be quick or confidence');
}
function integer(name: string, fallback: number) {
  const result = Number(value(name, String(fallback)));
  if (!Number.isSafeInteger(result) || result <= 0)
    throw new Error(`--${name} must be a positive integer`);
  return result;
}
function numberValue(name: string, fallback: number) {
  const result = Number(value(name, String(fallback)));
  if (!(result > 0)) throw new Error(`--${name} must be positive`);
  return result;
}
