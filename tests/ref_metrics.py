"""Plain-loop reference of the metric definition (mirrors the browser implementation; no numpy, no shared code with analytics.metrics)."""


def evaluate(scores, labels, thr, merge_gap=30, tol_after=60):
    n = len(scores)
    flag = [s >= thr for s in scores]
    segs, i = [], 0
    while i < n:
        if labels[i]:
            j = i
            while j < n and labels[j]:
                j += 1
            segs.append((i, j))
            i = j
        else:
            i += 1
    runs, i = [], 0
    while i < n:
        if flag[i]:
            j = i
            while j < n and flag[j]:
                j += 1
            runs.append([i, j])
            i = j
        else:
            i += 1
    alerts = []
    for r in runs:
        if alerts and r[0] - alerts[-1][1] <= merge_gap:
            alerts[-1][1] = r[1]
        else:
            alerts.append(r[:])
    tp = sum(1 for k in range(n) if flag[k] and labels[k])
    fp = sum(1 for k in range(n) if flag[k] and not labels[k])
    pos = sum(labels)
    pa_tp, detected, delays = 0, 0, []
    for a, b in segs:
        first = next((k for k in range(a, b) if flag[k]), None)
        if first is not None:
            detected += 1
            pa_tp += b - a
            delays.append(first - a)
    false_alerts = sum(1 for a, b in alerts if not any(a < e + tol_after and s < b for s, e in segs))
    delays.sort()
    m = len(delays)
    med = -1.0 if not m else (delays[m // 2] if m % 2 else (delays[m // 2 - 1] + delays[m // 2]) / 2)
    return {"point": {"tp": tp, "fp": fp, "fn": pos - tp}, "point_adjusted": {"tp": pa_tp, "fp": fp, "fn": pos - pa_tp},
            "event": {"segments": len(segs), "detected": detected, "alerts": len(alerts), "false_alerts": false_alerts, "delay_median_s": float(med)}}
