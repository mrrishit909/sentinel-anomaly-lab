/** Keyed retargetable tweens for composer-driven values (lens magnification, hairline slides, crossfades). */
import { Tween } from "../motion/tween";
import { easeSmooth } from "../motion/ease";
import { registerBusy } from "./bus";

const tweens = new Map<string, Tween>();
registerBusy(() => { for (const t of tweens.values()) if (t.active) return true; return false; });

/** Current value of `key`, retargeted to `target` over `ms` (0 under reduced motion; first use snaps). */
export function animTo(key: string, target: number, now: number, ms = 350, ease: (t: number) => number = easeSmooth): number {
  let t = tweens.get(key);
  if (!t) { t = new Tween(target, ms, ease); tweens.set(key, t); return target; }
  if (t.target !== target) t.retarget(target, now, ms);
  t.update(now);
  return t.value;
}
export function snapAll() { for (const t of tweens.values()) t.snap(); }
addEventListener("sal:snap", snapAll);
addEventListener("sal:jump", snapAll);

const starts = new Map<string, number>();
let onceBusy = 0;
registerBusy(() => onceBusy > performance.now());
/** Progress 0..1 of a one-shot animation that began the first time `key` was seen (0 under reduced motion: returns 1). */
export function once(key: string, now: number, ms: number, enabled = true): number {
  if (!enabled) return 1;
  let s = starts.get(key);
  if (s === undefined) { s = now; starts.set(key, s); }
  const t = Math.min(1, Math.max(0, (now - s) / ms));
  if (t < 1) onceBusy = Math.max(onceBusy, performance.now() + 50);
  return t;
}
export const resetOnce = (prefix: string) => { for (const k of [...starts.keys()]) if (k.startsWith(prefix)) starts.delete(k); };
