"""P06-DATA-002: DR-1..DR-7 artifact tests. Mostly artifact-only (no raw data needed)."""
import base64

import numpy as np
import pytest

from pipelines.common import CHANNELS, DETECTORS, MERGE_GAP, TELEMETRY
from tests.conftest import need_data

OPS = ("best_point_f1", "best_event_f1", "far_budget_1_per_day")


def u16(b):
    return np.frombuffer(base64.b64decode(b), "<u2")


def test_dr1_resid_scale_published_for_telemetry_only(art):
    ch = {c["id"]: c for c in art("channels.json")["channels"]}
    for c in TELEMETRY:
        assert ch[c]["resid_median_window_s"] == 61 and ch[c]["resid_scale"] >= 1e-6
    for c in set(CHANNELS) - set(TELEMETRY):
        assert ch[c]["resid_median_window_s"] is None and ch[c]["resid_scale"] is None


@need_data
def test_dr1_resid_scale_equals_pipeline(series, art):
    from analytics import features as fe
    X, _, _ = series
    F = fe.build(X, light=True)
    ch = {c["id"]: c for c in art("channels.json")["channels"]}
    assert np.allclose([ch[c]["resid_scale"] for c in TELEMETRY], F["res_scale"], rtol=1e-6)


def test_dr1_zres_parity_vector_matches_independent_numpy(art):
    case = art("recompute_vectors.json")["residual_cases"][0]
    assert case["name"] == "zres_window_142" and case["seconds"] == 600
    win = art("window_142.json")
    ch = {c["id"]: c for c in art("channels.json")["channels"]}
    for c in TELEMETRY:
        lo, hi = win["channel_range"][c]
        x = lo + u16(win["channels_u16"][c]).astype(np.float64) / 65535 * (hi - lo)
        z = np.array([abs(x[t] - np.median(x[max(0, t - 60):t + 1])) for t in range(case["seconds"])]) / ch[c]["resid_scale"]
        assert np.allclose(z, case["zres"][c], rtol=case["tolerance_rel"], atol=2e-6), c


def test_dr2_detection_by_op_consistent(art):
    inc, ev = art("incidents.json")["incidents"], art("detector_eval.json")["detectors"]
    for d in DETECTORS:
        for op in OPS:
            for sp in ("val", "test"):
                n = sum(i["detection_by_op"][op][d]["detected"] for i in inc if i["split"] == sp)
                assert n == ev[d]["points"][op][sp]["event"]["detected"], (d, op, sp)
        assert all(i["detection"][d] == i["detection_by_op"]["best_event_f1"][d] for i in inc)


def test_dr2_rise_rebuilds_every_sweep_row(art):
    inc, sw = art("incidents.json")["incidents"], art("threshold_sweep.json")["detectors"]
    for i in inc:
        for d in DETECTORS:
            r = i["rise"][d]
            assert r[0][0] == 0 and all(b[0] > a[0] and b[1] > a[1] for a, b in zip(r, r[1:])) and r[-1][0] < i["duration_s"]
    for d in DETECTORS:
        for sp in ("val", "test"):
            S = sw[d]["splits"][sp]
            rows = [i for i in inc if i["split"] == sp]
            for k, t in enumerate(sw[d]["thresholds_q"]):
                delays = []
                for i in rows:
                    hit = next((dt for dt, q in i["rise"][d] if q >= t), None)
                    if hit is not None:
                        delays.append(hit)
                assert len(delays) == S["ev_detected"][k], (d, sp, t)
                med = float(np.median(delays)) if delays else -1.0
                assert abs(med - S["delay_median_s"][k]) < 1e-9, (d, sp, t)


def test_dr2_incident_detection_in_json_matches_rise_at_op_threshold(art):
    inc, ev = art("incidents.json")["incidents"], art("detector_eval.json")["detectors"]
    for d in DETECTORS:
        for op in OPS:
            t = ev[d]["points"][op]["threshold_q"]
            for i in inc:
                hit = next((dt for dt, q in i["rise"][d] if q >= t), None)
                got = i["detection_by_op"][op][d]
                assert got["detected"] == (hit is not None) and got["delay_s"] == hit


