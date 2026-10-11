/**
 * Lookups into the precomputed threshold sweep (S05). Every number is a stored column at one real threshold
 * index; nothing is interpolated between steps (rejection criterion 5).
 */
import type { DetId, DetectorEvalFile, OpId, SweepFile, SweepSplit, SplitId } from "../data/types";
import { OPS } from "../data/types";

export interface SplitRow {
  index: number;
  thresholdQ: number;
  pointF1: number; pointPrecision: number | null; pointRecall: number | null;
  paF1: number; paRecall: number | null; inflation: number | null;
  detected: number; segments: number; recall: number;
  alerts: number; falseAlerts: number; alertPrecision: number | null; falsePerDay: number;
  /** null = no incident caught */
  delay: number | null;
  days: number;
  tp: number; fp: number; positives: number;
}

const f1 = (tp: number, fp: number, fn: number) => (2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0);

export function splitRow(sweep: SweepFile, det: DetId, split: SplitId, index: number): SplitRow {
  const d = sweep.detectors[det];
  const s: SweepSplit = d.splits[split];
  const i = Math.max(0, Math.min(d.thresholds_q.length - 1, index));
  const tp = s.p_tp[i]!, fp = s.p_fp[i]!, pa = s.pa_tp[i]!;
  const pf = f1(tp, fp, s.positives - tp);
  const paf = f1(pa, fp, s.positives - pa);
  const al = s.ev_alerts[i]!, fa = s.ev_false[i]!;
  const dm = s.delay_median_s[i]!;
  return {
    index: i, thresholdQ: d.thresholds_q[i]!,
    pointF1: pf, pointPrecision: tp + fp ? tp / (tp + fp) : null, pointRecall: s.positives ? tp / s.positives : null,
    paF1: paf, paRecall: s.positives ? pa / s.positives : null, inflation: pf > 0 ? paf / pf : null,
    detected: s.ev_detected[i]!, segments: s.segments, recall: s.segments ? s.ev_detected[i]! / s.segments : 0,
    alerts: al, falseAlerts: fa, alertPrecision: al ? (al - fa) / al : null, falsePerDay: fa / s.days,
    delay: dm < 0 ? null : dm, days: s.days, tp, fp, positives: s.positives,
  };
}

/** Index of an integer threshold in a detector's sweep, or -1 when it is not a step. */
export const indexOfThreshold = (sweep: SweepFile, det: DetId, q: number) => sweep.detectors[det].thresholds_q.indexOf(q);
/** Index of the sweep step nearest to q (ties go to the stricter, i.e. higher, threshold). */
export function nearestIndex(thresholds: readonly number[], q: number) {
  let best = 0;
  for (let i = 1; i < thresholds.length; i++) if (Math.abs(thresholds[i]! - q) < Math.abs(thresholds[best]! - q) || (Math.abs(thresholds[i]! - q) === Math.abs(thresholds[best]! - q) && thresholds[i]! > thresholds[best]!)) best = i;
  return best;
}
/** The three val-derived operating points of a detector as sweep indices (always members of thresholds_q). */
export function notches(sweep: SweepFile, ev: DetectorEvalFile, det: DetId): Record<OpId, number> {
  const out = {} as Record<OpId, number>;
  for (const op of OPS) out[op] = nearestIndex(sweep.detectors[det].thresholds_q, ev.detectors[det].points[op].threshold_q);
  return out;
}
/** The operating point whose notch is nearest to an index (a detector change keeps the operating point, not the index). */
export function opAt(n: Record<OpId, number>, index: number): OpId | null {
  for (const op of OPS) if (n[op] === index) return op;
  return null;
}

/** Detection and delay at any integer threshold from the record-setting rise staircase (DR-2). */
export function detectedAt(rise: readonly (readonly [number, number])[], thr: number): { detected: boolean; delay: number | null } {
  for (const [dt, q] of rise) if (q >= thr) return { detected: true, delay: dt };
  return { detected: false, delay: null };
}
