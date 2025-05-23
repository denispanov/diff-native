# diff-native

High-performance text diffing library built with Rust and WebAssembly. This library is a drop-in replacement for the popular [jsdiff](https://github.com/kpdecker/jsdiff) library, offering identical API with dramatically improved performance and reduced memory usage.

[![npm version](https://img.shields.io/npm/v/diff-native.svg)](https://www.npmjs.com/package/diff-native)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ⚡ **Blazing Fast**: 10-20x faster than JavaScript diffing libraries
- 💾 **Memory Efficient**: Up to 80% less memory usage
- 🔄 **Drop-in Replacement**: Identical API to the original [jsdiff](https://github.com/kpdecker/jsdiff) library
- 📝 **Text Diffing**: Compare strings at character, word, line, and sentence levels
- 🔍 **Patching**: Create, parse, and apply patches in unified diff format
- 🌐 **Universal**: Works in Node.js, Bun, and modern browsers
- 📦 **Small Footprint**: Optimized WASM binary for minimal bundle size
- 🦀 **Rust-Powered**: Built with Rust for maximum performance and safety

## Installation

```bash
# NPM
npm install diff-native

# Yarn
yarn add diff-native

# PNPM
pnpm add diff-native

# Bun
bun add diff-native
```

## Usage

### Node.js (CommonJS)

```javascript
const { diffChars, diffWords, diffLines } = require('diff-native');

// Basic character-level diff
const charChanges = diffChars('old string', 'new string');

// Word-level diff
const wordChanges = diffWords('old string with words', 'new string with words');

// Line-level diff
const lineChanges = diffLines('line one\nline two', 'line one\nmodified line\nline two');

// Each change has properties:
// - value: The text content
// - added: true if this is an addition
// - removed: true if this is a removal
// - count: Number of tokens in the change
```

### Bun or ESM

```javascript
import { diffChars, diffWords, diffLines } from 'diff-native';

// Use the same API as in the CommonJS example
const changes = diffChars('old string', 'new string');
```

### Browser via CDN

```html
<script type="module">
  import * as diff from 'https://cdn.jsdelivr.net/npm/diff-native/dist/browser/index.js';
  
  const changes = diff.diffChars('old string', 'new string');
  console.log(changes);
</script>
```

## API Overview

### Diff Methods

All diff methods follow the same basic pattern:

```javascript
diff(oldText, newText, options?)
```

- **diffChars**: Character by character diff
- **diffWords**: Word level diff
- **diffWordsWithSpace**: Word level diff including whitespace
- **diffLines**: Line level diff
- **diffTrimmedLines**: Line level diff with whitespace trimming
- **diffSentences**: Sentence level diff
- **diffCss**: CSS specific diff
- **diffJson**: JSON diff that handles objects

### Options

```javascript
// Example options
const options = {
  ignoreCase: true,        // Ignore case differences
  ignoreWhitespace: true,  // Ignore whitespace differences
  oneChangePerToken: false // Combine consecutive changes of the same type
};
```

### Patch Methods

```javascript
// Create a patch
const patch = createPatch('filename.txt', oldText, newText);

// Apply a patch
const patched = applyPatch(oldText, patch);

// Parse a patch
const parsed = parsePatch(patchString);
```

### Line Ending Utilities

```javascript
// Check line ending style
const isUnixEndings = isUnix(patchString);
const isWindowsEndings = isWin(patchString);

// Convert between line endings
const unixPatch = winToUnix(patchString);
const windowsPatch = unixToWin(patchString);
```

## Performance

`diff-native` dramatically outperforms other JavaScript diffing libraries:

- **10-20x faster** for text comparisons across all diff operations
- **Up to 80% less memory usage** compared to pure JavaScript implementations
- **Consistent performance gains** across Node.js, Bun, and browser environments
- **Optimized for all diff operations** - character, word, line, sentence, and JSON diffs all benefit

Performance benefits are most noticeable when processing larger documents or working with resource-constrained environments.

## Browser Compatibility

diff-native works in all modern browsers that support WebAssembly:

- Chrome 57+
- Firefox 53+
- Safari 11+
- Edge 16+

## Runtime Support

- **Node.js**: 14.0.0+
- **Bun**: All versions
- **Deno**: With npm compatibility mode

## Module Formats

This package provides multiple build formats:

- CommonJS for Node.js (default)
- ES Modules for bundlers and modern runtimes
- Browser-ready bundle

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/) (stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) 0.13.1+
- [Node.js](https://nodejs.org/) 16+ or [Bun](https://bun.sh/) (recommended)

### Building

```bash
# Install dependencies
bun install

# Build all targets (node, browser, and esm)
bun run build

# Build specific targets
bun run build:wasm:node   # Only build Node.js target
bun run build:wasm:web    # Only build Web target
```

### Testing

```bash
# Run all tests
bun test

# Run tests after building
bun run build && bun test

# Run tests in watch mode
bun test --watch

# Run Rust unit tests
bun run test:rust
# or
cargo test --lib

# Run WebAssembly integration tests
wasm-pack test --node
```

### Build Outputs

The build process creates several distribution formats:

- `dist/node/` - CommonJS modules for Node.js
- `dist/browser/` - Browser-compatible modules
- `dist/esm/` - ES modules for modern bundlers

### Code Quality

This project uses several tools to maintain code quality:

```bash
# Run ESLint to check code
bun run lint

# Fix ESLint issues automatically
bun run lint:fix

# Format code with Prettier
bun run format

# Check formatting without changing files
bun run format:check

# Run both linting and format checking
bun run check

# Fix all linting and formatting issues
bun run fix
```

Husky and lint-staged are configured to automatically check code quality before each commit.

### Issues and Feature Requests

If you encounter any bugs or have feature requests, please [file an issue](https://github.com/denispanov/diff-native/issues) on GitHub.

### Pull Requests

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

Make sure to:
1. Follow the code style guidelines
2. Add or update tests as necessary
3. Update documentation for any API changes
4. Maintain API compatibility with the original jsdiff library

## Versioning

This project follows [Semantic Versioning](https://semver.org/). The version numbers follow the pattern: MAJOR.MINOR.PATCH.

## License

[MIT](LICENSE)