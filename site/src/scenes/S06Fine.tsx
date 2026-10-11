import { useEffect, useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { Segmented } from "../components/Segmented";
import { HonestyChip } from "../components/HonestyChip";
import { SceneErrors, type Needed } from "../components/StateUI";
import { LensFigure } from "../components/LensFigure";
import { useArtifact } from "../data/useArtifact";
import { ATTRIBUTION, CHANNELS, EVAL, INCIDENTS, windowSpec } from "../data/artifacts";
import { DETECTORS, type DetId } from "../data/types";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { fine, FINE_DEFAULT, type Protocol } from "../state/scenes";
import { decodeWindow } from "./windows";
import { box } from "./geometry";
import { composeFinePart1, PART2_AT, protoAt, PROTO_STEPS } from "./fine";
import { composeNormal } from "./normal";
import { litFor } from "./signal";
import { evaluate } from "../model/metrics";
import { d1, d2, pct0 } from "../model/format";
import { CODE } from "./detectors";
import { useStage } from "./useStage";
import { invalidate } from "./bus";
import { incident } from "./data";

const PROTOS: { value: Protocol; label: string }[] = [{ value: "point", label: "POINT" }, { value: "pa", label: "POINT-ADJUSTED" }, { value: "event", label: "EVENT" }];

export function S06Fine({ def }: { def: SceneDef }) {
  const [w153, r153] = useArtifact(windowSpec("153"));
  const [w142, r142] = useArtifact(windowSpec("142"));
  const [chs, rCh] = useArtifact(CHANNELS);
  const [ev, rEv] = useArtifact(EVAL);
  const [at, rAt] = useArtifact(ATTRIBUTION);
    const [inc, rInc] = useArtifact(INCIDENTS);
  const st = fine.use();
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const [p, setP] = useState(0);
  const prev = useRef<Protocol>("point");
  useProgress(def.id, (q) => {
    setP((o) => (Math.abs(o - q) > 0.002 ? q : o));
    const s = protoAt(q);
    if (s !== prev.current) { prev.current = s; if (fine.get().protocol !== null) fine.set({ protocol: null }); }
  });
  useEffect(() => { invalidate(); }, [st]);
  const d153 = useMemo(() => (w153.status === "ready" && chs.status === "ready" ? decodeWindow(w153.data, chs.data) : null), [w153, chs]);
  const d142 = useMemo(() => (w142.status === "ready" && chs.status === "ready" ? decodeWindow(w142.data, chs.data) : null), [w142, chs]);
  const protocol = st.protocol ?? protoAt(p);
  const part2 = !motion ? true : p >= PART2_AT;

  const thr = ev.status === "ready" ? ev.data.detectors.iforest.points.best_event_f1.threshold_q : null;
  const m153 = d153 && thr !== null && d153.scores.iforest ? evaluate(d153.scores.iforest, d153.labels, thr) : null;
  const flagged = m153 ? m153.point.tp : null;
  const counted = m153 ? m153.point_adjusted.tp : null;
  const delay = m153?.segments[0]?.delay ?? -1;
  const needed: Needed[] = [
    { file: "window_153.json", state: w153, retry: r153 }, { file: "window_142.json", state: w142, retry: r142 }, { file: "channels.json", state: chs, retry: rCh },
    { file: "detector_eval.json", state: ev, retry: rEv }, { file: "attribution.json", state: at, retry: rAt }, { file: "incidents.json", state: inc, retry: rInc },
  ];
  const pairs = useMemo(() => {
    if (ev.status !== "ready") return [];
    return DETECTORS.map((d) => ({ d, ...ev.data.detectors[d].test_point_f1_vs_point_adjusted })).sort((a, b) => b.point_f1 - a.point_f1);
  }, [ev]);
  const method = st.attribution;
  const scopeKey = st.scope;
  const rank = at.status === "ready" ? at.data : null;
  const statement = part2 ? "Which measurements moved. Not why." : "One touch paints the whole fault.";

  const figs = (!motion && d153 && d142 && ev.status === "ready") ? (
    <div className="figs figs--3">
      {PROTOS.map((pr) => (
        <LensFigure key={pr.value} label={`Window 153, ${pr.label}`} className="lens-fig--flow" deps={[d153, pr.value, stage.w]}
          tag={<><b>{pr.label}</b> · <HonestyChip tag="DERIVED" /></>}
          build={(w, h) => composeFinePart1({ cls: stage.cls, w, h, now: 0, p: 0, motion: false }, { win: d153, protocol: pr.value })} />
      ))}
      <LensFigure label="Window 142 attribution" className="lens-fig--flow" deps={[d142, method, stage.w]}
        tag={<><b>{method === "pca" ? "PCA" : "ROBUST Z"} TOP 3 FOR INCIDENT 142</b> · <HonestyChip tag="DERIVED" /></>}
        build={(w, h) => {
          const c = { cls: stage.cls, w, h, now: 0, p: 0, motion: false };
          const i = incident(142);
          const t = ev.data.detectors[method].points.best_event_f1.threshold_q;
          const lit = i ? litFor(d142, method, t, i.attribution[method].top3, () => 1) : undefined;
          return composeNormal(c, { win: d142, view: "raw", zoom: 3, channel: null, lit: lit ?? null, span: false, f: d142.start + 160, box: box(stage.cls, "L6", w, h) });
        }} />
    </div>
  ) : null;
  void PROTO_STEPS;

  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-fine" >
      <div className="sc sc--fine" data-part={part2 ? "2" : "1"}>
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top">
          <p className="scene-kicker">FINE PRINT · {part2 ? "WHICH MEASUREMENTS MOVED" : `WINDOW 153 · ISOLATION FOREST AT ITS VAL-CHOSEN THRESHOLD${m153 ? ` · ${m153.positives} LABELLED SECONDS` : ""}`}</p>
          <h2 id="fine-title" key={part2 ? "b" : "a"} tabIndex={-1} data-scene-heading className="sc-title serif title-swap">{statement}</h2>
          {!part2 || !motion ? (
            <div className="part part--1">
              <div className="ctl-row">
                <Segmented label="Protocol" value={protocol} compact options={PROTOS} onChange={(v) => fine.set({ protocol: v })} />
              </div>
              <p className="readout plate readout__row tnum">
                {protocol === "point" ? (flagged !== null && counted !== null && m153 ? `${flagged} SECONDS FLAGGED · ${flagged} COUNTED AS CAUGHT · THE OTHER ${m153.positives - flagged} LABELLED SECONDS ARE MISSES`
                  : "RECOMPUTING FROM WINDOW 153")
                  : protocol === "pa" ? (flagged !== null && counted !== null ? `${flagged} SECONDS FLAGGED · ${counted} COUNTED AS CAUGHT` : "RECOMPUTING FROM WINDOW 153")
                  : delay >= 0 ? `CAUGHT · DELAY ${delay} S` : "NOT CAUGHT IN THIS WINDOW"}
              </p>
            </div>
          ) : null}
          {part2 || !motion ? (
            <div className="part part--2">
              <div className="ctl-row">
                <Segmented label="Attribution method" value={method} compact options={[{ value: "pca", label: "PCA" }, { value: "robust_z", label: "ROBUST Z" }]} onChange={(v) => fine.set({ attribution: v })} />
                <Segmented label="Scope" value={scopeKey} compact options={[{ value: "all", label: "ALL 200" }, { value: "test", label: "TEST 67" }]} onChange={(v) => fine.set({ scope: v })} />
                <button type="button" className="btn-square" onClick={() => fine.set({ ...FINE_DEFAULT })}>RESET</button>
              </div>
              {rank ? (
                <p className="ledger-line plate tnum">
                  {`ROOT CHANNEL RANKED FIRST: PCA ${pct0(rank.methods.pca[scopeKey].hit_at_1)} · ROBUST Z ${pct0(rank.methods.robust_z[scopeKey].hit_at_1)} · RANDOM ${pct0(rank.random_baseline.hit_at_1)} (N ${rank.methods.pca[scopeKey].n}) · IN TOP 3: PCA ${pct0(rank.methods.pca[scopeKey].hit_at_3)} · ROBUST Z ${pct0(rank.methods.robust_z[scopeKey].hit_at_3)} · RANDOM ${pct0(rank.random_baseline.hit_at_3)}`}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {figs}

        <div className="sc-bottom">
          {!part2 || !motion ? (
            <div className="part part--1">
              <ul className="pairs" aria-label="Point-wise and point-adjusted F1 per detector, test split">
                {pairs.map((r) => (
                  <li key={r.d} className="pair">
                    <span className="pair__name">{CODE[r.d]}</span>
                    <span className="pair__bars" aria-hidden="true">
                      <i className="bar bar--pt" style={{ width: `${r.point_f1 * 100}%` }} />
                      <i className="bar bar--pa" style={{ width: `${r.point_adjusted_f1 * 100}%` }} />
                    </span>
                    <span className="pair__num tnum">{d2(r.point_f1)} | {d2(r.point_adjusted_f1)} (×{d1(r.inflation)})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {part2 || !motion ? (
            <div className="part part--2">
              {rank ? (
                <ul className="roots" aria-label="First-ranked rate per root channel">
                  {Object.entries(rank.per_root_cause).map(([ch, r]) => (
                    <li key={ch} className="root">
                      <span className="pair__name">{ch.toUpperCase()}</span>
                      <span className="pair__bars" aria-hidden="true"><i className="bar bar--pt" style={{ width: `${r.hit_at_1_pca * 100}%` }} /><i className="bar bar--pa" style={{ width: `${r.hit_at_1_robust_z * 100}%` }} /></span>
                      <span className="pair__num tnum">PCA {pct0(r.hit_at_1_pca)} | RZ {pct0(r.hit_at_1_robust_z)} · N {r.n}{r.hit_at_1_pca < 0.1 ? " · PCA ALMOST NEVER FIRST" : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="sc-aside">
          {!part2 || !motion ? (ev.status === "ready" ? <p className="caveat plate">{ev.data.caveat_point_adjust.toUpperCase()}</p> : null) : null}
          {part2 || !motion ? (rank ? <p className="caveat plate">{rank.wording.toUpperCase()} <span className="dataset-label">ROOT_CAUSE (DATASET LABEL)</span></p> : null) : null}
          <div className="chip-row">
            <HonestyChip tag="DERIVED" detail="F1, RANKINGS" />
            <HonestyChip tag="SYNTHETIC" detail="LABELS" />
          </div>
        </div>
      </div>
    </Track>
  );
}
void (null as unknown as DetId);
