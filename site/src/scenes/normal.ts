/** S03a "Normal has a shape": lens travel along window 142, VIEW / ZOOM / CHANNEL. Composer and DOM readout share this math. */
import type { Frame, Lit, Tag } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, clampFocus, lens, lerpBox, MT, type Box } from "./geometry";
import { layoutFor, telemetryStrands } from "./strands";
import { TELEMETRY } from "../data/types";
import type { View } from "../state/scenes";
import { evalFile, incident } from "./data";
import { litFor } from "./signal";
import { clamp, lerp, lerpLog } from "../lib/math";
import { easeSymmetric } from "../motion/ease";
import { windowed } from "../motion/progress";
import { animTo } from "./anim";
import { freeY } from "./bus";
import type { WinData } from "./windows";

export const VIEW_STEPS = [0.2, 0.45];
export const stepView = (p: number): View => (p < VIEW_STEPS[0]! ? "raw" : p < VIEW_STEPS[1]! ? "expected" : "residual");
export const SPAN_AT = 0.7;
export const NOTE_AT = 0.45;

/** the focus second at scroll progress p, clamped so data always fills the lens chord */
export function focusAt(c: Ctx, win: WinData, p: number, mt: number, bx?: Box) {
  const L = layoutFor(c, win.n, TELEMETRY.length);
  const b = bx ?? box(c.cls, "L2", c.w, c.h);
  const raw = lerp(60, win.n - 60, windowed(p, 0.04, 0.92));
  return Math.round(clampFocus(raw, win.n, b.R, L.pxPerS, mt));
}

export interface NormalOpts {
  win: WinData; view: View; zoom: number; channel: string | null;
  /** 0..1 how much of the record is written (S03a entry re-write) */
  write?: number;
  alpha?: number;
  /** the focus second; defaults from progress */
  f?: number;
  /** show the labelled span */
  span?: boolean;
  box?: Box;
  /** lit residual spans by channel (default: PCA at its val-chosen best-event-F1 threshold) */
  lit?: Record<string, Lit[]> | null;
  /** where the white alert bar goes for detectors that rank no measurement */
  topBar?: { t0: number; t1: number }[];
}

export function composeNormal(c: Ctx, o: NormalOpts): Frame {
  const { win } = o;
  const L = layoutFor(c, win.n, TELEMETRY.length);
  const bx = o.box ?? box(c.cls, "L2", c.w, c.h);
  const mt = c.motion ? animTo("normal.mt", o.zoom, c.now, 600) : o.zoom;
  const f = o.f ?? focusAt(c, win, c.p, mt, bx);
  const ev = evalFile(), inc = incident(win.incidentId ?? 142);
  let lit: Record<string, Lit[]> | undefined = o.lit ?? undefined;
  const thr = ev?.detectors.pca.points.best_event_f1.threshold_q;
  if (o.lit === undefined && thr !== undefined && inc) lit = litFor(win, "pca", thr, inc.attribution.pca.top3, () => 1);
  const res = o.view === "residual";
  const strands = telemetryStrands(win, L, {
    ids: TELEMETRY, alpha: 0.3, ink: 0.85, series: res ? "res" : "z",
    expected: o.view === "expected" ? Object.fromEntries(TELEMETRY.map((id) => [id, [60, Infinity] as [number, number]])) : lit ? Object.fromEntries(Object.keys(lit).map((id) => [id, [60, Infinity] as [number, number]])) : null,
    lit, emphasis: o.channel,
  });
  const marks: Frame["marks"] = [];
  const tags: Tag[] = [];
  const yb = Math.min(L.ys[L.ys.length - 1]! + L.gap * 0.45, c.h - 118);
  if (o.span) {
    marks.push({ kind: "bar", t0: win.start, t1: Math.min(win.n, win.end), y: yb, h: 3, color: "#ffffff", alpha: 0.9 });
  }
  if (o.view !== "raw" && f - bx.R / (L.pxPerS * mt) < 60) {
    const flow = c.cls === "T" || c.cls === "M";
    const wy = flow ? freeY(bx.cy + bx.R * 0.62) : bx.cy + bx.R * 0.62;
    if (wy !== null) tags.push({ key: "warm", text: "WARMING UP: NO FULL 61 S MEDIAN YET", x: Math.max(bx.cx - bx.R * 0.55, L.x0 + 4), y: wy, tone: "mute" });
  }
  return {
    w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(bx, mt, f), strands, marks, tags,
    glow: c.cls === "M" || c.cls === "T" ? 2 : 3, alpha: o.alpha, topBar: o.topBar,
    writeX: o.write !== undefined && o.write < 1 ? L.x0 + (c.w - L.x0) * o.write : undefined,
  };
}

/** S03a camera: L2 held, written in over the first 6% of the track (S02 faded the old record out). */
export const normalBox = (c: Ctx): Box => box(c.cls, "L2", c.w, c.h);
export const normalWrite = (p: number) => easeSymmetric(clamp(p / 0.06));
export { lerpBox, lerpLog, MT };
