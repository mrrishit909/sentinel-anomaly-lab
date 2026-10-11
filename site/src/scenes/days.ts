/**
 * S04 "Fifty-eight days, two hundred faults": the pull-back from window 142 (seconds) to the whole record (10-minute
 * max-pool), split bands, 200 incident ticks and three stepped operating points. One global time axis in seconds;
 * the lens rides the strip. LOD: the 1 Hz layer crossfades out where one 600 s bin is at most one pixel wide.
 */
import type { Frame, Mark, Strand, Tag, Lit } from "../lens/types";
import { ALARM } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, lerpBox, MT, RAIL } from "./geometry";
import { layoutFor } from "./strands";
import { DETECTORS, type DetId, type OpId } from "../data/types";
import { alerts as alertsFile, evalFile, incident, meta as metaFile, type OverviewData } from "./data";
import { normQ, qFrac, CODE } from "./detectors";
import { lerp, lerpLog, clamp } from "../lib/math";
import { detectedAt } from "../model/sweep";
import { animTo } from "./anim";
import type { WinData } from "./windows";

export const DAYS_OP_STEPS = [0.6, 0.75, 0.9];
/** state 0 shows labelled spans only; 1..3 are the three operating points */
export const OPS_ORDER: OpId[] = ["best_point_f1", "best_event_f1", "far_budget_1_per_day"];
export const opAtDays = (p: number): OpId | null => {
  const s = DAYS_OP_STEPS.filter((t) => p >= t).length;
  return s === 0 ? null : OPS_ORDER[s - 1]!;
};
export const DAYS_TOTAL = 5_000_000;
export const BIN = 600;

let fineOn = true;

export interface DaysOpts {
  win: WinData; ov: OverviewData; det: DetId; op: OpId | null;
  u: number; bandsT: number; ticksT: number; all58: boolean;
  focusBin: number | null;
  alpha?: number;
}

export interface DaysGeom { x0: number; pxPerS: number; ys: number[]; gap: number; rowTick: number; rowBand: number; r0: number; r1: number; left: number; right: number }

export function daysGeometry(c: Ctx, win: WinData, all58: boolean): { end: DaysGeom; start: { x0: number; pxPerS: number; ys: number[]; gap: number } } {
  const fr = c.cls === "M" ? [0.5, 0.7] : c.cls === "T" ? [0.36, 0.62] : [0.34, 0.7];
  const top = fr[0]! * c.h, bot = Math.min(fr[1]! * c.h, c.h - (c.cls === "M" ? 272 : c.cls === "T" ? 280 : 290));
  const gap = (bot - top) / (DETECTORS.length - 1);
  const ys = DETECTORS.map((_, i) => top + gap * i);
  const left = c.cls === "D" || c.cls === "C" ? Math.max(RAIL[c.cls], 80) : RAIL[c.cls] + 4;
  const right = c.w - (c.cls === "M" ? 16 : c.cls === "T" ? 40 : 72);
  const testOnly = c.cls === "M" && !all58;
  const r0 = testOnly ? 3_750_000 : 0, r1 = DAYS_TOTAL;
  const b1 = (right - left) / (r1 - r0);
  const ta = win.row0 + win.n / 2;
  const s3 = layoutFor(c, win.n, DETECTORS.length);
  const bW = s3.pxPerS;
  const xA1 = left + (ta - r0) * b1;
  return {
    end: { x0: xA1 - ta * b1, pxPerS: b1, ys, gap, rowBand: bot + gap * 0.62, rowTick: bot + gap * 0.62 + 16, r0, r1, left, right },
    start: { x0: s3.x0 + win.n / 2 * bW - ta * bW, pxPerS: bW, ys: s3.ys, gap: s3.gap },
  };
}

