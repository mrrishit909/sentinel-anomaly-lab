# Sentinel Anomaly Lab

Find the Signal Inside the Noise. A benchmarked comparison of five anomaly detectors on labelled multivariate telemetry (CATS v2, CC BY 4.0, 5 million rows at 1 Hz, 200 incidents), with event-level and point-adjusted metrics side by side, false alerts per day, detection delay, and attribution reported as contributing measurements, not causes.

The data is simulated (honesty tag SYNTHETIC). See `docs/LIMITATIONS.md` before quoting any number.

## Reproduce

```
uv sync
uv run python -m pipelines.run_all     # download (md5 verified), clean, engine, publish, validate
uv run pytest -q
```

Raw data is downloaded to `data/raw` (gitignored) and never published. Artifacts for the static site land in `site/public/data` and are described in `docs/DATA_CONTRACTS.md`. Method: `docs/METHODOLOGY.md`. Sources and licence decision: `docs/DATA_SOURCES.md`.

Attribution: CATS Dataset v2, Solenix Engineering GmbH / Patrick Fleith, doi:10.5281/zenodo.8338435, CC BY 4.0. Changes made: quantized and windowed; scores and metrics are derived results of this project.
