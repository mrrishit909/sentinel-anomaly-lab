/** One ArtifactSpec per file; getStore() shares a single request per artifact (the loader state machine is shared). */
import type { ArtifactSpec } from "./loader";
import {
  isAlerts, isAttribution, isChannels, isDetectorEval, isFacts, isIncidents, isMeta, isOverview, isQuality, isRecon, isSweep, isWindow,
  type AlertsFile, type AttributionFile, type Channels, type DetectorEvalFile, type Facts, type IncidentsFile, type Meta, type OverviewFile,
  type QualityFile, type ReconFile, type SweepFile, type WindowFile,
} from "./types";

export const FACTS: ArtifactSpec<Facts> = { file: "facts.json", guard: isFacts };
export const META: ArtifactSpec<Meta> = { file: "meta.json", guard: isMeta };
export const CHANNELS: ArtifactSpec<Channels> = { file: "channels.json", guard: isChannels };
export const EVAL: ArtifactSpec<DetectorEvalFile> = { file: "detector_eval.json", guard: isDetectorEval };
export const SWEEP: ArtifactSpec<SweepFile> = { file: "threshold_sweep.json", guard: isSweep };
export const INCIDENTS: ArtifactSpec<IncidentsFile> = { file: "incidents.json", guard: isIncidents };
export const OVERVIEW: ArtifactSpec<OverviewFile> = { file: "overview.json", guard: isOverview };
export const ALERTS: ArtifactSpec<AlertsFile> = { file: "alerts.json", guard: isAlerts };
export const ATTRIBUTION: ArtifactSpec<AttributionFile> = { file: "attribution.json", guard: isAttribution };
export const QUALITY: ArtifactSpec<QualityFile> = { file: "quality.json", guard: isQuality };
export const RECON: ArtifactSpec<ReconFile> = { file: "reconciliation.json", guard: isRecon };
export const HERO: ArtifactSpec<WindowFile> = { file: "window_142_hero.json", guard: isWindow };

const wins = new Map<string, ArtifactSpec<WindowFile>>();
/** window_<id>.json (13 published); the stored label is `WINDOW_<id>` in loading and error lines. */
export function windowSpec(id: string): ArtifactSpec<WindowFile> {
  let s = wins.get(id);
  if (!s) {
    s = { file: `window_${id}.json`, guard: isWindow };
    wins.set(id, s);
  }
  return s;
}
