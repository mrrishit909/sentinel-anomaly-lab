"""Re-create everything: download -> clean -> contracts -> engine -> publish -> validate. `uv run python -m pipelines.run_all [--skip-engine]`"""
from __future__ import annotations

import sys
import time

from analytics import engine
from pipelines import contracts, publish, validate_artifacts
from pipelines.cleaning import clean
from pipelines.ingestion import download


def main(argv: list[str]) -> int:
    t = time.time()
    download.main(); print("ingest ok", round(time.time() - t, 1))
    print("clean", clean.main())
    contracts.main()
    if "--skip-engine" not in argv:
        print("engine", engine.main())
    publish.main(); print("publish ok", round(time.time() - t, 1))
    return validate_artifacts.main()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
