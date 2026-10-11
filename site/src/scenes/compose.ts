/** Composer dispatch for the pinned scenes after S02: scene id + progress + visitor state + loaded artifacts -> Frame. */
import type { Frame } from "../lens/types";
import type { Ctx } from "./ctx";
import { alerts, evalFile, incident, overview, sweep, winById, heroWin } from "./data";
import { detectors, days, fine, lab, normal, replay } from "../state/scenes";
import { box, lens, MT } from "./geometry";
import { composeNormal, normalWrite, SPAN_AT, stepView } from "./normal";
import { composeScores, detAt, DET_STEPS } from "./detectors";
import { composeDays, opAtDays } from "./days";
import { composeLab } from "./lab";
import { composeFinePart1, protoAt, PART2_AT } from "./fine";
import { composeClose, echo, ECHO_AT } from "./close";
import { layoutFor, telemetryStrands } from "./strands";
import { TELEMETRY, type DetId } from "../data/types";
import { clamp } from "../lib/math";
import { easeSymmetric } from "../motion/ease";
import { windowed } from "../motion/progress";
import { litFor } from "./signal";
import { once } from "./anim";
import { Q_MAX } from "../model/quant";
import { hasContributions } from "./replayFrame";

/** Crossfade two frames: strands of `a` fade as `b`'s rise (never a point-wise morph, MOTION_SYSTEM rule 4). */
export function mix(a: Frame, b: Frame, t: number): Frame {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    ...b,
    strands: [
      ...a.strands.map((s) => ({ ...s, alpha: s.alpha * (1 - t), ink: s.ink * (1 - t), label: false, lit: s.lit?.map((l) => ({ ...l, k: l.k * (1 - t) })) })),
      ...b.strands.map((s) => ({ ...s, alpha: s.alpha * t, ink: s.ink * t, lit: s.lit?.map((l) => ({ ...l, k: l.k * t })) })),
    ],
    marks: t < 0.5 ? a.marks : b.marks,
    tags: t < 0.5 ? a.tags : b.tags,
  };
}

/** The honest initial state of a scene whose data has not arrived: strand baselines at 10%, the lens glass, nothing else. */
export function baselineFrame(c: Ctx, stateName: "L1" | "L2" | "L3" | "L4" | "L5" | "L6" = "L3", n = 2600, count: number = TELEMETRY.length): Frame {
  const L = layoutFor(c, n, count);
  const b = box(c.cls, stateName, c.w, c.h);
  const ids = count === TELEMETRY.length ? [...TELEMETRY] : Array.from({ length: count }, (_, i) => String(i));
  return {
    w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(b, MT[c.cls][stateName], n / 2, 0.065, 0.4),
    strands: ids.map((id, i) => ({ id, y: L.ys[i]!, vals: [0, 0], dt: n, t0: 0, amp: 1, alpha: 0.1, ink: 0.1, ridge: false, label: count === TELEMETRY.length })),
    marks: [], glow: 0,
  };
}

