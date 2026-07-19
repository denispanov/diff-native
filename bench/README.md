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

## Dedicated `diffJson` confidence benchmark

This statistically oriented suite is separate from the general harness and never reads or
updates its tracked baselines. `bun run bench:json:quick` builds once and runs the small suite;
`bun run bench:json:confidence` builds once, then runs all 39 cases in three fresh Node
processes. Results have the `diff-native-json-confidence-v1` identity and are written as raw
JSON under the ignored `bench/results/` directory. The Bun source runner is available as
`bun run bench:json:quick:bun` after building.

Every candidate result (including error name/message) is first checked against `diff@9.0.0`
using fresh inputs and the public `diffJson` API. Inputs are also freshly constructed outside
each warm-up, calibration, and timed batch. Normal cases use paired candidate/reference
batches; confidence defaults to five blocks of six deterministically balanced, randomized
AB/BA pairs. Both targets are warmed, batch sizes are calibrated to at least 10ms (quick) or
20ms (confidence), and outputs are consumed. Raw order, iterations, and elapsed times are
retained. Reports include mean, p50, coarse p95, standard deviation, CV, the primary geometric
mean paired ratio, and a seeded block-bootstrap 95% interval over paired log ratios. Aggregate
resampling preserves every case's fixed weight. Expected throws are timed and reported
separately and do not enter normal aggregates. Quick-mode ratios are diagnostics because its
single block is insufficient for interval interpretation.

The confidence matrix includes 10,000-key no-op and sparse-edit cases, but deliberately bounds
dense-edit coverage at 1,000 keys. A 50%-changed 10,000-key object primarily exercises the
quadratic high-edit-distance diff path and can take many minutes per sample, obscuring the JSON
boundary cost this suite is intended to measure.

Interpret the 5% threshold in three states: an interval wholly below 0.95 favors the candidate,
an interval wholly above 1.05 favors the reference, and any overlapping interval is
inconclusive. Repeated fresh processes expose startup/JIT variability; they are separate
fresh-process runs, not extra within-process samples, so inspect all three outputs rather than
pooling them blindly.

For an exact-artifact comparison, pass `--baseline-module /path/to/old/index.js` and optionally
`--baseline-label old-sha`. The old artifact is loaded in the same process. Cases where its
observable result differs from pinned jsdiff are marked baseline-incompatible; no old/current
ratio is calculated for them. `--aa` substitutes the candidate for the timed reference to
measure harness noise. Other controls are `--blocks`, `--pairs-per-block` (even),
`--warmup-calls`, `--target-batch-ms`, `--bootstrap-samples`, `--order-seed`, and `--output`.
The candidate path is always explicit via `--candidate-module`.

No memory value is sampled in timed regions. Endpoint heap or RSS mostly reflects allocator,
GC, and retained-memory state; it is neither an allocation count nor a peak measurement, so
this benchmark deliberately omits misleading memory numbers. Use a separate profiler/process
experiment when memory behavior is the question.
