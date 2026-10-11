import json

import numpy as np
import pytest

from pipelines.common import CONTRACTS, PROCESSED, PUBLIC, RAW


def pytest_configure(config):
    config.addinivalue_line("markers", "needs_data: requires data/raw and data/processed (run `python -m pipelines.run_all`)")


need_data = pytest.mark.skipif(not ((PROCESSED / "engine.npz").exists() and (RAW / "data.parquet").exists()), reason="raw/processed data not built; run pipelines.run_all")


@pytest.fixture(scope="session")
def art():
    def load(name):
        return json.loads((PUBLIC / name).read_text())
    return load


@pytest.fixture(scope="session")
def series():
    from analytics import features as fe
    X, y, cat = fe.load()
    return X, y, cat


@pytest.fixture(scope="session")
def scores():
    eng = np.load(PROCESSED / "engine.npz")
    return {k: eng[k] for k in ("robust_z", "pca", "iforest", "changepoint", "gbm")}
