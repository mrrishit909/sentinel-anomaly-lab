"""P06 sketches of "The Lens", rendered from the real published artifacts (site/public/data).

Writes SVGs next to this file; render_sheet.mjs rasterizes them and compose_sheet.py builds the
distinctness sheet. Run from the project root:
  uv run --with numpy python design/sketches/render_lens_sketch.py

Sketch approximation (the build must not copy it): residual scale = train_std of the channel,
because the robust-z MAD scale is not published yet (VISUAL_DESIGN DR-1).
"""
import base64
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
DATA = HERE / "../../site/public/data"
TELE = "bed1 bed2 bfo1 bfo2 bso1 bso2 bso3 ced1 cfo1 cso1".split()
ORANGE = "#FF4C25"
MONO = "JetBrains Mono, ui-monospace, monospace"
SERIF = "Newsreader, Georgia, serif"


def load(name):
    return json.loads((DATA / name).read_text())


meta, chans, evalj = load("meta.json"), load("channels.json"), load("detector_eval.json")
CH = {c["id"]: c for c in chans["channels"]}


def u16(b64):
    return np.frombuffer(base64.b64decode(b64), dtype="<u2").astype(np.float64)


def window(wid):
    w = load(f"window_{wid}.json")
    vals = {}
    for c in TELE:
        lo, hi = w["channel_range"][c]
        vals[c] = lo + u16(w["channels_u16"][c]) / 65535 * (hi - lo)
    scores = {d: u16(q) for d, q in w["scores_q_u16"].items()}
    return w, vals, scores


def trailing_median(x, n=61):
    out = np.empty_like(x)
    for i in range(len(x)):
        out[i] = np.median(x[max(0, i - n + 1): i + 1])
    return out


def path(xs, ys):
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in zip(xs, ys))


