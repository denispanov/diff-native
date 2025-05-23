/**
 * Type definitions for diff-native
 *
 * A high-performance text-diffing & patching library compiled from Rust to WebAssembly.
 *
 * @packageDocumentation
 */

declare module 'diff-native' {
  /**
   * Represents a change between two strings.
   * Used as the return type for all diff functions.
   *
   * For unchanged segments: both `added` and `removed` are false.
   * For additions: `added` is true, `removed` is false.
   * For deletions: `added` is false, `removed` is true.
   */
  export interface Change {
    /** The content of this change segment */
    value: string;
    /** True if this segment was added in the new string */
    added: boolean;
    /** True if this segment was removed from the old string */
    removed: boolean;
    /**
     * Number of tokens in this segment (may be omitted if not relevant).
     * For character diffs, this is the number of characters.
     * For word diffs, this is the number of words.
     * For line diffs, this is the number of lines.
     */
    count?: number;
  }

  /**
   * Common options for most diff algorithms.
   */
  export interface DiffOptions {
    /**
     * When true, character case is ignored when comparing strings.
     * @default false
     */
    ignoreCase?: boolean;
    /**
     * When true, returns a separate change object for each token.
     * When false (default), consecutive changes of the same type (add/remove) are merged.
     * @default false
     */
    oneChangePerToken?: boolean;
    /**
     * When true, whitespace is ignored when comparing strings.
     * @default false
     */
    ignoreWhitespace?: boolean;
  }

  /**
   * Options specific to line-based diff algorithms.
   */
  export interface DiffLinesOptions extends DiffOptions {
    /**
     * When true, each newline character is treated as a separate token.
     * When false (default), newlines are considered part of their line.
     * @default false
     */
    newlineIsToken?: boolean;
    /**
     * When true, trailing carriage returns (\r) are stripped before processing.
     * Useful for normalizing line endings between operating systems.
     * @default false
     */
    stripTrailingCr?: boolean;
  }

  /**
   * Options for JSON diffing.
   */
  export interface JsonOptions {
    /**
     * Value to use when serializing `undefined` values in JSON objects.
     *
     * By default, properties with `undefined` values are omitted from the JSON output
     * (following standard JSON.stringify behavior). This option allows you to replace
     * `undefined` with a specific value for comparison purposes.
     *
     * @example
     * // Without undefinedReplacement (default behavior):
     * // { a: 1, b: undefined } becomes { a: 1 }
     *
     * // With undefinedReplacement: null:
     * // { a: 1, b: undefined } becomes { a: 1, b: null }
     */
    undefinedReplacement?: any | null;
  }

  /**
   * Options for applying patches.
   */
  export interface ApplyOptions {
    /**
     * Automatically convert line endings (LF ↔ CRLF) when it's safe to do so.
     * @default true
     */
    autoConvertLineEndings?: boolean;
    /**
     * Maximum number of lines that may mismatch while still applying a hunk.
     * Higher values allow more fuzzy matching when applying patches.
     * @default 0
     */
    fuzzFactor?: number;
  }

  /**
   * Represents a single hunk in a unified diff patch.
   * A hunk is a contiguous section of changes in a diff.
   */
  export interface Hunk {
    /** Starting line number in the original file */
    oldStart: number;
    /** Number of lines from the original file in this hunk */
    oldLines: number;
    /** Starting line number in the new file */
    newStart: number;
    /** Number of lines from the new file in this hunk */
    newLines: number;
    /**
     * Array of lines in the hunk, including context.
     * Each line is prefixed with a character indicating its type:
     * ' ' for context lines, '-' for removals, '+' for additions
     */
    lines: string[];
  }

  /**
   * Represents a structured patch in unified diff format.
   * Contains all the information needed to apply or display a patch.
   */
  export interface StructuredPatch {
    /** Optional 'Index: filename' line from the patch header */
    index?: string;
    /** Original file name */
    oldFileName: string;
    /** New file name */
    newFileName: string;
    /** Optional header information for the old file */
    oldHeader: string;
    /** Optional header information for the new file */
    newHeader: string;
    /** Array of hunks containing the actual changes */
    hunks: Hunk[];
  }

