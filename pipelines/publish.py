"""Write the versioned JSON artifacts to site/public/data from the cached engine scores."""
from __future__ import annotations

import base64
import datetime as dt
import gc
import gzip
import json

import numpy as np
import polars as pl

from analytics import detectors as de, evaluate as ev, features as fe, metrics as M
from pipelines.cleaning.clean import rebuild_labels
from pipelines.common import (CHANNELS, CONTEXT, DETECTOR_TAGS, DETECTORS, MANIFESTS, MERGE_GAP, N_ROWS, PROCESSED, PUBLIC, SECONDS_PER_DAY, SPLITS,
                              TELEMETRY, TOL_AFTER, ZENODO_DOI, write_json)
from pipelines.quality import run_checks

VERSION = "0.2.0"
HERO_WINDOW_INCIDENT = 142
HERO_SECONDS = 1200
RESID_CASE_SECONDS = 600
ALERTS_GZ_BUDGET = 60_000
BIN_S = 600
PAD = 300
WIN_MAX = 3600
ATTRIBUTION = [
    "Telemetry and labels: CATS (Controlled Anomalies Time Series) Dataset v2, Solenix Engineering GmbH / Patrick Fleith, doi:10.5281/zenodo.8338435.",
    "Licensed under Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/).",
    "Changes made: channels quantized to 16 bits and cut into incident windows; detector scores, metrics and attributions are derived results of this project and are not endorsed by the dataset creators.",
]
LABELS = {
    "robust_z": ("Rolling robust z-score", "statistical", False, True, "Largest |x - 61 s trailing median| / (1.4826 MAD of train residuals) across the 10 telemetry channels."),
    "pca": ("PCA reconstruction error", "reconstruction", False, True, "Squared error rebuilding 17 standardised channels plus 10 residual features from 12 principal components fitted on nominal train data."),
    "iforest": ("Isolation Forest", "isolation", False, True, "100 trees, 4,096 samples each, fitted on 200,000 random train rows over channel levels and 30 s residual peaks."),
    "changepoint": ("Change-point (ruptures Window)", "change-point", False, True, "ruptures Window l2 mean-shift discrepancy on 10 s means of 10 standardised telemetry channels, shifted so it only uses past data."),
    "gbm": ("Gradient-boosted trees (supervised)", "supervised", True, True, "Histogram gradient boosting trained on labels from the gbm_fit split only, on residual and PCA features; iterations chosen before val."),
}


def b64(a: np.ndarray, dtype: str) -> str:
    return base64.b64encode(np.ascontiguousarray(a, dtype=dtype).tobytes()).decode()


def gz_bytes(path) -> int:
    return len(gzip.compress(path.read_bytes(), 6))


def chan_ranges(X: np.ndarray) -> dict:
    return {c: (float(X[:, j].min()), float(X[:, j].max())) for j, c in enumerate(CHANNELS)}


def choose_windows(inc: pl.DataFrame) -> list[int]:
    """Earliest test incident per category 1..13 (fallback: val, then gbm_fit)."""
    s, e, cat = inc["start"].to_numpy(), inc["end"].to_numpy(), inc["category"].to_numpy()
    picks = []
    for c in range(1, 14):
        for sp in ("test", "val", "gbm_fit"):
            lo, hi = SPLITS[sp]
            m = np.flatnonzero((cat == c) & (s >= lo) & (e <= hi))
            if len(m):
                picks.append(int(m[0]))
                break
    return picks


def split_of(start: int) -> str:
    return next(k for k, (lo, hi) in SPLITS.items() if lo <= start < hi)


