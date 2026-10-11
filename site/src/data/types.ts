/**
 * Artifact types (docs/DATA_CONTRACTS.md) and hand-written guards at the trust boundary.
 * Only the fields the site reads are typed; each guard checks the structural keys a render depends on.
 */
export type Tag = "OBSERVED" | "DERIVED" | "PREDICTED" | "SIMULATED" | "SYNTHETIC";
export const DETECTORS = ["robust_z", "pca", "iforest", "changepoint", "gbm"] as const;
export type DetId = (typeof DETECTORS)[number];
export const OPS = ["best_point_f1", "best_event_f1", "far_budget_1_per_day"] as const;
export type OpId = (typeof OPS)[number];
export type SplitId = "val" | "test";
export const TELEMETRY = ["bed1", "bed2", "bfo1", "bfo2", "bso1", "bso2", "bso3", "ced1", "cfo1", "cso1"] as const;
export const CONTEXT = ["aimp", "amud", "arnd", "asin1", "asin2", "adbr", "adfl"] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (v: unknown, ...keys: string[]) => isObj(v) && keys.every((k) => k in v);

export interface Facts { values: Record<string, { value: number | string; tag: Tag; unit: string }> }
export const isFacts = (v: unknown): v is Facts => has(v, "values") && isObj((v as Facts).values);

export interface DetectorMeta {
  label: string; family: string; description: string; supervised: boolean; tag: Tag; causal: boolean;
  has_channel_contributions: boolean; quant: { c: number; smax: number };
}
export interface MetaWindow { id: string; incident_id: number; category: number; split: string; file: string; contrib_file: string }
export interface Meta {
  dataset: { name: string; nature: string; licence: string; licence_url: string; provider: string; url: string; doi: string; rows: number; hz: number; version: string };
  attribution: string[];
  detectors: Record<DetId, DetectorMeta>;
  splits: Record<"train" | "gbm_fit" | "val" | "test", { rows: number; days: number; segments: number; lo: number; hi: number; positives: number }>;
  metric_params: { merge_gap_s: number; tol_after_s: number; operating_points: string[] };
  windows: MetaWindow[];
  windows_note: string;
  pipeline_version: string;
  generated_at: string;
  hero_window: { file: string; seconds: [number, number]; source_window: string };
}
export const isMeta = (v: unknown): v is Meta => has(v, "dataset", "attribution", "detectors", "splits", "windows", "metric_params") && Array.isArray((v as Meta).attribution) && (v as Meta).attribution.length === 3;

export interface Channel { id: string; group: "telemetry" | "context"; lo: number; hi: number; train_mean: number; train_std: number; resid_scale: number | null; resid_median_window_s: number | null; binary_like: boolean }
export interface Channels { channels: Channel[]; grouping_note: string }
export const isChannels = (v: unknown): v is Channels => has(v, "channels", "grouping_note") && Array.isArray((v as Channels).channels) && (v as Channels).channels.length === 17;

export interface EvalMetrics {
  rows: number; threshold_q: number;
  point: { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null };
  point_adjusted: { tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null };
  event: { segments: number; detected: number; recall: number | null; alerts: number; false_alerts: number; alert_precision: number | null; false_alerts_per_day: number; delay_median_s: number | null; delay_mean_s: number | null };
}
export interface DetectorEval {
  average_precision: { val: number; test: number };
  points: Record<OpId, { selected_on: string; threshold_q: number; threshold_score: number; val: EvalMetrics; test: EvalMetrics }>;
  pr_curve: Record<SplitId, { precision: number[]; recall: number[] }>;
  test_point_f1_vs_point_adjusted: { point_f1: number; point_adjusted_f1: number; inflation: number };
}
export interface DetectorEvalFile { caveat_point_adjust: string; best_detector_by_test_event_f1: string; detectors: Record<DetId, DetectorEval> }
export const isDetectorEval = (v: unknown): v is DetectorEvalFile => has(v, "caveat_point_adjust", "detectors") && DETECTORS.every((d) => has((v as DetectorEvalFile).detectors[d], "points", "pr_curve", "test_point_f1_vs_point_adjusted"));

