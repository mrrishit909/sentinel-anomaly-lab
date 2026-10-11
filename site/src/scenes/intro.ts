/** S00 intro clock (MOTION_SYSTEM 5.1). SKIP, Esc and any scroll input compress the remainder into 350 ms. */
import { clamp } from "../lib/math";
import { DUR, easePremium } from "../motion/ease";

export const INTRO_MS = 4600;
export const intro = {
  playing: false, start: 0, completeFrom: -1, completeAt: 0,
  /** evidence hook: freeze the clock at t ms (-1 releases it) */
  frozen: -1,
  /** intro time at which the hero window became available (data-driven phases are delayed by arrival - 400) */
  arrival: -1,
  /** lens radius monotonicity (rejection criterion 17 / test 15) */
  minR: Infinity, lastR: 0, monotonic: true,
};
export function introTime(now: number) {
  if (intro.frozen >= 0) return intro.frozen;
  if (!intro.playing) return INTRO_MS;
  if (!intro.start) intro.start = now;
  const t = now - intro.start;
  if (intro.completeFrom < 0) return Math.min(INTRO_MS, t);
  const k = easePremium(clamp((now - intro.completeAt) / DUR.standard));
  return intro.completeFrom + (INTRO_MS - intro.completeFrom) * k;
}