export function composeDays(c: Ctx, o: DaysOpts): Frame {
  const { win, ov } = o;
  const g = daysGeometry(c, win, o.all58);
  const u = o.u;
  const b = lerpLog(g.start.pxPerS, g.end.pxPerS, u);
  const ta = win.row0 + win.n / 2;
  // x(t) = xa + (t - ta) * b with xa interpolated, so the window centre eases to its place in the full record
  const xa0 = g.start.x0 + ta * g.start.pxPerS, xa1 = g.end.x0 + ta * g.end.pxPerS;
  const xa = lerp(xa0, xa1, u);
  const x0 = xa - ta * b;
  const L0 = box(c.cls, "L3", c.w, c.h), L1 = box(c.cls, "L4", c.w, c.h);
  const bx = lerpBox(L0, L1, u);
  const Mt = lerpLog(MT[c.cls].L3, MT[c.cls].L4, u);
  const focusEnd = o.focusBin !== null ? o.focusBin * BIN + BIN / 2 : ta;
  const f0 = win.row0 + Math.min(win.start + 250, win.n / 2 + 200);
  const f = lerp(f0, focusEnd, u);
  // LOD with hysteresis +-5%
  const px = b * BIN;
  if (fineOn && px < 1 / 1.05) fineOn = false;
  else if (!fineOn && px > 1.05) fineOn = true;
  const fine = c.motion ? animTo("days.fine", fineOn ? 1 : 0, c.now, 200) : fineOn ? 1 : 0;
  const ev = evalFile();
  const strands: Strand[] = [];
  DETECTORS.forEach((d, i) => {
    const y = lerp(g.start.ys[i]!, g.end.ys[i]!, u);
    const gap = lerp(g.start.gap, g.end.gap, u);
    const amp = 0.45 * gap;
    const act = d === o.det;
    const aOut = 0.3 * (act ? 1 : 0.5), aIn = act ? 0.9 : 0.4;
    const thr = ev && o.op ? ev.detectors[d].points[o.op].threshold_q : ev ? ev.detectors[d].points.best_event_f1.threshold_q : undefined;
    const hv = act && thr !== undefined ? qFrac(d, thr) : undefined;
    // lit 10-minute bins in the lens for the active detector (exact: scores_q_max >= threshold_q)
    let lit: Lit[] | undefined;
    if (act && thr !== undefined && o.op && u > 0.5) {
      const q = ov.q[d];
      const fb = Math.floor(f / BIN), span = Math.ceil((bx.R / (b * Mt)) / BIN) + 2;
      lit = [];
      for (let k = Math.max(0, fb - span); k < Math.min(q.length, fb + span); k++) if (q[k]! >= thr) lit.push({ t0: k * BIN, t1: (k + 1) * BIN, k: 1 });
    }
    strands.push({
      id: d, text: CODE[d], y, vals: normQ(d, ov.q[d]), dt: BIN, t0: 0, amp, alpha: aOut, ink: aIn, ridge: u > 0.3, label: true,
      skip: fine > 0.02 ? [win.row0, win.row0 + win.n] : undefined,
      hairline: hv, lit, litRef: hv, labelLit: !!lit?.length,
    });
    const wq = win.scores[d];
    if (wq && fine > 0.01) {
      strands.push({ id: `${d}@w`, y, vals: normQ(d, wq), dt: 1, t0: win.row0, amp, alpha: aOut * fine, ink: aIn * fine, ridge: true });
    }
  });
  const marks: Mark[] = [];
  const tags: Tag[] = [];
  const m = metaFile();
  const bandsOn = o.bandsT > 0.01;
  if (m && bandsOn) {
    const sp = m.splits;
    const rows: [string, number, number, number][] = [["TRAIN", sp.train.lo, sp.train.hi, 0.12], ["GBM FIT", sp.gbm_fit.lo, sp.gbm_fit.hi, 0.2], ["VAL", sp.val.lo, sp.val.hi, 0.3], ["TEST", sp.test.lo, sp.test.hi, 0.42]];
    for (const [name, lo, hi, a] of rows) {
      // the bands grow left to right in time order
      const hiG = lo + (hi - lo) * clamp(o.bandsT * 4 - rows.findIndex((r) => r[0] === name));
      marks.push({ kind: "bar", t0: lo, t1: hiG, y: g.end.rowBand, h: 8, color: "#ffffff", alpha: a });
      const x0b = Math.max(g.end.left, x0 + lo * b), x1b = Math.min(g.end.right, x0 + hi * b);
      if (x1b - x0b > 34 && o.bandsT > 0.9) tags.push({ key: `band.${name}`, text: name, x: x0b + 4, y: g.end.rowBand + 11, tone: "mute" });
    }
  }
  // 200 incident ticks: caught (filled) or missed (outline) at the active operating point
  if (o.ticksT > 0.01 && u > 0.95) {
    const lastN = Math.floor(ov.ticks.length * clamp(o.ticksT));
    const w = c.cls === "M" ? 3 : 2;
    ov.ticks.slice(0, lastN).forEach((tk) => {
      const inc = incident(tk.id);
      const t = tk.bin * BIN + BIN / 2;
      let caught = true;
      if (o.op && inc) caught = inc.detection_by_op[o.op][o.det].detected;
      marks.push({ kind: "tick", t, y: g.end.rowTick, h: 22, w, color: ALARM, hollow: !caught, alpha: caught ? 1 : 0.95 });
    });
    // false alerts as white ticks above the active strand (alerts.json, or the lit-bin fallback for best_point_f1)
    if (o.op && ev) {
      const yA = g.end.ys[DETECTORS.indexOf(o.det)]! - 16;
      const a = alertsFile();
      const runs = a?.detectors[o.det]?.[o.op];
      if (runs) {
        for (const sp of ["val", "test"] as const) for (const [s0, , isF] of runs[sp] ?? []) if (isF) marks.push({ kind: "tick", t: s0, y: yA, h: 8, w: 1, color: "#ffffff", alpha: 0.9 * o.ticksT });
      } else {
        const q = ov.q[o.det], thr = ev.detectors[o.det].points[o.op].threshold_q;
        const sp = m?.splits;
        if (sp) for (let k = Math.floor(sp.val.lo / BIN); k < q.length; k++) if (q[k]! >= thr) marks.push({ kind: "tick", t: k * BIN + BIN / 2, y: yA, h: 8, w: 1, color: "#ffffff", alpha: 0.7 * o.ticksT });
      }
    }
  }
  if (fine < 0.99 && u > 0.05) {
    tags.push({ key: "maxpool", text: "MAX PER 10 MINUTES", x: g.end.right, y: g.end.rowTick + 28, align: "r", tone: "mute" });
  }
  return { w: c.w, h: c.h, tx: { x0, pxPerS: b }, lens: { cx: bx.cx, cy: bx.cy, R: bx.R, Mt, Ma: 2, f, glass: 0.065, ridge: 1 }, strands, marks, tags, glow: 2, alpha: o.alpha };
}

/** Caught / missed counts for the ledger tables, rebuilt from the published rise staircase at any threshold. */
export function caughtAt(det: DetId, thrQ: number, ids: number[]) {
  let n = 0;
  for (const id of ids) {
    const inc = incident(id);
    if (inc && detectedAt(inc.rise[det], thrQ).detected) n++;
  }
  return n;
}