def lens_svg(W, H, c, R, mag, band, label_x, head, head_xy, head_size, chip_y, extra=""):
    """Strands outside: raw level, 1px white 30%. Inside the lens: time magnified `mag` x about
    the focus second, amplitude x2, ridgeline gradient fills, expected path and residual fill for
    flagged channels (the detector's view)."""
    w, vals, scores = window("142")
    n, a0, a1 = w["n"], w["anomaly_start"], w["anomaly_end"]
    inc = {i["id"]: i for i in load("incidents.json")["incidents"]}[142]
    top3 = inc["attribution"]["pca"]["top3"]
    alert = scores["pca"] >= evalj["detectors"]["pca"]["points"]["best_event_f1"]["threshold_q"]
    y0, y1 = band
    gap = (y1 - y0) / (len(TELE) - 1)
    px_per_s = W / n
    t_focus = a0 + 160  # seconds into the window under the lens centre
    amp_out = gap * 0.075  # px per train SD outside
    amp_in = amp_out * 2.0
    defs = [
        '<defs>',
        f'<clipPath id="lens"><circle cx="{c[0]}" cy="{c[1]}" r="{R}"/></clipPath>',
        f'<mask id="outside"><rect width="{W}" height="{H}" fill="#fff"/><circle cx="{c[0]}" cy="{c[1]}" r="{R}" fill="#000"/></mask>',
        '<linearGradient id="ridge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>',
        f'<linearGradient id="hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC23D" stop-opacity=".95"/><stop offset=".35" stop-color="{ORANGE}" stop-opacity=".75"/><stop offset="1" stop-color="{ORANGE}" stop-opacity=".05"/></linearGradient>',
        '<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>',
        '<linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".92"/><stop offset=".6" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>',
        '</defs>',
    ]
    out_layer, in_layer, hot_layer = [], [], []
    xs_out = np.arange(n) * px_per_s
    # inside: x = c.x + (t - t_focus) * px_per_s * mag
    t_in = np.arange(n)
    xs_in = c[0] + (t_in - t_focus) * px_per_s * mag
    for k, ch in enumerate(TELE):
        base = y0 + k * gap
        z = (vals[ch] - CH[ch]["train_mean"]) / CH[ch]["train_std"]
        z = z - np.median(z[:a0])
        ys = base - z * amp_out
        out_layer.append(f'<path d="{path(xs_out, ys)}" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1"/>')
        exp = trailing_median(vals[ch])
        resid = (vals[ch] - exp) / CH[ch]["train_std"]
        yi = base - z * amp_in
        ye = base - ((exp - CH[ch]["train_mean"]) / CH[ch]["train_std"] - np.median(((vals[ch] - CH[ch]["train_mean"]) / CH[ch]["train_std"])[:a0])) * amp_in
        flagged = alert & (ch in top3)
        poly = path(xs_in, yi) + f" L{xs_in[-1]:.1f},{base + gap:.1f} L{xs_in[0]:.1f},{base + gap:.1f} Z"
        in_layer.append(f'<path d="{poly}" fill="#000"/>')
        in_layer.append(f'<path d="{poly}" fill="url(#ridge)"/>')
        in_layer.append(f'<path d="{path(xs_in, yi)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="1.5"/>')
        if flagged.any():
            # residual fill between expected and observed, only where flagged
            idx = np.where(flagged)[0]
            i0, i1 = idx.min(), idx.max()
            seg = slice(max(i0 - 20, 0), min(i1 + 20, n - 1))
            xf, yo, yex = xs_in[seg], yi[seg], ye[seg]
            fill = path(xf, yo) + " L" + " L".join(f"{x:.1f},{y:.1f}" for x, y in zip(xf[::-1], yex[::-1])) + " Z"
            op = {0: 1.0, 1: .75, 2: .5}[top3.index(ch)]
            hot_layer.append(f'<g opacity="{op}">')
            hot_layer.append(f'<path d="{fill}" fill="url(#hot)" filter="url(#glow)" opacity=".9"/>')
            hot_layer.append(f'<path d="{fill}" fill="url(#hot)"/>')
            hot_layer.append(f'<path d="{path(xf, yex)}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 4"/>')
            hot_layer.append(f'<path d="{path(xf, yo)}" fill="none" stroke="{ORANGE}" stroke-width="2"/></g>')
        out_layer.append(f'<text x="{label_x}" y="{base - 6:.0f}" font-family="{MONO}" font-size="11" fill="#fff" fill-opacity=".5">{ch.upper()}</text>')
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', *defs,
           f'<rect width="{W}" height="{H}" fill="#000"/>',
           f'<g mask="url(#outside)">{"".join(out_layer)}</g>',
           f'<circle cx="{c[0]}" cy="{c[1]}" r="{R}" fill="#fff" fill-opacity=".065"/>',
           f'<g clip-path="url(#lens)">{"".join(in_layer)}{"".join(hot_layer)}</g>', extra]
    hx, hy = head_xy
    lines = head.split("|")
    svg.append(f'<rect x="0" y="{hy - head_size * 1.2:.0f}" width="{W * 0.72:.0f}" height="{head_size * (len(lines) + 1.6):.0f}" fill="url(#scrim)"/>')
    for i, ln in enumerate(lines):
        svg.append(f'<text x="{hx}" y="{hy + i * head_size * 1.02:.0f}" font-family="{SERIF}" font-size="{head_size}" fill="#fff">{ln}</text>')
    return svg


def chip(x, y, text, color="#B48CFF"):
    wpx = len(text) * 6.7 + 16
    return (f'<rect x="{x}" y="{y - 14}" width="{wpx:.0f}" height="20" fill="#fff" fill-opacity=".1"/>'
            f'<text x="{x + 8}" y="{y}" font-family="{MONO}" font-size="11" fill="{color}">{text}</text>')


def mono(x, y, text, size=11, op=1.0, anchor="start", color="#fff"):
    return f'<text x="{x}" y="{y}" font-family="{MONO}" font-size="{size}" fill="{color}" fill-opacity="{op}" text-anchor="{anchor}">{text}</text>'


nature = "SIMULATED SYSTEM · 200 INJECTED ANOMALIES · NOT REAL INFRASTRUCTURE"