  /**
   * Diffs two blocks of text, treating each word, punctuation mark, newline, or run of whitespace as a token.
   *
   * This differs from `diffWords` by treating whitespace as significant, including
   * treating each individual newline as a distinct token rather than merging it with
   * other surrounding whitespace.
   *
   * @param oldStr The original string.
   * @param newStr The new string to compare against.
   * @param options Optional configuration options.
   * @returns An array of change objects.
   */
  export function diffWordsWithSpace(
    oldStr: string,
    newStr: string,
    options?: DiffOptions
  ): Change[];

  /**
   * Diffs two blocks of text, treating each word and punctuation mark as a token.
   * Whitespace is considered when computing the diff, but whitespace-only changes
   * are handled intelligently to produce cleaner, more meaningful results.
   *
   * @param oldStr The original string.
   * @param newStr The new string to compare against.
   * @param options Optional configuration options.
   * @returns An array of change objects.
   */
  export function diffWords(oldStr: string, newStr: string, options?: DiffOptions): Change[];

  /**
   * Diffs two blocks of text, treating each Unicode character as a token.
   * This is the most granular diff, operating at the character level.
   *
   * @param oldStr The original string.
   * @param newStr The new string to compare against.
   * @param options Optional configuration options.
   * @returns An array of change objects.
   */
  export function diffChars(oldStr: string, newStr: string, options?: DiffOptions): Change[];

  /**
   * Diffs two blocks of text, treating each line as a token.
   * Lines are delimited by newline characters (\n or \r\n).
   *
   * @param oldStr The original multi-line string.
   * @param newStr The new multi-line string to compare against.
   * @param options Optional configuration options specific to line diffing.
   * @returns An array of change objects.
   */
  export function diffLines(oldStr: string, newStr: string, options?: DiffLinesOptions): Change[];

  /**
   * Diffs two blocks of text line by line, ignoring leading and trailing whitespace on each line.
   * This is useful for comparing text where indentation differences should be ignored.
   *
   * @param oldStr The original multi-line string.
   * @param newStr The new multi-line string to compare against.
   * @param options Optional configuration options specific to line diffing.
   * @returns An array of change objects.
   */
  export function diffTrimmedLines(
    oldStr: string,
    newStr: string,
    options?: DiffLinesOptions
  ): Change[];

  /**
   * Diffs two blocks of text, treating each sentence as a token.
   * Sentences are delimited by periods, question marks, and exclamation marks
   * followed by whitespace.
   *
   * @param oldStr The original string containing sentences.
   * @param newStr The new string containing sentences to compare against.
   * @param options Optional configuration options.
   * @returns An array of change objects.
   */
  export function diffSentences(oldStr: string, newStr: string, options?: DiffOptions): Change[];

  /**
   * Diffs two blocks of CSS text, with specialized handling for CSS tokens.
   * Recognizes CSS syntax including selectors, properties, and values.
   *
   * @param oldStr The original CSS string.
   * @param newStr The new CSS string to compare against.
   * @param options Optional configuration options.
   * @returns An array of change objects.
   */
  export function diffCss(oldStr: string, newStr: string, options?: DiffOptions): Change[];

  /**
   * Diffs two JSON-serializable objects by first serializing them to prettily-formatted JSON
   * and then treating each line of the JSON as a token.
   *
   * Object properties are sorted alphabetically in the serialized JSON to ensure consistent
   * comparison regardless of the order of properties in the input objects. This function
   * handles circular references and objects with custom toJSON methods.
   *
   * @param oldVal The original object to compare.
   * @param newVal The new object to compare against.
   * @param options Optional configuration options for JSON diffing.
   * @returns An array of change objects representing the differences between the JSON representations.
   */
  export function diffJson(oldVal: any, newVal: any, options?: JsonOptions | null): Change[];

  /**
   * Converts an array of change objects to an XML string.
   *
   * The XML format wraps added content in <ins> tags and removed content in <del> tags.
   * This is useful for displaying diffs in HTML with proper styling.
   *
   * @param changes Array of change objects to convert.
   * @returns An XML string representing the changes.
   */
  export function convertChangesToXML(changes: Change[]): string;

