"""Raw CATS parquet + metadata -> processed float32 table, accounted ledger, parsed incidents.

Nothing is dropped or imputed: the data is complete. The ledger records that explicitly so a future schema change is caught.
"""
from __future__ import annotations

import numpy as np
import polars as pl

from pipelines.common import CHANNELS, N_ROWS, PROCESSED, RAW

T0 = np.datetime64("2023-01-01T00:00:00", "s")


def load_incidents() -> pl.DataFrame:
    """metadata.csv -> one row per incident; start/end are row indices, end EXCLUSIVE (verified in tests)."""
    md = pl.read_csv(RAW / "metadata.csv", try_parse_dates=True)
    s = (md["start_time"].to_numpy().astype("datetime64[s]") - T0).astype(np.int64)
    e = (md["end_time"].to_numpy().astype("datetime64[s]") - T0).astype(np.int64)
    aff = [x.strip("[]").replace("'", "").replace(" ", "").split(",") for x in md["affected"].to_list()]
    return pl.DataFrame({"id": np.arange(len(md)), "start": s, "end": e, "category": md["category"].to_numpy(),
                         "root_cause": md["root_cause"].to_list(), "affected": aff}).sort("start")


def rebuild_labels(inc: pl.DataFrame, n: int = N_ROWS) -> np.ndarray:
    y = np.zeros(n, np.uint8)
    for s, e in zip(inc["start"].to_list(), inc["end"].to_list()):
        y[s:e] = 1
    return y


def main() -> dict:
    raw = pl.read_parquet(RAW / "data.parquet")
    n_in = raw.height
    ts = raw["__index_level_0__"].to_numpy().astype("datetime64[s]")
    ok_ts = bool((np.diff(ts.astype(np.int64)) == 1).all() and ts[0] == T0)
    df = raw.select([pl.col(c).cast(pl.Float32) for c in CHANNELS] + [pl.col("y").cast(pl.UInt8), pl.col("category").cast(pl.UInt8)])
    PROCESSED.mkdir(parents=True, exist_ok=True)
    df.write_parquet(PROCESSED / "cats.parquet")
    inc = load_incidents()
    inc.with_columns(pl.col("affected").list.join(",")).write_csv(PROCESSED / "incidents.csv")
    y_rebuilt = rebuild_labels(inc)
    y = df["y"].to_numpy()
    info = {"rows_in": n_in, "rows_out": df.height, "timestamps_ok": ok_ts, "segments_metadata": inc.height,
            "mismatched_rows": int((y != y_rebuilt).sum()),
            "null_cells": int(sum(raw[c].null_count() for c in raw.columns))}
    return info


if __name__ == "__main__":
    print(main())