def test_dr3_alerts_match_event_metrics(art):
    al, ev = art("alerts.json"), art("detector_eval.json")["detectors"]
    assert {"best_event_f1", "far_budget_1_per_day"} <= set(al["operating_points_included"])
    if len(al["operating_points_included"]) < 3:
        assert "best_point_f1" in al["excluded_note"]
    for d in DETECTORS:
        for op in al["operating_points_included"]:
            for sp in ("val", "test"):
                runs = al["detectors"][d][op][sp]
                m = ev[d]["points"][op][sp]["event"]
                assert len(runs) == m["alerts"] and sum(r[2] for r in runs) == m["false_alerts"], (d, op, sp)
                assert all(a < b for a, b, _ in runs) and all(r2[0] - r1[1] > MERGE_GAP for r1, r2 in zip(runs, runs[1:]))


def test_dr3_false_flag_follows_tolerance_rule(art):
    al, inc = art("alerts.json"), art("incidents.json")["incidents"]
    tol = al["metric_params"]["tol_after_s"]
    for sp in ("val", "test"):
        segs = [(i["start"], i["end"]) for i in inc if i["split"] == sp]
        for a, b, f in al["detectors"]["pca"]["best_event_f1"][sp]:
            overlap = any(a < e + tol and s < b for s, e in segs)
            assert f == (0 if overlap else 1)


def test_dr5_fact_additions(art):
    f, meta = art("facts.json")["values"], art("meta.json")
    assert abs(f["nominal_pct"]["value"] + f["contamination_pct"]["value"] - 100) < 1e-9
    assert 0.09 < f["event_recall_ci_halfwidth"]["value"] < 0.13 and "Wilson" in f["event_recall_ci_method"]["value"]
    infl = {d: f[f"point_adjust_inflation.{d}"]["value"] for d in DETECTORS}
    mx = f["point_adjust_inflation.max_detector"]["value"]
    assert infl[mx] == max(infl.values()) == f["point_adjust_inflation.max"]["value"] and mx == "iforest"
    assert f["windows_published"]["value"] == len(meta["windows"]) == 13 and f["categories_with_window"]["value"] == 13


def test_dr6_category13_window(art):
    w = [x for x in art("meta.json")["windows"] if x["category"] == 13]
    assert len(w) == 1 and w[0]["split"] == "test"
    d = art(w[0]["file"])
    assert d["category"] == 13 and "windows_note" in art("meta.json")


def test_dr7_hero_slice_equals_window_prefix(art):
    h, w = art("window_142_hero.json"), art("window_142.json")
    assert h["n"] == 1200 and h["row0"] == w["row0"] and h["anomaly_start"] == w["anomaly_start"]
    for c in TELEMETRY:
        assert np.array_equal(u16(h["channels_u16"][c]), u16(w["channels_u16"][c])[:1200])
    assert np.array_equal(u16(h["scores_q_u16"]["pca"]), u16(w["scores_q_u16"]["pca"])[:1200])
    assert art("meta.json")["hero_window"]["file"] == "window_142_hero.json"


def test_dr4_contributions_reproduce_incident_attribution(art):
    meta = art("meta.json")
    inc = {i["id"]: i for i in art("incidents.json")["incidents"]}
    checked = 0
    for w in meta["windows"]:
        win, cb = art(w["file"]), art(w["contrib_file"])
        assert cb["n"] == win["n"] and cb["row0"] == win["row0"]
        for k in ("robust_z", "pca"):
            qi = meta["contrib_quant"][k]
            M = np.array([qi["c"] * np.expm1(u16(cb["contrib_q_u16"][k][c]) / 65535 * qi["smax"]) for c in TELEMETRY])
            assert M.shape == (10, win["n"]) and (M >= 0).all()
            if win["truncated"]:
                continue
            mean = M[:, win["anomaly_start"]:win["anomaly_end"]].mean(1)
            top3 = [TELEMETRY[j] for j in np.argsort(-mean)[:3]]
            assert top3 == inc[w["incident_id"]]["attribution"][k]["top3"], (w["id"], k)
            checked += 1
    assert checked >= 20