  /**
   * Parses a unified diff patch string into structured patch objects.
   *
   * @param text Unified diff patch string to parse.
   * @returns Array of structured patch objects.
   */
  export function parsePatch(text: string): StructuredPatch[];

  /**
   * Creates a unified diff patch string between two strings.
   *
   * Just like createTwoFilesPatch, but with oldFileName being equal to newFileName.
   *
   * @param fileName String to be output in the filename section of the patch.
   * @param oldStr Original string value.
   * @param newStr New string value.
   * @param oldHeader Optional additional information to include in the old file header.
   * @param newHeader Optional additional information to include in the new file header.
   * @param options Optional configuration options.
   * @param options.context Number of context lines to include (default: 4).
   * @returns A unified diff patch string.
   */
  export function createPatch(
    fileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: { context?: number }
  ): string;

  /**
   * Creates a unified diff patch string between two files.
   *
   * @param oldFile String to be output in the filename section of the patch for the removals.
   * @param newFile String to be output in the filename section of the patch for the additions.
   * @param oldStr Original string value.
   * @param newStr New string value.
   * @param oldHeader Optional additional information to include in the old file header.
   * @param newHeader Optional additional information to include in the new file header.
   * @param options Optional configuration options.
   * @param options.context Number of context lines to include (default: 4).
   * @returns A unified diff patch string.
   */
  export function createTwoFilesPatch(
    oldFile: string,
    newFile: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: { context?: number }
  ): string;

  /**
   * Creates a structured patch object representing the differences between two strings.
   *
   * This method is similar to createTwoFilesPatch, but returns a data structure
   * suitable for further processing instead of a formatted string.
   *
   * @param oldFile String to be output in the filename section of the patch for the removals.
   * @param newFile String to be output in the filename section of the patch for the additions.
   * @param oldStr Original string value.
   * @param newStr New string value.
   * @param oldHeader Optional additional information to include in the old file header.
   * @param newHeader Optional additional information to include in the new file header.
   * @param options Optional configuration options.
   * @param options.context Number of context lines to include (default: 4).
   * @returns A structured patch object.
   */
  export function structuredPatch(
    oldFile: string,
    newFile: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: { context?: number }
  ): StructuredPatch;

  /**
   * Formats a structured patch or array of patches into a unified diff string.
   * If given a string, returns it unchanged (useful for pipelines).
   *
   * @param patch A string, a single structured patch object, or an array of patches.
   * @returns A formatted unified diff string.
   */
  export function formatPatch(patch: string | StructuredPatch | StructuredPatch[]): string;

  /**
   * Applies a unified diff patch to a string.
   *
   * @param source Original string to apply the patch to.
   * @param patch Patch to apply - can be a string, a structured patch object, or an array of patch objects.
   * @param options Optional configuration options for patch application.
   * @returns The patched string, or false if the patch could not be applied.
   */
  export function applyPatch(
    source: string,
    patch: string | StructuredPatch | StructuredPatch[],
    options?: ApplyOptions
  ): string | false;

  /**
   * Applies patches to multiple files with callbacks for loading and saving.
   * This is designed for use in environments like Node.js where file operations are asynchronous.
   *
   * @param patch Patch data - can be a string or an array of structured patch objects.
   * @param handlers Object containing callback functions for file operations.
   * @param handlers.loadFile Function called to load the content of a file.
   * @param handlers.patched Function called after a file has been successfully patched.
   * @param handlers.complete Function called when all patches have been applied.
   */
  export function applyPatches(
    patch: string | StructuredPatch[],
    handlers: {
      loadFile(index: StructuredPatch, callback: (err?: Error, contents?: string) => void): void;
      patched(index: StructuredPatch, content: string, callback: (err?: Error) => void): void;
      complete(err?: Error): void;
    }
  ): void;

  /**
   * Reverses a patch - turning additions into removals and vice versa.
   * This effectively creates a patch that undoes the original patch.
   *
   * When given an array of patches, the patches are reversed both individually
   * and in order (the array is reversed).
   *
   * @param patch Structured patch object or array of patch objects to reverse.
   * @returns The reversed patch in the same format as the input.
   */
  export function reversePatch(
    patch: StructuredPatch | StructuredPatch[]
  ): StructuredPatch | StructuredPatch[];

