"""Quantise scores, build threshold sweeps, choose operating points on VAL ONLY, evaluate on val and test, score attribution."""
from __future__ import annotations

import numpy as np
import polars as pl
from sklearn.metrics import average_precision_score

from analytics import metrics as M
from pipelines.common import DETECTORS, PROCESSED, Q_MAX, SPLITS, TELEMETRY

N_THR = 160
OPS = ("best_point_f1", "best_event_f1", "far_budget_1_per_day")


def quantise(score: np.ndarray, train: slice) -> tuple[np.ndarray, dict]:
    """q = round(65535 * clip(log1p(s/c)/smax, 0, 1)); c, smax come from train/all rows (monotone map, no label information)."""
    s = score.astype(np.float64)
    c = max(float(np.median(s[train])), 1e-6 * float(s.max()), 1e-12)
    smax = float(np.log1p(s.max() / c))
    q = np.rint(np.clip(np.log1p(s / c) / smax, 0, 1) * Q_MAX).astype(np.uint16)
    return q, {"c": c, "smax": smax}


def dequantise(q: int, quant: dict) -> float:
    return quant["c"] * float(np.expm1(q / Q_MAX * quant["smax"]))


def thresholds_from_val(qv: np.ndarray) -> np.ndarray:
    """Thresholds at flagged-fraction quantiles of the VAL scores only, 30% down to 0.002% of rows."""
    fr = np.logspace(np.log10(0.30), np.log10(2e-5), N_THR)
    t = np.unique(np.quantile(qv, 1 - fr).astype(np.int64))
    return t[t >= 1]


def seg_in(s: np.ndarray, e: np.ndarray, lo: int, hi: int) -> tuple[np.ndarray, np.ndarray]:
    m = (s >= lo) & (e <= hi)
    return s[m] - lo, e[m] - lo


def sweep(q: np.ndarray, s: np.ndarray, e: np.ndarray, split: str, thr: np.ndarray) -> list[dict]:
    lo, hi = SPLITS[split]
    ss, ee = seg_in(s, e, lo, hi)
    return [M.evaluate(q[lo:hi] >= t, ss, ee) for t in thr]


def pick(rows: list[dict], thr: np.ndarray) -> dict:
    """Operating points from VAL sweep rows. Ties go to the higher (stricter) threshold."""
    def best(vals):
        v = np.asarray(vals, float)
        return int(len(v) - 1 - np.argmax(v[::-1]))
    pf1 = [M.prf(r["tp"], r["fp"], r["fn"])["f1"] or 0.0 for r in rows]
    ef1 = [M.event_f1(r) for r in rows]
    ok = [i for i, r in enumerate(rows) if r["false_alerts_per_day"] <= 1.0]
    far = min(ok) if ok else len(rows) - 1
    return {"best_point_f1": int(thr[best(pf1)]), "best_event_f1": int(thr[best(ef1)]), "far_budget_1_per_day": int(thr[far])}


def run(scores: dict, y: np.ndarray, quant_info: dict | None = None) -> dict:
    inc = pl.read_csv(PROCESSED / "incidents.csv")
    s, e = M.segments(y)  # labels come ONLY from y, so permuting y is a real leakage probe
    tr = slice(*SPLITS["train"])
    out = {"q": {}, "quant": {}, "thr": {}, "sweep": {}, "ops": {}, "metrics": {}, "ap": {}, "pr": {}, "det": {}, "det_ops": {}, "rise": {}, "alerts": {}}
    for d in DETECTORS:
        q, qi = quantise(scores[d], tr)
        out["q"][d], out["quant"][d] = q, qi
        vlo, vhi = SPLITS["val"]
        thr = thresholds_from_val(q[vlo:vhi])
        out["thr"][d] = thr
        sw = {sp: sweep(q, s, e, sp, thr) for sp in ("val", "test")}
        out["sweep"][d] = sw
        ops = pick(sw["val"], thr)  # VAL ONLY
        out["ops"][d] = ops
        out["metrics"][d] = {}
        for op, tq in ops.items():
            out["metrics"][d][op] = {sp: M.summarize(M.evaluate(q[SPLITS[sp][0]:SPLITS[sp][1]] >= tq, *seg_in(s, e, *SPLITS[sp])), tq) for sp in ("val", "test")}
        out["ap"][d] = {sp: float(average_precision_score(y[SPLITS[sp][0]:SPLITS[sp][1]], q[SPLITS[sp][0]:SPLITS[sp][1]])) for sp in ("val", "test")}
        out["pr"][d] = {sp: pr_curve(sw[sp]) for sp in ("val", "test")}
        det, delay = M.per_segment(q >= ops["best_event_f1"], s, e)
        out["det"][d] = (det, delay)
        out["det_ops"][d] = {op: M.per_segment(q >= tq, s, e) for op, tq in ops.items()}
        out["rise"][d] = [rise(q[a:b]) for a, b in zip(s, e)]
        out["alerts"][d] = {op: {sp: alert_list(q, tq, sp, s, e) for sp in ("val", "test")} for op, tq in ops.items()}
    out["attr"] = attribution(inc)
    out["inc"] = inc
    return out


def rise(qs: np.ndarray) -> list[list[int]]:
    """Record-setting points of the running maximum of q from the segment start: [[dt, q], ...] (strictly increasing q, first dt = 0)."""
    rm = np.maximum.accumulate(qs.astype(np.int64))
    idx = np.flatnonzero(np.r_[True, rm[1:] > rm[:-1]])
    return [[int(i), int(rm[i])] for i in idx]


def alert_list(q: np.ndarray, thr: int, split: str, s: np.ndarray, e: np.ndarray) -> list[list[int]]:
    lo, hi = SPLITS[split]
    ss, ee = seg_in(s, e, lo, hi)
    a, b, f = M.alert_runs(q[lo:hi] >= thr, ss, ee)
    return [[int(x) + lo, int(y) + lo, int(z)] for x, y, z in zip(a, b, f)]


def pr_curve(rows: list[dict]) -> dict:
    pts = []
    for r in rows:
        if r["tp"] + r["fp"] == 0:
            continue
        pts.append((r["tp"] / r["positives"], r["tp"] / (r["tp"] + r["fp"])))
    pts.sort()
    return {"recall": [round(p[0], 5) for p in pts], "precision": [round(p[1], 5) for p in pts]}


def attribution(inc: pl.DataFrame) -> dict:
    eng = np.load(PROCESSED / "engine.npz")
    tel = list(TELEMETRY)
    rows = {}
    for name, key in (("robust_z", "contrib_robust_z"), ("pca", "contrib_pca")):
        C = eng[key]
        order = np.argsort(-C, axis=1)
        res = []
        for i in range(len(inc)):
            rc = tel.index(inc["root_cause"][i])
            aff = [tel.index(a) for a in inc["affected"][i].split(",")]
            rank = int(np.where(order[i] == rc)[0][0]) + 1
            top3 = [tel[j] for j in order[i, :3]]
            res.append({"top3": top3, "root_rank": rank, "hit_at_1": rank == 1, "hit_at_3": rank <= 3,
                        "hit_at_3_any": bool(rank <= 3 or any(j in order[i, :3] for j in aff))})
        rows[name] = res
    return rows
