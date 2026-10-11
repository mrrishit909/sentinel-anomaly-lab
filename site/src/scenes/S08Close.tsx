import { useEffect, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { WordReveal } from "../components/WordReveal";
import { HonestyChip } from "../components/HonestyChip";
import { LensFigure } from "../components/LensFigure";
import { SceneErrors, type Needed } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { CHANNELS, EVAL, FACTS, INCIDENTS, META, windowSpec } from "../data/artifacts";
import { fv } from "../data/copy";
import { replay } from "../state/scenes";
import { useSel } from "../state/store";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { jumpTo } from "../scroll/engine";
import { words } from "../model/format";
import { decodeWindow } from "./windows";
import { composeClose, ECHO_AT } from "./close";
import { replayThreshold } from "./compose";
import { incident } from "./data";
import { hasContributions } from "./replayFrame";
import { box } from "./geometry";
import { CODE } from "./detectors";
import { useStage } from "./useStage";
import { Q_MAX } from "../model/quant";
import { METHODOLOGY_URL, REPO_URL } from "../config";

/** S08: the closing echoes the opening. Frame comes from the fixed canvas (motion on) or an in-flow figure (motion off). */
export function S08Close({ def, onReplayIntro }: { def: SceneDef; onReplayIntro: () => void }) {
  const [facts, rF] = useArtifact(FACTS);
  const [meta, rM] = useArtifact(META);
  const [ev, rE] = useArtifact(EVAL);
  const [chs, rC] = useArtifact(CHANNELS);
  const [inc, rI] = useArtifact(INCIDENTS);
  const touched = useSel(replay, (s) => s.touched);
  const incidentId = useSel(replay, (s) => s.incidentId);
  const det = useSel(replay, (s) => s.det);
  const op = useSel(replay, (s) => s.op);
  const index = useSel(replay, (s) => s.index);
  const [win] = useArtifact(windowSpec(touched ? String(incidentId) : "142"));
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const [p, setP] = useState(0);
  useProgress(def.id, (q) => setP((o) => (Math.abs(o - q) > 0.002 ? q : o)));
  useEffect(() => undefined, []);
  const data = win.status === "ready" && chs.status === "ready" ? decodeWindow(win.data, chs.data) : null;
  const useDet = touched ? det : "pca";
  const thr = touched ? replayThreshold(det, op, index) : ev.status === "ready" ? ev.data.detectors.pca.points.best_event_f1.threshold_q : Q_MAX;
  const q = data?.scores[useDet];
  const nothing = !!q && !q.some((v) => v >= thr);
  const needed: Needed[] = [
    { file: "facts.json", state: facts, retry: rF }, { file: "meta.json", state: meta, retry: rM }, { file: "detector_eval.json", state: ev, retry: rE },
    { file: "channels.json", state: chs, retry: rC }, { file: "incidents.json", state: inc, retry: rI },
  ];
  const nInc = facts.status === "ready" ? fv(facts.data, "incidents") : 0;
  const nDet = meta.status === "ready" ? Object.keys(meta.data.detectors).length : 0;
  const para = facts.status === "ready" && meta.status === "ready"
    ? `A machine that never sits still, ${words(nInc)} faults hidden in it, and ${words(nDet)} ways of looking. The right lens finds most of them. Every one of them is paid for in false alarms, and none of them says why.`
    : "A machine that never sits still, faults hidden in it, and several ways of looking.";
  const label = data && incidentId ? `INCIDENT ${touched ? incidentId : 142} · ${meta.status === "ready" ? meta.data.detectors[useDet].label.toUpperCase() : CODE[useDet]} · THRESHOLD Q ${thr} (${touched ? "YOUR CHOICE" : "CHOSEN ON VAL"})` : "";
  const echoed = !motion || p >= ECHO_AT;
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-close">
      <div className="close__scrim" aria-hidden="true" />
      <div className="sc sc--close">
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top">
          <p className="scene-kicker">THE SIGNAL, FOUND AGAIN</p>
          <h2 id="close-title" tabIndex={-1} data-scene-heading className="sr-only">The signal, found again.</h2>
        </div>
        {!motion && data ? (
          <div className="figs figs--1">
            <LensFigure label="The giant lens, end state" className="lens-fig--flow lens-fig--giant" deps={[data, useDet, thr, stage.w]}
              tag={<HonestyChip tag={useDet === "gbm" ? "PREDICTED" : touched ? "DERIVED" : "SYNTHETIC"} detail={touched ? "YOUR SETTINGS" : "SIMULATED SYSTEM"} />}
              build={(w, h) => composeClose({ cls: stage.cls, w, h, now: 0, p: 1, motion: false }, { win: data, det: useDet, thrQ: thr, inc: hasContributions(useDet) ? incident(touched ? incidentId : 142) : incident(touched ? incidentId : 142), fromRoot: null }).frame} />
          </div>
        ) : null}
        <div className="sc-bottom close__bottom">
          <WordReveal as="p" className="close__para serif" text={para} mode={motion ? { kind: "scrub", track: def.id, from: 0.35, to: 0.65 } : { kind: "value", t: 1 }} />
          <p className="close__caption plate" aria-live="polite">
            {echoed ? (nothing ? "NOTHING CROSSED YOUR LINE. THAT IS ALSO AN ANSWER." : label) : ""}
          </p>
          <div className="chip-row">
            <HonestyChip tag={useDet === "gbm" ? "PREDICTED" : "DERIVED"} detail={touched ? "YOUR SETTINGS" : "PCA, CHOSEN ON VAL"} />
            <HonestyChip tag="SYNTHETIC" detail="SIMULATED SYSTEM, NOT REAL TELEMETRY" />
          </div>
          <nav className="close__links" aria-label="Closing links">
            <button type="button" className="link-btn" onClick={() => jumpTo("replay", 0, { push: true, focus: true })}>→ OPEN THE REPLAY</button>
            <button type="button" className="link-btn" onClick={onReplayIntro}>→ REPLAY THE INTRO</button>
            <a className="link-btn" href={METHODOLOGY_URL} target="_blank" rel="noopener">→ READ THE METHODOLOGY</a>
            <a className="link-btn" href={REPO_URL} target="_blank" rel="noopener">→ SOURCE CODE</a>
          </nav>
          {meta.status === "ready" ? (
            <footer className="attrib">
              <p>{meta.data.dataset.nature.toUpperCase()}</p>
              {meta.data.attribution.map((a) => <p key={a}>{a}</p>)}
              <p>
                <a href={meta.data.dataset.licence_url} target="_blank" rel="noopener">{meta.data.dataset.licence}</a> · PIPELINE V{meta.data.pipeline_version} · {meta.data.dataset.provider}
              </p>
            </footer>
          ) : null}
        </div>
      </div>
    </Track>
  );
}
void box;
