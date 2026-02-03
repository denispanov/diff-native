export function pickIndices(
  count: number,
  range: number,
  rng: () => number,
  skip?: Int32Array
): Int32Array {
  if (count === 0) return new Int32Array(0);
  const out = new Int32Array(count);

  if (count > range / 2) {
    const arr = Int32Array.from({ length: range }, (_, i) => i);
    fyShuffle(arr, rng);
    let j = 0;
    for (const idx of arr) {
      if (skip && binSearch(skip, idx)) continue;
      out[j++] = idx;
      if (j === count) break;
    }
  } else {
    const picks = new Set<number>();
    while (picks.size < count) {
      const idx = Math.floor(rng() * range);
      if (picks.has(idx) || (skip && binSearch(skip, idx))) continue;
      picks.add(idx);
    }
    let i = 0;
    for (const v of picks) out[i++] = v;
  }
  out.sort();
  return out;
}

export function fyShuffle(values: Int32Array, rng: () => number): void {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = values[i];
    values[i] = values[j];
    values[j] = t;
  }
}

export function binSearch(arr: Int32Array, needle: number): boolean {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = arr[mid];
    if (value === needle) return true;
    if (value < needle) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return false;
}
