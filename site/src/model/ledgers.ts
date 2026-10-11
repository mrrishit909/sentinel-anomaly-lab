/** Ledger cells. SPLIT cells are sweep lookups; WINDOW cells are recomputed from stored window scores. One scope per cell. */
import type { Cell } from "./scope";
import type { SplitRow } from "./sweep";
import { f1, type WindowMetrics } from "./metrics";
import { d1, d2, n0, pct0 } from "./format";

export function splitCells(r: SplitRow): Cell[] {
  const infl = r.inflation === null ? "" : ` (×${d1(r.inflation)})`;
  return [
    { key: "f1", label: "POINT F1 | POINT-ADJUSTED F1", value: `${d2(r.pointF1)} | ${d2(r.paF1)}${infl}`, scope: "SPLIT" },
    { key: "caught", label: "INCIDENTS CAUGHT", value: `${r.detected} OF ${r.segments}`, scope: "SPLIT" },
    { key: "prec", label: "ALERT PRECISION", value: r.alertPrecision === null ? "NO ALERTS" : pct0(r.alertPrecision), scope: "SPLIT" },
    { key: "fa", label: "FALSE ALERTS / DAY", value: d2(r.falsePerDay), scope: "SPLIT" },
    { key: "delay", label: "MEDIAN DELAY", value: r.delay === null ? "NO INCIDENT CAUGHT" : `${n0(r.delay)} S`, scope: "SPLIT" },
  ];
}

export function windowCells(m: WindowMetrics, truncated: boolean): Cell[] {
  const pf = f1(m.point), pa = f1(m.point_adjusted);
  const first = m.segments[0];
  return [
    { key: "pt", label: "POINT TP / FP / FN", value: `${n0(m.point.tp)} / ${n0(m.point.fp)} / ${n0(m.point.fn)}`, scope: "WINDOW" },
    { key: "f1", label: "POINT F1 | POINT-ADJUSTED F1", value: `${d2(pf)} | ${d2(pa)}${pf > 0 ? ` (×${d1(pa / pf)})` : ""}`, scope: "WINDOW" },
    { key: "alerts", label: "ALERTS (FALSE)", value: `${m.event.alerts} (${m.event.false_alerts})`, scope: "WINDOW" },
    { key: "delay", label: truncated ? "FIRST ALERT, WITHIN THIS WINDOW" : "FIRST ALERT", value: first && first.detected ? `AFTER ${first.delay} S` : "NONE IN THIS WINDOW", scope: "WINDOW" },
  ];
}
