/**
 * Point-wise, point-adjusted and event-level metrics from stored scores (DATA_CONTRACTS "Metric definitions").
 * Same definition as analytics/metrics.py; parity with all 17 recompute_vectors cases is a Vitest suite.
 * flag = q >= threshold_q. Segments are runs of labels == 1 (half-open). Alerts merge runs separated by <= mergeGap unflagged points.
 */
export interface Counts { tp: number; fp: number; fn: number }
export interface WindowMetrics {
  rows: number;
  positives: number;
  point: Counts;
  point_adjusted: Counts;
  event: { segments: number; detected: number; alerts: number; false_alerts: number; delay_median_s: number };
  /** per labelled segment: detected, and the delay of its first flagged second (-1 when missed) */
  segments: { start: number; end: number; detected: boolean; delay: number }[];
  /** merged alert runs [start, end) and whether each is false */
  alertRuns: { start: number; end: number; isFalse: boolean }[];
  flagged: number;
}

export function labelSegments(labels: ArrayLike<number>): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  const n = labels.length;
  while (i < n) {
    if (labels[i]) {
      let j = i;
      while (j < n && labels[j]) j++;
      out.push([i, j]);
      i = j;
    } else i++;
  }
  return out;
}

export function evaluate(scores: ArrayLike<number>, labels: ArrayLike<number>, thr: number, mergeGap = 30, tolAfter = 60): WindowMetrics {
  const n = scores.length;
  const segs = labelSegments(labels);
  // maximal runs of flagged points, merged when the gap is <= mergeGap
  const alerts: [number, number][] = [];
  for (let i = 0; i < n; ) {
    if (scores[i]! >= thr) {
      let j = i;
      while (j < n && scores[j]! >= thr) j++;
      const last = alerts[alerts.length - 1];
      if (last && i - last[1] <= mergeGap) last[1] = j;
      else alerts.push([i, j]);
      i = j;
    } else i++;
  }
  let tp = 0, fp = 0, pos = 0, flagged = 0;
  for (let k = 0; k < n; k++) {
    const f = scores[k]! >= thr;
    if (f) flagged++;
    if (labels[k]) pos++;
    if (f && labels[k]) tp++;
    else if (f) fp++;
  }
  let paTp = 0, detected = 0;
  const delays: number[] = [];
  const segOut = segs.map(([a, b]) => {
    let first = -1;
    for (let k = a; k < b; k++) if (scores[k]! >= thr) { first = k; break; }
    if (first >= 0) { detected++; paTp += b - a; delays.push(first - a); }
    return { start: a, end: b, detected: first >= 0, delay: first >= 0 ? first - a : -1 };
  });
  const alertRuns = alerts.map(([a, b]) => ({ start: a, end: b, isFalse: !segs.some(([s, e]) => a < e + tolAfter && s < b) }));
  delays.sort((x, y) => x - y);
  const m = delays.length;
  const med = !m ? -1 : m % 2 ? delays[(m - 1) / 2]! : (delays[m / 2 - 1]! + delays[m / 2]!) / 2;
  return {
    rows: n, positives: pos, flagged,
    point: { tp, fp, fn: pos - tp },
    point_adjusted: { tp: paTp, fp, fn: pos - paTp },
    event: { segments: segs.length, detected, alerts: alerts.length, false_alerts: alertRuns.filter((r) => r.isFalse).length, delay_median_s: med },
    segments: segOut, alertRuns,
  };
}

export const f1 = (c: Counts) => (2 * c.tp + c.fp + c.fn ? (2 * c.tp) / (2 * c.tp + c.fp + c.fn) : 0);
export const precision = (c: Counts) => (c.tp + c.fp ? c.tp / (c.tp + c.fp) : null);
export const recall = (c: Counts) => (c.tp + c.fn ? c.tp / (c.tp + c.fn) : null);

/** Seconds (window index) where the score is at or above the threshold, as [start, end) runs. */
export function flagRuns(scores: ArrayLike<number>, thr: number): [number, number][] {
  const out: [number, number][] = [];
  const n = scores.length;
  for (let i = 0; i < n; ) {
    if (scores[i]! >= thr) {
      let j = i;
      while (j < n && scores[j]! >= thr) j++;
      out.push([i, j]);
      i = j;
    } else i++;
  }
  return out;
}

/** First flagged second inside [start, end), or -1. */
export function firstFlag(scores: ArrayLike<number>, thr: number, start: number, end: number) {
  for (let k = start; k < Math.min(end, scores.length); k++) if (scores[k]! >= thr) return k;
  return -1;
}