export function composeScene(id: string, c: Ctx): Frame | null {
  const win142 = winById("142");
  switch (id) {
    case "normal": {
      if (!win142) return baselineFrame(c, "L2");
      const st = normal.get();
      const view = st.view ?? stepView(c.p);
      const base = composeNormal(c, { win: win142, view, zoom: st.zoom, channel: st.channel, write: normalWrite(c.p), span: c.p >= SPAN_AT });
      // p .92 to 1: the telemetry strands hand over to the five score strands (crossfade, then S03b)
      const t = easeSymmetric(windowed(c.p, 0.92, 1));
      if (t > 0) return mix(base, composeScores(c, { win: win142, det: detAt(0), op: "best_event_f1", stateKey: "sc" }), t);
      return base;
    }
    case "detectors": {
      if (!win142) return baselineFrame(c, "L3", 2600, 5);
      const st = detectors.get();
      const det = st.det ?? detAt(c.p);
      const base = composeScores(c, { win: win142, det, op: st.op, stateKey: "sc" });
      // p .94 to 1: the lens begins the pull-back (the S04 camera takes over at its p 0)
      return base;
    }
    case "days": {
      const ov = overview();
      if (!win142 || !ov) return baselineFrame(c, "L4", 2600, 5);
      const st = days.get();
      const u = c.motion ? easeSymmetric(windowed(c.p, 0, 0.4)) : 1;
      const bandsT = c.motion ? windowed(c.p, 0.4, 0.55) : 1;
      const op = st.op ?? (c.motion ? opAtDays(c.p) : "best_event_f1");
      return composeDays(c, { win: win142, ov, det: st.det, op, u, bandsT, ticksT: bandsT, all58: st.all58, focusBin: st.focusBin });
    }
    case "lab": {
      const st = lab.get();
      const sw = sweep(), ev = evalFile();
      const w = winById(st.windowId) ?? win142;
      if (!w || !sw || !ev) return baselineFrame(c, "L5", 2600, 5);
      const thr = labThreshold(st, c.p);
      const fr = composeLab(c, { win: w, ov: overview(), det: st.det, thrQ: thr, split: st.split });
      const wt = once(`lab.write.${w.id}`, c.now, 700, c.motion);
      if (wt < 1) {
        const lx = fr.tx.x0 + (c.w - fr.tx.x0) * wt;
        fr.writeX = lx;
      }
      return fr;
    }
    case "fine": {
      const st = fine.get();
      const w153 = winById("153");
      const protocol = st.protocol ?? protoAt(c.p);
      const part1 = w153 ? composeFinePart1(c, { win: w153, protocol }) : baselineFrame(c, "L6", 1300, 2);
      if (!win142) return part1;
      const part2 = composePart2(c, win142, st.attribution);
      return mix(part1, part2, easeSymmetric(windowed(c.p, PART2_AT - 0.05, PART2_AT + 0.05)));
    }
    case "evidence": {
      const hero = heroWin();
      if (!hero) return null;
      const L = layoutFor(c, 1200, TELEMETRY.length);
      const b = box(c.cls, "L1", c.w, c.h);
      return {
        w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(b, MT[c.cls].L1, 460),
        strands: telemetryStrands(hero, L, { ids: TELEMETRY, alpha: 0.3, ink: 0.85 }).map((s) => ({ ...s, label: false })), marks: [], glow: 0, alpha: 0.15,
      };
    }
    case "close": {
      const rp = replay.get();
      const w = rp.touched ? winById(String(rp.incidentId)) : null;
      const win = w ?? win142 ?? heroWin();
      if (!win) return null;
      const ev = evalFile();
      const det: DetId = w ? rp.det : "pca";
      const thrQ = w ? replayThreshold(rp.det, rp.op, rp.index) : ev?.detectors.pca.points.best_event_f1.threshold_q ?? Q_MAX;
      const inc = incident(w ? rp.incidentId : 142);
      // the echo is stepped: once per down-crossing of p 0.70; re-armed when p falls below 0.35
      if (c.motion) {
        if (c.p >= ECHO_AT && echo.armed) { echo.armed = false; echo.start = c.now; }
        else if (c.p < 0.35) { echo.armed = true; echo.start = -1; }
      }
      return composeClose(c, { win, det, thrQ, inc, fromRoot: null }).frame;
    }
    default:
      return null;
  }
}

/** S05 slider threshold: the tour scrubs a real index over p 0..0.3, then the visitor (or BEST EVENT F1) owns it. */
export function labThreshold(st: ReturnType<typeof lab.get>, p: number): number {
  const sw = sweep(), ev = evalFile();
  if (!sw || !ev) return 0;
  const t = sw.detectors[st.det].thresholds_q;
  const i = labIndex(st, p);
  return t[i]!;
}
export function labIndex(st: ReturnType<typeof lab.get>, p: number): number {
  const sw = sweep(), ev = evalFile();
  if (!sw || !ev) return 0;
  const t = sw.detectors[st.det].thresholds_q;
  const best = nearest(t, ev.detectors[st.det].points.best_event_f1.threshold_q);
  if (st.index !== null) return clamp(st.index, 0, t.length - 1);
  if (st.touched || p >= 0.3) return best;
  const u = p / 0.3;
  // strictest -> loosest over the first half, then back to BEST EVENT F1 (every frame is a real step)
  return Math.round(u < 0.5 ? (t.length - 1) * (1 - u * 2) : best * (u - 0.5) * 2);
}
const nearest = (t: number[], q: number) => { let b = 0; for (let i = 1; i < t.length; i++) if (Math.abs(t[i]! - q) < Math.abs(t[b]! - q)) b = i; return b; };

export function replayThreshold(det: DetId, op: string, index: number | null): number {
  const sw = sweep(), ev = evalFile();
  if (!sw || !ev) return Q_MAX;
  const t = sw.detectors[det].thresholds_q;
  if (index !== null) return t[clamp(index, 0, t.length - 1)]!;
  return ev.detectors[det].points[op as "best_event_f1"].threshold_q;
}

function composePart2(c: Ctx, win: NonNullable<ReturnType<typeof winById>>, method: "pca" | "robust_z"): Frame {
  const ev = evalFile(), inc = incident(142);
  const thr = ev?.detectors[method].points.best_event_f1.threshold_q;
  const lit = thr !== undefined && inc && hasContributions(method) ? litFor(win, method, thr, inc.attribution[method].top3, () => 1) : undefined;
  return composeNormal(c, { win, view: "raw", zoom: 3, channel: null, box: box(c.cls, "L6", c.w, c.h), lit: lit ?? null, span: false });
}
export { alerts, DET_STEPS };
