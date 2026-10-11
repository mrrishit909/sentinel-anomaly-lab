/**
 * S00 "The Focus" and S01 (scrubbed lens move L0 to L1) and the S02 backdrop. One composer: the S00 end state is the S01
 * start state (no transition). Nothing lights before the active detector's alert second, and nothing is drawn without data.
 */
import type { Lit, Frame } from "../lens/types";
import type { Ctx } from "./ctx";
import { box, lens, lerpBox, MT, clampFocus, type Box } from "./geometry";
import { layoutFor, telemetryStrands } from "./strands";
import { evalFile, heroWin, incident } from "./data";
import { TELEMETRY } from "../data/types";
import { clamp, lerp, lerpLog } from "../lib/math";
import { easePremium, easeSmooth, easeSymmetric } from "../motion/ease";
import { flagRuns } from "../model/metrics";
import { INTRO_MS, intro, introTime } from "./intro";
import { windowed } from "../motion/progress";
import { motionEnabled } from "../state/motion";
import type { WinData } from "./windows";

export const HERO_FOCUS_OFFSET = 160;
const RANK_K = [1, 0.75, 0.5];

/** Ignition clock: shared with the S08 echo. `readyAt` is the absolute time the detector inputs became available. */
export const ignition = { incidentsAt: -1, introIgniteAbs: -1 };

export function litFor(win: WinData, det: "pca" | "robust_z", thr: number, top3: readonly string[], g: (rank: number) => number): Record<string, Lit[]> {
  const q = win.scores[det];
  const out: Record<string, Lit[]> = {};
  if (!q) return out;
  const runs = flagRuns(q, thr);
  top3.forEach((ch, r) => {
    out[ch] = runs.map(([a, b]) => ({ t0: a, t1: b, k: RANK_K[r] ?? 0.5, g: g(r) }));
  });
  return out;
}

const EMPTY: number[] = [0, 0];

/** The intro and S01 frame. */
export function composeSignal(c: Ctx): Frame {
  const hero = heroWin();
  const ev = evalFile();
  const inc = incident(142);
  const t = intro.playing || intro.frozen >= 0 ? introTime(c.now) : INTRO_MS;
  const done = t >= INTRO_MS;
  const n = 1200;
  const L = layoutFor(c, n, TELEMETRY.length);
  const Mt0 = MT[c.cls].L0;
  const b0 = box(c.cls, "L0", c.w, c.h);
  // data-driven phases are delayed when the hero window is late; the headline sharpens on the raw clock
  if (hero && intro.arrival < 0) intro.arrival = t;
  const delay = !c.motion || done ? 0 : Math.max(0, (intro.arrival < 0 ? t : intro.arrival) - 400);
  const td = t - delay;
  const noData = !hero;
  // the write clip, then focus, expected paths, ignition
  const write = !c.motion || done ? 1 : easePremium(clamp((td - 400) / 1200));
  const focus = !c.motion || done ? 1 : easeSmooth(clamp((td - 1600) / 800));
  const expReveal = !c.motion || done ? 1 : clamp((td - 2400) / 500);
  // S01 camera: L0 -> L1 over p 0..0.4
  const s1 = done ? easeSymmetric(windowed(c.p, 0, 0.4)) : 0;
  const bx: Box = lerpBox(b0, box(c.cls, "L1", c.w, c.h), s1);
  const Mt = lerpLog(1, lerpLog(Mt0, MT[c.cls].L1, s1), focus);
  const f = clampFocus((hero?.start ?? 300) + HERO_FOCUS_OFFSET, n, bx.R, L.pxPerS, Mt);
  if (intro.playing || intro.frozen >= 0) {
    intro.minR = Math.min(intro.minR, bx.R);
    if (focus > 0 && bx.R < intro.lastR - 0.01) intro.monotonic = false;
    intro.lastR = bx.R;
  }
  const strands = !hero
    ? TELEMETRY.map((id, i) => ({ id, y: L.ys[i]!, vals: EMPTY, dt: 600, t0: 0, amp: 1, alpha: 0.1, ink: 0.1, ridge: false, label: true }))
    : (() => {
        let lit: Record<string, Lit[]> | undefined, exp: Record<string, [number, number]> | undefined;
        const thr = ev?.detectors.pca.points.best_event_f1.threshold_q;
        const top3 = inc?.attribution.pca.top3;
        const half = bx.R / (L.pxPerS * Mt);
        if (thr !== undefined && top3) {
          // ignition: 600 ms smooth from the alert second, 120 ms stagger by rank. Late incidents are gated, not faked.
          const lateAt = ignition.incidentsAt;
          const introAbs = intro.start ? intro.start + 2900 + delay : -1;
          const late = c.motion && lateAt > 0 && introAbs > 0 && lateAt > introAbs;
          const g = (r: number) => {
            if (!c.motion || (done && !late)) return 1;
            if (late) return easeSmooth(clamp((c.now - lateAt - 120 * r) / 600));
            return easeSmooth(clamp((td - 2900 - 120 * r) / 600));
          };
          lit = litFor(hero, "pca", thr, top3, g);
          exp = {};
          for (const ch of top3) exp[ch] = [f - half, f - half + 2 * half * expReveal];
        }
        return telemetryStrands(hero, L, { ids: TELEMETRY, alpha: 0.3, ink: 0.85, lit, expected: exp });
      })();
  const fr: Frame = {
    w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS },
    lens: lens(bx, Mt, f, 0.065 * focus, focus, lerp(1, 2, focus)),
    strands, marks: [], glow: c.cls === "M" || c.cls === "T" ? 2 : 3,
    writeX: noData || write >= 1 ? undefined : L.x0 + (c.w - L.x0) * write,
  };
  if (hero) {
    fr.marks.push({ kind: "bar", t0: hero.start, t1: Math.min(hero.end, hero.n), y: L.ys[L.ys.length - 1]! + L.gap * 0.55, h: 3, color: "#ffffff", alpha: 0.8 * (c.motion && !done ? clamp((td - 1600) / 600) : 1) });
  }
  return fr;
}

/** S02 backdrop: lens held at L1, dimmed to 20%; the final 15% moves it to L2 and fades the record out for S03a's re-write. */
export function composeRecordBackdrop(c: Ctx): Frame {
  const hero = heroWin();
  const L = layoutFor(c, 1200, TELEMETRY.length);
  const b1 = box(c.cls, "L1", c.w, c.h), b2 = box(c.cls, "L2", c.w, c.h);
  const u = easeSymmetric(windowed(c.p, 0.85, 1));
  const bx = lerpBox(b1, b2, u);
  const Mt = lerpLog(MT[c.cls].L1, MT[c.cls].L2, u);
  const f = clampFocus((hero?.start ?? 300) + HERO_FOCUS_OFFSET, 1200, bx.R, L.pxPerS, Mt);
  const dim = lerp(0.2, 0.2, u) * (1 - windowed(c.p, 0.9, 1));
  const strands = hero ? telemetryStrands(hero, L, { ids: TELEMETRY, alpha: 0.3, ink: 0.85 }) : [];
  return { w: c.w, h: c.h, tx: { x0: L.x0, pxPerS: L.pxPerS }, lens: lens(bx, Mt, f), strands: strands.map((s) => ({ ...s, label: false })), marks: [], glow: 0, alpha: Math.max(0.0001, dim) };
}
export { motionEnabled };
