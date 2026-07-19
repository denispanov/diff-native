# diff-native contributor instructions

## Project invariant: exact jsdiff compatibility

`diff-native` is a Rust/WebAssembly drop-in replacement for the pinned compatibility target, currently `diff@9.0.0`.

- Observable JavaScript behavior must match jsdiff exactly: signatures, accepted inputs and options, return values, object and array shapes, property presence (including omitted versus present with `undefined`), errors, callbacks, ordering, patch formatting, and line endings.
- Treat unexplained output differences as regressions. Cover compatibility fixes with focused regression tests and, where practical, differential tests against the pinned `diff` dependency.
- Never trade compatibility for speed. Optimize only after preserving behavior.
- Internal Rust implementation details do not need to resemble jsdiff internals; compatibility applies to the observable JavaScript contract.

## Repository map

- `src/diff/` — tokenization and diff algorithms.
- `src/patch/` — patch creation, parsing, application, reversal, and line-ending handling.
- `src/lib.rs` — WASM exports and the Rust-JavaScript boundary.
- `src/*-index.js` — runtime-specific JavaScript entry points.
- `types/` — published TypeScript declarations.
- `tests/` — behavioral, regression, and conformance tests.
- `bench/` — deterministic compatibility and performance benchmarks; see `bench/README.md` for details.
- `dist/`, `pkg/`, and `pkg-web/` are generated. Do not edit them by hand.

## Commands

Prefer repository Bun scripts when an equivalent script exists. Build before tests that load generated WASM or package output.

```bash
# Install and build
bun install
bun run build

# Targeted tests
bun test tests/path/to/test.ts
cargo test --lib test_name

# Focused compatibility and package checks
bun run test:conformance
bun run test:package

# Full JavaScript and Rust suites
bun test
bun run test:rust

# Formatting, linting, and strict Clippy checks
bun run check
```

Run the current CI job locally with:

```bash
bun install
bun run bench:build
bun run build
bun run check
bun test
bun run test:rust
```

## Testing approach

- `<module>.test.ts` contains hand-written examples and permanent minimized regressions.
- `<module>.differential.test.ts` contains deterministic generated comparisons against exact `diff@9.0.0`, using fixed checked-in seeds and case counts. These files run with normal `bun test` and in CI.
- Run the line differential suite with `bun test tests/diff/line.differential.test.ts`, or all differential suites with `bun run test:differential`.

## Change requirements

- For behavior-affecting fixes or compatibility work, add a focused regression test and differential coverage where practical.
- For API or package-boundary work, update every affected representation among `src/lib.rs`, the JavaScript entry points, `types/index.d.ts`, and tests.
- For algorithm or hot-path work, use `bun run bench:quick` while iterating and `bun run bench:full` before merging. Compare results only on the same machine and runtime signature, and report the relevant result.
- For docs, tests, CI, or repository-maintenance changes, run only relevant checks; compatibility and performance may be reported as having no runtime impact or as not applicable.
- Keep compatibility fixes narrowly scoped. Do not combine them with unrelated refactoring or speculative optimization.

## Pull requests

- PR titles should follow Conventional Commits when practical; this convention is guidance and is not currently CI-enforced.
- Format: `<type>[optional scope][optional !]: <description>`.
- Preferred types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, and `revert`.
- Use `fix`, not `bug`, for bug fixes. Write a concise, imperative description.
- `!` indicates a genuinely breaking package or tooling change; it never permits deliberate incompatibility with jsdiff.
- Complete `.github/pull_request_template.md`. Report compatibility impact, checks run, and benchmark results when relevant.
