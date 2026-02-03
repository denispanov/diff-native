import type {
  BaseOptions,
  Change,
  JsonOptions,
  LinesOptions,
  PatchOptions,
  WordsOptions,
} from 'diff';

export type BenchmarkKind = 'diff' | 'patch';
export type Granularity = 'char' | 'word' | 'sentence' | 'line' | 'json';
export type DiffMode = 'mixed' | 'ins' | 'del';

export type DiffCharsFn = (oldStr: string, newStr: string, options?: BaseOptions) => Change[];
export type DiffWordsFn = (oldStr: string, newStr: string, options?: WordsOptions) => Change[];
export type DiffSentencesFn = (oldStr: string, newStr: string, options?: BaseOptions) => Change[];
export type DiffLinesFn = (oldStr: string, newStr: string, options?: LinesOptions) => Change[];
export type DiffJsonFn = (
  oldObj: string | object,
  newObj: string | object,
  options?: JsonOptions
) => Change[];
export type CreateTwoFilesPatchFn = (
  oldFileName: string,
  newFileName: string,
  oldStr: string,
  newStr: string,
  oldHeader?: string,
  newHeader?: string,
  options?: PatchOptions
) => string;

export interface DiffNativeExports {
  diffChars: DiffCharsFn;
  diffWords: DiffWordsFn;
  diffSentences: DiffSentencesFn;
  diffLines: DiffLinesFn;
  diffJson: DiffJsonFn;
  createTwoFilesPatch: CreateTwoFilesPatchFn;
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
