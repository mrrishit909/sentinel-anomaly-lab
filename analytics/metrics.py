"""Point-wise, point-adjusted and event-level metrics from a boolean flag series.

The browser re-implements exactly this (see recompute_vectors.json). Segments are half-open [s, e), sorted, non-overlapping.
Alerts: maximal runs of flagged points, merged when separated by <= merge_gap unflagged points.
"""
from __future__ import annotations

import numpy as np

from pipelines.common import MERGE_GAP, SECONDS_PER_DAY, TOL_AFTER


def segments(y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    d = np.diff(np.r_[0, y.astype(np.int8), 0])
    return np.flatnonzero(d == 1), np.flatnonzero(d == -1)


def alerts(flag: np.ndarray, merge_gap: int = MERGE_GAP) -> tuple[np.ndarray, np.ndarray]:
    a, b = segments(flag)
    if len(a) < 2:
        return a, b
    brk = np.flatnonzero(a[1:] - b[:-1] > merge_gap)  # gaps wider than merge_gap separate alerts
    return a[np.r_[0, brk + 1]], b[np.r_[brk, len(a) - 1]]


def alert_runs(flag: np.ndarray, s: np.ndarray, e: np.ndarray, merge_gap: int = MERGE_GAP, tol_after: int = TOL_AFTER) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Merged alert runs [a, b) and a bool mask of false alerts (overlaps no [s, e + tol_after))."""
    aa, ab = alerts(flag, merge_gap)
    if not len(aa):
        return aa, ab, np.zeros(0, bool)
    if not len(s):
        return aa, ab, np.ones(len(aa), bool)
    i = np.searchsorted(e + tol_after, aa, side="right")
    hit = (i < len(s)) & (s[np.minimum(i, len(s) - 1)] < ab)
    return aa, ab, ~hit


def evaluate(flag: np.ndarray, s: np.ndarray, e: np.ndarray, merge_gap: int = MERGE_GAP, tol_after: int = TOL_AFTER) -> dict:
    """flag: bool[n]; s,e: segment starts and exclusive ends (indices into flag)."""
    n = len(flag)
    cs = np.r_[0, np.cumsum(flag, dtype=np.int64)]
    per_seg = cs[e] - cs[s]
    lens = e - s
    pos = int(lens.sum())
    tp = int(per_seg.sum())
    nflag = int(cs[-1])
    fp = nflag - tp
    det = per_seg > 0
    pa_tp = int(lens[det].sum())
    aa, ab, fa = alert_runs(flag, s, e, merge_gap, tol_after)
    false_alerts = int(fa.sum())
    idx = np.flatnonzero(flag)
    j = np.searchsorted(idx, s)
    first = idx[np.minimum(j, max(len(idx) - 1, 0))] if len(idx) else np.zeros(len(s), np.int64)
    delays = (first - s)[det] if len(idx) else np.array([], np.int64)
    return {
        "rows": n, "positives": pos, "segments": int(len(s)), "tp": tp, "fp": fp, "fn": pos - tp, "pa_tp": pa_tp,
        "detected": int(det.sum()), "alerts": int(len(aa)), "false_alerts": false_alerts,
        "delay_median_s": float(np.median(delays)) if len(delays) else -1.0,
        "delay_mean_s": float(np.mean(delays)) if len(delays) else -1.0,
        "false_alerts_per_day": false_alerts / (n / SECONDS_PER_DAY),
    }


def prf(tp: int, fp: int, fn: int) -> dict:
    p = tp / (tp + fp) if tp + fp else None
    r = tp / (tp + fn) if tp + fn else None
    f = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None
    return {"tp": int(tp), "fp": int(fp), "fn": int(fn), "precision": p, "recall": r, "f1": f}


def summarize(m: dict, threshold_q: int) -> dict:
    """Evaluate() dict -> the METRICS object in detector_eval.schema.json."""
    na = m["alerts"]
    return {
        "rows": m["rows"], "threshold_q": int(threshold_q),
        "point": prf(m["tp"], m["fp"], m["fn"]),
        "point_adjusted": prf(m["pa_tp"], m["fp"], m["positives"] - m["pa_tp"]),
        "event": {"segments": m["segments"], "detected": m["detected"], "recall": m["detected"] / m["segments"] if m["segments"] else None,
                  "alerts": na, "false_alerts": m["false_alerts"], "alert_precision": (na - m["false_alerts"]) / na if na else None,
                  "false_alerts_per_day": m["false_alerts_per_day"],
                  "delay_median_s": None if m["delay_median_s"] < 0 else m["delay_median_s"],
                  "delay_mean_s": None if m["delay_mean_s"] < 0 else m["delay_mean_s"]},
    }


def event_f1(m: dict) -> float:
    """F1 of event recall and alert precision; 0 when undefined."""
    na = m["alerts"]
    if not na or not m["segments"]:
        return 0.0
    p, r = (na - m["false_alerts"]) / na, m["detected"] / m["segments"]
    return 2 * p * r / (p + r) if p + r else 0.0


def per_segment(flag: np.ndarray, s: np.ndarray, e: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """-> detected bool[k], delay int[k] (-1 where not detected)."""
    cs = np.r_[0, np.cumsum(flag, dtype=np.int64)]
    det = (cs[e] - cs[s]) > 0
    idx = np.flatnonzero(flag)
    delay = np.full(len(s), -1, np.int64)
    if len(idx):
        j = np.minimum(np.searchsorted(idx, s), len(idx) - 1)
        delay[det] = (idx[j] - s)[det]
    return det, delay