# S00 desktop
svg = lens_svg(1440, 900, (1010, 450), 560, 3.0, (96, 804), 24,
               "Find the signal|inside the noise.", (96, 690), 88, 0)
svg += [mono(24, 32, "SENTINEL ANOMALY LAB", 13),
        mono(1416, 32, "CATS V2 · 17 CHANNELS · 1 HZ · 57.9 DAYS", 11, 1, "end"),
        mono(1416, 50, nature, 11, .5, "end"),
        chip(96, 848, "SYNTHETIC · CC BY 4.0 · INCIDENT 142 · INSIDE THE LENS: EXPECTED VS MEASURED"),
        mono(1416, 884, "SKIP INTRO", 11, 1, "end"), "</svg>"]
(HERE / "lens-s00-d.svg").write_text("".join(svg))

# S00 mobile
svg = lens_svg(390, 844, (410, 330), 507, 6.0, (72, 760), 16,
               "Find the signal|inside the|noise.", (16, 470), 40, 0)
svg += [mono(16, 28, "SENTINEL ANOMALY LAB", 11),
        mono(16, 590, "SYNTHETIC · SIMULATED SYSTEM", 11, 1, color="#B48CFF"),
        mono(16, 606, "NOT REAL INFRASTRUCTURE", 11, .5),
        '<rect x="115" y="788" width="160" height="32" fill="#fff"/>',
        mono(195, 809, "= SIGNAL", 13, 1, "middle", "#000"), "</svg>"]
(HERE / "lens-s00-m.svg").write_text("".join(svg))

# S05 threshold lab (desktop). The lens holds the five detector strands of incident 142 as
# ridges (same object as S00); the active detector (PCA) is bright, its seconds above the
# val-derived threshold glow, and the threshold is a light-blue hairline across the lens only.
w, vals, scores = window("142")
pca = evalj["detectors"]["pca"]
thr = pca["points"]["best_event_f1"]["threshold_q"]
W, H, c, R = 1440, 900, (1110, 540), 540
n = w["n"]
a0, a1 = w["anomaly_start"], w["anomaly_end"]
xs = c[0] - R + np.arange(n) / (n - 1) * 2 * R
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         '<defs>', f'<clipPath id="lens"><circle cx="{c[0]}" cy="{c[1]}" r="{R}"/></clipPath>',
         f'<linearGradient id="hot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC23D" stop-opacity=".95"/><stop offset=".4" stop-color="{ORANGE}" stop-opacity=".7"/><stop offset="1" stop-color="{ORANGE}" stop-opacity="0"/></linearGradient>',
         '<linearGradient id="ridge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>',
         '<filter id="glow"><feGaussianBlur stdDeviation="10"/></filter></defs>',
         f'<rect width="{W}" height="{H}" fill="#000"/>']
order = ["robust_z", "iforest", "changepoint", "gbm", "pca"]
inside = [f'<rect x="{c[0] - R}" y="0" width="{2 * R}" height="{H}" fill="#fff" fill-opacity=".065"/>']
parts_lbl = []
band_h = 150
for k, d in enumerate(order):
    yb = 150 + k * 125 + (band_h if d == "pca" else 0) * 0
    amp = 230 if d == "pca" else 70
    yb = 300 + k * 80 if d != "pca" else 760
    ys = yb - scores[d] / 65535 * amp
    poly = path(xs, ys) + f" L{xs[-1]:.1f},{yb + 40:.1f} L{xs[0]:.1f},{yb + 40:.1f} Z"
    inside += [f'<path d="{poly}" fill="#0b0b0b"/>', f'<path d="{poly}" fill="url(#ridge)" opacity="{1 if d == "pca" else .5}"/>']
    if d == "pca":
        yt = yb - thr / 65535 * amp
        flag = scores[d] >= thr
        run = []
        for i in range(n + 1):
            if i < n and flag[i]:
                run.append(i)
            elif run:
                sx, sy = xs[run[0]:run[-1] + 1], ys[run[0]:run[-1] + 1]
                hp = path(sx, sy) + f" L{sx[-1]:.1f},{yt:.1f} L{sx[0]:.1f},{yt:.1f} Z"
                inside += [f'<path d="{hp}" fill="url(#hot)" filter="url(#glow)"/>', f'<path d="{hp}" fill="url(#hot)"/>']
                run = []
        inside.append(f'<path d="{path(xs, ys)}" fill="none" stroke="#fff" stroke-width="1.5"/>')
        inside.append(f'<line x1="{c[0] - R}" x2="{c[0] + R}" y1="{yt:.1f}" y2="{yt:.1f}" stroke="#58B8E1"/>')
        inside.append(f'<rect x="{xs[a0]:.1f}" y="{yb + 14:.1f}" width="{xs[a1 - 1] - xs[a0]:.1f}" height="3" fill="#fff" fill-opacity=".6"/>')
    else:
        inside.append(f'<path d="{path(xs, ys)}" fill="none" stroke="#fff" stroke-opacity=".45"/>')
        parts_lbl.append(mono(c[0] - np.sqrt(R**2 - (yb + 16 - c[1])**2) + 12, yb + 16, d.upper().replace("_", " "), 11, .6))
