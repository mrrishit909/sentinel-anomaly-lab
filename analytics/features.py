"""Causal feature construction (every value at row t uses rows <= t only)."""
from __future__ import annotations

import numpy as np
import polars as pl

from pipelines.common import CHANNELS, CONTEXT, PROCESSED, SPLITS, TELEMETRY

MED_W = 61   # trailing window (s) for the rolling median baseline
STD_W = 30   # trailing window (s) for rolling residual spread


def load() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """-> X (n,17) float32 in CHANNELS order, y uint8, category uint8"""
    df = pl.read_parquet(PROCESSED / "cats.parquet")
    return df.select(CHANNELS).to_numpy().astype(np.float32), df["y"].to_numpy(), df["category"].to_numpy()


def rolling_median_residual(x: np.ndarray, w: int = MED_W) -> np.ndarray:
    """x - trailing rolling median(x), per column. Trailing window, min_samples=1 at the start."""
    out = np.empty_like(x)
    for j in range(x.shape[1]):
        m = pl.Series(x[:, j]).rolling_median(window_size=w, min_samples=1).to_numpy()
        out[:, j] = x[:, j] - m.astype(np.float32)
    return out


def robust_scale(a: np.ndarray, rows: slice) -> np.ndarray:
    """1.4826 * MAD per column over `rows` (train only), floored so constant channels cannot blow up z."""
    med = np.median(a[rows], axis=0)
    mad = 1.4826 * np.median(np.abs(a[rows] - med), axis=0)
    return np.maximum(mad, 1e-6).astype(np.float32)


def build(X: np.ndarray) -> dict:
    """Return the shared feature blocks. Statistics (scales, means) are fit on the train split only."""
    tr = slice(*SPLITS["train"])
    ti = [CHANNELS.index(c) for c in TELEMETRY]
    mu = X[tr].mean(0, dtype=np.float64).astype(np.float32)  # float64 accumulation: float32 row-wise sums drift by ~0.03%
    sd = np.maximum(X[tr].std(0, dtype=np.float64), 1e-6).astype(np.float32)
    Z = ((X - mu) / sd).astype(np.float32)
    res = rolling_median_residual(X[:, ti])
    scale = robust_scale(res, tr)
    zres = np.abs(res) / scale                          # robust z of each telemetry channel
    rstd = np.empty_like(res)
    for j in range(res.shape[1]):
        rstd[:, j] = pl.Series(np.abs(res[:, j] / scale[j])).rolling_max(window_size=STD_W, min_samples=1).to_numpy()
    return {"mu": mu, "sd": sd, "Z": Z, "res": res, "res_scale": scale, "zres": zres, "zres_max30": rstd}