def toy_cases() -> list[dict]:
    """Hand-built series covering the edge rules; expected values come from the reference implementation (and are hand-checked in tests)."""
    def mk(name, n, segs, flags, thr=1):
        y = np.zeros(n, int)
        sc = np.zeros(n, int)
        for a, b in segs:
            y[a:b] = 1
        for a, b in flags:
            sc[a:b] = 2
        return {"name": name, "source": "toy", "scores_q": sc.tolist(), "labels": y.tolist(), "threshold_q": thr}
    c = [
        mk("perfect_overlap", 300, [(100, 150)], [(100, 150)]),
        mk("no_flags", 300, [(100, 150)], []),
        mk("all_flagged", 200, [(50, 80)], [(0, 200)]),
        mk("late_alert_delay_20", 400, [(100, 200)], [(120, 140)]),
        mk("merge_gap_exact_30", 600, [(100, 400)], [(100, 120), (150, 170)]),   # 30 unflagged points between -> merge into one alert
        mk("merge_gap_31_splits", 600, [(100, 400)], [(100, 120), (151, 171)]),  # 31 unflagged points -> two alerts
        mk("tolerance_60_after_end", 600, [(100, 150)], [(209, 220)]),           # starts at end + 59 -> not a false alert
        mk("tolerance_exceeded", 600, [(100, 150)], [(210, 220)]),               # starts at end + 60 -> false alert
        mk("false_alert_only", 500, [(100, 150)], [(300, 320)]),
        mk("two_segments_one_hit", 800, [(100, 150), (400, 500)], [(450, 460)]),
        mk("segment_at_start", 200, [(0, 10)], [(0, 3)]),
    ]
    return c


def expected(sc: list[int], y: list[int], thr: int) -> dict:
    sc, y = np.asarray(sc), np.asarray(y)
    s, e = M.segments(y)
    m = M.evaluate(sc >= thr, s, e)
    return {"point": {"tp": m["tp"], "fp": m["fp"], "fn": m["fn"]}, "point_adjusted": {"tp": m["pa_tp"], "fp": m["fp"], "fn": m["positives"] - m["pa_tp"]},
            "event": {"segments": m["segments"], "detected": m["detected"], "alerts": m["alerts"], "false_alerts": m["false_alerts"], "delay_median_s": m["delay_median_s"]}}


