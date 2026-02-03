# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

diff-native is a high-performance text diffing library built with Rust and compiled to WebAssembly. It is a **drop-in replacement** for the JavaScript `jsdiff` library, providing identical API with significantly improved performance (10-20x faster) and reduced memory usage (up to 80% less).

## Critical Requirement: Exact jsdiff Compatibility

This library must maintain 100% compatibility with the original jsdiff library:
- Identical API signatures
- Exactly the same output for any given input
- Match all edge cases and behaviors
- Use the same data structures and return types

The goal is purely performance improvement without any functional changes. Users should be able to switch from `jsdiff` to `diff-native` without any code changes or behavioral differences.

## Common Commands

Always use Bun for running commands in this repository:

### Building

```bash
# Build all targets (node, browser, and esm)
bun run build

# Build the WASM module for Node.js target only
bun run build:wasm:node
# or: wasm-pack build --target nodejs --out-dir pkg

# Build the WASM module for web target only
bun run build:wasm:web
# or: wasm-pack build --target web --out-dir pkg-web
```

### Testing

```bash
# Run all tests (requires build first)
bun run build && bun test

# Run a specific test file
bun test tests/diff/character.test.ts

# Run tests in watch mode
bun test --watch

# Run Rust unit tests
bun run test:rust
# or: cargo test --lib

# Run a specific Rust test
cargo test --lib test_name

# Run WebAssembly integration tests
wasm-pack test --node
```

### Linting and Formatting

```bash
# Run all checks (biome + cargo fmt + clippy)
bun run check

# Fix all linting and formatting issues
bun run fix

# JavaScript/TypeScript (Biome)
bun run lint           # Biome lint only
bun run lint:fix       # Biome lint with auto-fix
bun run format         # Biome format
bun run format:check   # Biome format check only

# Rust
cargo fmt              # Rust formatting
cargo clippy           # Rust linting (strict mode)
```

### Benchmarking (Bun + Node)

Benchmarks live under `bench/` and are deterministic (seeded). They always validate `diff-native`
output against `jsdiff`, then report timing + memory (heap/RSS).

- Runners: `bench/run-bun.ts` (Bun/TS) and `bench/run-node.mjs` (Node/compiled JS)
- Cases: `bench/src/cases/` (synthetic + fixtures), fixtures in `bench/fixtures/`
- Generators: `bench/src/generators/` (text + JSON + RNG) keep cases deterministic
- Outputs: `bench/results/` (gitignored) and baselines in `bench/baselines/`

Note: comparisons are only meaningful when runtime + machine signature match.
Summaries include both mean speedup and ratio-of-means (the latter is usually the most honest overall).

```bash
# Bun (runs TS directly)
bun run bench:full        # Full suite + compare vs baseline
bun run bench:quick       # Quick suite + compare vs baseline
bun run bench:baseline    # Full suite + overwrite baseline
bun run bench:compare     # Compare latest results vs baseline

# Node.js (compiled JS runner)
bun run bench:full:node
bun run bench:quick:node
bun run bench:baseline:node
bun run bench:compare:node
```

## Testing Approach

Our testing strategy ensures exact compatibility with the original `jsdiff` library:

1. Tests are based on behaviors expected from the original jsdiff library
2. A utility (`tests/utils/wasm-loader.ts`) loads and initializes the WASM module
3. Setup code (`tests/setup.ts`) initializes the module once for all tests
4. Tests verify that behavior matches the original jsdiff library bit-by-bit

For Rust-specific unit testing:
1. Tests are in dedicated `*_test.rs` files alongside their modules
2. All tokenizers have corresponding test files
3. Run with `cargo test --lib` or `bun run test:rust`

## Architecture

### Module Structure

```
src/
├── lib.rs              # WASM entry point, exports all public functions
├── change.rs           # Change struct (value, added, removed, count)
├── options.rs          # DiffOptions, DiffWordsOptions, etc.
├── diff/               # Diff algorithms
│   ├── base.rs         # Generic Myers algorithm implementation
│   ├── token.rs        # Tokeniser trait and Tok type
│   ├── character.rs    # diffChars - CharTokenizer
│   ├── word.rs         # diffWords, diffWordsWithSpace - WordTokenizer
│   ├── line.rs         # diffLines, diffTrimmedLines - LineTokenizer
│   ├── sentences.rs    # diffSentences - SentenceTokenizer
│   ├── css.rs          # diffCss - CssTokenizer
│   ├── json.rs         # diffJson - JsonTokenizer, canonicalize
│   ├── components.rs   # Optimized 8-byte Component storage
│   ├── component_pool.rs # Structure-of-Arrays (SoA) for cache efficiency
│   └── memory_pool.rs  # Thread-local memory pooling (PooledDiff)
├── patch/              # Patch operations (unified diff format)
│   ├── types.rs        # Patch, Hunk structs
│   ├── apply.rs        # applyPatch, applyPatches, ApplyOptions
│   ├── create.rs       # createPatch, createTwoFilesPatch, formatPatch
│   ├── parse.rs        # parsePatch
│   ├── reverse.rs      # reversePatch
│   └── line_endings.rs # unixToWin, winToUnix, isUnix, isWin
├── util/               # String and array utilities
│   ├── string.rs       # String manipulation helpers
│   ├── array.rs        # Array utilities
│   ├── params.rs       # Parameter handling
│   └── distance_iterator.rs # Iterator for diff distance
└── convert/
    └── xml.rs          # convertChangesToXml
```

