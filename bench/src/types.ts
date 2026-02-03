export type BenchmarkKind = 'diff' | 'patch';
export type Granularity = 'char' | 'word' | 'sentence' | 'line' | 'json';
export type DiffMode = 'mixed' | 'ins' | 'del';
export type AnyFn = (...args: unknown[]) => unknown;

export interface DiffNativeExports {
  diffChars: AnyFn;
  diffWords: AnyFn;
  diffSentences: AnyFn;
  diffLines: AnyFn;
  diffJson: AnyFn;
  createTwoFilesPatch: AnyFn;
}

export interface CaseMeta {
  kind: BenchmarkKind;
  level?: Granularity;
  oldLength?: number;
  newLength?: number;
  diffCount?: number;
  densityPct?: number;
  mode?: DiffMode;
  prefix?: number;
  suffix?: number;
  fixture?: string;
  note?: string;
}

export interface DiffInput {
  oldValue: unknown;
  newValue: unknown;
}

export interface PatchInput {
  oldFileName: string;
  newFileName: string;
  oldStr: string;
  newStr: string;
  oldHeader?: string;
  newHeader?: string;
}

export interface BenchCase {
  id: string;
  kind: BenchmarkKind;
  level?: Granularity;
  meta: CaseMeta;
  buildInput: () => DiffInput | PatchInput;
}

export interface Metrics {
  meanMs: number;
  p95Ms: number;
  meanHeapBytes: number;
  p95HeapBytes: number;
  meanRssBytes: number;
  p95RssBytes: number;
}

export interface CaseResult {
  id: string;
  kind: BenchmarkKind;
  level?: Granularity;
  meta: CaseMeta;
  js: Metrics;
  wasm: Metrics;
  speedup: number;
}

export interface BenchMetadata {
  runtime: 'bun' | 'node';
  runtimeVersion: string;
  os: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuSpeedMHz: number;
  machineSignature: string;
  bunVersion?: string;
  nodeVersion?: string;
  jsdiffVersion?: string;
  diffNativeVersion?: string;
  gitCommit?: string;
  suiteVersion: string;
  seed: number;
  iterations: number;
  validate: boolean;
}

export interface BenchResult {
  schemaVersion: number;
  suite: string;
  createdAt: string;
  metadata: BenchMetadata;
  results: CaseResult[];
}
