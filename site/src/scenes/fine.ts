/** S06 "The fine print": the paint (point, point-adjusted, event) on window 153, then which measurements moved on window 142. */
import type { Frame, Lit, Mark, Tag } from "../lens/types";
import { ALARM } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, clampFocus, lens, MT } from "./geometry";
import { layoutFor } from "./strands";
import { evalFile } from "./data";
import { normQ, qFrac } from "./detectors";
import { flagRuns } from "../model/metrics";
import { Q_MAX } from "../model/quant";
import type { Protocol } from "../state/scenes";
import { animTo } from "./anim";
import type { WinData } from "./windows";

export const PROTO_STEPS = [0.12, 0.26, 0.4];
export const protoAt = (p: number): Protocol => (p < PROTO_STEPS[0]! ? "point" : p < PROTO_STEPS[1]! ? "point" : p < PROTO_STEPS[2]! ? "pa" : "event");
export const PART2_AT = 0.55;

/** Part 1: window 153, Isolation Forest at its val-chosen best-event-F1 threshold. */
export function composeFinePart1(c: Ctx, o: { win: WinData; protocol: Protocol }): Frame {
  const { win } = o;
  const ev = evalFile();
  const bx = box(c.cls, "L6", c.w, c.h);
  const mt = MT[c.cls].L6;
  const L = layoutFor(c, win.n, 2);
  const thr = ev?.detectors.iforest.points.best_event_f1.threshold_q ?? Q_MAX;
  const q = win.scores.iforest;
  const f = clampFocus(win.start + win.n * 0.18, win.n, bx.R, L.pxPerS, mt);
  const y = bx.cy + bx.R * 0.28;
  const amp = bx.R * 0.5;
  const runs = q ? flagRuns(q, thr) : [];
  const inSpan = runs.filter(([a, b]) => b > win.start && a < win.end);
  const lit: Lit[] = runs.map(([a, b]) => ({ t0: a, t1: b, k: 1 }));
  const target = o.protocol === "point" ? 0 : o.protocol === "pa" ? 1 : 2;
  const v = c.motion ? animTo("fine.paint", target, c.now, 600) : target;
  const marks: Mark[] = [];
  const tags: Tag[] = [];
  const yb = y + amp * 0.12 + 6;
  // the labelled span: hollow orange outline under the strand
  const seg0 = win.start, seg1 = Math.min(win.end, win.n);
  marks.push({ kind: "bar", t0: seg0, t1: seg1, y: yb, h: 14, color: ALARM, hollow: true, insideOnly: true });
  if (v > 0.01) {
    // the paint: orange floods outward from each flagged second to both ends of the span; then it collapses to one tick
    const flood = Math.min(1, v), collapse = Math.max(0, v - 1);
    for (const [a, b] of inSpan) {
      const l = seg0 + (Math.max(seg0, a) - seg0) * (1 - flood);
      const r = Math.min(seg1, b) + (seg1 - Math.min(seg1, b)) * flood;
      marks.push({ kind: "bar", t0: l, t1: seg0 + (r - seg0) * (1 - collapse) + 0.001, y: yb, h: 14, color: ALARM, alpha: 0.9, insideOnly: true });
    }
    if (collapse >= 0.98) marks.push({ kind: "tick", t: seg0 + 1, y: yb - 10, h: 34, w: 4, color: ALARM });
  }
  const strands = [{
    id: "iforest", text: "IF", y, vals: q ? normQ("iforest", q) : [0, 0], dt: 1, t0: 0, amp, alpha: 0.3, ink: 0.9, ridge: true, label: true,
    hairline: qFrac("iforest", thr), lit, litRef: qFrac("iforest", thr), labelLit: lit.length > 0,
  }];
  return { w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(bx, mt, f), strands, marks, tags, glow: 2 };
}
