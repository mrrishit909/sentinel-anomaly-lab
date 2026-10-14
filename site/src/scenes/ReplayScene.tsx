import { useEffect, useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { Segmented } from "../components/Segmented";
import { HonestyChip } from "../components/HonestyChip";
import { Ledger } from "../components/Ledger";
import { Sheet } from "../components/Sheet";
import { ThresholdSlider } from "../components/ThresholdSlider";
import { LensFigure } from "../components/LensFigure";
import { SceneErrors, ErrorLine, LoadingLine, type Needed } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { Footer } from "../components/Footer";
import { ATTRIBUTION, CHANNELS, EVAL, FACTS, INCIDENTS, META, SWEEP, windowSpec } from "../data/artifacts";
import { CONTEXT, DETECTORS, OPS, TELEMETRY, type DetId, type OpId } from "../data/types";
import { useActiveScene, useFrame, useMotion } from "../scroll/hooks";
import { replay, REPLAY_DEFAULT } from "../state/scenes";
import { useSel } from "../state/store";
import { decodeWindow } from "./windows";
import { composeReplay, hasContributions } from "./replayFrame";
import { replayThreshold } from "./compose";
import { CODE } from "./detectors";
import { incident } from "./data";
import { useStage } from "./useStage";
import { evaluate } from "../model/metrics";
import { notches, opAt, splitRow } from "../model/sweep";
import { splitCells, windowCells } from "../model/ledgers";
import { splitCaption, windowCaption } from "../model/scope";
import { qToScore } from "../model/quant";
import { d1, d2, n0 } from "../model/format";
import { clamp } from "../lib/math";
import { useLastGood } from "../lib/useLastGood";

const OP_NAME: Record<OpId, string> = { best_point_f1: "BEST POINT F1", best_event_f1: "BEST EVENT F1", far_budget_1_per_day: "1 FALSE ALERT A DAY" };
const OP_SHORT: Record<OpId, string> = { best_point_f1: "PT", best_event_f1: "EV", far_budget_1_per_day: "1/D" };
const SPEEDS = [1, 10, 60] as const;
const TRUNC_DUR = 3300;

export function Replay({ def }: { def: SceneDef }) {
  const incidentId = useSel(replay, (s) => s.incidentId);
  const det = useSel(replay, (s) => s.det);
  const op = useSel(replay, (s) => s.op);
  const index = useSel(replay, (s) => s.index);
  const playing = useSel(replay, (s) => s.playing);
  const speed = useSel(replay, (s) => s.speed);
  const context = useSel(replay, (s) => s.context);
  const attribution = useSel(replay, (s) => s.attribution);
  const inspected = useSel(replay, (s) => s.inspected);
  const [sw, rSw] = useArtifact(SWEEP);
  const [ev, rEv] = useArtifact(EVAL);
  const [meta, rMeta] = useArtifact(META);
  const [chs, rCh] = useArtifact(CHANNELS);
  const [inc, rInc] = useArtifact(INCIDENTS);
  const [facts] = useArtifact(FACTS);
  const [at] = useArtifact(ATTRIBUTION);
  const [win, rWin] = useArtifact(windowSpec(String(incidentId)));
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const [sheet, setSheet] = useState(false);
  const [resetOk, setResetOk] = useState(false);

  const data = useMemo(() => (win.status === "ready" && chs.status === "ready" ? decodeWindow(win.data, chs.data) : null), [win, chs]);
  const w = useLastGood(data);
  const incRow = incident(incidentId);
  const nCat = facts.status === "ready" ? Number(facts.data.values.categories?.value) : 13;

  if (active !== def.id && sheet) setSheet(false);
  useEffect(() => { if (active !== def.id) replay.set({ inspected: null, playing: false }); }, [active, def.id]);
  // playback: the one rAF loop, dt-driven (never setInterval), capped so a stall never jumps the playhead
  useFrame((_now, dt) => {
    const s = replay.get();
    if (!s.playing || !w) return;
    const next = s.playhead + (Math.min(dt, 250) / 1000) * s.speed;
    if (next >= w.n - 1) replay.set({ playhead: w.n - 1, playing: false });
    else replay.set({ playhead: next });
  }, 105);

  const tl = sw.status === "ready" ? sw.data.detectors[det].thresholds_q : null;
  const nt = sw.status === "ready" && ev.status === "ready" ? notches(sw.data, ev.data, det) : null;
  const idx = tl && nt ? (index !== null ? clamp(index, 0, tl.length - 1) : nt[op]) : 0;
  const thrQ = tl ? tl[idx]! : replayThreshold(det, op, index);
  const curOp = nt ? opAt(nt, idx) : null;
  const winM = w && w.scores[det] ? evaluate(w.scores[det]!, w.labels, thrQ) : null;
  const splitRowV = sw.status === "ready" ? splitRow(sw.data, det, "test", idx) : null;
  const contributes = hasContributions(det);
  const trunc = (i: number) => { const r = incident(i); return r ? r.duration_s > TRUNC_DUR : false; };

  const setDet = (d: DetId) => {
    // a detector change keeps the operating point (the nearest notch), not the index: indices differ per detector
    const keep: OpId = curOp ?? op;
    replay.set({ det: d, op: keep, index: null, attribution: hasContributions(d) ? (d as "pca" | "robust_z") : "off", touched: true });
  };
  const needed: Needed[] = [
    { file: "threshold_sweep.json", state: sw, retry: rSw }, { file: "detector_eval.json", state: ev, retry: rEv }, { file: "meta.json", state: meta, retry: rMeta },
    { file: "channels.json", state: chs, retry: rCh }, { file: "incidents.json", state: inc, retry: rInc }, { file: `window_${incidentId}.json`, state: win, retry: rWin },
  ];
  const reset = () => {
    replay.set({ ...REPLAY_DEFAULT, touched: true });
    setResetOk(true);
    window.setTimeout(() => setResetOk(false), 1200);
  };
  const info = chs.status === "ready" && inspected ? chs.data.channels.find((c) => c.id === inspected) : null;

  const rail = (
    <div className="rail">
      <fieldset className="rail__group">
        <legend>INCIDENT</legend>
        <ul className="inc-list" aria-label="Incident window">
          {meta.status === "ready" ? meta.data.windows.map((m) => {
            const r = incident(m.incident_id);
            const on = m.incident_id === incidentId;
            return (
              <li key={m.id}>
                <button type="button" aria-pressed={on} className={`inc-item ${on ? "is-on" : ""}`} onClick={() => replay.set({ incidentId: m.incident_id, playhead: 0, playing: false, inspected: null, touched: true })}>
                  {`${m.id} · CAT ${m.category}${r ? ` · ${n0(r.duration_s)} S` : ""}`}{trunc(m.incident_id) ? <span className="badge">TRUNCATED</span> : null}
                </button>
              </li>
            );
          }) : <li className="state-line">LOADING META.JSON</li>}
        </ul>
        <p className="rail__note">{facts.status === "ready" ? `${fvN(facts.data.values.categories_with_window?.value)} OF ${nCat} FAULT CATEGORIES HAVE A PUBLISHED WINDOW. NUMBERS HERE COVER THIS WINDOW ONLY. SEE LIMITATIONS.` : ""}</p>
      </fieldset>
      <fieldset className="rail__group">
        <legend>DETECTOR</legend>
        <div className="tabs" role="tablist" aria-label="Detector">
          {DETECTORS.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={d === det} tabIndex={d === det ? 0 : -1} className={`tab ${d === det ? "is-on" : ""}`} onClick={() => setDet(d)}
              onKeyDown={(k) => { const i = DETECTORS.indexOf(d); if (k.key === "ArrowRight") { k.preventDefault(); setDet(DETECTORS[(i + 1) % 5]!); } if (k.key === "ArrowLeft") { k.preventDefault(); setDet(DETECTORS[(i + 4) % 5]!); } }}>
              {CODE[d]}{d === "gbm" ? <i className="tab__dot" aria-label="predicted" /> : null}
            </button>
          ))}
        </div>
        {det === "gbm" ? <HonestyChip tag="PREDICTED" detail="TRAINED ON LABELLED INCIDENTS" /> : null}
      </fieldset>
      <fieldset className="rail__group">
        <legend>THRESHOLD</legend>
        {tl && nt ? (
          <>
            <ThresholdSlider steps={tl.length} index={idx} notches={OPS.map((o) => ({ index: nt[o], text: OP_SHORT[o] }))}
              valueText={`q ${tl[idx]}, ${curOp ? `${OP_NAME[curOp].toLowerCase()} on val, ` : ""}step ${idx + 1} of ${tl.length}`}
              onChange={(i) => replay.set({ index: i, touched: true })} />
            <p className="slider-read tnum">{`q ${tl[idx]} · SCORE ${meta.status === "ready" ? d2(qToScore(tl[idx]!, meta.data.detectors[det].quant)) : "…"} · STEP ${idx + 1} OF ${tl.length}${curOp ? ` · ${OP_NAME[curOp]}, CHOSEN ON VAL` : ""}`}</p>
          </>
        ) : null}
      </fieldset>
      <fieldset className="rail__group">
        <legend>SIGNALS</legend>
        <button type="button" className="btn-square" aria-pressed={context} onClick={() => replay.set({ context: !context })}>CONTEXT: {context ? "ON" : "OFF"}</button>
        <Segmented label="Attribution" value={attribution} compact
          options={[
            { value: "pca", label: "PCA", disabled: det !== "pca", reason: contributes ? "LIT CHANNELS COME FROM THE SELECTED DETECTOR'S OWN RANKING" : "THIS DETECTOR DOES NOT RANK MEASUREMENTS" },
            { value: "robust_z", label: "ROBUST Z", disabled: det !== "robust_z", reason: contributes ? "LIT CHANNELS COME FROM THE SELECTED DETECTOR'S OWN RANKING" : "THIS DETECTOR DOES NOT RANK MEASUREMENTS" },
            { value: "off", label: "OFF" },
          ]}
          onChange={(v) => replay.set({ attribution: v })} />
        <label className="sel">
          <span className="sel__label">INSPECT</span>
          <select value={inspected ?? ""} onChange={(e) => replay.set({ inspected: e.target.value || null })} aria-label="Inspect a channel">
            <option value="">NONE</option>
            {[...TELEMETRY, ...(context ? CONTEXT : [])].map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </label>
        <button type="button" className="btn-square" onClick={reset} aria-live="polite">{resetOk ? "RESET ✓" : "RESET"}</button>
      </fieldset>
    </div>
  );

  const inspector = info && w ? (
    <aside className="inspector" role="dialog" aria-label={`Channel ${info.id}`}>
      <header><span className="inspector__id">{info.id.toUpperCase()}</span><HonestyChip tag="SYNTHETIC" detail={info.group.toUpperCase()} />
        <button type="button" className="btn-square inspector__close" onClick={() => replay.set({ inspected: null })}>CLOSE</button></header>
      <PlayheadValues w={w} id={info.id} mean={info.train_mean} sd={info.train_std} scale={info.resid_scale} />
      {info.group === "telemetry" && incRow ? (
        <ul className="inspector__rank">
          {(["pca", "robust_z"] as const).map((m) => {
            const r = incRow.attribution[m].top3.indexOf(info.id);
            return <li key={m}>{m === "pca" ? "PCA" : "ROBUST Z"} RANK: {r >= 0 ? `${r + 1} OF TOP 3` : "NOT IN TOP 3"} (RANK FOR THE WHOLE INCIDENT)</li>;
          })}
        </ul>
      ) : <p className="inspector__rank">{info.group === "context" ? "CONTEXT: COMMAND OR STIMULUS, ROLE NOT ASSIGNED" : ""}</p>}
      <p className="inspector__fine">CONTRIBUTING, NOT CAUSE</p>
    </aside>
  ) : null;

  const statusLine = w && incRow
    ? `INCIDENT ${incRow.id} · CATEGORY ${incRow.category} OF ${nCat} · ${incRow.split.toUpperCase().replace("_", " ")} · ${n0(incRow.duration_s)} S · ROOT_CAUSE (DATASET LABEL) ${incRow.root_cause.toUpperCase()} · AFFECTED ${incRow.affected.join(", ").toUpperCase()} · SYNTHETIC`
    : `INCIDENT ${incidentId}`;
  const emptyWin = winM && winM.flagged === 0;

  return (
    <Track id={def.id} height={def.track} landing={def.landing} label="Incident replay" className="scene scene-replay">
      <div className="rp">
        <SceneErrors active={active === def.id} items={needed} />
        <header className="rp-head">
          <p className="scene-kicker">INCIDENT REPLAY</p>
          <h2 id="replay-title" tabIndex={-1} data-scene-heading className="sc-title serif">Replay a fault. Choose who is watching.</h2>
          <p className="status-line plate tnum">{statusLine}</p>
          {w?.truncated ? <p className="status-line plate">{`SEGMENT CONTINUES BEYOND THIS WINDOW (${n0(incRow?.duration_s ?? 0)} S IN TOTAL)`}</p> : null}
        </header>
        <div className="rp-main">
          <div className="rp-figwrap">
            {win.status === "error" && !w ? <ErrorLine file={`window_${incidentId}.json`} reason={win.reason} attempt={win.attempt} onRetry={rWin} /> : null}
            {win.status === "loading" ? <LoadingLine file={`window_${incidentId}.json`} loaded={win.loaded} total={win.total} /> : null}
            <LensFigure className="rp-fig" label="Incident replay lens" animate={false} watch={replay} deps={[w, det, idx, context, attribution, inspected, speed, stage.w, incRow, playing]}
              tag={<><HonestyChip tag={det === "gbm" ? "PREDICTED" : "DERIVED"} detail="SCORES" /> <HonestyChip tag="SYNTHETIC" detail="TELEMETRY AND LABELS" /></>}
              build={(wd, hd) => (w ? composeReplay({ cls: stage.cls, w: wd, h: hd, now: performance.now(), p: 0, motion: false }, { win: w, thrQ, det, inc: incRow, st: replay.get() }) : null)} />
            <FigureHit w={w} cls={stage.cls} />
            {emptyWin ? <p className="note-line plate rp-empty">NO SECOND IN THIS WINDOW REACHES THE LINE</p> : null}
          </div>
          <PlayBar n={w?.n ?? 0} motion={motion} />
        </div>
        <aside className="rp-rail glass">
          {stage.cls === "M" ? <button type="button" className="btn-square" aria-expanded={sheet} aria-controls="rp-sheet" onClick={() => setSheet(true)}>CONTROLS</button> : rail}
        </aside>
        <div className="rp-ledgers">
          {winM && w ? <Ledger caption={windowCaption(w.n)} scope="WINDOW" cells={windowCells(winM, w.truncated)} className="ledger--win" /> : <p className="state-line state-line--loading" role="status">{win.status === "error" ? "WINDOW UNAVAILABLE" : `LOADING WINDOW_${incidentId}`}</p>}
          {splitRowV && sw.status === "ready" ? (
            <Ledger caption={`SAME DETECTOR AND THRESHOLD ON THE WHOLE TEST SPLIT: ${splitCaption("test", d1(splitRowV.days), splitRowV.segments)}`} scope="SPLIT" cells={splitCells(splitRowV)} className="ledger--split" />
          ) : null}
        </div>
        {!contributes ? <p className="note-line plate rp-note">THIS DETECTOR DOES NOT RANK MEASUREMENTS: ITS ALERT SHOWS AS A WHITE BAR ACROSS THE LENS TOP, NO CHANNEL LIGHTS.</p> : at.status === "ready" ? <p className="note-line plate rp-note">LIT: TOP 3 CONTRIBUTING MEASUREMENTS FOR THE WHOLE INCIDENT, NOT CAUSES.</p> : null}
        {inspector}
        <Footer introPlaying={false} inline />
      </div>
      {stage.cls === "M" ? <Sheet id="rp-sheet" open={sheet} onClose={() => setSheet(false)} title="REPLAY CONTROLS">{rail}</Sheet> : null}
    </Track>
  );
}

