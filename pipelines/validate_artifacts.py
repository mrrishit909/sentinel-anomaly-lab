"""Validate every file in site/public/data against data/contracts/<name>.schema.json."""
from __future__ import annotations

import json
import sys

from jsonschema import Draft202012Validator

from pipelines.common import CONTRACTS, PUBLIC


def schema_name(fname: str) -> str:
    if fname.endswith("_hero.json"):
        return "window_hero"
    if fname.startswith("contrib_"):
        return "contrib"
    return "window" if fname.startswith("window_") else fname.removesuffix(".json")


def main() -> int:
    bad = 0
    for p in sorted(PUBLIC.glob("*.json")):
        sch = json.loads((CONTRACTS / f"{schema_name(p.name)}.schema.json").read_text())
        errs = list(Draft202012Validator(sch).iter_errors(json.loads(p.read_text())))
        if errs:
            bad += 1
            print(f"FAIL {p.name}: {errs[0].message[:200]} at {list(errs[0].path)}")
    print(f"validated {len(list(PUBLIC.glob('*.json')))} artifacts, {bad} failing")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
