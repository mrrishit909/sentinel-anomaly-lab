/**
 * Window decode (quantized u16 base64 to Float64 series) and the derived series the lens draws:
 * z = (v - train_mean) / train_std offset to the pre-incident median, the expected path (61 s trailing median in the
 * same units) and the residual (measured - expected, in train SD).
 */
import type { Channels, DetId, WindowFile } from "../data/types";
import { CONTEXT, TELEMETRY } from "../data/types";
import { b64ToU16, b64ToU8, decodeChannel } from "../model/quant";
import { trailingMedian } from "../model/residual";
import { median } from "../lib/math";

export interface WinData {
  id: string; n: number; row0: number; start: number; end: number; truncated: boolean;
  category: number | null; split: string | null; rootCause: string | null; affected: string[]; incidentId: number | null;
  labels: Uint8Array;
  /** pre-incident median level in train SD (z + base = the level against the train mean) */
  base: Record<string, number>;
  /** level in train SD relative to the pre-incident median, per channel */
  z: Record<string, Float64Array>;
  /** expected level in the same units (61 s trailing median) */
  exp: Record<string, Float64Array>;
  /** measured - expected, in train SD */
  res: Record<string, Float64Array>;
  /** robust z = |x - med| / resid_scale (telemetry only) */
  zres: Record<string, Float64Array>;
  scores: Partial<Record<DetId, Uint16Array>>;
}

const cache = new WeakMap<WindowFile, WinData>();
export function decodeWindow(w: WindowFile, ch: Channels): WinData {
  const hit = cache.get(w);
  if (hit) return hit;
  const base: Record<string, number> = {};
  const z: WinData["z"] = {}, exp: WinData["exp"] = {}, res: WinData["res"] = {}, zres: WinData["zres"] = {};
  const info = new Map(ch.channels.map((c) => [c.id, c]));
  for (const id of [...TELEMETRY, ...CONTEXT]) {
    const q = w.channels_u16[id];
    const c = info.get(id);
    if (!q || !c) continue;
    const range = w.channel_range[id]!;
    const v = decodeChannel(b64ToU16(q), range);
    const sd = c.train_std || 1;
    const lvl = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) lvl[i] = (v[i]! - c.train_mean) / sd;
    const b0 = median(lvl.subarray(0, Math.max(1, Math.min(w.anomaly_start, lvl.length))));
    const zz = new Float64Array(v.length);
    for (let i = 0; i < v.length; i++) zz[i] = lvl[i]! - b0;
    z[id] = zz;
    base[id] = b0;
    if (c.group === "telemetry") {
      const med = trailingMedian(v, c.resid_median_window_s ?? 61);
      const e = new Float64Array(v.length), r = new Float64Array(v.length), zr = new Float64Array(v.length);
      for (let i = 0; i < v.length; i++) {
        e[i] = (med[i]! - c.train_mean) / sd - b0;
        r[i] = (v[i]! - med[i]!) / sd;
        zr[i] = c.resid_scale ? Math.abs(v[i]! - med[i]!) / c.resid_scale : 0;
      }
      exp[id] = e; res[id] = r; zres[id] = zr;
    }
  }
  const scores: WinData["scores"] = {};
  for (const [k, s] of Object.entries(w.scores_q_u16)) if (s) scores[k as DetId] = b64ToU16(s);
  const out: WinData = {
    id: String(w.id), n: w.n, row0: w.row0, start: w.anomaly_start, end: w.anomaly_end, truncated: !!w.truncated,
    category: w.category ?? null, split: w.split ?? null, rootCause: w.root_cause ?? null, affected: (w.affected ?? []).filter(Boolean) as string[], incidentId: w.incident_id ?? null,
    labels: b64ToU8(w.labels_u8), base, z, exp, res, zres, scores,
  };
  cache.set(w, out);
  return out;
}
