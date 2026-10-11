"""Browser-recompute parity: the stored vectors must equal an independent plain-loop implementation of the documented definition."""
import base64

import numpy as np

from pipelines.common import DETECTORS, Q_MAX
from tests.ref_metrics import evaluate as ref


def test_vectors_match_independent_reference(art):
    v = art("recompute_vectors.json")
    assert len(v["cases"]) >= 8 and any(c["source"] == "real_window" for c in v["cases"])
    mp = v["metric_params"]
    for c in v["cases"]:
        got = ref(c["scores_q"], c["labels"], c["threshold_q"], mp["merge_gap_s"], mp["tol_after_s"])
        assert got == c["expected"], c["name"]


def test_vectors_cover_edge_rules(art):
    names = {c["name"] for c in art("recompute_vectors.json")["cases"]}
    assert {"merge_gap_exact_30", "merge_gap_31_splits", "tolerance_60_after_end", "tolerance_exceeded", "no_flags", "all_flagged"} <= names


def test_window_scores_decode_and_labels_align(art):
    meta = art("meta.json")
    for w in meta["windows"]:
        d = art(w["file"])
        for det in DETECTORS:
            q = np.frombuffer(base64.b64decode(d["scores_q_u16"][det]), "<u2")
            assert len(q) == d["n"] and q.max() <= Q_MAX
        lab = np.frombuffer(base64.b64decode(d["labels_u8"]), "u1")
        assert len(lab) == d["n"] and lab[d["anomaly_start"]] == 1 and (lab[d["anomaly_start"]:d["anomaly_end"]] == 1).all()
        if not d["truncated"]:
            assert lab[d["anomaly_end"]] == 0  # end exclusive


def test_sweep_matches_quantized_domain(art):
    sw, meta = art("threshold_sweep.json"), art("meta.json")
    for det in DETECTORS:
        t = sw["detectors"][det]["thresholds_q"]
        assert t == sorted(set(t)) and 1 <= t[0] and t[-1] <= Q_MAX
        for sp in ("val", "test"):
            s = sw["detectors"][det]["splits"][sp]
            assert len(s["p_tp"]) == len(t)
            assert all(a >= b for a, b in zip(s["p_tp"], s["p_tp"][1:]))   # stricter threshold never adds true positives
            assert all(a >= b for a, b in zip(s["p_fp"], s["p_fp"][1:]))
            assert all(tp <= s["positives"] for tp in s["p_tp"]) and all(p >= q for p, q in zip(s["pa_tp"], s["p_tp"]))
            assert s["rows"] == meta["splits"][sp]["rows"] and s["segments"] == meta["splits"][sp]["segments"]


def test_quantisation_roundtrip_bound(art):
    meta = art("meta.json")
    for det in DETECTORS:
        qi = meta["detectors"][det]["quant"]
        x = np.geomspace(qi["c"] * 1e-3, qi["c"] * np.expm1(qi["smax"]), 1000)
        q = np.rint(np.clip(np.log1p(x / qi["c"]) / qi["smax"], 0, 1) * Q_MAX)
        back = qi["c"] * np.expm1(q / Q_MAX * qi["smax"])
        rel = np.abs(back - x) / np.maximum(x, qi["c"])
        assert rel.max() < 2 * qi["smax"] / Q_MAX * 1.05 * np.exp(qi["smax"]) or rel.max() < 0.05
