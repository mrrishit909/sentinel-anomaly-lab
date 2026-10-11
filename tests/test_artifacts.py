import gzip
import json
import re

import pytest
from jsonschema import Draft202012Validator

from pipelines.common import CONTRACTS, DETECTORS, PUBLIC, ROOT
from pipelines.validate_artifacts import schema_name


def test_schemas_are_valid_and_every_artifact_conforms():
    files = sorted(PUBLIC.glob("*.json"))
    assert len(files) >= 20
    for sc in CONTRACTS.glob("*.schema.json"):
        Draft202012Validator.check_schema(json.loads(sc.read_text()))
    for p in files:
        sch = json.loads((CONTRACTS / f"{schema_name(p.name)}.schema.json").read_text())
        Draft202012Validator(sch).validate(json.loads(p.read_text()))


def test_every_artifact_under_400kb_gzip():
    for p in PUBLIC.glob("*.json"):
        assert len(gzip.compress(p.read_bytes())) < 400_000, p.name


def test_no_em_or_en_dash_characters():
    bad = []
    for p in ROOT.rglob("*"):
        if p.is_file() and not any(x in p.parts for x in (".venv", ".git", "raw", "processed", "node_modules", "__pycache__")) and p.suffix in {".py", ".md", ".json", ".yml", ".toml", ".csv", ".sh", ".txt"}:
            t = p.read_text(errors="ignore")
            if chr(0x2014) in t or chr(0x2015) in t:
                bad.append(str(p.relative_to(ROOT)))
    assert not bad, bad


def test_honesty_tags_present_and_valid(art):
    for p in PUBLIC.glob("*.json"):
        d = json.loads(p.read_text())
        assert d["tags"] and all(re.fullmatch(r"(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC)(/(OBSERVED|DERIVED|PREDICTED|SIMULATED|SYNTHETIC))*", v) for v in d["tags"].values())
    meta = art("meta.json")
    assert meta["tags"]["telemetry"] == "SYNTHETIC" and "OBSERVED" not in meta["tags"].values()
    assert meta["detectors"]["gbm"]["tag"] == "PREDICTED" and meta["detectors"]["pca"]["tag"] == "DERIVED"
    assert meta["dataset"]["licence"] == "CC-BY-4.0" and any("Solenix" in a for a in meta["attribution"]) and any("Changes made" in a for a in meta["attribution"])


def test_meta_sizes_and_windows(art):
    meta = art("meta.json")
    assert len(meta["windows"]) == 12 and all((PUBLIC / w["file"]).exists() for w in meta["windows"])
    assert set(meta["artifact_bytes"]) == {p.name for p in PUBLIC.glob("*.json")}


def test_incidents_and_operating_points_consistent(art):
    inc, ev, sw = art("incidents.json")["incidents"], art("detector_eval.json"), art("threshold_sweep.json")
    assert len(inc) == 200 and [i["id"] for i in inc] == list(range(200))
    assert all(a["end"] > a["start"] and b["start"] >= a["end"] for a, b in zip(inc, inc[1:]))
    assert sum(1 for i in inc if i["split"] == "test") == art("meta.json")["splits"]["test"]["segments"]
    for d in DETECTORS:
        grid = set(sw["detectors"][d]["thresholds_q"])
        for op, v in ev["detectors"][d]["points"].items():
            assert v["threshold_q"] in grid, (d, op)
            assert v["selected_on"] == "val only"
            for sp in ("val", "test"):
                m = v[sp]
                assert m["point_adjusted"]["recall"] >= m["point"]["recall"]  # point-adjust can only raise recall
                # operating-point metrics equal the sweep row at that threshold
                k = sw["detectors"][d]["thresholds_q"].index(v["threshold_q"])
                assert m["point"]["tp"] == sw["detectors"][d]["splits"][sp]["p_tp"][k]
                assert m["event"]["false_alerts"] == sw["detectors"][d]["splits"][sp]["ev_false"][k]


def test_best_detectors_beat_chance_by_a_wide_margin(art):
    prevalence = 58900 / 1_250_000  # AP of a random scorer on test
    ev = art("detector_eval.json")["detectors"]
    assert ev["pca"]["average_precision"]["test"] > 3 * prevalence and ev["gbm"]["average_precision"]["test"] > 3 * prevalence


def test_facts_match_artifacts(art):
    f, ev = art("facts.json")["values"], art("detector_eval.json")
    for d in DETECTORS:
        assert f[f"{d}.test.average_precision"]["value"] == ev["detectors"][d]["average_precision"]["test"]
        m = ev["detectors"][d]["points"]["best_event_f1"]["test"]
        assert f[f"{d}.best_event_f1.test.false_alerts_per_day"]["value"] == m["event"]["false_alerts_per_day"]
    assert f["incidents"]["value"] == 200 and f["quality_checks_passed"]["value"] == f["quality_checks_total"]["value"]


def test_attribution_reported_as_contributing_measurements(art):
    a = art("attribution.json")
    assert "not causes" in a["wording"]
    for k in ("robust_z", "pca"):
        assert a["methods"][k]["all"]["hit_at_1"] > a["random_baseline"]["hit_at_1"]  # beats chance; a result, asserted so a regression is loud