export interface SweepSplit {
  days: number; rows: number; segments: number; positives: number;
  p_tp: number[]; p_fp: number[]; pa_tp: number[]; ev_alerts: number[]; ev_false: number[]; ev_detected: number[]; delay_median_s: number[];
}
export interface SweepFile { detectors: Record<DetId, { thresholds_q: number[]; splits: Record<SplitId, SweepSplit> }>; metric_params: { merge_gap_s: number; tol_after_s: number } }
export const isSweep = (v: unknown): v is SweepFile => has(v, "detectors") && DETECTORS.every((d) => {
  const e = (v as SweepFile).detectors[d];
  return has(e, "thresholds_q", "splits") && Array.isArray(e.thresholds_q) && has(e.splits.val, "p_tp", "p_fp", "pa_tp", "ev_detected") && has(e.splits.test, "p_tp", "p_fp", "pa_tp", "ev_detected") && e.splits.test.p_tp.length === e.thresholds_q.length;
});

export interface AttrMethod { hit_at_1: number; hit_at_3: number; hit_at_3_any: number; mean_root_rank: number; n: number }
export interface AttributionFile {
  channels_scored: string[]; wording: string;
  methods: Record<"pca" | "robust_z", { all: AttrMethod; test: AttrMethod }>;
  per_root_cause: Record<string, { hit_at_1_pca: number; hit_at_1_robust_z: number; n: number }>;
  random_baseline: { hit_at_1: number; hit_at_3: number; hit_at_3_any: number; mean_root_rank: number };
}
export const isAttribution = (v: unknown): v is AttributionFile => has(v, "wording", "methods", "per_root_cause", "random_baseline");

export interface QualityFile { checks: { id: string; description: string; passed: boolean; expected: unknown; observed: unknown }[]; passed: number; failed: number }
export const isQuality = (v: unknown): v is QualityFile => has(v, "checks", "passed", "failed") && Array.isArray((v as QualityFile).checks);
export interface ReconFile { files: { name: string; md5: string; sha256: string; bytes: number }[]; labels: { segments_from_y: number; segments_metadata: number; mismatched_rows: number; end_convention: string; category_matches: boolean } }
export const isRecon = (v: unknown): v is ReconFile => has(v, "files", "labels");

export interface Incident {
  id: number; category: number; split: string; start: number; end: number; duration_s: number; root_cause: string; affected: string[]; window: string | null;
  attribution: Record<"pca" | "robust_z", { top3: string[]; hit_at_1: boolean; hit_at_3: boolean; root_rank: number }>;
  detection: Record<DetId, { detected: boolean; delay_s: number | null }>;
  detection_by_op: Record<OpId, Record<DetId, { detected: boolean; delay_s: number | null }>>;
  rise: Record<DetId, [number, number][]>;
}
export interface IncidentsFile { incidents: Incident[] }
export const isIncidents = (v: unknown): v is IncidentsFile => has(v, "incidents") && Array.isArray((v as IncidentsFile).incidents) && (v as IncidentsFile).incidents.length === 200;

export interface OverviewFile {
  bin_s: number; bins: number; scores_q_max: Record<DetId, string>; anomaly_frac_u8: string; incident_bins: [number, number, number][];
}
export const isOverview = (v: unknown): v is OverviewFile => has(v, "bin_s", "bins", "scores_q_max", "incident_bins") && DETECTORS.every((d) => typeof (v as OverviewFile).scores_q_max[d] === "string");

export interface AlertsFile {
  operating_points_included: string[]; excluded_note: string;
  detectors: Record<DetId, Partial<Record<OpId, Record<SplitId, [number, number, number][]>>>>;
}
export const isAlerts = (v: unknown): v is AlertsFile => has(v, "detectors", "operating_points_included");

export interface WindowFile {
  id: string; n: number; row0: number; anomaly_start: number; anomaly_end: number; truncated?: boolean; category?: number; split?: string;
  root_cause?: string; affected?: string[]; incident_id?: number;
  channel_range: Record<string, [number, number]>; channels_u16: Record<string, string>; labels_u8: string; scores_q_u16: Partial<Record<DetId, string>>;
}
export const isWindow = (v: unknown): v is WindowFile => has(v, "n", "row0", "anomaly_start", "anomaly_end", "channel_range", "channels_u16", "labels_u8", "scores_q_u16") && typeof (v as WindowFile).n === "number";

export interface VectorsFile {
  cases: { name: string; source: string; scores_q: number[]; labels: number[]; threshold_q: number; expected: { point: { tp: number; fp: number; fn: number }; point_adjusted: { tp: number; fp: number; fn: number }; event: { segments: number; detected: number; alerts: number; false_alerts: number; delay_median_s: number } } }[];
  residual_cases: { name: string; seconds: number; tolerance_rel: number; window: string; zres: Record<string, number[]> }[];
  metric_params: { merge_gap_s: number; tol_after_s: number };
}
