"""Data-level tests; need data/raw + data/processed (skipped when absent)."""
import numpy as np
import polars as pl

from analytics import evaluate as ev, features as fe
from analytics import metrics as M
from pipelines.cleaning.clean import load_incidents, rebuild_labels
from pipelines.common import PROCESSED, SPLITS
from pipelines.quality import run_checks
from tests.conftest import need_data

pytestmark = need_data


def test_label_alignment_index_base():
    inc = load_incidents()
    y = pl.read_parquet(PROCESSED / "cats.parquet", columns=["y"])["y"].to_numpy()
    assert (rebuild_labels(inc) == y).all()                                  # end exclusive reproduces y exactly
    assert (rebuild_labels(inc.with_columns(end=inc["end"] + 1)) != y).sum() == 200  # inclusive reading is off by one per segment
    s0, e0 = int(inc["start"][0]), int(inc["end"][0])
    assert y[s0 - 1] == 0 and y[s0] == 1 and y[e0 - 1] == 1 and y[e0] == 0
    assert inc.height == 200 and y[:1_000_000].sum() == 0 and abs(y.mean() - 0.038) < 5e-4


def test_quality_checks_all_pass():
    bad = [c for c in run_checks() if not c["passed"]]
    assert not bad, bad


def test_unsupervised_statistics_fit_on_train_only(series):
    X, y, _ = series
    F1 = fe.build(X)
    X2 = X.copy()
    X2[1_000_000:] = X2[1_000_000:] * 3 + 50   # wreck everything after train
    F2 = fe.build(X2)
    for k in ("mu", "sd", "res_scale"):
        assert np.array_equal(F1[k], F2[k]), k


def test_features_are_causal(series):
    X, _, _ = series
    cut = 2_000_000
    A = fe.build(X[:cut + 1000])
    B = fe.build(np.vstack([X[:cut], X[cut:cut + 1000] * 0 + 7]))  # future rows changed
    assert np.array_equal(A["zres"][:cut], B["zres"][:cut]) and np.array_equal(A["zres_max30"][:cut], B["zres_max30"][:cut])


def test_thresholds_use_validation_only(series, scores):
    _, y, _ = series
    base = ev.run(scores, y)["ops"]
    y2 = y.copy()
    lo, hi = SPLITS["test"]
    y2[lo:hi] = np.random.default_rng(1).permutation(y2[lo:hi])   # scramble TEST labels
    assert ev.run(scores, y2)["ops"] == base                      # thresholds unchanged
    y3 = y.copy()
    vlo, vhi = SPLITS["val"]
    y3[vlo:vhi] = np.roll(y3[vlo:vhi], 100_000)                   # sanity: changing VAL labels does change thresholds
    assert ev.run(scores, y3)["ops"] != base


def test_gbm_trained_before_validation(art):
    info = art("meta.json")["sources"]["engine"]["gbm"]
    assert info["early_stop_rows"][1] <= SPLITS["val"][0] and info["fit_rows"][1] <= info["early_stop_rows"][0]


def test_unsupervised_scores_ignore_labels(series):
    """Unsupervised detectors take no labels: scores recomputed from X alone equal the cached ones."""
    from analytics import detectors as de
    X, y, _ = series
    F = fe.build(X)
    cached = np.load(PROCESSED / "engine.npz")
    assert np.allclose(de.robust_z(F)[0], cached["robust_z"])
    assert np.allclose(de.pca_error(F)[0], cached["pca"], rtol=1e-4, atol=1e-5)


def test_attribution_ranks_valid():
    inc = pl.read_csv(PROCESSED / "incidents.csv")
    a = ev.attribution(inc)
    assert all(1 <= r["root_rank"] <= 10 and len(set(r["top3"])) == 3 for k in a for r in a[k]) and len(a["pca"]) == 200
