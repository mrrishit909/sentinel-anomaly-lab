/**
 * REPLAY: the lens follows a playhead over one incident window (an in-flow figure with its own canvas). The recomputation
 * for the ledgers lives in the component; this composes the frame from the same store.
 */
import type { Frame, Lit, Mark, Tag } from "../lens/types";
import { ALARM } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, clampFocus, lens, MT } from "./geometry";
import { layoutFor, telemetryStrands } from "./strands";
import { CONTEXT, TELEMETRY, type DetId } from "../data/types";
import { evaluate, flagRuns } from "../model/metrics";
import { litFor } from "./signal";
import type { WinData } from "./windows";
import type { Incident } from "../data/types";
import type { replay as ReplayStore } from "../state/scenes";

export type ReplayState = ReturnType<typeof ReplayStore.get>;

export function hasContributions(det: DetId) { return det === "pca" || det === "robust_z"; }

export interface ReplayView {
  win: WinData; thrQ: number; det: DetId; inc: Incident | null;
  st: ReplayState;
}
export function composeReplay(c: Ctx, v: ReplayView): Frame {
  const { win, st, thrQ, det } = v;
  const ids = TELEMETRY;
  const ctxIds = st.context ? CONTEXT : [];
  const L = layoutFor(c, win.n, ids.length + ctxIds.length);
  const bx = box(c.cls, "L7", c.w, c.h);
  const mt = MT[c.cls].L7;
  const f = clampFocus(st.playhead, win.n, bx.R, L.pxPerS, mt);
  const q = win.scores[det];
  const runs = q ? flagRuns(q, thrQ) : [];
  let lit: Record<string, Lit[]> | undefined;
  const useRank = hasContributions(det) && st.attribution === det && v.inc;
  if (useRank && q && v.inc) lit = litFor(win, det as "pca" | "robust_z", thrQ, v.inc.attribution[det as "pca" | "robust_z"].top3, () => 1);
  const strands = telemetryStrands(win, L, { ids, alpha: 0.3, ink: 0.85, lit, emphasis: st.inspected, context: ctxIds });
  const marks: Mark[] = [];
  const tags: Tag[] = [];
  const yb = Math.min(L.ys[0]! + L.gap * (ids.length + ctxIds.length - 1 + 0.45), c.h - 8);
  marks.push({ kind: "bar", t0: win.start, t1: Math.min(win.n, win.end), y: yb, h: 3, color: "#ffffff", alpha: 0.9 });
  // playhead
  marks.push({ kind: "vline", t: st.playhead, y0: L.ys[0]! - 14, y1: yb + 6, color: "#ffffff", alpha: 0.9, w: 1 });
  if (q) {
    const m = evaluate(q, win.labels, thrQ);
    let shown = 0;
    m.alertRuns.forEach((r) => {
      if (r.start > st.playhead) return;
      marks.push({ kind: "square", t: r.start, y: L.ys[0]! - 2, s: 8, color: r.isFalse ? "#ffffff" : ALARM });
      if (shown < 4 && (m.segments[0] && r.start >= win.start && r.start < win.end && !r.isFalse ? m.segments[0].delay >= 0 : false)) {
        tags.push({ key: `al${r.start}`, text: `ALERT AFTER ${r.start - win.start} S`, x: L.x0 + r.start * L.pxPerS + 8, y: L.ys[0]! - 22, tone: "alarm" });
        shown++;
      } else if (r.isFalse && shown < 4) {
        tags.push({ key: `fa${r.start}`, text: "FALSE ALERT", x: L.x0 + r.start * L.pxPerS + 8, y: L.ys[0]! - 22 - (shown % 2) * 14, tone: "ink" });
        shown++;
      }
    });
  }
  return {
    w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(bx, mt, f), strands, marks, tags,
    glow: 2, topBar: !hasContributions(det) ? runs.map(([a, b]) => ({ t0: a, t1: b })) : undefined,
  };
}
