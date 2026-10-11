import numpy as np

from analytics import metrics as M
from tests.ref_metrics import evaluate as ref


def run(n, segs, flags, **kw):
    y, f = np.zeros(n, bool), np.zeros(n, bool)
    for a, b in segs:
        y[a:b] = True
    for a, b in flags:
        f[a:b] = True
    s, e = M.segments(y)
    return M.evaluate(f, s, e, **kw)


def test_perfect():
    m = run(300, [(100, 150)], [(100, 150)])
    assert (m["tp"], m["fp"], m["fn"], m["detected"], m["alerts"], m["false_alerts"], m["delay_median_s"]) == (50, 0, 0, 1, 1, 0, 0.0)


def test_point_adjust_inflation_hand_computed():
    # segment of 100 points, detector flags only 10 of them: point recall 0.1, point-adjusted recall 1.0
    m = run(500, [(100, 200)], [(150, 160)])
    assert (m["tp"], m["fp"], m["fn"]) == (10, 0, 90)
    assert (m["pa_tp"], m["positives"]) == (100, 100)
    p = M.summarize(m, 1)
    assert p["point"]["recall"] == 0.1 and p["point_adjusted"]["recall"] == 1.0
    assert p["point"]["f1"] < p["point_adjusted"]["f1"]
    assert m["delay_median_s"] == 50.0


def test_fp_not_changed_by_point_adjust():
    m = run(500, [(100, 200)], [(150, 160), (300, 310)])
    assert m["fp"] == 10 and M.summarize(m, 1)["point_adjusted"]["fp"] == 10


def test_merge_gap_boundary():
    assert run(600, [(100, 400)], [(100, 120), (150, 170)])["alerts"] == 1   # 30 unflagged between
    assert run(600, [(100, 400)], [(100, 120), (151, 171)])["alerts"] == 2   # 31 unflagged between


def test_tolerance_boundary():
    assert run(600, [(100, 150)], [(209, 220)])["false_alerts"] == 0  # starts at end + 59
    assert run(600, [(100, 150)], [(210, 220)])["false_alerts"] == 1  # starts at end + 60


def test_event_vs_point_two_segments_and_false_alerts_per_day():
    m = run(86_400, [(100, 150), (400, 500)], [(450, 460), (1000, 1010), (5000, 5010)])
    assert (m["segments"], m["detected"], m["alerts"], m["false_alerts"]) == (2, 1, 3, 2)
    assert m["false_alerts_per_day"] == 2.0
    s = M.summarize(m, 3)["event"]
    assert s["recall"] == 0.5 and abs(s["alert_precision"] - 1 / 3) < 1e-12


def test_no_flags_and_all_flags():
    m = run(200, [(50, 80)], [])
    assert (m["tp"], m["detected"], m["alerts"], m["delay_median_s"]) == (0, 0, 0, -1.0)
    m = run(200, [(50, 80)], [(0, 200)])
    assert (m["tp"], m["fp"], m["alerts"], m["false_alerts"]) == (30, 170, 1, 0)


def test_matches_plain_loop_reference_on_random_series():
    rng = np.random.default_rng(0)
    for _ in range(25):
        n = 3000
        y = np.zeros(n, int)
        for a in rng.choice(n - 400, 4, replace=False):
            y[a:a + rng.integers(20, 200)] = 1
        sc = rng.integers(0, 100, n) + y * rng.integers(0, 60, n)
        thr = int(rng.integers(30, 120))
        s, e = M.segments(y)
        m = M.evaluate(sc >= thr, s, e)
        r = ref(sc.tolist(), y.tolist(), thr)
        assert (m["tp"], m["fp"], m["fn"]) == tuple(r["point"].values())
        assert (m["pa_tp"], m["detected"], m["alerts"], m["false_alerts"]) == (r["point_adjusted"]["tp"], r["event"]["detected"], r["event"]["alerts"], r["event"]["false_alerts"])
        assert m["delay_median_s"] == r["event"]["delay_median_s"]