parts.append(f'<g clip-path="url(#lens)">{"".join(inside)}</g>')
parts += parts_lbl
parts.append(mono(700, 790, "PCA RECONSTRUCTION · INCIDENT 142 (SYNTHETIC) · LABELLED SPAN", 11, .7))
parts.append(mono(1416, 760 - thr / 65535 * 230 - 8, f"THRESHOLD q {thr} · CHOSEN ON VAL", 11, 1, "end", "#58B8E1"))
t = pca["points"]["best_event_f1"]["test"]
parts.append(f'<text x="96" y="150" font-family="{SERIF}" font-size="64" fill="#fff">Move the line.</text>')
parts.append(f'<text x="96" y="214" font-family="{SERIF}" font-size="64" fill="#fff">Pay for it somewhere.</text>')
rows = [("DETECTOR", "PCA RECONSTRUCTION · DERIVED"),
        ("THRESHOLD", f"{thr} (BEST EVENT F1 ON VAL)"),
        ("", ""),
        ("TEST SPLIT · 14.5 DAYS · 67 INCIDENTS", ""),
        ("POINT F1", f"{t['point']['f1']:.2f}"),
        ("POINT-ADJUSTED F1", f"{t['point_adjusted']['f1']:.2f}  ({t['point_adjusted']['f1'] / t['point']['f1']:.1f}X)"),
        ("INCIDENTS CAUGHT", f"{t['event']['detected']} OF {t['event']['segments']}"),
        ("FALSE ALERTS / DAY", f"{t['event']['false_alerts_per_day']:.2f}"),
        ("MEDIAN DELAY", f"{t['event']['delay_median_s']:.0f} S")]
for i, (k, v) in enumerate(rows):
    parts.append(mono(96, 300 + i * 24, k, 13, .5 if v else 1))
    parts.append(mono(330, 300 + i * 24, v, 13))
parts.append('<rect x="96" y="540" width="380" height="4" fill="#fff" fill-opacity=".16"/>')
parts.append('<rect x="96" y="540" width="250" height="4" fill="#fff"/><rect x="340" y="528" width="12" height="28" fill="#690DE2"/>')
parts.append(mono(96, 580, "THIS WINDOW · 2,600 S · RECOMPUTED IN YOUR BROWSER", 11, .5))
parts.append(chip(96, 620, "DERIVED · THRESHOLDS FROM VAL ONLY", "#58B8E1"))
parts.append(mono(24, 32, "SENTINEL ANOMALY LAB", 13))
for i, lab in enumerate(["SIGNAL", "SOURCE", "NORMAL", "DETECTORS", "58 DAYS", "THRESHOLD", "FINE PRINT", "EVIDENCE", "REPLAY"]):
    x0 = 300 + i * 96
    on = lab == "THRESHOLD"
    parts.append(f'<rect x="{x0}" y="858" width="92" height="26" fill="#fff" fill-opacity="{1 if on else .1}"/>')
    parts.append(mono(x0 + 46, 875, lab, 11, 1, "middle", "#000" if on else "#fff"))
