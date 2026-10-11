"""Run all five detectors once and cache raw float32 scores + per-incident channel contributions to data/processed/engine.npz."""
from __future__ import annotations

import json
import time

import numpy as np
import polars as pl

from analytics import detectors as de, features as fe
from pipelines.common import DETECTORS, PROCESSED


def incident_contrib(contrib: np.ndarray, s: np.ndarray, e: np.ndarray) -> np.ndarray:
    """Mean per-channel contribution over each incident [s, e). (200, 10)"""
    cs = np.vstack([np.zeros((1, contrib.shape[1])), np.cumsum(contrib, axis=0, dtype=np.float64)])
    return ((cs[e] - cs[s]) / (e - s)[:, None]).astype(np.float64)


def main() -> dict:
    t0 = time.time()
    X, y, _ = fe.load()
    F = fe.build(X)
    inc = pl.read_csv(PROCESSED / "incidents.csv")
    s, e = inc["start"].to_numpy(), inc["end"].to_numpy()
    info, scores = {}, {}
    scores["robust_z"], zc = de.robust_z(F)
    ic_rz = incident_contrib(zc, s, e)
    scores["pca"], pc, info["pca"] = de.pca_error(F)
    ic_pca = incident_contrib(pc, s, e)
    scores["iforest"], info["iforest"] = de.isolation_forest(F)
    scores["changepoint"], info["changepoint"] = de.change_point(F)
    scores["gbm"], info["gbm"] = de.gbm(F, y, scores["pca"], pc)
    info["robust_z"] = {"median_window_s": fe.MED_W, "scale": "1.4826*MAD of train residuals", "channels": 10}
    info["seconds"] = round(time.time() - t0, 1)
    np.savez(PROCESSED / "engine.npz", **{k: scores[k] for k in DETECTORS}, contrib_robust_z=ic_rz, contrib_pca=ic_pca)
    (PROCESSED / "engine_info.json").write_text(json.dumps(info, indent=1, default=float))
    return info


if __name__ == "__main__":
    print(main())
