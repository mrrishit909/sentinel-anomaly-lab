import { useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { Segmented } from "../components/Segmented";
import { HonestyChip } from "../components/HonestyChip";
import { SceneErrors, type Needed } from "../components/StateUI";
import { LensFigure } from "../components/LensFigure";
import { useArtifact } from "../data/useArtifact";
import { CHANNELS, EVAL, INCIDENTS, META, windowSpec } from "../data/artifacts";
import { DETECTORS, OPS, type DetId, type OpId } from "../data/types";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { seek } from "../scroll/engine";
import { detectors } from "../state/scenes";
import { decodeWindow } from "./windows";
import { box } from "./geometry";
import { composeScores, DET_STEPS, detAt, CODE } from "./detectors";
import { firstFlag } from "../model/metrics";
import { cap, d1, words } from "../model/format";
import { useStage } from "./useStage";
import { invalidate } from "./bus";
import { useEffect } from "react";
import { fv } from "../data/copy";
import { FACTS } from "../data/artifacts";

const OP_LABEL: Record<OpId, string> = { best_point_f1: "BEST POINT F1", best_event_f1: "BEST EVENT F1", far_budget_1_per_day: "1 FALSE ALERT A DAY" };
const STEP_P = [0.19, 0.37, 0.55, 0.73, 0.91];

export function S03bDetectors({ def }: { def: SceneDef }) {
  const [win, rWin] = useArtifact(windowSpec("142"));
  const [chs, rCh] = useArtifact(CHANNELS);
  const [ev, rEv] = useArtifact(EVAL);
  const [meta, rMeta] = useArtifact(META);
  const [inc, rInc] = useArtifact(INCIDENTS);
  const [facts] = useArtifact(FACTS);
  const st = detectors.use();
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const [p, setP] = useState(0);
  const prev = useRef<DetId>("robust_z");
  const data = useMemo(() => (win.status === "ready" && chs.status === "ready" ? decodeWindow(win.data, chs.data) : null), [win, chs]);

  useProgress(def.id, (q) => {
    setP((o) => (Math.abs(o - q) > 0.002 ? q : o));
    const d = detAt(q);
    if (d !== prev.current) { prev.current = d; if (detectors.get().det !== null) detectors.set({ det: null }); }
  });
  useEffect(() => { invalidate(); }, [st.det, st.op]);

  const det: DetId = st.det ?? detAt(p);
  const m = meta.status === "ready" ? meta.data.detectors[det] : null;
  const thr = ev.status === "ready" ? ev.data.detectors[det].points[st.op].threshold_q : null;
  const first = data && thr !== null && data.scores[det] ? firstFlag(data.scores[det]!, thr, data.start, data.end) : -2;
  const delay = first >= 0 && data ? first - data.start : null;
  const rzTest = ev.status === "ready" ? ev.data.detectors.robust_z.points[st.op].test.event.false_alerts_per_day : null;
  const needed: Needed[] = [
    { file: "window_142.json", state: win, retry: rWin }, { file: "channels.json", state: chs, retry: rCh },
    { file: "detector_eval.json", state: ev, retry: rEv }, { file: "meta.json", state: meta, retry: rMeta }, { file: "incidents.json", state: inc, retry: rInc },
  ];
  const goto = (d: DetId) => {
    detectors.set({ det: null });
    seek(def.id, STEP_P[DETECTORS.indexOf(d)]!);
  };
  void DET_STEPS;
  const nDet = meta.status === "ready" ? Object.keys(meta.data.detectors).length : 5;
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-detectors">
      <div className="sc">
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top">
          <p className="scene-kicker">DETECTORS · WINDOW 142 · ONE FAULT, FIVE READINGS</p>
          <h2 id="detectors-title" tabIndex={-1} data-scene-heading className="sc-title serif">{cap(words(nDet))} ways to be suspicious.</h2>
          <div className="ctl-row">
            <div className="tabs" role="tablist" aria-label="Detector">
              {DETECTORS.map((d) => (
                <button key={d} type="button" role="tab" aria-selected={d === det} tabIndex={d === det ? 0 : -1} className={`tab ${d === det ? "is-on" : ""}`} onClick={() => goto(d)}
                  onKeyDown={(e) => {
                    const i = DETECTORS.indexOf(d);
                    if (e.key === "ArrowRight") { e.preventDefault(); goto(DETECTORS[(i + 1) % 5]!); }
                    if (e.key === "ArrowLeft") { e.preventDefault(); goto(DETECTORS[(i + 4) % 5]!); }
                  }}>
                  {CODE[d]}{d === "gbm" ? <i className="tab__dot" aria-label="predicted" /> : null}
                </button>
              ))}
            </div>
            <Segmented label="Operating point" value={st.op} compact options={OPS.map((o) => ({ value: o, label: OP_LABEL[o] }))} onChange={(v) => detectors.set({ op: v })} />
          </div>
        </div>

        {!motion && data && ev.status === "ready" ? (
          <div className="figs figs--col">
            {DETECTORS.map((d) => (
              <LensFigure key={d} label={`Lens, ${d}`} className="lens-fig--flow" deps={[data, st.op, stage.w]}
                tag={<><b>{meta.status === "ready" ? meta.data.detectors[d].label.toUpperCase() : d}</b> · <HonestyChip tag={d === "gbm" ? "PREDICTED" : "DERIVED"} /></>}
                build={(w, h) => composeScores({ cls: stage.cls, w, h, now: 0, p: 0, motion: false }, { win: data, det: d, op: st.op, box: box(stage.cls, "L3", w, h), noAnim: true, stateKey: `fig.${d}` })} />
            ))}
          </div>
        ) : null}

        <div className="sc-bottom">
          {m ? (
            <article className="detcard plate" aria-live="polite">
              <header className="detcard__head">
                <span className="detcard__name">{m.label.toUpperCase()}</span>
                <HonestyChip tag={m.tag} detail={m.supervised ? "SUPERVISED" : "UNSUPERVISED"} />
              </header>
              <p className="detcard__fam">{m.family.toUpperCase()} · {m.description.toUpperCase()}</p>
              <p className="detcard__line tnum">
                {delay !== null ? `FIRST ALERT AFTER ${delay} S` : first === -2 ? "…" : "NEVER ALERTED"} · THRESHOLD CHOSEN ON VAL · {OP_LABEL[st.op]}
              </p>
              {det === "gbm" && facts.status === "ready" ? <p className="detcard__extra">{`TRAINED ON ${fv(facts.data, "split.gbm_fit.segments")} LABELLED INCIDENTS`}</p> : null}
              {det === "changepoint" ? <p className="detcard__extra">CAUSAL VERSION: ABOUT 100 S OF LOOK-AHEAD BUILT INTO ITS DELAY</p> : null}
              {det === "robust_z" && first !== -2 ? (
                <p className="detcard__extra">
                  {delay === null ? "AT THIS THRESHOLD, THE SIMPLEST DETECTOR NEVER RAISES ITS HAND ON THIS FAULT."
                    : `IT ALERTS AFTER ${delay} S HERE, AT A THRESHOLD THAT ALSO RAISES ${rzTest !== null ? d1(rzTest) : "…"} FALSE ALERTS A DAY ON TEST.`}
                </p>
              ) : null}
            </article>
          ) : null}
          <div className="chip-row">
            <HonestyChip tag={det === "gbm" ? "PREDICTED" : "DERIVED"} detail="SCORES, VAL LINES" />
          </div>
        </div>
      </div>
    </Track>
  );
}