parts.append("</svg>")
(HERE / "lens-s05-d.svg").write_text("".join(parts))

# S04 secondary view: the five detector strands over all 57.9 days (overview max-pool),
# 200 incidents as orange ticks. Strands are lines, time runs left to right (never a vertical stack).
ov = load("overview.json")
nb = ov["bins"]
W, H = 1440, 900
# The L4 lens (VISUAL_DESIGN 3.3: c (1090, 520), R 330) rides the strip over window 142's day and
# shows the 10-minute bins around it at x6. No other circle is drawn (no rising arc).
c4, R4, M4 = (1090, 520), 330, 6.0
x0s, x1s = 96, W - 96
xb = lambda b: x0s + b / nb * (x1s - x0s)
w142 = load("window_142.json")
focus = (w142["row0"] + w142["anomaly_start"]) / ov["bin_s"]
parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<defs><clipPath id="l4"><circle cx="{c4[0]}" cy="{c4[1]}" r="{R4}"/></clipPath>'
         f'<mask id="o4"><rect width="{W}" height="{H}" fill="#fff"/><circle cx="{c4[0]}" cy="{c4[1]}" r="{R4}" fill="#000"/></mask>'
         '<linearGradient id="ridge4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="#000"/>']
x = np.array([xb(b) for b in range(nb)])
bins = np.arange(nb)
xin = c4[0] + (bins - focus) * (x1s - x0s) / nb * M4
outside, inside = [], [f'<circle cx="{c4[0]}" cy="{c4[1]}" r="{R4}" fill="#fff" fill-opacity=".065"/>']
for k, d in enumerate(["robust_z", "pca", "iforest", "changepoint", "gbm"]):
    yb = 330 + k * 92
    sq = u16(ov["scores_q_max"][d])
    yy = yb - sq / 65535 * 70
    outside.append(f'<path d="{path(x, yy)}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>')
    outside.append(mono(96, yb + 18, d.upper().replace("_", " "), 11, .5))
    sel = (xin > c4[0] - R4 - 10) & (xin < c4[0] + R4 + 10)
    yi = yb - sq[sel] / 65535 * 70 * 1.4
    xi = xin[sel]
    poly = path(xi, yi) + f" L{xi[-1]:.1f},{yb + 40} L{xi[0]:.1f},{yb + 40} Z"
    inside += [f'<path d="{poly}" fill="#0b0b0b"/>', f'<path d="{poly}" fill="url(#ridge4)"/>',
               f'<path d="{path(xi, yi)}" fill="none" stroke="#fff" stroke-opacity=".9" stroke-width="1.5"/>']
for b, i, _ in ov["incident_bins"]:
    outside.append(f'<rect x="{xb(b):.1f}" y="790" width="2" height="16" fill="{ORANGE}"/>')
    xi = c4[0] + (b - focus) * (x1s - x0s) / nb * M4
    inside.append(f'<rect x="{xi:.1f}" y="790" width="6" height="16" fill="{ORANGE}"/>')
for name, sp in meta["splits"].items():
    outside.append(mono(xb(sp["lo"] / ov["bin_s"]), 836, name.upper().replace("_", " "), 11, .5))
parts.append(f'<g mask="url(#o4)">{"".join(outside)}</g>')
parts.append(f'<g clip-path="url(#l4)">{"".join(inside)}</g>')
parts.append(mono(c4[0], c4[1] - R4 + 28, "x6 · INCIDENT 142 · TEST", 11, .7, "middle"))
parts.append(f'<text x="96" y="150" font-family="{SERIF}" font-size="64" fill="#fff">Fifty-eight days.</text>')
parts.append(f'<text x="96" y="214" font-family="{SERIF}" font-size="64" fill="#fff">Two hundred faults.</text>')
parts.append(mono(96, 260, "MAX SCORE PER 10 MIN · DERIVED · 200 INJECTED FAULTS (SYNTHETIC)", 11, .5))
parts.append("</svg>")
(HERE / "strands-s04-d.svg").write_text("".join(parts))
print("wrote 4 svgs")
