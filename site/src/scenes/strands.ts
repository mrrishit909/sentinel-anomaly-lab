/** Strand construction: baselines, amplitudes and label rail from the stage box (VISUAL_DESIGN 3.2). */
import type { Strand, Lit } from "../lens/types";
import type { Ctx } from "./ctx";
import { band, RAIL } from "./geometry";
import type { WinData } from "./windows";

export interface Layout1 { x0: number; pxPerS: number; ys: number[]; gap: number; ampSD: number }
/** Outside time mapping and baselines for `count` strands. */
export function layoutFor(c: Ctx, n: number, count: number, pad = 14): Layout1 {
  const [top, bot] = band(c.cls, c.h);
  const gap = count > 1 ? (bot - top) / (count - 1) : 0;
  const x0 = RAIL[c.cls];
  return { x0, pxPerS: (c.w - x0 - pad) / n, ys: Array.from({ length: count }, (_, i) => top + gap * i), gap, ampSD: 0.075 * gap };
}

export interface TelOpts {
  ids: readonly string[];
  alpha?: number; ink?: number;
  /** level series by channel; default the window's z */
  series?: "z" | "res";
  expected?: Record<string, [number, number] | true> | null;
  lit?: Record<string, Lit[]>;
  emphasis?: string | null;
  context?: readonly string[];
}
/** The telemetry strands of a window. Context strands (dashed) are appended in REPLAY only. */
export function telemetryStrands(win: WinData, L: Layout1, o: TelOpts): Strand[] {
  const all = [...o.ids, ...(o.context ?? [])];
  const rows = all.length;
  const out: Strand[] = [];
  const gap = o.context?.length ? (L.ys[L.ys.length - 1]! - L.ys[0]!) / Math.max(1, rows - 1) : L.gap;
  const top = L.ys[0]!;
  all.forEach((id, i) => {
    const isCtx = i >= o.ids.length;
    const vals = o.series === "res" && !isCtx ? win.res[id]! : win.z[id]!;
    const lit = o.lit?.[id];
    const exp = o.expected?.[id];
    out.push({
      id, y: top + gap * i, vals, dt: 1, t0: 0, amp: 0.075 * gap,
      alpha: (o.alpha ?? 0.3) * (isCtx ? 1.07 : 1) * (o.emphasis && o.emphasis !== id ? 0.5 : 1) + (o.emphasis === id ? 0.7 : 0),
      ink: (o.ink ?? 0.85) * (isCtx ? 0.38 : 1) * (o.emphasis && o.emphasis !== id ? 0.5 : 1) + (o.emphasis === id ? 0.15 : 0),
      dashed: isCtx, ridge: !isCtx,
      expected: exp && o.series !== "res" ? win.exp[id] : null,
      expectedRange: Array.isArray(exp) ? exp : undefined,
      lit, litRef: lit ? (o.series === "res" ? 0 : win.exp[id]) : undefined,
      label: true, labelLit: !!lit?.length,
    });
  });
  return out;
}
