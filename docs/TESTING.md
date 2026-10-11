# Testing (data and analytics)

`uv run pytest -q` (30 tests, about 30 s; data-dependent tests skip with a reason if `data/raw` and `data/processed` are absent; run `uv run python -m pipelines.run_all` first).

| File | What it proves |
|---|---|
| `tests/test_metrics.py` | Hand-computed toy cases: perfect, empty, all-flagged, point-adjust inflation (10 of 100 points flagged gives recall 0.1 vs 1.0), merge gap boundary at 30/31, tolerance boundary at 59/60, false alerts per day, event vs point, and 25 random series vs an independent plain-loop reference |
| `tests/test_parity.py` | `recompute_vectors.json` equals the independent plain-loop implementation in `tests/ref_metrics.py` (the browser must reproduce the same numbers); window score decoding and label alignment; sweep monotonicity and consistency with split sizes; quantization round trip |
| `tests/test_pipeline.py` | Label alignment with the index base verified (metadata end is exclusive; inclusive reading mismatches 200 rows); 22 data-quality checks; train-only fitting (corrupting val/test data leaves train statistics unchanged); feature causality (changing future rows leaves past features unchanged); threshold leakage (permuting test labels leaves thresholds unchanged, changing val labels changes them); GBM fitted before val; unsupervised scores recompute from X alone; attribution ranks |
| `tests/test_artifacts.py` | Every artifact validates against its JSON Schema; each under 400 KB gzip; no U+2014 or U+2015 characters anywhere; honesty tags valid and telemetry never tagged OBSERVED; licence and attribution text present; operating points lie on the sweep grid and equal the sweep rows; point-adjusted recall >= point recall; facts equal the evaluation artifact; attribution wording; best detectors beat chance by 3x |

Site-side checks (Vitest parity against `recompute_vectors.json`, Playwright, axe) are owned by the site track.
