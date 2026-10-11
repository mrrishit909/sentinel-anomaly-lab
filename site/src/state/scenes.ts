/**
 * Visitor parameters, one store per signature interaction (VISUAL_DESIGN 4). Stepped scenes take their authored
 * state from scroll; a visitor's choice overrides it until the next threshold (the override is cleared there).
 */
import { createStore } from "./store";
import type { DetId, OpId } from "../data/types";

export type View = "raw" | "expected" | "residual";
export const NORMAL_DEFAULT = { view: null as View | null, zoom: 3 as 1 | 3 | 10, channel: null as string | null, drag: null as number | null };
export const normal = createStore({ ...NORMAL_DEFAULT });

/** S03b: the active detector is stepped by scroll; a click overrides until the next step. */
export const detectors = createStore({ det: null as DetId | null, op: "best_event_f1" as OpId });

/** S04: detector, operating point (stepped by scroll until chosen), and the phone's test-only strip toggle. */
export const days = createStore({ det: "pca" as DetId, op: null as OpId | null, all58: false, focusBin: null as number | null });

/** S05 threshold lab. index is a position in the detector's own thresholds_q (never one scale for all). */
export const LAB_DEFAULT = { det: "pca" as DetId, index: null as number | null, split: "test" as "val" | "test", windowId: "142", touched: false };
export const lab = createStore({ ...LAB_DEFAULT });

export type Protocol = "point" | "pa" | "event";
export const FINE_DEFAULT = { protocol: null as Protocol | null, attribution: "pca" as "pca" | "robust_z", scope: "all" as "all" | "test" };
export const fine = createStore({ ...FINE_DEFAULT });

export const REPLAY_DEFAULT = {
  incidentId: 142, det: "pca" as DetId, op: "best_event_f1" as OpId, index: null as number | null,
  playhead: 0, playing: false, speed: 10 as 1 | 10 | 60, context: false, attribution: "pca" as "pca" | "robust_z" | "off", inspected: null as string | null, touched: false,
};
export const replay = createStore({ ...REPLAY_DEFAULT });
