export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Log-space interpolation (radius and magnification camera moves, MOTION_SYSTEM 4). */
export const lerpLog = (a: number, b: number, t: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t);
export const median = (xs: ArrayLike<number>) => {
  const a = Array.from(xs).sort((x, y) => x - y);
  const m = a.length;
  return m ? (m % 2 ? a[(m - 1) / 2]! : (a[m / 2 - 1]! + a[m / 2]!) / 2) : NaN;
};
/** requestIdleCallback where it exists (not Safari), else a macrotask. */
export const idle = (fn: () => void, timeout = 1000) =>
  typeof window !== "undefined" && "requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout }) : setTimeout(fn, 0);
