/** S05 "Move the line": the threshold lab. Every split number is a lookup at a real sweep index; window numbers are recomputed. */
import type { Frame } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, MT } from "./geometry";
import { composeScores } from "./detectors";
import type { DetId, SplitId } from "../data/types";
import { incident, meta as metaFile, type OverviewData } from "./data";
import { detectedAt } from "../model/sweep";
import { BIN } from "./days";
import { slots } from "./bus";
import { layoutFor } from "./strands";
import { DETECTORS } from "../data/types";
import { Q_MAX } from "../model/quant";
import { qFrac, qLo } from "./detectors";
import type { WinData } from "./windows";

export const LAB_TOUR_END = 0.3;

export function stripRect(c: Ctx) {
  if (c.cls === "D" || c.cls === "C") {
    const x = Math.round(c.w * 0.41);
    return { x, y: c.h - (c.cls === "D" ? 138 : 128), w: c.w - x - 40, h: 44 };
  }
  if (c.cls === "T") return { x: 48, y: c.h - 176, w: c.w - 96, h: 44 };
  return { x: 36, y: Math.round(c.h * 0.7), w: c.w - 52, h: 38 };
}

export function labSplitBins(ov: OverviewData, split: SplitId) {
  const m = metaFile();
  const sp = m?.splits[split];
  if (!sp) return { lo: 0, hi: 0, bins: ov.q.pca.subarray(0, 0) };
  return { lo: sp.lo, hi: sp.hi, bins: (d: DetId) => ov.q[d].subarray(Math.floor(sp.lo / BIN), Math.floor(sp.hi / BIN)) };
}

export function composeLab(c: Ctx, o: { win: WinData; ov: OverviewData | null; det: DetId; thrQ: number; split: SplitId }): Frame {
  const bx = box(c.cls, "L5", c.w, c.h);
  const fr = composeScores(c, { win: o.win, det: o.det, op: null, thrQ: o.thrQ, box: bx, mt: MT[c.cls].L5, stateKey: "lab" });
  const m = metaFile();
  if (o.ov && m) {
    const sp = m.splits[o.split];
    const bins = o.ov.q[o.det].subarray(Math.floor(sp.lo / BIN), Math.floor(sp.hi / BIN));
    const spans: { b0: number; b1: number; caught: boolean }[] = [];
    for (const tk of o.ov.ticks) {
      const inc = incident(tk.id);
      if (!inc || inc.split !== o.split) continue;
      const b0 = Math.floor((inc.start - sp.lo) / BIN);
      const b1 = Math.max(b0 + 1, Math.ceil((inc.end - sp.lo) / BIN));
      spans.push({ b0, b1, caught: detectedAt(inc.rise[o.det], o.thrQ).detected });
    }
    const r = slots.strip && slots.strip.w > 20 ? slots.strip : stripRect(c);
    fr.strip = { ...r, bins, thr: o.thrQ, spans, alpha: 1 };
  }
  return fr;
}

/** Where the active detector's hairline sits (px) and the px-per-q scale, for the 44 px drag zone. */
export function labHairline(c: Ctx, win: WinData, det: DetId, thrQ: number) {
  const L = layoutFor(c, win.n, DETECTORS.length);
  const i = DETECTORS.indexOf(det);
  const bx = box(c.cls, "L5", c.w, c.h);
  const amp = 0.45 * L.gap * 2;
  const yBase = L.ys[i]!;
  return { y: yBase - qFrac(det, thrQ) * amp, yBase, amp, lo: qLo(det), top: Q_MAX, x0: Math.max(0, bx.cx - bx.R), x1: Math.min(c.w, bx.cx + bx.R) };
}
