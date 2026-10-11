/**
 * Expected path and robust residual (DR-1, METHODOLOGY "Features"): the trailing median of the last 61 values
 * (fewer at the start, min_samples = 1, the mean of the two middle values for an even count), and the
 * robust z = |x - median| / resid_scale. Computed on the published, 16-bit quantized window.
 */
export function trailingMedian(x: ArrayLike<number>, w = 61): Float64Array {
  const n = x.length;
  const out = new Float64Array(n);
  const win: number[] = []; // sorted
  const insert = (v: number) => {
    let lo = 0, hi = win.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (win[m]! < v) lo = m + 1; else hi = m; }
    win.splice(lo, 0, v);
  };
  const remove = (v: number) => {
    let lo = 0, hi = win.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (win[m]! < v) lo = m + 1; else hi = m; }
    win.splice(lo, 1);
  };
  for (let i = 0; i < n; i++) {
    insert(x[i]!);
    if (i >= w) remove(x[i - w]!);
    const m = win.length;
    out[i] = m % 2 ? win[(m - 1) / 2]! : (win[m / 2 - 1]! + win[m / 2]!) / 2;
  }
  return out;
}

export function robustZ(x: ArrayLike<number>, med: ArrayLike<number>, scale: number): Float64Array {
  const out = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = Math.abs(x[i]! - med[i]!) / scale;
  return out;
}