def main() -> dict:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for f in PUBLIC.glob("*.json"):
        f.unlink()
    X, y, cat = fe.load()
    # Heavy feature block first, then freed (keeps peak RAM under the 3 GB budget): contributions for the published windows only.
    inc0 = pl.read_csv(PROCESSED / "incidents.csv")
    s0, e0 = inc0["start"].to_numpy(), inc0["end"].to_numpy()
    win_ids = choose_windows(inc0)
    bounds = {}
    for i in win_ids:
        a = max(0, int(s0[i]) - PAD)
        b = min(N_ROWS, int(e0[i]) + PAD)
        trunc = b - a > WIN_MAX
        bounds[i] = (a, a + WIN_MAX if trunc else b, trunc)
    F = fe.build(X, light=True)
    res_scale = F["res_scale"].copy()
    pca_c = dict(zip(win_ids, de.pca_contrib_slices(F, [slice(bounds[i][0], bounds[i][1]) for i in win_ids])))
    rz_c = {i: F["zres"][bounds[i][0]:bounds[i][1]].copy() for i in win_ids}
    del F
    gc.collect()
    cmax = {"robust_z": max(float(rz_c[i].max()) for i in win_ids), "pca": max(float(pca_c[i].max()) for i in win_ids)}
    contrib_quant = {k: {"c": 1.0, "smax": float(np.log1p(v))} for k, v in cmax.items()}
    eng = np.load(PROCESSED / "engine.npz")
    info = json.loads((PROCESSED / "engine_info.json").read_text())
    R = ev.run({d: eng[d] for d in DETECTORS}, y)
    inc = R["inc"]
    ids = list(range(len(inc)))
    s, e = inc["start"].to_numpy(), inc["end"].to_numpy()
    cats, rc = inc["category"].to_numpy(), inc["root_cause"].to_list()
    aff = [a.split(",") for a in inc["affected"].to_list()]
    splits = [split_of(int(a)) for a in s]
    rng = chan_ranges(X)
    win_name = {i: f"window_{i:03d}.json" for i in win_ids}
    out_bytes: dict[str, int] = {}
    tags = {"telemetry": "SYNTHETIC", "labels": "SYNTHETIC", "scores_unsupervised": "DERIVED", "scores_gbm": "PREDICTED", "metrics": "DERIVED", "attribution": "DERIVED"}

    def save(name: str, obj: dict) -> None:
        write_json(PUBLIC / name, obj)

    # ---- windows
    windows_meta = []
    q = R["q"]

    def cq(c, k):
        return b64(np.rint(np.clip(np.log1p(c / 1.0) / contrib_quant[k]["smax"], 0, 1) * 65535), "<u2")

    def quant_ch(a, b, j, c):
        lo_, hi_ = rng[c]
        return np.rint((X[a:b, j] - lo_) / (hi_ - lo_) * 65535)

    for i in win_ids:
        a, b, trunc = bounds[i]
        chq = {c: b64(quant_ch(a, b, j, c), "<u2") for j, c in enumerate(CHANNELS)}
        save(f"contrib_{i:03d}.json", {"schema_version": "v1", "tags": {"contributions": "DERIVED"}, "id": f"{i:03d}", "incident_id": i, "row0": a, "n": b - a,
                                       "encoding": "u16le-base64 per telemetry channel; c = c0 * expm1(q / 65535 * smax), c0 and smax in meta.contrib_quant; contributing measurements, not causes",
                                       "contrib_q_u16": {"robust_z": {c: cq(rz_c[i][:, k], "robust_z") for k, c in enumerate(TELEMETRY)},
                                                         "pca": {c: cq(pca_c[i][:, k], "pca") for k, c in enumerate(TELEMETRY)}}})
        save(win_name[i], {"schema_version": "v1", "tags": {"channels": "SYNTHETIC", "scores": "DERIVED", "gbm_score": "PREDICTED"},
                           "id": f"{i:03d}", "incident_id": i, "split": splits[i], "category": int(cats[i]), "root_cause": rc[i], "affected": aff[i],
                           "row0": a, "n": b - a, "anomaly_start": int(s[i]) - a, "anomaly_end": min(int(e[i]), b) - a, "truncated": bool(trunc),
                           "encoding": "u16le-base64; channels: v = lo + q/65535*(hi-lo); scores: see meta.detectors[id].quant; labels u8",
                           "labels_u8": b64(y[a:b], "u1"), "channels_u16": chq, "channel_range": {c: list(rng[c]) for c in CHANNELS},
                           "scores_q_u16": {d: b64(q[d][a:b], "<u2") for d in DETECTORS}})
        windows_meta.append({"id": f"{i:03d}", "incident_id": i, "file": win_name[i], "contrib_file": f"contrib_{i:03d}.json", "split": splits[i], "category": int(cats[i])})

    # ---- incidents
    attr = R["attr"]
    incs = []
    for i in ids:
        d = {"id": i, "start": int(s[i]), "end": int(e[i]), "duration_s": int(e[i] - s[i]), "category": int(cats[i]), "root_cause": rc[i], "affected": aff[i],
             "split": splits[i], "window": win_name.get(i),
             "detection": {k: {"detected": bool(R["det"][k][0][i]), "delay_s": int(R["det"][k][1][i]) if R["det"][k][0][i] else None} for k in DETECTORS},
             "detection_by_op": {op: {k: {"detected": bool(R["det_ops"][k][op][0][i]), "delay_s": int(R["det_ops"][k][op][1][i]) if R["det_ops"][k][op][0][i] else None}
                                     for k in DETECTORS} for op in ev.OPS},
             "rise": {k: R["rise"][k][i] for k in DETECTORS},
             "attribution": {k: attr[k][i] for k in ("robust_z", "pca")}}
        incs.append(d)
    save("incidents.json", {"schema_version": "v1", "tags": {"incidents": "SYNTHETIC", "detection": "DERIVED", "attribution": "DERIVED"},
                            "incidents": incs, "operating_point": "best_event_f1"})

    # ---- overview
    nb = -(-N_ROWS // BIN_S)
    pad = nb * BIN_S - N_ROWS
    def binmax(a, fill=0):
        return np.r_[a, np.full(pad, fill, a.dtype)].reshape(nb, BIN_S).max(1)
    frac = np.r_[y, np.zeros(pad, y.dtype)].reshape(nb, BIN_S).mean(1)
    save("overview.json", {"schema_version": "v1", "tags": {"scores": "DERIVED", "labels": "SYNTHETIC"}, "bin_s": BIN_S, "bins": nb,
                           "encoding": "scores_q_max: u16le-base64 max-pool per bin; anomaly_frac_u8: round(255 * fraction of rows labelled anomalous)",
                           "anomaly_frac_u8": b64(np.rint(frac * 255), "u1"), "scores_q_max": {d: b64(binmax(q[d]), "<u2") for d in DETECTORS},
                           "incident_bins": [[int(s[i] // BIN_S), i, list(SPLITS).index(splits[i])] for i in ids]})

    # ---- channels
    tr = slice(*SPLITS["train"])
    save("channels.json", {"schema_version": "v1", "tags": {"channels": "SYNTHETIC"},
                           "grouping_note": "aimp amud arnd asin1 asin2 adbr adfl are 4 control commands and 3 external stimuli per the dataset document; the document's name-to-role figure was not machine-readable, so they are grouped as context without assigning roles.",
                           "channels": [{"id": c, "group": "context" if c in CONTEXT else "telemetry", "binary_like": bool(len(np.unique(X[tr, j])) <= 2),
                                         "train_mean": float(X[tr, j].mean()), "train_std": float(X[tr, j].std()), "train_min": float(X[tr, j].min()),
                                         "train_max": float(X[tr, j].max()), "lo": rng[c][0], "hi": rng[c][1],
                                         "resid_median_window_s": fe.MED_W if c in TELEMETRY else None,
                                         "resid_scale": float(res_scale[TELEMETRY.index(c)]) if c in TELEMETRY else None} for j, c in enumerate(CHANNELS)]})

    # ---- detector_eval + sweep
    det_eval, sweep_d = {}, {}
    for d in DETECTORS:
        pts = {}
        for op in ev.OPS:
            tq = R["ops"][d][op]
            pts[op] = {"threshold_q": tq, "threshold_score": ev.dequantise(tq, R["quant"][d]), "selected_on": "val only", **R["metrics"][d][op]}
        t = R["metrics"][d]["best_event_f1"]["test"]
        pf, paf = t["point"]["f1"], t["point_adjusted"]["f1"]
        det_eval[d] = {"points": pts, "average_precision": R["ap"][d], "pr_curve": R["pr"][d],
                       "test_point_f1_vs_point_adjusted": {"point_f1": pf, "point_adjusted_f1": paf, "inflation": (paf / pf if pf else None)}}
        sweep_d[d] = {"thresholds_q": [int(x) for x in R["thr"][d]], "splits": {}}
        for sp in ("val", "test"):
            rows = R["sweep"][d][sp]
            sweep_d[d]["splits"][sp] = {"rows": rows[0]["rows"], "positives": rows[0]["positives"], "segments": rows[0]["segments"],
                                        "days": rows[0]["rows"] / SECONDS_PER_DAY,
                                        "p_tp": [r["tp"] for r in rows], "p_fp": [r["fp"] for r in rows], "pa_tp": [r["pa_tp"] for r in rows],
                                        "ev_detected": [r["detected"] for r in rows], "ev_alerts": [r["alerts"] for r in rows], "ev_false": [r["false_alerts"] for r in rows],
                                        "delay_median_s": [r["delay_median_s"] for r in rows]}
    best_det = max(DETECTORS, key=lambda d: ev.M.event_f1(_ev_raw(R, d)))
    save("detector_eval.json", {"schema_version": "v1", "tags": {"metrics": "DERIVED"}, "operating_points": list(ev.OPS), "detectors": det_eval,
                                "best_detector_by_test_event_f1": best_det,
                                "caveat_point_adjust": "Point-adjusted scores count a whole labelled segment as detected when any single point in it is flagged. This inflates recall and F1, often by a factor of 1.5 to 8, so the page always shows point-wise, point-adjusted and event-level numbers side by side."})
    save("threshold_sweep.json", {"schema_version": "v1", "tags": {"metrics": "DERIVED"}, "metric_params": {"merge_gap_s": MERGE_GAP, "tol_after_s": TOL_AFTER},
                                  "detectors": sweep_d,
                                  "note": "Thresholds are integers in each detector's quantized score domain, chosen from quantiles of VAL scores only; test rows use the same thresholds. delay_median_s = -1 means no segment detected."})

    # ---- attribution
    def agg(rs):
        return {"n": len(rs), "hit_at_1": float(np.mean([r["hit_at_1"] for r in rs])), "hit_at_3": float(np.mean([r["hit_at_3"] for r in rs])),
                "hit_at_3_any": float(np.mean([r["hit_at_3_any"] for r in rs])), "mean_root_rank": float(np.mean([r["root_rank"] for r in rs]))}
    test_idx = [i for i in ids if splits[i] == "test"]
    prc = {}
    for r_ in sorted(set(rc)):
        ix = [i for i in ids if rc[i] == r_]
        prc[r_] = {"n": len(ix), "hit_at_1_robust_z": float(np.mean([attr["robust_z"][i]["hit_at_1"] for i in ix])), "hit_at_1_pca": float(np.mean([attr["pca"][i]["hit_at_1"] for i in ix]))}
    A = {"schema_version": "v1", "tags": {"attribution": "DERIVED", "labels": "SYNTHETIC"}, "channels_scored": list(TELEMETRY),
         "wording": "Contributing measurements, not causes. The dataset's own column is named root_cause; we score the top-ranked channels against it as a benchmark label only.",
         "methods": {k: {"all": agg(attr[k]), "test": agg([attr[k][i] for i in test_idx])} for k in ("robust_z", "pca")},
         "random_baseline": {"hit_at_1": 0.1, "hit_at_3": 0.3, "hit_at_3_any": 1 - 56 / 120, "mean_root_rank": 5.5}, "per_root_cause": prc}
    save("attribution.json", A)

    # ---- quality + reconciliation
    checks = run_checks()
    save("quality.json", {"schema_version": "v1", "tags": {"quality": "DERIVED"}, "checks": checks, "passed": sum(c["passed"] for c in checks), "failed": sum(not c["passed"] for c in checks)})
    man = json.loads((MANIFESTS / "raw_manifest.json").read_text())
    ys, ye = M.segments(y)
    save("reconciliation.json", {"schema_version": "v1", "tags": {"ledger": "DERIVED"},
                                 "ledger": [{"stage": "raw data.parquet", "rows_in": N_ROWS, "rows_out": N_ROWS, "dropped": 0, "reason": "as downloaded, md5 verified"},
                                            {"stage": "clean (float32 cast, label check)", "rows_in": N_ROWS, "rows_out": N_ROWS, "dropped": 0, "reason": "no nulls, no gaps, no duplicates found, nothing imputed"},
                                            {"stage": "split train/gbm_fit/val/test", "rows_in": N_ROWS, "rows_out": N_ROWS, "dropped": 0, "reason": "contiguous, covers all rows"}],
                                 "labels": {"segments_metadata": len(inc), "segments_from_y": int(len(ys)), "mismatched_rows": int((rebuild_labels(inc) != y).sum()),
                                            "end_convention": "end_time in metadata.csv is exclusive: segment = [start, end)", "contamination": float(y.mean()),
                                            "anomalies_in_first_million_rows": int(y[:1_000_000].sum()), "category_matches": bool(((cat > 0) == (y == 1)).all())},
                                 "files": [{k: f[k] for k in ("name", "bytes", "md5", "sha256")} for f in man["files"]]})

    # ---- alerts (DR-3)
    def alerts_obj(ops):
        return {"schema_version": "v1", "tags": {"alerts": "DERIVED"}, "metric_params": {"merge_gap_s": MERGE_GAP, "tol_after_s": TOL_AFTER},
                "row_base": "global row index = seconds since 2023-01-01T00:00:00; runs are [start, end) with end exclusive; third value 1 = false alert",
                "operating_points_included": ops, "excluded_note": None if len(ops) == 3 else "best_point_f1 excluded: file would exceed 60 KB gzip (Isolation Forest raises thousands of alerts at that threshold)",
                "detectors": {d: {op: R["alerts"][d][op] for op in ops} for d in DETECTORS}}
    ops_in = list(ev.OPS)
    save("alerts.json", alerts_obj(ops_in))
    if gz_bytes(PUBLIC / "alerts.json") > ALERTS_GZ_BUDGET:
        ops_in = ["best_event_f1", "far_budget_1_per_day"]
        save("alerts.json", alerts_obj(ops_in))

    # ---- hero slice (DR-7) and residual parity case (DR-1)
    hi_ = HERO_WINDOW_INCIDENT
    a, b, _ = bounds[hi_]
    hb = a + HERO_SECONDS
    save("window_142_hero.json", {"schema_version": "v1", "tags": {"channels": "SYNTHETIC", "scores": "DERIVED"}, "id": f"{hi_:03d}-hero", "source_window": f"{hi_:03d}",
                                  "row0": a, "n": HERO_SECONDS, "seconds": [0, HERO_SECONDS], "anomaly_start": int(s[hi_]) - a, "anomaly_end": min(int(e[hi_]), hb) - a,
                                  "encoding": "same as window files: u16le-base64; channels v = lo + q/65535*(hi-lo); pca score per meta.detectors.pca.quant; labels u8",
                                  "labels_u8": b64(y[a:hb], "u1"),
                                  "channels_u16": {c: b64(quant_ch(a, hb, CHANNELS.index(c), c), "<u2") for c in TELEMETRY},
                                  "channel_range": {c: list(rng[c]) for c in TELEMETRY}, "scores_q_u16": {"pca": b64(q["pca"][a:hb], "<u2")}})
    zr = {}
    for k, c in enumerate(TELEMETRY):
        j = CHANNELS.index(c)
        lo_c, hi_c = rng[c]
        xq = lo_c + quant_ch(a, b, j, c).astype(np.float64) / 65535 * (hi_c - lo_c)
        # exact trailing median in float64 (numpy), so a browser implementation can match it; the detectors themselves use polars rolling median on float32
        med = np.array([np.median(xq[max(0, t - fe.MED_W + 1):t + 1]) for t in range(RESID_CASE_SECONDS)])
        zr[c] = [round(float(v), 6) for v in np.abs(xq[:RESID_CASE_SECONDS] - med) / float(res_scale[k])]
    resid_cases = [{"name": "zres_window_142", "window": f"{hi_:03d}", "median_window_s": fe.MED_W, "min_samples": 1, "seconds": RESID_CASE_SECONDS, "tolerance_rel": 1e-5,
                    "definition": "Decode the published window channel (v = lo + q/65535*(hi-lo)), subtract the trailing median of the last 61 values (fewer at the start, min_samples=1, mean of the two middle values for even counts), divide by channels[].resid_scale, absolute value. First 600 s of the window.",
                    "zres": zr}]

    # ---- recompute vectors
    cases = toy_cases()
    for i in win_ids[:6]:
        d = DETECTORS[win_ids.index(i) % len(DETECTORS)]
        a = max(0, int(s[i]) - PAD)
        b = min(a + 1500, N_ROWS)
        cases.append({"name": f"window_{i:03d}_{d}", "source": "real_window", "scores_q": [int(v) for v in q[d][a:b]], "labels": [int(v) for v in y[a:b]],
                      "threshold_q": int(R["ops"][d]["best_event_f1"])})
    for c in cases:
        c["expected"] = expected(c["scores_q"], c["labels"], c["threshold_q"])
    save("recompute_vectors.json", {"schema_version": "v1", "tags": {"metrics": "DERIVED"}, "metric_params": {"merge_gap_s": MERGE_GAP, "tol_after_s": TOL_AFTER},
                                    "residual_cases": resid_cases,
                                    "definition": "flag = scores_q >= threshold_q. Segments are runs of labels == 1. Alerts merge runs separated by <= merge_gap_s unflagged points. False alert = overlaps no [start, end + tol_after_s). delay = first flagged point in the segment minus start. See docs/DATA_CONTRACTS.md.",
                                    "cases": cases})

    # ---- facts
    F = {}
    def fact(k, v, tag, unit=""):
        F[k] = {"value": v, "tag": tag, "unit": unit}
    fact("rows", N_ROWS, "SYNTHETIC", "rows"); fact("days", N_ROWS / SECONDS_PER_DAY, "SYNTHETIC", "days"); fact("channels", 17, "SYNTHETIC", "channels")
    fact("telemetry_channels", 10, "SYNTHETIC", "channels"); fact("incidents", len(inc), "SYNTHETIC", "segments"); fact("contamination_pct", float(y.mean()) * 100, "SYNTHETIC", "%")
    for sp in SPLITS:
        lo, hi = SPLITS[sp]
        fact(f"split.{sp}.rows", hi - lo, "DERIVED", "rows"); fact(f"split.{sp}.segments", int(((s >= lo) & (e <= hi)).sum()), "DERIVED", "segments")
    fact("val_days", (SPLITS['val'][1] - SPLITS['val'][0]) / SECONDS_PER_DAY, "DERIVED", "days"); fact("test_days", (SPLITS['test'][1] - SPLITS['test'][0]) / SECONDS_PER_DAY, "DERIVED", "days")
    fact("median_incident_duration_s", float(np.median(e - s)), "SYNTHETIC", "s"); fact("categories", 13, "SYNTHETIC", "categories")
    for d in DETECTORS:
        tg = DETECTOR_TAGS[d]
        fact(f"{d}.test.average_precision", R["ap"][d]["test"], tg); fact(f"{d}.val.average_precision", R["ap"][d]["val"], tg)
        for op in ev.OPS:
            m = R["metrics"][d][op]["test"]
            fact(f"{d}.{op}.test.point_f1", m["point"]["f1"], tg); fact(f"{d}.{op}.test.point_adjusted_f1", m["point_adjusted"]["f1"], tg)
            fact(f"{d}.{op}.test.event_recall", m["event"]["recall"], tg); fact(f"{d}.{op}.test.detected", m["event"]["detected"], tg, "segments")
            fact(f"{d}.{op}.test.false_alerts_per_day", m["event"]["false_alerts_per_day"], tg, "per day"); fact(f"{d}.{op}.test.delay_median_s", m["event"]["delay_median_s"], tg, "s")
            fact(f"{d}.{op}.test.alert_precision", m["event"]["alert_precision"], tg)
            fact(f"{d}.{op}.val.false_alerts_per_day", R["metrics"][d][op]["val"]["event"]["false_alerts_per_day"], tg, "per day")
    fact("best_detector_by_test_event_f1", best_det, "DERIVED")
    for k in ("robust_z", "pca"):
        for sc, rs in (("all", A["methods"][k]["all"]), ("test", A["methods"][k]["test"])):
            fact(f"attribution.{k}.{sc}.hit_at_1", rs["hit_at_1"], "DERIVED"); fact(f"attribution.{k}.{sc}.hit_at_3", rs["hit_at_3"], "DERIVED")
    fact("attribution.random.hit_at_1", 0.1, "DERIVED"); fact("attribution.random.hit_at_3", 0.3, "DERIVED")
    fact("nominal_pct", 100 - float(y.mean()) * 100, "SYNTHETIC", "%")
    ndet, nseg = det_eval["pca"]["points"]["best_event_f1"]["test"]["event"]["detected"], det_eval["pca"]["points"]["best_event_f1"]["test"]["event"]["segments"]
    assert ndet == det_eval["gbm"]["points"]["best_event_f1"]["test"]["event"]["detected"]
    pw, zc_ = ndet / nseg, 1.96
    half = zc_ * np.sqrt(pw * (1 - pw) / nseg + zc_ ** 2 / (4 * nseg ** 2)) / (1 + zc_ ** 2 / nseg)
    fact("event_recall_ci_halfwidth", float(half), "DERIVED", "fraction")
    fact("event_recall_ci_method", f"95% Wilson score interval for {ndet} of {nseg} test incidents (PCA and GBM at best_event_f1); one run, one seed", "DERIVED")
    infl = {d: det_eval[d]["test_point_f1_vs_point_adjusted"]["inflation"] for d in DETECTORS}
    for d, v in infl.items():
        fact(f"point_adjust_inflation.{d}", v, "DERIVED", "x")
    mx = max((d for d in DETECTORS if infl[d] is not None), key=lambda d: infl[d])
    fact("point_adjust_inflation.max", infl[mx], "DERIVED", "x"); fact("point_adjust_inflation.max_detector", mx, "DERIVED")
    fact("windows_published", len(win_ids), "DERIVED", "windows"); fact("categories_with_window", len({int(cats[i]) for i in win_ids}), "DERIVED", "categories")
    fact("quality_checks_passed", sum(c["passed"] for c in checks), "DERIVED", "checks"); fact("quality_checks_total", len(checks), "DERIVED", "checks")
    save("facts.json", {"schema_version": "v1", "tags": {"facts": "DERIVED"}, "values": F})

    # ---- meta (written last so it can report artifact sizes)
    meta = {"schema_version": "v1", "tags": tags, "pipeline_version": VERSION, "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "dataset": {"name": "CATS (Controlled Anomalies Time Series) Dataset", "version": "2", "doi": ZENODO_DOI, "url": "https://zenodo.org/records/8338435",
                        "licence": "CC-BY-4.0", "licence_url": "https://creativecommons.org/licenses/by/4.0/", "provider": "Solenix Engineering GmbH (Patrick Fleith)",
                        "rows": N_ROWS, "hz": 1, "start_utc": "2023-01-01T00:00:00", "end_utc": "2023-02-27T20:53:19",
                        "nature": "Simulated complex dynamical system with 200 deliberately injected anomalies; not real telemetry."},
            "attribution": ATTRIBUTION,
            "splits": {k: {"lo": lo, "hi": hi, "rows": hi - lo, "positives": int(y[lo:hi].sum()), "segments": int(((s >= lo) & (e <= hi)).sum()), "days": (hi - lo) / SECONDS_PER_DAY} for k, (lo, hi) in SPLITS.items()},
            "metric_params": {"merge_gap_s": MERGE_GAP, "tol_after_s": TOL_AFTER, "thresholds_per_detector": ev.N_THR, "operating_points": list(ev.OPS)},
            "detectors": {d: {"label": LABELS[d][0], "family": LABELS[d][1], "tag": DETECTOR_TAGS[d], "supervised": LABELS[d][2], "causal": LABELS[d][3], "description": LABELS[d][4],
                              "quant": R["quant"][d], "has_channel_contributions": d in ("robust_z", "pca")} for d in DETECTORS},
            "windows": windows_meta,
            "windows_note": "One window per category 1..13: the earliest test incident of that category (val, then gbm_fit, as fallback); each window is the labelled segment plus 300 s either side, capped at 3,600 rows. Truncated windows (anomaly_end == n) are marked truncated in their files.",
            "hero_window": {"file": "window_142_hero.json", "source_window": "142", "seconds": [0, HERO_SECONDS]},
            "contrib_quant": contrib_quant,
            "sources": {"engine": info, "zenodo_record": "https://zenodo.org/records/8338435"}, "artifact_tags": {}, "artifact_bytes": {}}
    names = sorted(p.name for p in PUBLIC.glob("*.json"))
    meta["artifact_tags"] = {n: "see tags inside each file" for n in names}
    save("meta.json", meta)
    sizes = {p.name: {"raw": p.stat().st_size, "gzip": gz_bytes(p)} for p in sorted(PUBLIC.glob("*.json"))}
    meta["artifact_bytes"] = sizes
    save("meta.json", meta)
    return sizes


def _ev_raw(R, d):
    m = R["metrics"][d]["best_event_f1"]["test"]["event"]
    return {"alerts": m["alerts"], "false_alerts": m["false_alerts"], "detected": m["detected"], "segments": m["segments"]}


if __name__ == "__main__":
    for k, v in main().items():
        print(f"{k:28s} {v['raw']:>9,} raw {v['gzip']:>8,} gz")
