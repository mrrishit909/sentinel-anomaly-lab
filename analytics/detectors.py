"""Five detectors. Each returns a float32 score series (higher = more anomalous) over all rows.

Unsupervised detectors are fit on the nominal train split only. The GBM uses labels from the gbm_fit split only.
"""
from __future__ import annotations

import numpy as np
import polars as pl
import ruptures as rpt
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest

from pipelines.common import CHANNELS, SPLITS, TELEMETRY

SEED = 20260101
CHUNK = 500_000
CP_BIN = 10     # seconds per change-point bin
CP_WIDTH = 20   # bins per ruptures Window (left half + right half = 10 bins each = 100 s each)


def tr_slice() -> slice:
    return slice(*SPLITS["train"])


def robust_z(F: dict) -> tuple[np.ndarray, np.ndarray]:
    """max over telemetry channels of |x - rolling median| / robust train scale. Also returns the per-channel matrix (contributions)."""
    return F["zres"].max(1).astype(np.float32), F["zres"]


def _pca_input(F: dict) -> np.ndarray:
    return np.hstack([F["Z"], np.clip(F["res"] / F["res_scale"], -50, 50) / 10]).astype(np.float32)


def pca_error(F: dict, var: float = 0.95) -> tuple[np.ndarray, np.ndarray, dict]:
    """Squared reconstruction error of a PCA fit on train. Returns score, per-telemetry-channel error (level + residual feature), info."""
    A = _pca_input(F)
    tr = tr_slice()
    m = PCA(n_components=var, svd_solver="full", random_state=SEED).fit(A[tr])
    n, d = A.shape
    err = np.empty((n, d), np.float32)
    for lo in range(0, n, CHUNK):
        a = A[lo:lo + CHUNK]
        err[lo:lo + CHUNK] = (a - m.inverse_transform(m.transform(a))) ** 2
    ti = [CHANNELS.index(c) for c in TELEMETRY]
    contrib = err[:, ti] + err[:, len(CHANNELS):]
    contrib = contrib / np.maximum(contrib[tr].mean(0), 1e-9)
    return err.sum(1).astype(np.float32), contrib.astype(np.float32), {"components": int(m.n_components_), "explained": float(m.explained_variance_ratio_.sum())}


def isolation_forest(F: dict, n_fit: int = 200_000) -> tuple[np.ndarray, dict]:
    A = np.hstack([F["Z"], np.log1p(F["zres_max30"])]).astype(np.float32)
    rng = np.random.default_rng(SEED)
    tr = tr_slice()
    fit_idx = rng.choice(np.arange(tr.start, tr.stop), n_fit, replace=False)
    m = IsolationForest(n_estimators=100, max_samples=4096, random_state=SEED, n_jobs=4).fit(A[fit_idx])
    out = np.empty(len(A), np.float32)
    for lo in range(0, len(A), CHUNK):
        out[lo:lo + CHUNK] = -m.score_samples(A[lo:lo + CHUNK])
    return out, {"n_estimators": 100, "max_samples": 4096, "n_fit_rows": n_fit}


def change_point(F: dict) -> tuple[np.ndarray, dict]:
    """ruptures Window (l2 mean-shift) on 10 s means of train-standardised telemetry. Offline algorithm made causal: the discrepancy for
    a window centred on bin i needs bins up to i + width/2, so it is assigned to the END of that look-ahead (bin i + width/2) and held
    for the 10 rows of that bin. No row's score uses data from its future."""
    ti = [CHANNELS.index(c) for c in TELEMETRY]
    Z = F["Z"][:, ti]
    nb = len(Z) // CP_BIN
    B = Z[:nb * CP_BIN].reshape(nb, CP_BIN, -1).mean(1).astype(np.float64)
    algo = rpt.Window(width=CP_WIDTH, model="l2", jump=1).fit(B)
    algo.predict(n_bkps=1)  # populates algo.score
    sc = np.asarray(algo.score, dtype=np.float64)
    sc = np.nan_to_num(sc)
    # Window.score[k] covers bins k .. k + width - 1 (left half | right half), so it is complete once bin k + width - 1 has ended
    caus = np.zeros(nb)
    L = min(len(sc), nb - (CP_WIDTH - 1))
    caus[CP_WIDTH - 1:CP_WIDTH - 1 + L] = sc[:L]
    out = np.repeat(caus, CP_BIN)
    out = np.r_[out, np.zeros(len(Z) - len(out))].astype(np.float32)
    # shift one more bin: a bin's mean is only complete at its last second
    out = np.r_[np.zeros(CP_BIN - 1, np.float32), out[:-(CP_BIN - 1)]]
    return out, {"bin_s": CP_BIN, "window_bins": CP_WIDTH, "model": "l2", "ruptures": rpt.__version__ if hasattr(rpt, "__version__") else "n/a"}


def gbm_features(F: dict, pca_score: np.ndarray, pca_contrib: np.ndarray) -> np.ndarray:
    """Per-row features. The PCA outputs are unsupervised (fit on train), so they carry no label information."""
    lp = np.log1p(pca_score)
    lpm = pl.Series(lp).rolling_mean(window_size=60, min_samples=1).to_numpy()
    return np.hstack([F["Z"], np.log1p(F["zres"]), np.log1p(F["zres_max30"]), lp[:, None], lpm[:, None], np.log1p(pca_contrib)]).astype(np.float32)


def gbm(F: dict, y: np.ndarray, pca_score: np.ndarray, pca_contrib: np.ndarray) -> tuple[np.ndarray, dict]:
    """Gradient-boosted trees (sklearn HistGradientBoosting) trained on the gbm_fit split. The number of iterations is chosen by average
    precision on the LAST 20% of gbm_fit (still before val), then the model is refit on the first 80%. Val and test are never seen."""
    from sklearn.ensemble import HistGradientBoostingClassifier as HGB
    from sklearn.metrics import average_precision_score
    A = gbm_features(F, pca_score, pca_contrib)
    lo, hi = SPLITS["gbm_fit"]
    cut = lo + int((hi - lo) * 0.8)
    while y[cut - 1] == 1 and y[cut] == 1:  # the cut must not fall inside a segment
        cut += 1
    kw = dict(learning_rate=0.1, max_depth=3, max_leaf_nodes=8, min_samples_leaf=2000, l2_regularization=5.0, early_stopping=False, random_state=SEED)
    m = HGB(max_iter=200, **kw).fit(A[lo:cut], y[lo:cut])
    aps = [average_precision_score(y[cut:hi], p[:, 1]) for p in m.staged_predict_proba(A[cut:hi])]
    best = int(np.argmax(aps)) + 1
    m = HGB(max_iter=best, **kw).fit(A[lo:cut], y[lo:cut])
    out = np.empty(len(A), np.float32)
    for s in range(0, len(A), CHUNK):
        out[s:s + CHUNK] = m.predict_proba(A[s:s + CHUNK])[:, 1]
    return out, {"best_iteration": best, "es_average_precision": float(max(aps)), "fit_rows": [int(lo), int(cut)], "early_stop_rows": [int(cut), int(hi)], "n_features": int(A.shape[1])}
