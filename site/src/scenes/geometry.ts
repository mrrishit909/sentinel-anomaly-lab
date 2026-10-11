/**
 * Lens geometry states (VISUAL_DESIGN 3.3). Fractions of the stage box derived from the D 1440x900, T 768x1024 and
 * M 390x844 tables; C (1024 to 1279) is a deliberate compact desktop composition with a smaller, lower lens. R is a fraction
 * of the stage height so a 1280x720 or 360x800 stage keeps the composition. Interpolation: centre linear, R and Mt in log space.
 */
import type { Cls } from "./viewport";
import { clamp, lerp, lerpLog } from "../lib/math";
import type { LensState } from "../lens/types";

export type LState = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
type Fr = [number, number, number]; // cx / w, cy / h, R / h
const T: Record<Cls, Record<LState, Fr>> = {
  D: { L0: [0.701, 0.5, 0.622], L1: [0.771, 0.522, 0.444], L2: [0.681, 0.511, 0.522], L3: [0.694, 0.522, 0.522], L4: [0.757, 0.578, 0.367], L5: [0.771, 0.6, 0.6], L6: [0.722, 0.533, 0.489], L7: [0.389, 0.522, 0.422] },
  C: { L0: [0.7, 0.5, 0.64], L1: [0.76, 0.54, 0.42], L2: [0.7, 0.56, 0.46], L3: [0.7, 0.56, 0.46], L4: [0.74, 0.6, 0.33], L5: [0.72, 0.6, 0.5], L6: [0.72, 0.56, 0.44], L7: [0.38, 0.56, 0.4] },
  T: { L0: [0.729, 0.508, 0.605], L1: [0.5, 0.742, 0.322], L2: [0.5, 0.605, 0.371], L3: [0.5, 0.605, 0.371], L4: [0.5, 0.684, 0.254], L5: [0.5, 0.645, 0.39], L6: [0.5, 0.625, 0.352], L7: [0.5, 0.39, 0.322] },
  M: { L0: [1.051, 0.391, 0.601], L1: [0.5, 0.758, 0.272], L2: [0.5, 0.545, 0.344], L3: [0.5, 0.545, 0.344], L4: [0.5, 0.664, 0.225], L5: [0.5, 0.45, 0.332], L6: [0.5, 0.498, 0.308], L7: [0.5, 0.391, 0.296] },
};
/** time magnification at rest per state (L0 is 3 on D and T, 6 on M; the visitor sets it in S03a) */
export const MT: Record<Cls, Record<LState, number>> = {
  D: { L0: 3, L1: 3, L2: 3, L3: 3, L4: 6, L5: 3, L6: 3, L7: 3 },
  C: { L0: 3, L1: 3, L2: 3, L3: 3, L4: 6, L5: 3, L6: 3, L7: 3 },
  T: { L0: 3, L1: 3, L2: 3, L3: 3, L4: 6, L5: 3, L6: 3, L7: 3 },
  M: { L0: 6, L1: 4, L2: 3, L3: 3, L4: 6, L5: 3, L6: 3, L7: 3 },
};

export interface Box { cx: number; cy: number; R: number }
export function box(cls: Cls, s: LState, w: number, h: number): Box {
  const [fx, fy, fr] = T[cls][s];
  return { cx: fx * w, cy: fy * h, R: fr * h };
}
export function lerpBox(a: Box, b: Box, t: number): Box {
  return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), R: lerpLog(a.R, b.R, t) };
}
export function lens(b: Box, Mt: number, f: number, glass = 0.065, ridge = 1, Ma = 2): LensState {
  return { cx: b.cx, cy: b.cy, R: b.R, Mt, Ma, f, glass, ridge };
}

/** Strand band (VISUAL_DESIGN 3.2): D y 96-804 of 900, T 120-900 of 1024, M 72-760 of 844. */
export function band(cls: Cls, h: number): [number, number] {
  const f = cls === "M" ? [0.085, 0.9] : cls === "T" ? [0.117, 0.879] : [0.107, 0.893];
  return [f[0]! * h, f[1]! * h];
}
/** Label rail: strands start to the right of it. */
export const RAIL: Record<Cls, number> = { D: 72, C: 64, T: 44, M: 38 };

/** The focus clamp: the visible span 2R / (pxPerS x Mt) stays inside [0, n). */
export function clampFocus(f: number, n: number, R: number, pxPerS: number, Mt: number) {
  const half = R / (pxPerS * Mt);
  return half * 2 >= n ? n / 2 : clamp(f, half, n - half);
}