  /**
   * Checks if a patch uses Unix-style line endings (LF).
   *
   * @param patch Patch to check - can be a string, a structured patch object, or an array of patch objects.
   * @returns True if the patch uses Unix-style line endings.
   */
  export function isUnix(patch: string | StructuredPatch | StructuredPatch[]): boolean;

  /**
   * Checks if a patch uses Windows-style line endings (CRLF).
   *
   * @param patch Patch to check - can be a string, a structured patch object, or an array of patch objects.
   * @returns True if the patch uses Windows-style line endings.
   */
  export function isWin(patch: string | StructuredPatch | StructuredPatch[]): boolean;

  /**
   * Converts a patch from Unix-style line endings (LF) to Windows-style (CRLF).
   *
   * @param patch Patch to convert - can be a string, a structured patch object, or an array of patch objects.
   * @returns The converted patch in the same format as the input.
   */
  export function unixToWin(
    patch: string | StructuredPatch | StructuredPatch[]
  ): string | StructuredPatch | StructuredPatch[];

  /**
   * Converts a patch from Windows-style line endings (CRLF) to Unix-style (LF).
   *
   * @param patch Patch to convert - can be a string, a structured patch object, or an array of patch objects.
   * @returns The converted patch in the same format as the input.
   */
  export function winToUnix(
    patch: string | StructuredPatch | StructuredPatch[]
  ): string | StructuredPatch | StructuredPatch[];

  /**
   * Utility object for working with line-level diffs.
   */
  export const lineDiff: {
    /**
     * Tokenizes a string into an array of line tokens.
     * Lines are split on newline characters (\n or \r\n).
     * This can be useful for custom implementations or for debugging.
     *
     * @param text The text to tokenize.
     * @returns An array of line tokens.
     */
    tokenize(text: string): string[];
  };

  /**
   * Utility object for working with word-level diffs.
   */
  export const wordDiff: {
    /**
     * Tokenizes a string into an array of word tokens.
     * Words are identified using word boundaries, treating punctuation
     * and whitespace as separate tokens.
     * This can be useful for custom implementations or for debugging.
     *
     * @param text The text to tokenize.
     * @returns An array of word tokens.
     */
    tokenize(text: string): string[];
  };

  /**
   * Utility object for working with sentence-level diffs.
   */
  export const sentenceDiff: {
    /**
     * Tokenizes a string into an array of sentence tokens.
     * Sentences are delimited by periods, question marks, and exclamation marks
     * followed by whitespace.
     * This can be useful for custom implementations or for debugging.
     *
     * @param text The text to tokenize.
     * @returns An array of sentence tokens.
     */
    tokenize(text: string): string[];
  };

  /**
   * Canonicalizes an object for consistent JSON diffing.
   *
   * This function handles:
   * - Sorting object keys alphabetically for deterministic output
   * - Handling circular references by replacing them with "[Circular]"
   * - Converting objects with toJSON methods properly
   * - Preserving arrays and primitive values
   *
   * This is used internally by `diffJson` but can also be used standalone
   * for preprocessing objects before comparison.
   *
   * @param val The value to canonicalize.
   * @returns A canonicalized version of the input value suitable for JSON serialization.
   */
  export function canonicalize(val: any): any;

  /**
   * Debug utilities for development environments.
   * These utilities help with debugging WebAssembly-related issues.
   */
  export interface DebugUtils {
    /**
     * Initialize better error reporting for Rust panics in WebAssembly.
     *
     * This is only useful in development environments. When enabled, Rust panics
     * will show detailed error messages and stack traces in the browser console
     * instead of generic "RuntimeError: Unreachable executed" messages.
     *
     * Should be called once during application initialization in development.
     * Has no effect and minimal overhead in production builds.
     *
     * @returns True if the panic hook was successfully enabled, false otherwise.
     */
    enablePanicReporting(): boolean;
  }

  /**
   * Debug utilities for development environments.
   * Contains helpers for debugging WebAssembly and Rust-related issues.
   */
  export const debug: DebugUtils;

  /**
   * @deprecated Use debug.enablePanicReporting() instead
   * Sets a panic hook to route Rust panics to the console.
   */
  export function set_panic_hook(): void;
}