### Core Components

1. **Tokenization Layer** - Each diff algorithm operates on tokens (characters, words, lines, etc.)
   - Tokenizers implement the `Tokeniser` trait in `src/diff/token.rs`
   - Tokens (`Tok`) are views/references to the original string to avoid copying
   - Each diff type has its own tokenizer: `CharTokenizer`, `WordTokenizer`, `LineTokenizer`, `SentenceTokenizer`, `CssTokenizer`, `JsonTokenizer`

2. **Diff Engine** - Myers algorithm implementation
   - Generic implementation in `src/diff/base.rs`
   - Works with any type that implements `Tokeniser`
   - Produces `Vec<Change>` as output

3. **Patch System** - Implements unified diff format
   - Creates patches from diffs (`create.rs`)
   - Parses patch strings (`parse.rs`)
   - Applies patches to source text (`apply.rs`)
   - Handles line ending conversions (`line_endings.rs`)

4. **Rust-JavaScript Bridge** - Uses wasm-bindgen
   - Exposes Rust functions to JavaScript in `lib.rs`
   - Uses `serde-wasm-bindgen` for serialization/deserialization
   - JavaScript entry points in `src/node-index.js`, `src/browser-index.js`, `src/esm-index.js`

### Memory Optimization System

The library includes comprehensive memory optimizations for performance:

1. **Optimized Component Storage** (`src/diff/components.rs`):
   - `Component` structure packed into exactly 8 bytes (down from 24-32 bytes)
   - 8 components fit perfectly in a 64-byte cache line

2. **Structure of Arrays (SoA)** (`src/diff/component_pool.rs`):
   - `ComponentPool` separates data by type for better cache locality
   - Counts, flags, and previous indices stored in separate arrays
   - Optimized bulk operations for path tracing

3. **Thread-Local Memory Pooling** (`src/diff/memory_pool.rs`):
   - `PooledDiff` implementation reuses memory allocations across diff operations
   - Thread-local storage eliminates allocation overhead
   - Automatic memory return to pool when diff operations complete

### Performance Features

1. **Zero-copy tokenization** - Tokens borrow data instead of copying
2. **Arena allocation** - Reuses memory between operations
3. **SIMD equality checks** - Uses vectorized instructions when available
4. **Prefix/suffix shortcuts** - Quickly handles common cases where strings share beginnings/endings

## Working with the Codebase

When implementing changes:

1. **Maintain exact API compatibility** with the original jsdiff library
2. **Ensure behavior matches** the expected output from tests
3. **Focus on performance** optimizations without changing behavior
4. **Run all tests** before submitting changes: `bun run build && bun test`
5. **Use Bun** for all testing and building operations

### Build Outputs

The build process creates several distribution formats:
- `dist/node/` - CommonJS modules for Node.js
- `dist/browser/` - Browser-compatible ES modules
- `dist/esm/` - ES modules for modern bundlers
- `pkg/` - Raw wasm-pack output for Node.js
- `pkg-web/` - Raw wasm-pack output for web

### API Surface

**Diff Functions:**
- `diffChars(oldStr, newStr, options?)` - Character by character
- `diffWords(oldStr, newStr, options?)` - Word level
- `diffWordsWithSpace(oldStr, newStr, options?)` - Word level including whitespace
- `diffLines(oldStr, newStr, options?)` - Line level
- `diffTrimmedLines(oldStr, newStr, options?)` - Line level with whitespace trimming
- `diffSentences(oldStr, newStr, options?)` - Sentence level
- `diffCss(oldStr, newStr, options?)` - CSS specific
- `diffJson(oldObj, newObj, options?)` - JSON objects

**Patch Functions:**
- `createPatch(fileName, oldStr, newStr, oldHeader?, newHeader?, options?)` - Create unified diff
- `createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader?, newHeader?, options?)` - Two-file patch
- `applyPatch(source, patch, options?)` - Apply a patch
- `applyPatches(patch, options)` - Apply multiple patches with callbacks
- `parsePatch(patchStr)` - Parse a patch string
- `reversePatch(patch)` - Reverse a patch
- `formatPatch(patch)` - Format patch object to string

**Line Ending Utilities:**
- `isUnix(patch)` - Check for Unix line endings
- `isWin(patch)` - Check for Windows line endings
- `unixToWin(patch)` - Convert to Windows line endings
- `winToUnix(patch)` - Convert to Unix line endings
