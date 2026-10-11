"""Shared paths and constants for the Sentinel Anomaly Lab pipeline."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
MANIFESTS = ROOT / "data" / "manifests"
CONTRACTS = ROOT / "data" / "contracts"
PUBLIC = ROOT / "site" / "public" / "data"

SCHEMA_VERSION = "v1"
ZENODO_RECORD = "8338435"
ZENODO_DOI = "10.5281/zenodo.8338435"
ZENODO_FILES = {  # name -> (zenodo key, md5 from the Zenodo record API)
    "data.parquet": ("data.parquet", "824309369c26902aa520e4b5209977f7"),
    "metadata.csv": ("metadata.csv", "cb52d1d73bf4bb54ebbfb466b94618de"),
    "CATS-DDD.pdf": ("SLXENGDE-CATS-DDD - Controlled Anomalies Time Series - 02.00.pdf", "30fee9cac0a83b8cd679b5e2f5dccf28"),
}

N_ROWS = 5_000_000
SECONDS_PER_DAY = 86_400
CONTEXT = ("aimp", "amud", "arnd", "asin1", "asin2", "adbr", "adfl")  # commands + external stimuli (a*)
TELEMETRY = ("bed1", "bed2", "bfo1", "bfo2", "bso1", "bso2", "bso3", "ced1", "cfo1", "cso1")  # sensor readings (b*, c*)
CHANNELS = CONTEXT + TELEMETRY
DETECTORS = ("robust_z", "pca", "iforest", "changepoint", "gbm")
DETECTOR_TAGS = {"robust_z": "DERIVED", "pca": "DERIVED", "iforest": "DERIVED", "changepoint": "DERIVED", "gbm": "PREDICTED"}

# Row-index splits (row i = i seconds after 2023-01-01T00:00:00, see docs/METHODOLOGY.md). Half-open [lo, hi).
SPLITS = {
    "train": (0, 1_000_000),      # nominal only; unsupervised detectors fit here
    "gbm_fit": (1_000_000, 2_500_000),  # labelled; only the supervised GBM trains here
    "val": (2_500_000, 3_750_000),      # thresholds tuned here and only here
    "test": (3_750_000, 5_000_000),     # untouched until final reporting
}
# Event metric parameters (same constants in the browser recompute).
MERGE_GAP = 30   # predicted runs separated by <= this many unflagged seconds merge into one alert
TOL_AFTER = 60   # an alert overlapping [start, end + TOL_AFTER) of a true segment is not a false alert
Q_MAX = 65535


def sha256(path: Path, chunk: int = 1 << 24) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def write_json(path: Path, obj, compact: bool = True) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    s = json.dumps(obj, separators=(",", ":"), sort_keys=True, allow_nan=False) if compact else json.dumps(obj, indent=2, sort_keys=True, allow_nan=False)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(s + "\n")
    os.replace(tmp, path)
    return len(s) + 1
