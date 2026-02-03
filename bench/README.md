# Benchmarks

In-repo performance benchmark harness for `diff-native`.

## Goals
- One-command run with automatic comparison to a tracked baseline.
- Deterministic inputs with repeatable results.
- Always compare `diff-native` vs `jsdiff`.
- Include patch performance via `createTwoFilesPatch`.
- Support both Bun and Node runtimes.

## Commands
### Bun
- `bun run bench:full` — build + run full suite (Bun) and compare vs baseline
- `bun run bench:quick` — build + run quick suite (Bun) and compare vs baseline
- `bun run bench:baseline` — build + run full suite (Bun) and overwrite baseline
- `bun run bench:compare` — compare latest results to baseline (Bun)

### Node
- `bun run bench:full:node` — build + run full suite (Node)
- `bun run bench:quick:node` — build + run quick suite (Node)
- `bun run bench:baseline:node` — build + run full suite and overwrite baseline (Node)
- `bun run bench:compare:node` — compare latest results to baseline (Node)

## Outputs
- Results: `bench/results/<timestamp>.<runtime>.json` and `.csv`
- Baselines (tracked):
  - `bench/baselines/master.bun.json`
  - `bench/baselines/master.node.json`

## Determinism
- Fixed seed is used for generators.
- Each case uses a per-case seed derived from the case id.

## Validation
- Each case validates that `diff-native` output equals `jsdiff` output before timing.
- If a mismatch is found, the run fails immediately.

## Runtime & Memory
- Benchmarks can run under **Bun** or **Node.js**.
- Memory metrics use `process.memoryUsage()` and are **runtime-specific** (Bun and Node report differently).
- Comparisons are valid only when baseline and current run share the same runtime + machine signature.

## Fixtures
Realistic fixtures live in `bench/fixtures/` and are used in both diff and patch benchmarks.

## Iteration Scaling
Large and expensive cases automatically reduce iterations to keep full runs under control.

## Environment Variables
- `BENCH_ITERATIONS` — base timing iterations (default: 10 full / 6 quick)
- `BENCH_WARN_PCT` — regression threshold for warnings (default: 5)
- `BENCH_STRONG_PCT` — threshold for strong regressions (default: 10)
