# Methodology

Everything is deterministic (seeds fixed in `analytics/detectors.py`) and re-created by `uv run python -m pipelines.run_all` (about 1 minute of compute after download, peak RAM 2.7 GB).

## Data and splits

CATS v2: 5,000,000 rows at 1 Hz (2023-01-01 to 2023-02-27), 17 channels, 200 injected anomalies (see `DATA_SOURCES.md`). Row index = seconds since the start. Splits are contiguous and temporal; no split boundary cuts a labelled segment (checked).

| Split | Rows | Segments | Role |
|---|---|---|---|
| train | 0 to 1,000,000 | 0 (nominal) | every unsupervised detector is fitted here |
| gbm_fit | 1,000,000 to 2,500,000 | 83 | labels used by the supervised GBM only (last 20% picks the iteration count) |
| val | 2,500,000 to 3,750,000 | 50 | thresholds and operating points tuned here, nowhere else |
| test | 3,750,000 to 5,000,000 | 67 | untouched until reporting |

## Features (causal: row t uses rows <= t)

- Context channels (7) and telemetry channels (10) are standardised with train mean and std (float64 accumulation).
- Residual: `x - trailing median (61 s)` per telemetry channel; scale = 1.4826 x MAD of the train residuals (floored at 1e-6); `zres = |residual| / scale`.
- `zres_max30`: trailing 30 s maximum of `zres`.

## Detectors

| id | Method | Fitted on | Tag |
|---|---|---|---|
| robust_z | max over the 10 telemetry channels of `zres` | train scale only | DERIVED |
| pca | squared reconstruction error of a PCA (12 components, 95% variance, 96.8% reached) over 17 standardised channels plus 10 scaled residual features | train | DERIVED |
| iforest | Isolation Forest, 100 trees, 4,096 samples per tree, 200,000 random train rows, over channel levels and log `zres_max30`; scored in 500k chunks | train | DERIVED |
| changepoint | `ruptures.Window(width=20 bins, l2)` on 10 s means of the 10 standardised telemetry channels. Offline algorithm made causal: a window centred at bin i needs bins up to i + 10, so its discrepancy is assigned to the end of that look-ahead and held; a bin only becomes known at its last second | none | DERIVED |
| gbm | sklearn HistGradientBoosting (depth 3, 8 leaves, min 2,000 per leaf, L2 5) on levels, log `zres`, log `zres_max30`, log PCA error, its 60 s mean and log PCA channel contributions. Iterations chosen by average precision on the last 20% of gbm_fit, then refit on the first 80% | gbm_fit labels | PREDICTED |

The GBM's PCA inputs are unsupervised (train-fit), so they carry no label information. Why sklearn and not LightGBM: the machine lacks `libomp`; no extra dependency was needed.

Not used: a deep model. The task set deliberately small, explainable detectors; the stored scores make a fair comparison possible.

## Score quantization

`q = round(65535 * clip(log1p(s / c) / smax, 0, 1))`, `c` = max(train median, 1e-6 x max, 1e-12), `smax = log1p(max / c)`. Monotone, label-free, so thresholds in `q` are equivalent to thresholds in raw scores up to quantization. All metrics, sweeps and parity vectors are computed on `q`.

## Thresholds and operating points (validation only)

`thresholds_q` = unique quantiles of the **val** scores at flagged fractions from 30% down to 0.002% (up to 160). Three operating points are chosen from the val sweep:

1. `best_point_f1`: maximum point-wise F1.
2. `best_event_f1`: maximum F1 of event recall and alert precision (headline).
3. `far_budget_1_per_day`: the lowest threshold whose val false alerts per day is at most 1.

Ties go to the stricter threshold. The same integers are applied to test. Test is never used for choosing anything (test `labels` are permuted in `tests/test_pipeline.py` and the chosen thresholds do not change; changing val labels does change them). `best_detector_by_test_event_f1` is a reporting field, not a selection step.

## Metrics

Definitions are in `DATA_CONTRACTS.md` (point-wise, point-adjusted, event-level; false alerts per day; delay). Point-adjusted and event-level numbers are always published together with point-wise numbers because point-adjust inflates results: on test at the best-event-F1 point the point-adjusted F1 is 1.7x the point F1 for PCA and the GBM, but 4.5x for change-point, 5.0x for the robust z-score and 18.6x for Isolation Forest. A detector can look strong under point-adjust and be nearly useless point-wise.

PR curves are point-wise precision against recall over the val-derived sweep thresholds; `average_precision` is sklearn's exact value on the quantized scores. A random scorer's AP equals the prevalence (about 0.047 on test).

## Attribution: contributing measurements, not causes

For each incident, the 10 telemetry channels are ranked by mean contribution over the incident's rows:

- robust_z: mean `zres` of the channel.
- pca: the channel's squared reconstruction error plus its residual-feature error, divided by its train mean.

Scored against the dataset's own `root_cause` column (the channel where the anomaly first develops): hit@1 and hit@3, and `hit_at_3_any` counts an `affected` channel too. The random baseline is analytic (0.1, 0.3, 0.533, mean rank 5.5). These are rankings of measurements that moved, scored against a benchmark label. They are not causal claims. Attribution uses no thresholds and no labels, so it is reported on all 200 incidents and on test (67) separately.

## Reproducibility

Raw files are md5-checked against Zenodo and sha256-listed in `data/manifests/raw_manifest.json`. Artifacts are compact JSON with sorted keys. `pytest` covers schema, label alignment, leakage, metric correctness, parity vectors and artifact validation.
