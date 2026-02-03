import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildCases } from './cases/index.js';
import { printComparison } from './reporters/compare.js';
import { toCsv } from './reporters/csv.js';
import { printSummary } from './reporters/summary.js';
import { runCases } from './runner.js';
import { createDiffTargets } from './targets/diff.js';
import { createPatchTargets } from './targets/patch.js';
import type { BenchMetadata, BenchResult, DiffNativeExports } from './types.js';

const SCHEMA_VERSION = 1;
const SUITE_VERSION = '2';
const DEFAULT_SEED = 2025;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const RESULTS_DIR = path.join(ROOT, 'bench', 'results');

main().catch(err => {
  console.error(err);
  process.exit(1);
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const suite = getArgValue('--suite', args) ?? 'full';
  const compareOnly = args.includes('--compare-only');
  const writeBaseline = args.includes('--baseline');

  const iterations = Number(process.env.BENCH_ITERATIONS) || (suite === 'quick' ? 6 : 10);
  const warnPct = Number(process.env.BENCH_WARN_PCT) || 5;
  const strongPct = Number(process.env.BENCH_STRONG_PCT) || 10;
  const validate = true;

  const runtime = getRuntimeName();
  const baselinePath = path.join(ROOT, 'bench', 'baselines', `master.${runtime}.json`);

  if (compareOnly) {
    const baseline = readBaseline(baselinePath);
    if (!baseline) {
      console.error('No baseline found. Run `bun run bench:baseline` first.');
      process.exit(1);
    }
    const latest = readLatestResult(RESULTS_DIR);
    if (!latest) {
      console.error('No benchmark results found. Run `bun run bench:full` first.');
      process.exit(1);
    }
    printMismatchWarnings(latest, baseline);
    printComparison(latest, baseline, { warnPct, strongPct });
    return;
  }

  const distPath = path.join(ROOT, 'dist', 'node', 'index.js');
  const diffNativeModule = (await import(pathToFileURL(distPath).toString())) as {
    default?: DiffNativeExports;
  };
  const diffNative = (diffNativeModule.default ?? diffNativeModule) as DiffNativeExports;
  const diffTargets = createDiffTargets(diffNative);
  const patchTargets = createPatchTargets(diffNative);

  const cases = buildCases(DEFAULT_SEED, suite === 'quick' ? 'quick' : 'full');

  console.log(
    `\n🧪  suite=${suite} cases=${cases.length} iterations=${iterations} runtime=${runtime} validate=${validate}`
  );

  const tGlobal = performance.now();

  const results = await runCases(cases, diffTargets, patchTargets, {
    iterationsBase: iterations,
    validate,
  });

  const benchResult: BenchResult = {
    schemaVersion: SCHEMA_VERSION,
    suite,
    createdAt: new Date().toISOString(),
    metadata: buildMetadata(iterations, DEFAULT_SEED, validate),
    results,
  };

  ensureDir(RESULTS_DIR);
  const stamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+/, '');
  const jsonOutPath = path.join(RESULTS_DIR, `${stamp}.${runtime}.json`);
  fs.writeFileSync(jsonOutPath, JSON.stringify(benchResult, null, 2), 'utf8');
  console.log(`\n📄 JSON results saved to ${jsonOutPath}`);

  const csvOutPath = path.join(RESULTS_DIR, `${stamp}.${runtime}.csv`);
  fs.writeFileSync(csvOutPath, toCsv(benchResult), 'utf8');
  console.log(`📄 CSV results saved to ${csvOutPath}`);

  console.log(`\n⏱️  Total runtime ${(performance.now() - tGlobal).toFixed(1)} ms`);

  printSummary(benchResult);

  if (writeBaseline) {
    ensureDir(path.dirname(baselinePath));
    fs.writeFileSync(baselinePath, JSON.stringify(benchResult, null, 2), 'utf8');
    console.log(`\n✅ Baseline updated at ${baselinePath}`);
    return;
  }

  const baseline = readBaseline(baselinePath);
  if (!baseline || baseline.results.length === 0) {
    console.warn('\n⚠️  No baseline results found. Run `bun run bench:baseline` to create one.');
    return;
  }

  printMismatchWarnings(benchResult, baseline);
  printComparison(benchResult, baseline, { warnPct, strongPct });
}

