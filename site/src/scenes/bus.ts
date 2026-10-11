/** Redraw requests for the fixed lens canvas (kept apart from the director so scenes never import it). */
let dirty = true;
let version = 0;
export const invalidate = () => { dirty = true; version++; };
export const takeDirty = () => { const d = dirty; dirty = false; return d; };
export const markDirty = () => { dirty = true; };
export const stateVersion = () => version;
/** scenes that animate on their own clock register here so the director keeps drawing while they run */
const busy = new Set<() => boolean>();
export const registerBusy = (fn: () => boolean) => { busy.add(fn); return () => void busy.delete(fn); };
export const anyBusy = () => { for (const fn of busy) if (fn()) return true; return false; };

/** DOM slots the canvas draws into (measured by the owning scene): the S05 strip lives in normal flow so it can never collide. */
/** A y inside the free band between the top and bottom DOM groups (phones and tablets), or null when there is no room. */
export function freeY(pref: number, need = 14): number | null {
  const lo = slots.topBottom + 8, hi = slots.bottomTop - need - 6;
  if (hi < lo) return null;
  return Math.min(hi, Math.max(lo, pref));
}
export const slots: { strip: { x: number; y: number; w: number; h: number } | null; topBottom: number; bottomTop: number } = { strip: null, topBottom: 0, bottomTop: 0 };