const fvN = (v: unknown) => (typeof v === "number" ? String(v) : "…");

function PlayheadValues({ w, id, mean, sd, scale }: { w: NonNullable<ReturnType<typeof decodeWindow>>; id: string; mean: number; sd: number; scale: number | null }) {
  const ph = useSel(replay, (s) => Math.floor(s.playhead));
  const i = Math.min(w.n - 1, ph);
  const z = (w.z[id]?.[i] ?? 0) + (w.base[id] ?? 0);
  const zr = w.zres[id]?.[i];
  void mean; void sd; void scale;
  return (
    <p className="inspector__vals tnum">
      {`SECOND ${i} · ${z >= 0 ? "+" : "−"}${d1(Math.abs(z))} SD FROM ITS TRAIN MEAN${zr !== undefined ? ` · ${d1(zr)} ROBUST UNITS FROM EXPECTED` : ""}`}
    </p>
  );
}

/** Pointer overlay for strand inspection (hover raises, click opens the inspector). It never intercepts vertical scroll on touch. */
function FigureHit({ w, cls }: { w: ReturnType<typeof decodeWindow> | null; cls: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !w) return null;
    const ids: string[] = [...TELEMETRY, ...(replay.get().context ? CONTEXT : [])];
    const top = r.height * (cls === "M" ? 0.085 : 0.107), bot = r.height * (cls === "M" ? 0.9 : 0.893);
    const gap = (bot - top) / Math.max(1, ids.length - 1);
    const k = Math.round((e.clientY - r.top - top) / gap);
    return k >= 0 && k < ids.length ? ids[k]! : null;
  };
  return (
    <div ref={ref} data-hit className="fig-hit" onClick={(e) => { const c = pick(e); if (c) replay.set({ inspected: c, touched: true }); }} aria-hidden="true" />
  );
}

