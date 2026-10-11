"""Generate JSON Schemas (draft 2020-12) for every published artifact into data/contracts/*.schema.json.

Run: uv run python -m pipelines.contracts
"""
from __future__ import annotations

import json

from pipelines.common import CHANNELS, CONTRACTS, DETECTORS, TELEMETRY

N, I, S, B = {"type": "number"}, {"type": "integer"}, {"type": "string"}, {"type": "boolean"}
TAG_RE = "^(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC)(/(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC))*$"
TAG = {"type": "string", "pattern": TAG_RE}
TAGS = {"type": "object", "minProperties": 1, "additionalProperties": TAG}
DET = {"enum": list(DETECTORS)}
CH = {"enum": list(CHANNELS)}
TEL = {"enum": list(TELEMETRY)}
SPLIT = {"enum": ["train", "gbm_fit", "val", "test"]}
NI = {"type": ["integer", "null"]}
NN = {"type": ["number", "null"]}
B64 = {"type": "string", "pattern": "^[A-Za-z0-9+/]*={0,2}$"}  # base64 of little-endian typed array


def arr(item, n=None, lo=None):
    d = {"type": "array", "items": item}
    if n is not None:
        d["minItems"] = d["maxItems"] = n
    elif lo is not None:
        d["minItems"] = lo
    return d


def obj(props: dict, req: list | None = None) -> dict:
    return {"type": "object", "properties": props, "required": req if req is not None else list(props), "additionalProperties": False}


def per(keys, item) -> dict:
    return obj({k: item for k in keys})


def top(name: str, props: dict, req: list | None = None) -> dict:
    p = {"schema_version": {"const": "v1"}, "tags": TAGS, **props}
    r = ["schema_version", "tags"] + (req if req is not None else list(props))
    return {"$schema": "https://json-schema.org/draft/2020-12/schema", "title": name, **obj(p, r)}


PRF = obj({"tp": I, "fp": I, "fn": I, "precision": NN, "recall": NN, "f1": NN})
EVENT = obj({"segments": I, "detected": I, "recall": NN, "alerts": I, "false_alerts": I, "alert_precision": NN, "false_alerts_per_day": N,
             "delay_median_s": NN, "delay_mean_s": NN})
QUANT = obj({"c": N, "smax": N})  # raw = c * expm1(q / 65535 * smax)
METRICS = obj({"rows": I, "threshold_q": I, "point": PRF, "point_adjusted": PRF, "event": EVENT})
OPS = ["best_point_f1", "best_event_f1", "far_budget_1_per_day"]