function getArgValue(flag: string, list: string[]): string | undefined {
  const idx = list.indexOf(flag);
  if (idx >= 0 && idx + 1 < list.length) return list[idx + 1];
  const withEq = list.find(a => a.startsWith(`${flag}=`));
  if (withEq) return withEq.split('=')[1];
  return undefined;
}

function buildMetadata(iterations: number, seed: number, validate: boolean): BenchMetadata {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? 'unknown';
  const cpuSpeed = cpus[0]?.speed ?? 0;
  const runtime = getRuntimeName();
  const bunGlobal = getBunGlobal();
  const runtimeVersion =
    runtime === 'bun' ? (bunGlobal?.version ?? 'unknown') : process.versions.node;

  const machineSignature = `${os.platform()}-${os.arch()}-${cpuModel}-${cpuSpeed}-${cpus.length}`;

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const jsdiffVersion = pkg.devDependencies?.diff ?? pkg.dependencies?.diff;
  const diffNativeVersion = pkg.version;

  return {
    runtime,
    runtimeVersion,
    os: os.platform(),
    arch: os.arch(),
    cpuModel,
    cpuCores: cpus.length,
    cpuSpeedMHz: cpuSpeed,
    machineSignature,
    bunVersion: bunGlobal?.version,
    nodeVersion: process.versions?.node,
    jsdiffVersion,
    diffNativeVersion,
    gitCommit: getGitCommit(),
    suiteVersion: SUITE_VERSION,
    seed,
    iterations,
    validate,
  };
}

function getRuntimeName(): 'bun' | 'node' {
  return getBunGlobal() ? 'bun' : 'node';
}

function getGitCommit(): string | undefined {
  try {
    const bunGlobal = getBunGlobal();
    if (bunGlobal?.spawnSync) {
      const result = bunGlobal.spawnSync({ cmd: ['git', 'rev-parse', 'HEAD'] });
      if (result.exitCode === 0) {
        return result.stdout.toString().trim();
      }
      return undefined;
    }
    return execSync('git rev-parse HEAD').toString().trim();
  } catch {
    return undefined;
  }
}

type BunRuntime = {
  version?: string;
  spawnSync?: (opts: { cmd: string[] }) => { exitCode: number; stdout: { toString(): string } };
};

function getBunGlobal(): BunRuntime | undefined {
  return (globalThis as { Bun?: BunRuntime }).Bun;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readBaseline(pathToBaseline: string): BenchResult | null {
  if (!fs.existsSync(pathToBaseline)) return null;
  try {
    const raw = fs.readFileSync(pathToBaseline, 'utf8');
    return JSON.parse(raw) as BenchResult;
  } catch {
    return null;
  }
}

function readLatestResult(resultsDir: string): BenchResult | null {
  if (!fs.existsSync(resultsDir)) return null;
  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith(`.${getRuntimeName()}.json`));
  if (files.length === 0) return null;
  files.sort();
  const latest = files[files.length - 1];
  try {
    return JSON.parse(fs.readFileSync(path.join(resultsDir, latest), 'utf8')) as BenchResult;
  } catch {
    return null;
  }
}

function printMismatchWarnings(current: BenchResult, baseline: BenchResult): void {
  const warnings: string[] = [];
  if (current.metadata.machineSignature !== baseline.metadata.machineSignature) {
    warnings.push('machine signature');
  }
  if (current.metadata.runtime !== baseline.metadata.runtime) {
    warnings.push('runtime');
  }
  if (current.metadata.suiteVersion !== baseline.metadata.suiteVersion) {
    warnings.push('suite version');
  }
  if (current.suite !== baseline.suite) {
    warnings.push('suite name');
  }

  if (warnings.length > 0) {
    console.warn(
      `\n⚠️  Baseline mismatch detected (${warnings.join(', ')}). Comparisons may be noisy.`
    );
  }
}