function PlayBar({ n, motion }: { n: number; motion: boolean }) {
  const playing = useSel(replay, (s) => s.playing);
  const speed = useSel(replay, (s) => s.speed);
  const ph = useSel(replay, (s) => Math.floor(s.playhead));
  return (
    <div className="playbar plate">
      <button type="button" className="btn-square playbar__play" aria-pressed={playing} disabled={!motion || n === 0} title={!motion ? "MOTION IS OFF: SCRUB ONLY" : undefined}
        onClick={() => replay.set({ playing: !playing, playhead: replay.get().playhead >= n - 1 ? 0 : replay.get().playhead, touched: true })}>
        {playing ? "PAUSE" : "PLAY"}
      </button>
      <input type="range" className="playbar__scrub" min={0} max={Math.max(1, n - 1)} step={1} value={ph} aria-label="Playhead second" aria-valuetext={`second ${ph} of ${n}`}
        onChange={(e) => replay.set({ playhead: Number(e.target.value), touched: true })}
        onKeyDown={(e) => { if (e.key === " ") { e.preventDefault(); if (motion) replay.set({ playing: !playing }); } }} />
      <Segmented label="Speed" value={speed} compact options={SPEEDS.map((s) => ({ value: s, label: `×${s}` }))} onChange={(v) => replay.set({ speed: v })} />
      <span className="playbar__label tnum">{`REPLAY OF SIMULATED DATA · ×${speed} · ${ph} / ${n} S`}</span>
    </div>
  );
}