SCHEMAS = {
    "meta": top("meta", {
        "pipeline_version": S, "generated_at": S,
        "dataset": obj({"name": S, "version": S, "doi": S, "url": S, "licence": S, "licence_url": S, "provider": S, "rows": I, "hz": I,
                        "start_utc": S, "end_utc": S, "nature": S}),
        "attribution": arr(S, lo=3),
        "splits": per(["train", "gbm_fit", "val", "test"], obj({"lo": I, "hi": I, "rows": I, "positives": I, "segments": I, "days": N})),
        "metric_params": obj({"merge_gap_s": I, "tol_after_s": I, "thresholds_per_detector": I, "operating_points": arr({"enum": OPS})}),
        "detectors": per(list(DETECTORS), obj({"label": S, "family": S, "tag": TAG, "supervised": B, "causal": B, "description": S, "quant": QUANT,
                                               "has_channel_contributions": B})),
        "windows": arr(obj({"id": S, "incident_id": I, "file": S, "contrib_file": S, "split": SPLIT, "category": I})),
        "windows_note": S,
        "hero_window": obj({"file": S, "source_window": S, "seconds": arr(I, n=2)}),
        "contrib_quant": per(["robust_z", "pca"], QUANT),
        "sources": {"type": "object"}, "artifact_tags": {"type": "object"}, "artifact_bytes": {"type": "object"}}),
    "facts": top("facts", {"values": {"type": "object", "additionalProperties": obj({"value": {"type": ["number", "string", "boolean", "null"]}, "tag": TAG, "unit": S})}}),
    "channels": top("channels", {"channels": arr(obj({
        "id": CH, "group": {"enum": ["context", "telemetry"]}, "binary_like": B,
        "train_mean": N, "train_std": N, "train_min": N, "train_max": N, "lo": N, "hi": N,
        "resid_median_window_s": NI, "resid_scale": NN}), n=len(CHANNELS)),
        "grouping_note": S}),
    "incidents": top("incidents", {"incidents": arr(obj({
        "id": I, "start": I, "end": I, "duration_s": I, "category": I, "root_cause": TEL, "affected": arr(S),
        "split": SPLIT, "window": {"type": ["string", "null"]},
        "detection": per(list(DETECTORS), obj({"detected": B, "delay_s": NI})),
        "detection_by_op": per(OPS, per(list(DETECTORS), obj({"detected": B, "delay_s": NI}))),
        "rise": per(list(DETECTORS), arr(arr(I, n=2))),
        "attribution": per(["robust_z", "pca"], obj({"top3": arr(TEL, n=3), "root_rank": I, "hit_at_1": B, "hit_at_3": B, "hit_at_3_any": B}))}), n=200),
        "operating_point": S}),
    "detector_eval": top("detector_eval", {
        "operating_points": arr({"enum": OPS}, n=3),
        "detectors": per(list(DETECTORS), obj({
            "points": per(OPS, obj({"threshold_q": I, "threshold_score": N, "selected_on": S, "val": METRICS, "test": METRICS})),
            "average_precision": obj({"val": NN, "test": NN}),
            "pr_curve": per(["val", "test"], obj({"recall": arr(N), "precision": arr(N)})),
            "test_point_f1_vs_point_adjusted": obj({"point_f1": NN, "point_adjusted_f1": NN, "inflation": NN})})),
        "best_detector_by_test_event_f1": DET,
        "caveat_point_adjust": S}),
    "threshold_sweep": top("threshold_sweep", {
        "metric_params": obj({"merge_gap_s": I, "tol_after_s": I}),
        "detectors": per(list(DETECTORS), obj({
            "thresholds_q": arr(I, lo=20),
            "splits": per(["val", "test"], obj({
                "rows": I, "positives": I, "segments": I, "days": N,
                "p_tp": arr(I), "p_fp": arr(I), "pa_tp": arr(I),
                "ev_detected": arr(I), "ev_alerts": arr(I), "ev_false": arr(I), "delay_median_s": arr(N)})),
        })),
        "note": S}),
    "attribution": top("attribution", {
        "channels_scored": arr(TEL, n=len(TELEMETRY)),
        "wording": S,
        "methods": per(["robust_z", "pca"], obj({"all": obj({"n": I, "hit_at_1": N, "hit_at_3": N, "hit_at_3_any": N, "mean_root_rank": N}),
                                                 "test": obj({"n": I, "hit_at_1": N, "hit_at_3": N, "hit_at_3_any": N, "mean_root_rank": N})})),
        "random_baseline": obj({"hit_at_1": N, "hit_at_3": N, "hit_at_3_any": N, "mean_root_rank": N}),
        "per_root_cause": {"type": "object", "additionalProperties": obj({"n": I, "hit_at_1_robust_z": N, "hit_at_1_pca": N})}}),
    "quality": top("quality", {
        "checks": arr(obj({"id": S, "description": S, "passed": B, "observed": {}, "expected": {}}), lo=10),
        "passed": I, "failed": I}),
    "reconciliation": top("reconciliation", {
        "ledger": arr(obj({"stage": S, "rows_in": I, "rows_out": I, "dropped": I, "reason": S}), lo=2),
        "labels": obj({"segments_metadata": I, "segments_from_y": I, "mismatched_rows": I, "end_convention": S, "contamination": N,
                       "anomalies_in_first_million_rows": I, "category_matches": B}),
        "files": arr(obj({"name": S, "bytes": I, "md5": S, "sha256": S}), lo=3)}),
    "overview": top("overview", {
        "bin_s": I, "bins": I, "encoding": S,
        "anomaly_frac_u8": B64, "scores_q_max": per(list(DETECTORS), B64),
        "incident_bins": arr(arr(I, n=3))}),  # [bin_index, incident_id, split_index]
    "window": top("window", {
        "id": S, "incident_id": I, "split": SPLIT, "category": I, "root_cause": TEL, "affected": arr(S),
        "row0": I, "n": I, "anomaly_start": I, "anomaly_end": I, "truncated": B, "encoding": S,
        "labels_u8": B64, "channels_u16": per(list(CHANNELS), B64), "channel_range": per(list(CHANNELS), arr(N, n=2)),
        "scores_q_u16": per(list(DETECTORS), B64)}),
    "recompute_vectors": top("recompute_vectors", {
        "metric_params": obj({"merge_gap_s": I, "tol_after_s": I}),
        "definition": S,
        "cases": arr(obj({"name": S, "source": {"enum": ["toy", "real_window"]}, "scores_q": arr(I), "labels": arr({"enum": [0, 1]}), "threshold_q": I,
                          "expected": obj({"point": obj({"tp": I, "fp": I, "fn": I}), "point_adjusted": obj({"tp": I, "fp": I, "fn": I}),
                                           "event": obj({"segments": I, "detected": I, "alerts": I, "false_alerts": I, "delay_median_s": N})})}), lo=8),
        "residual_cases": arr(obj({"name": S, "window": S, "median_window_s": I, "min_samples": I, "seconds": I, "tolerance_rel": N, "definition": S,
                                   "zres": per(list(TELEMETRY), arr(N))}), lo=1)}),
    "alerts": top("alerts", {
        "metric_params": obj({"merge_gap_s": I, "tol_after_s": I}),
        "row_base": S,
        "operating_points_included": arr({"enum": OPS}, lo=2),
        "excluded_note": {"type": ["string", "null"]},
        "detectors": per(list(DETECTORS), {"type": "object", "properties": {op: obj({"val": arr(arr(I, n=3)), "test": arr(arr(I, n=3))}) for op in OPS},
                                           "required": ["best_event_f1", "far_budget_1_per_day"], "additionalProperties": False})}),
    "contrib": top("contrib", {
        "id": S, "incident_id": I, "row0": I, "n": I, "encoding": S,
        "contrib_q_u16": per(["robust_z", "pca"], per(list(TELEMETRY), B64))}),
    "window_hero": top("window_hero", {
        "id": S, "source_window": S, "row0": I, "n": I, "seconds": arr(I, n=2), "anomaly_start": I, "anomaly_end": I, "encoding": S,
        "labels_u8": B64, "channels_u16": per(list(TELEMETRY), B64), "channel_range": per(list(TELEMETRY), arr(N, n=2)),
        "scores_q_u16": obj({"pca": B64})}),
}


def main() -> None:
    CONTRACTS.mkdir(parents=True, exist_ok=True)
    for name, sch in SCHEMAS.items():
        (CONTRACTS / f"{name}.schema.json").write_text(json.dumps(sch, indent=1, sort_keys=True) + "\n")
    print(f"wrote {len(SCHEMAS)} schemas")


if __name__ == "__main__":
    main()
