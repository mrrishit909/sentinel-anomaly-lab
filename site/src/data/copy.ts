/**
 * Copy bound to artifacts (VISUAL_DESIGN 5 and 6.1). Every number on screen comes through here, from facts.json,
 * meta.json or detector_eval.json, never typed (rejection criterion 8). The lint test greps these files for banned wording.
 */
import type { DetectorEvalFile, Facts, Meta } from "./types";
import { cap, d1, d2, n0, words } from "../model/format";

export const fv = (f: Facts, key: string): number => {
  const v = f.values[key]?.value;
  return typeof v === "number" ? v : NaN;
};
export const fs = (f: Facts, key: string): string => String(f.values[key]?.value ?? "");

export const COPY = {
  statementS01: (f: Facts) => `${cap(words(fv(f, "channels")))} measurements never sit still. Almost none of that movement is a fault.`,
  kickerS01: (f: Facts) => `NOISE HERE MEANS NORMAL BEHAVIOUR: THE ${d1(fv(f, "nominal_pct"))}% OF SECONDS WITH NO FAULT, AND EVERY FALSE ALARM RAISED ON THEM. THIS SIMULATION HAS NO SENSOR NOISE.`,
  card1: (f: Facts) => ({
    head: `FROM: PCA DETECTOR / TEST SPLIT · ${d1(fv(f, "test_days"))} DAYS`,
    body: `CAUGHT ${n0(fv(f, "pca.best_event_f1.test.detected"))} OF ${n0(fv(f, "split.test.segments"))} INJECTED FAULTS · ${d2(fv(f, "pca.best_event_f1.test.false_alerts_per_day"))} FALSE ALERTS A DAY.`,
  }),
  card2: (f: Facts) => ({
    head: "FROM: ISOLATION FOREST / SAME TEST SPLIT",
    body: `POINT F1 ${d2(fv(f, "iforest.best_event_f1.test.point_f1"))}. POINT-ADJUSTED F1 ${d2(fv(f, "iforest.best_event_f1.test.point_adjusted_f1"))}. SAME ALERTS, ${d1(fv(f, "point_adjust_inflation.iforest"))}X APART.`,
  }),
};
export const detectorLabel = (m: Meta, id: keyof Meta["detectors"]) => m.detectors[id].label;
export const pcaThreshold = (e: DetectorEvalFile) => e.detectors.pca.points.best_event_f1.threshold_q;
