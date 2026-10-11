/** S03b "Five ways to be suspicious": five score strands of window 142, one hairline each at the active operating point. */
import type { Frame, Lit, Strand, Tag } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, clampFocus, lens, lerpBox, MT, band, RAIL } from "./geometry";
import { layoutFor } from "./strands";
import { DETECTORS, type DetId, type OpId } from "../data/types";
import { evalFile, sweep } from "./data";
import { freeY } from "./bus";
import { flagRuns } from "../model/metrics";
import { Q_MAX } from "../model/quant";
import { clamp } from "../lib/math";
import { stepState } from "../motion/progress";
import { animTo } from "./anim";
import type { WinData } from "./windows";

export const DET_STEPS = [0.1, 0.28, 0.46, 0.64, 0.82];
export const detAt = (p: number): DetId => DETECTORS[clamp(DET_STEPS.filter((t) => p >= t).length - 1, 0, 4)]!;
export { stepState };
export const CODE: Record<DetId, string> = { robust_z: "RZ", pca: "PCA", iforest: "IF", changepoint: "CP", gbm: "GBM" };

const series = new WeakMap<Uint16Array, Map<number, Float32Array>>();
/** The score floor of a detector's plots: its loosest sweep threshold (val 30th-percentile flagging). Scores below it plot at zero. */
export function qLo(det: DetId): number {
  const sw = sweep();
  return sw ? sw.detectors[det].thresholds_q[0]! : 0;
}
/** Score q mapped to 0..1 between the detector's floor and the top of the quantized range. */
export function normQ(det: DetId, q: Uint16Array): Float32Array {
  const lo = qLo(det);
  let m = series.get(q);
  if (!m) { m = new Map(); series.set(q, m); }
  let s = m.get(lo);
  if (!s) {
    s = new Float32Array(q.length);
    const span = Q_MAX - lo || 1;
    for (let i = 0; i < q.length; i++) { const v = (q[i]! - lo) / span; s[i] = v < 0 ? 0 : v; }
    m.set(lo, s);
  }
  return s;
}
/** A threshold in the same 0..1 height as normQ. */
export const qFrac = (det: DetId, thrQ: number) => clamp((thrQ - qLo(det)) / (Q_MAX - qLo(det) || 1), 0, 1);

export interface ScoreOpts {
  win: WinData; det: DetId; op: OpId | null;
  /** explicit threshold in q (S05 slider); overrides op */
  thrQ?: number;
  box?: ReturnType<typeof box>;
  mt?: number;
  f?: number;
  /** fade of the non-active strands (S03b 0.35) */
  dim?: number;
  span?: boolean;
  alpha?: number;
  /** which detectors to draw (default all five) */
  only?: DetId[];
  stateKey?: string;
  noAnim?: boolean;
  /** label of the active hairline (default CHOSEN ON VAL when an operating point is set) */
  hairlineText?: string;
}

/** 5 strands, hairlines, lit area of the active detector. */
export function composeScores(c: Ctx, o: ScoreOpts): Frame {
  const { win } = o;
  const ev = evalFile();
  const ids = o.only ?? [...DETECTORS];
  const L = layoutFor(c, win.n, ids.length);
  const bx = o.box ?? box(c.cls, "L3", c.w, c.h);
  const mt = o.mt ?? MT[c.cls].L3;
  const f = o.f ?? clampFocus(Math.min(win.start + 250, win.n / 2 + 200), win.n, bx.R, L.pxPerS, mt);
  const amp = 0.45 * L.gap;
  const key = o.stateKey ?? "sc";
  const strands: Strand[] = ids.map((d, i) => {
    const q = win.scores[d];
    const act = d === o.det;
    const a = c.motion && !o.noAnim ? animTo(`${key}.alpha.${d}`, act ? 1 : (o.dim ?? 0.35), c.now, 350) : act ? 1 : (o.dim ?? 0.35);
    const thr = act && o.thrQ !== undefined ? o.thrQ : ev && o.op ? ev.detectors[d].points[o.op].threshold_q : undefined;
    const hv = thr !== undefined ? qFrac(d, thr) : undefined;
    const lit: Lit[] | undefined = act && q && thr !== undefined ? flagRuns(q, thr).map(([s0, s1]) => ({ t0: s0, t1: s1, k: 1 })) : undefined;
    return {
      id: d, text: CODE[d], y: L.ys[i]!, vals: q ? normQ(d, q) : [0, 0], dt: 1, t0: 0, amp,
      alpha: 0.3 * (0.35 + 0.65 * a), ink: 0.28 + 0.62 * a, ridge: true, label: true, labelLit: !!lit?.length,
      hairline: hv, hairlineAlpha: 0.3 + 0.7 * a, lit, litRef: hv,
    };
  });
  const marks: Frame["marks"] = [];
  const tags: Tag[] = [];
  const yb = Math.min(L.ys[L.ys.length - 1]! + Math.min(L.gap * 0.3, 18), c.h - 116);
  const ai = ids.indexOf(o.det);
  const act = strands[ai];
  if (act && act.hairline !== undefined) {
    const yH = act.y - act.hairline * act.amp * 2;
    // the label rides the hairline at the lens's right edge, but never under the controls plate (phones and tablets)
    const flow = c.cls === "T" || c.cls === "M";
    const fy = flow ? freeY(yH - 15) : yH - 15;
    const ty = fy ?? 0;
    if (fy !== null) tags.push({ key: "hl", text: o.hairlineText ?? (o.op ? "CHOSEN ON VAL" : `Q ${o.thrQ}`), x: Math.min(bx.cx + bx.R * 0.78, c.w - 12), y: ty, align: "r", tone: "thresh" });
  }
  if (o.span !== false) {
    marks.push({ kind: "bar", t0: win.start, t1: Math.min(win.n, win.end), y: yb, h: 3, color: "#ffffff", alpha: 0.9 });
  }
  return { w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(bx, mt, f), strands, marks, tags, glow: c.cls === "D" ? 3 : 2, alpha: o.alpha };
}
export { band, RAIL, lerpBox };
