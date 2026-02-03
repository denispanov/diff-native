export function validateDiff(jsOut: unknown, wasmOut: unknown): void {
  if (!deepEqualDiff(jsOut, wasmOut)) {
    throw new Error('Diff output mismatch between jsdiff and diff-native');
  }
}

export function validatePatch(jsOut: unknown, wasmOut: unknown): void {
  if (typeof jsOut !== 'string' || typeof wasmOut !== 'string') {
    throw new Error('Patch output was not a string');
  }
  if (jsOut !== wasmOut) {
    throw new Error('Patch output mismatch between jsdiff and diff-native');
  }
}

function deepEqualDiff(a: unknown, b: unknown): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;

  type DiffChange = {
    value: string;
    added?: boolean;
    removed?: boolean;
    count?: number;
  };

  for (let i = 0; i < a.length; i++) {
    const left = a[i] as DiffChange;
    const right = b[i] as DiffChange;
    if (!left || !right) return false;
    if (left.value !== right.value) return false;
    if (!!left.added !== !!right.added) return false;
    if (!!left.removed !== !!right.removed) return false;
    const lCount = left.count ?? null;
    const rCount = right.count ?? null;
    if (lCount !== rCount) return false;
  }
  return true;
}
