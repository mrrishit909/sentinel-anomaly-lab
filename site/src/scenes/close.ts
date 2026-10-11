/** S08 "The signal, found again": the echo of S00 with the visitor's last REPLAY settings. */
import type { Frame, Lit } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, clampFocus, lens, lerpBox, MT } from "./geometry";
import { layoutFor, telemetryStrands } from "./strands";
import { TELEMETRY, type DetId } from "../data/types";
import { flagRuns } from "../model/metrics";
import { litFor } from "./signal";
import { clamp, lerp, lerpLog } from "../lib/math";
import { easePremium, easeSmooth, easeSymmetric } from "../motion/ease";
import { windowed } from "../motion/progress";
import type { Incident } from "../data/types";
import type { WinData } from "./windows";
import { hasContributions } from "./replayFrame";

export const ECHO_AT = 0.7;
export const echo = { start: -1, armed: true };

export interface CloseView { win: WinData; det: DetId; thrQ: number; inc: Incident | null; fromRoot: Frame | null }

/** S08 frame. The lens grows to L0 in log space over p 0..0.35 and never falls below L0 radius at p 0.75. */
export function composeClose(c: Ctx, v: CloseView): { frame: Frame; nothing: boolean } {
  const { win } = v;
  const L = layoutFor(c, win.n, TELEMETRY.length);
  const from = box(c.cls, "L6", c.w, c.h), to = box(c.cls, "L0", c.w, c.h);
  const e = easeSymmetric(windowed(c.p, 0, 0.35));
  const bx = lerpBox(from, to, e);
  // the echo (stepped, once per down-crossing): unwrite 600 ms, write 1200 ms, refocus 800 ms, ignite 600 ms
  let t = Infinity;
  if (c.motion && echo.start >= 0) t = c.now - echo.start;
  const unwrite = t < 600 ? 1 - easePremium(clamp(t / 600)) : 1;
  const write = t === Infinity ? 1 : t < 600 ? 1 - easePremium(t / 600) : easePremium(clamp((t - 600) / 1200));
  const focus = t === Infinity ? 1 : easeSmooth(clamp((t - 1800) / 800));
  const g = (r: number) => (t === Infinity ? 1 : easeSmooth(clamp((t - 2600 - 120 * r) / 600)));
  void unwrite;
  const mt = lerpLog(MT[c.cls].L6, MT[c.cls].L0, e) * (t === Infinity ? 1 : lerp(0.34, 1, focus));
  const f = clampFocus(win.start + 160, win.n, bx.R, L.pxPerS, mt);
  let lit: Record<string, Lit[]> | undefined;
  let nothing = false;
  const q = win.scores[v.det];
  const runs = q ? flagRuns(q, v.thrQ) : [];
  nothing = runs.length === 0;
  if (hasContributions(v.det) && v.inc && q) lit = litFor(win, v.det as "pca" | "robust_z", v.thrQ, v.inc.attribution[v.det as "pca" | "robust_z"].top3, g);
  const strands = telemetryStrands(win, L, { ids: TELEMETRY, alpha: 0.3, ink: 0.85, lit });
  const frame: Frame = {
    w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(bx, mt, f, 0.065, 1, 2), strands, marks: [],
    glow: c.cls === "D" ? 3 : 2, writeX: write >= 1 ? undefined : L.x0 + (c.w - L.x0) * write,
    topBar: !hasContributions(v.det) && q ? runs.map(([a, b]) => ({ t0: a, t1: b })) : undefined,
  };
  return { frame, nothing };
}
