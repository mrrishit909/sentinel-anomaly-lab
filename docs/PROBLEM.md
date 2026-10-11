# Problem: Sentinel Anomaly Lab

**Tagline:** Find the Signal Inside the Noise.

## The question

Given a stream of 17 channels from one complex system sampled once per second, which detection method raises the fewest false alarms while still catching real incidents quickly, and when it does fire, which measurements point at the incident?

This is a benchmarked detector comparison on labelled telemetry, not an incident workflow app. The user can move a threshold and watch precision, recall, false alerts per day and detection delay recompute from real stored scores.

## Audience and decisions

- Operators and reliability engineers choosing an alerting threshold and a detector family.
- Data scientists who want to see how much a headline "F1" depends on the evaluation protocol (point-wise, point-adjusted, event-level).

## What the data can and cannot say

- The dataset is CATS v2 (Controlled Anomalies Time Series), a **simulated** system with 200 **injected** anomalies. Labels are exact by construction. That makes evaluation clean and also makes the result easier than real telemetry. See `LIMITATIONS.md`.
- The dataset replaced the planned SMD (OmniAnomaly) because SMD has no stated dataset licence. The decision and quotes are in `DATA_SOURCES.md`.
- Attribution is reported as "contributing measurements, not causes". The dataset's own column is called `root_cause`; we score against it but make no causal claim.

## Deliverables of the data phases (01-13)

1. Sources and licence record (`DATA_SOURCES.md`).
2. Contracts: JSON Schema per artifact (`data/contracts`), described in `DATA_CONTRACTS.md`.
3. Reproducible ingestion with md5 and sha256 manifest.
4. Cleaning with an accounted ledger and quality checks.
5. Five detectors, temporal train/val/test, thresholds tuned on validation only.
6. Evaluation: point-wise, point-adjusted and event-level metrics, PR curves, threshold sweep tables, false alerts per day, detection delay.
7. Attribution scored against the dataset's channel labels.
8. Compact versioned JSON artifacts for a static site, plus browser parity test vectors.

## Honesty tags

OBSERVED is not used: no measurement in this project comes from a real system. Telemetry and labels are SYNTHETIC (simulator output with injected anomalies). Detector scores from unsupervised methods are DERIVED. Supervised GBM scores are PREDICTED.
