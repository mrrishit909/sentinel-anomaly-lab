import { describe, expect, it } from "vitest";
import { art } from "./testdata";
import { evaluate, f1 } from "./metrics";
import { trailingMedian } from "./residual";
import { splitRow, notches, detectedAt, indexOfThreshold } from "./sweep";
import { b64ToU16, b64ToU8, decodeChannel } from "./quant";
import type { DetectorEvalFile, IncidentsFile, SweepFile, VectorsFile, WindowFile, Channels, Meta } from "../data/types";
import { DETECTORS, OPS } from "../data/types";

const sweep = art<SweepFile>("threshold_sweep.json");
const ev = art<DetectorEvalFile>("detector_eval.json");
const inc = art<IncidentsFile>("incidents.json");
const vec = art<VectorsFile>("recompute_vectors.json");
const meta = art<Meta>("meta.json");
const channels = art<Channels>("channels.json");

describe("metric parity with the Python reference (recompute_vectors.json)", () => {
  for (const c of vec.cases) {
    it(c.name, () => {
      const m = evaluate(c.scores_q, c.labels, c.threshold_q, vec.metric_params.merge_gap_s, vec.metric_params.tol_after_s);
      expect({ point: m.point, point_adjusted: m.point_adjusted, event: { ...m.event } }).toEqual(c.expected);
    });
  }
  it("covers 17 cases including 6 real windows", () => {
    expect(vec.cases.length).toBe(17);
    expect(vec.cases.filter((c) => c.source === "real_window").length).toBe(6);
  });
});

describe("expected path and robust residual (DR-1)", () => {
  const rc = vec.residual_cases[0]!;
  it("matches zres_window_142 on the first 600 s", () => {
    const w = art<WindowFile>(`window_${rc.window}.json`);
    let checked = 0;
    for (const [ch, ref] of Object.entries(rc.zres)) {
      const info = channels.channels.find((c) => c.id === ch)!;
      const x = decodeChannel(b64ToU16(w.channels_u16[ch]!), w.channel_range[ch]!);
      const med = trailingMedian(x, 61);
      for (let i = 0; i < rc.seconds; i++) {
        const z = Math.abs(x[i]! - med[i]!) / info.resid_scale!;
        // the vector is rounded to 6 decimals: relative tolerance plus a 1e-6 absolute floor
        expect(Math.abs(z - ref[i]!)).toBeLessThanOrEqual(rc.tolerance_rel * Math.abs(ref[i]!) + 2e-6);
        checked++;
      }
    }
    expect(checked).toBe(10 * 600);
  });
  it("trailing median has the min_samples = 1 and even-count rules", () => {
    expect(Array.from(trailingMedian([5, 1, 9, 3], 3))).toEqual([5, 3, 5, 3]);
  });
});

describe("sweep lookups equal detector_eval at each operating point", () => {
  for (const det of DETECTORS) {
    it(det, () => {
      const nt = notches(sweep, ev, det);
      for (const op of OPS) {
        expect(sweep.detectors[det].thresholds_q[nt[op]]).toBe(ev.detectors[det].points[op].threshold_q);
        for (const sp of ["val", "test"] as const) {
          const r = splitRow(sweep, det, sp, nt[op]);
          const e = ev.detectors[det].points[op][sp];
          expect(r.pointF1).toBeCloseTo(e.point.f1!, 9);
          expect(r.paF1).toBeCloseTo(e.point_adjusted.f1!, 9);
          expect(r.detected).toBe(e.event.detected);
          expect(r.falseAlerts).toBe(e.event.false_alerts);
          expect(r.falsePerDay).toBeCloseTo(e.event.false_alerts_per_day, 9);
          expect(r.delay).toBe(e.event.delay_median_s);
        }
      }
    });
  }
});

describe("detection at any threshold rebuilt from the rise staircase (DR-2)", () => {
  for (const det of DETECTORS) {
    it(`${det}: detected and median delay at every sweep step, val and test`, () => {
      for (const sp of ["val", "test"] as const) {
        const col = sweep.detectors[det].splits[sp];
        const mine = inc.incidents.filter((i) => i.split === sp);
        expect(mine.length).toBe(col.segments);
        sweep.detectors[det].thresholds_q.forEach((thr, k) => {
          const delays: number[] = [];
          for (const i of mine) { const r = detectedAt(i.rise[det], thr); if (r.detected) delays.push(r.delay!); }
          expect(delays.length).toBe(col.ev_detected[k]);
          delays.sort((a, b) => a - b);
          const m = delays.length;
          const med = !m ? -1 : m % 2 ? delays[(m - 1) / 2]! : (delays[m / 2 - 1]! + delays[m / 2]!) / 2;
          expect(med).toBe(col.delay_median_s[k]);
        });
      }
    });
  }
  it("detection_by_op equals the rise at each operating threshold", () => {
    for (const i of inc.incidents) for (const op of OPS) for (const det of DETECTORS) {
      const thr = ev.detectors[det].points[op].threshold_q;
      const r = detectedAt(i.rise[det], thr);
      expect(r.detected).toBe(i.detection_by_op[op][det].detected);
      expect(r.delay).toBe(i.detection_by_op[op][det].delay_s);
    }
  });
});

describe("window facts the copy relies on", () => {
  it("window 153, Isolation Forest at best event F1: 2 flagged seconds, 700 counted by point adjustment", () => {
    const w = art<WindowFile>("window_153.json");
    const q = b64ToU16(w.scores_q_u16.iforest!);
    const lab = b64ToU8(w.labels_u8);
    const m = evaluate(q, lab, ev.detectors.iforest.points.best_event_f1.threshold_q);
    expect(m.point.tp).toBe(2);
    expect(m.point_adjusted.tp).toBe(700);
    const flagged = [...q.keys()].filter((k) => q[k]! >= ev.detectors.iforest.points.best_event_f1.threshold_q && k >= w.anomaly_start && k < w.anomaly_end);
    expect(flagged).toEqual([882, 886]);
  });
  it("window 142: robust z never flags at best event F1; PCA flags at 0 s", () => {
    const w = art<WindowFile>("window_142.json");
    const lab = b64ToU8(w.labels_u8);
    const r = evaluate(b64ToU16(w.scores_q_u16.robust_z!), lab, ev.detectors.robust_z.points.best_event_f1.threshold_q);
    expect(r.event.detected).toBe(0);
    const p = evaluate(b64ToU16(w.scores_q_u16.pca!), lab, ev.detectors.pca.points.best_event_f1.threshold_q);
    expect(p.segments[0]!.delay).toBe(0);
  });
  it("hero slice equals the first 1200 s of window 142", () => {
    const w = art<WindowFile>("window_142.json"), h = art<WindowFile>("window_142_hero.json");
    expect(h.n).toBe(1200);
    for (const ch of Object.keys(h.channels_u16)) {
      expect(Array.from(b64ToU16(h.channels_u16[ch]!))).toEqual(Array.from(b64ToU16(w.channels_u16[ch]!).slice(0, 1200)));
    }
    expect(Array.from(b64ToU16(h.scores_q_u16.pca!))).toEqual(Array.from(b64ToU16(w.scores_q_u16.pca!).slice(0, 1200)));
  });
  it("every operating threshold is a member of its detector's sweep", () => {
    for (const det of DETECTORS) for (const op of OPS) expect(indexOfThreshold(sweep, det, ev.detectors[det].points[op].threshold_q)).toBeGreaterThanOrEqual(0);
  });
  it("f1 helper and meta windows", () => {
    expect(f1({ tp: 1, fp: 0, fn: 0 })).toBe(1);
    expect(meta.windows.length).toBe(13);
  });
});
