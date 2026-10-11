import type { Cls } from "./viewport";

/** Everything a composer needs for one frame. */
export interface Ctx {
  cls: Cls;
  w: number; h: number;
  now: number;
  /** progress through the active track (0..1) */
  p: number;
  /** the motion mode: false under prefers-reduced-motion or MOTION OFF */
  motion: boolean;
}
