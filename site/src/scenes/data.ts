/** Synchronous reads of already-loaded artifacts for composers (frames never wait on a fetch). */
import { getStore, type ArtifactSpec } from "../data/loader";
import { ATTRIBUTION, CHANNELS, EVAL, HERO, INCIDENTS, META, OVERVIEW, ALERTS, SWEEP, windowSpec } from "../data/artifacts";
import { decodeWindow, type WinData } from "./windows";
import type { Channels, DetectorEvalFile, Incident, Meta, OverviewFile, SweepFile, AlertsFile, AttributionFile } from "../data/types";
import { b64ToU16, b64ToU8 } from "../model/quant";
import { DETECTORS, type DetId } from "../data/types";

export function peek<T>(spec: ArtifactSpec<T>): T | null {
  const s = getStore(spec).getState();
  return s.status === "ready" || s.status === "empty" ? s.data : null;
}
export const channels = (): Channels | null => peek(CHANNELS);
export const meta = (): Meta | null => peek(META);
export const evalFile = (): DetectorEvalFile | null => peek(EVAL);
export const sweep = (): SweepFile | null => peek(SWEEP);
export const alerts = (): AlertsFile | null => peek(ALERTS);
export const attribution = (): AttributionFile | null => peek(ATTRIBUTION);

let incMap: { src: unknown; map: Map<number, Incident> } | null = null;
export function incident(id: number | string): Incident | null {
  const f = peek(INCIDENTS);
  if (!f) return null;
  if (!incMap || incMap.src !== f) incMap = { src: f, map: new Map(f.incidents.map((i) => [i.id, i])) };
  return incMap.map.get(Number(id)) ?? null;
}

export function heroWin(): WinData | null {
  const h = peek(HERO), c = channels();
  return h && c ? decodeWindow(h, c) : null;
}
export function winById(id: string): WinData | null {
  const w = peek(windowSpec(id)), c = channels();
  return w && c ? decodeWindow(w, c) : null;
}

export interface OverviewData { bins: number; binS: number; q: Record<DetId, Uint16Array>; frac: Uint8Array; ticks: { bin: number; id: number; split: number }[] }
let ovCache: { src: OverviewFile; out: OverviewData } | null = null;
export function overview(): OverviewData | null {
  const o = peek(OVERVIEW);
  if (!o) return null;
  if (ovCache?.src === o) return ovCache.out;
  const q = {} as Record<DetId, Uint16Array>;
  for (const d of DETECTORS) q[d] = b64ToU16(o.scores_q_max[d]);
  const out: OverviewData = { bins: o.bins, binS: o.bin_s, q, frac: b64ToU8(o.anomaly_frac_u8), ticks: o.incident_bins.map(([bin, id, split]) => ({ bin, id, split })) };
  ovCache = { src: o, out };
  return out;
}
