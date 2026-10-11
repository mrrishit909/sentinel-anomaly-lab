"""Data-quality checks on the processed table. Each check: id, description, passed, observed, expected."""
from __future__ import annotations

import numpy as np
import polars as pl

from analytics import features as fe
from analytics.metrics import segments
from pipelines.cleaning.clean import load_incidents, rebuild_labels
from pipelines.common import CHANNELS, CONTEXT, MANIFESTS, N_ROWS, PROCESSED, RAW, SPLITS, TELEMETRY, sha256


def run_checks() -> list[dict]:
    X, y, cat = fe.load()
    raw = pl.read_parquet(RAW / "data.parquet", columns=["__index_level_0__"])["__index_level_0__"].to_numpy().astype("datetime64[s]")
    inc = load_incidents()
    s, e = inc["start"].to_numpy(), inc["end"].to_numpy()
    ys, ye = segments(y)
    out: list[dict] = []

    def chk(i, d, ok, obs, exp):
        out.append({"id": i, "description": d, "passed": bool(ok), "observed": obs, "expected": exp})

    chk("rows", "row count", len(y) == N_ROWS, len(y), N_ROWS)
    chk("no_nulls", "no null or non-finite cells in the 17 channels", bool(np.isfinite(X).all()), int((~np.isfinite(X)).sum()), 0)
    chk("timestamps_1s", "timestamps strictly 1 s apart, starting 2023-01-01T00:00:00", bool((np.diff(raw.astype(np.int64)) == 1).all() and str(raw[0]) == "2023-01-01T00:00:00"), str(raw[0]), "2023-01-01T00:00:00")
    chk("labels_binary", "y is 0/1", set(np.unique(y)) <= {0, 1}, sorted(map(int, np.unique(y))), [0, 1])
    chk("segments_200", "200 contiguous labelled segments", len(ys) == 200, len(ys), 200)
    chk("segments_match_metadata", "segment starts and exclusive ends equal metadata.csv", bool(np.array_equal(ys, s) and np.array_equal(ye, e)), int(np.sum(ys != s) + np.sum(ye != e)), 0)
    chk("labels_rebuild", "y rebuilt from metadata (end exclusive) has zero mismatches", int((rebuild_labels(inc) != y).sum()) == 0, int((rebuild_labels(inc) != y).sum()), 0)
    chk("end_inclusive_wrong", "an inclusive-end reading would mismatch (documents the convention)", int((rebuild_labels(inc.with_columns(end=inc["end"] + 1)) != y).sum()) == 200, int((rebuild_labels(inc.with_columns(end=inc["end"] + 1)) != y).sum()), 200)
    chk("no_overlap", "segments sorted and non-overlapping", bool((s[1:] >= e[:-1]).all()), int((s[1:] < e[:-1]).sum()), 0)
    chk("clean_first_million", "no anomaly in the first 1,000,000 rows", int(y[:1_000_000].sum()) == 0, int(y[:1_000_000].sum()), 0)
    chk("contamination", "contamination about 0.038", abs(float(y.mean()) - 0.038) < 0.0005, round(float(y.mean()), 5), 0.038)
    chk("category_consistent", "category > 0 exactly where y = 1, and equals metadata", bool(((cat > 0) == (y == 1)).all() and (cat[s] == inc["category"].to_numpy()).all()), int(((cat > 0) != (y == 1)).sum()), 0)
    chk("category_range", "categories in 1..13", set(np.unique(cat[y == 1])) == set(range(1, 14)), sorted(map(int, np.unique(cat[y == 1]))), list(range(1, 14)))
    chk("root_cause_domain", "root_cause always a b* telemetry channel", set(inc["root_cause"]) <= set(TELEMETRY), sorted(set(inc["root_cause"])), "subset of TELEMETRY")
    aff = {a for x in inc["affected"].to_list() for a in x}
    chk("affected_domain", "affected channels are telemetry channels", aff <= set(TELEMETRY), sorted(aff), "subset of TELEMETRY")
    bad = [c for c in ("aimp", "adbr", "adfl") if not set(np.unique(X[:, CHANNELS.index(c)])) <= {0.0, 1.0}]
    chk("binary_context", "aimp, adbr, adfl take only values 0 and 1", not bad, bad, [])
    chk("train_variance", "every channel has non-zero variance in train", bool((X[:1_000_000].std(0) > 0).all()), int((X[:1_000_000].std(0) == 0).sum()), 0)
    cross = [k for k, (lo, hi) in SPLITS.items() if ((s < hi) & (e > hi) & (s >= lo)).any() or ((s < lo) & (e > lo)).any()]
    chk("splits_cut_no_segment", "no split boundary falls inside a labelled segment", not cross, cross, [])
    nseg = {k: int(((s >= lo) & (e <= hi)).sum()) for k, (lo, hi) in SPLITS.items()}
    chk("split_segments", "gbm_fit, val and test each hold at least 40 segments; train none", nseg["train"] == 0 and min(nseg["gbm_fit"], nseg["val"], nseg["test"]) >= 40, nseg, "train 0, others >= 40")
    chk("split_order", "splits are contiguous, ordered and cover all rows", [SPLITS[k] for k in ("train", "gbm_fit", "val", "test")] == [(0, 1_000_000), (1_000_000, 2_500_000), (2_500_000, 3_750_000), (3_750_000, 5_000_000)], "ok", "ok")
    man = {f["name"]: f for f in __import__("json").loads((MANIFESTS / "raw_manifest.json").read_text())["files"]}
    ok = all(sha256(RAW / n) == m["sha256"] for n, m in man.items())
    chk("raw_checksums", "raw files match the sha256 manifest", ok, sorted(man), "all match")
    chk("context_group", "17 channels = 7 context + 10 telemetry", len(CONTEXT) + len(TELEMETRY) == len(CHANNELS) == X.shape[1] == 17, X.shape[1], 17)
    return out
