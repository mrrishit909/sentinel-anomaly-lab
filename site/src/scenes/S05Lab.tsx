import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { Segmented } from "../components/Segmented";
import { HonestyChip } from "../components/HonestyChip";
import { Ledger } from "../components/Ledger";
import { Sheet } from "../components/Sheet";
import { ThresholdSlider } from "../components/ThresholdSlider";
import { SceneErrors, type Needed } from "../components/StateUI";
import { LensFigure } from "../components/LensFigure";
import { useArtifact } from "../data/useArtifact";
import { CHANNELS, EVAL, INCIDENTS, META, OVERVIEW, SWEEP, windowSpec } from "../data/artifacts";
import { DETECTORS, type DetId } from "../data/types";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { lab, LAB_DEFAULT } from "../state/scenes";
import { decodeWindow } from "./windows";
import { useLastGood } from "../lib/useLastGood";
import { composeLab, labHairline } from "./lab";
import { labIndex } from "./compose";
import { CODE } from "./detectors";
import { incident, overview } from "./data";
import { slots, invalidate } from "./bus";
import { useStage } from "./useStage";
import { evaluate } from "../model/metrics";
import { notches, opAt, splitRow } from "../model/sweep";
import { splitCells, windowCells } from "../model/ledgers";
import { splitCaption, windowCaption } from "../model/scope";
import { qToScore } from "../model/quant";
import { d2 } from "../model/format";
import { LAB_TOUR_END } from "./lab";
import type { Ctx } from "./ctx";
import { windowed } from "../motion/progress";

const OP_SHORT = { best_point_f1: "PT", best_event_f1: "EV", far_budget_1_per_day: "1/D" } as const;
const OP_NAME = { best_point_f1: "BEST POINT F1", best_event_f1: "BEST EVENT F1", far_budget_1_per_day: "1 FALSE ALERT A DAY" } as const;

export function S05Lab({ def }: { def: SceneDef }) {
  const st = lab.use();
  const [sw, rSw] = useArtifact(SWEEP);
  const [ev, rEv] = useArtifact(EVAL);
  const [meta, rMeta] = useArtifact(META);
  const [ov, rOv] = useArtifact(OVERVIEW);
  const [chs, rCh] = useArtifact(CHANNELS);
  const [inc, rInc] = useArtifact(INCIDENTS);
  const [win, rWin] = useArtifact(windowSpec(st.windowId));
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const [p, setP] = useState(0);
  const [sheet, setSheet] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  useProgress(def.id, (q) => setP((o) => (Math.abs(o - q) > 0.002 ? q : o)));
  useEffect(() => { invalidate(); }, [st]);
  if (active !== def.id && sheet) setSheet(false);

  const data = useMemo(() => (win.status === "ready" && chs.status === "ready" ? decodeWindow(win.data, chs.data) : null), [win, chs]);
  const w = useLastGood(data);

  // slots: the strip lives in normal flow and the canvas draws into its measured rect
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); slots.strip = { x: r.left, y: r.top, w: r.width, h: r.height }; invalidate(); };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    addEventListener("resize", read);
    return () => { ro.disconnect(); removeEventListener("resize", read); slots.strip = null; };
  }, [motion]);

  const det = st.det;
  const tl = sw.status === "ready" ? sw.data.detectors[det].thresholds_q : null;
  const index = tl ? labIndex(st, p) : 0;
  const nt = sw.status === "ready" && ev.status === "ready" ? notches(sw.data, ev.data, det) : null;
  const op = nt ? opAt(nt, index) : null;
  const row = sw.status === "ready" ? splitRow(sw.data, det, st.split, index) : null;
  const days = row ? row.days : 0;
  const winM = w && tl && w.scores[det] ? evaluate(w.scores[det]!, w.labels, tl[index]!) : null;
  const raw = tl && meta.status === "ready" ? qToScore(tl[index]!, meta.data.detectors[det].quant) : null;
  const ctx: Ctx = { cls: stage.cls, w: stage.w, h: stage.h, now: 0, p, motion };
  const hl = w && tl ? labHairline(ctx, w, det, tl[index]!) : null;
  const touch = () => lab.set({ touched: true });
  const setIndex = (i: number) => lab.set({ index: i, touched: true });
  const tour = motion && p < LAB_TOUR_END && !st.touched && st.index === null;
  const statement2 = !motion || p >= LAB_TOUR_END;

  const needed: Needed[] = [
    { file: "threshold_sweep.json", state: sw, retry: rSw }, { file: "detector_eval.json", state: ev, retry: rEv }, { file: "meta.json", state: meta, retry: rMeta },
    { file: "overview.json", state: ov, retry: rOv }, { file: "channels.json", state: chs, retry: rCh }, { file: "incidents.json", state: inc, retry: rInc },
    { file: `window_${st.windowId}.json`, state: win, retry: rWin },
  ];

  const hairDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hl || !tl || e.buttons === 0) return;
    const q = hl.lo + ((hl.yBase - e.clientY) / hl.amp) * (hl.top - hl.lo);
    let b = 0;
    for (let i = 1; i < tl.length; i++) if (Math.abs(tl[i]! - q) < Math.abs(tl[b]! - q)) b = i; // snaps to the nearest real step on every frame
    if (b !== st.index) setIndex(b);
  };
  const controls = (
    <>
      <div className="tabs" role="tablist" aria-label="Detector">
        {DETECTORS.map((d: DetId) => (
          <button key={d} type="button" role="tab" aria-selected={d === det} tabIndex={d === det ? 0 : -1} className={`tab ${d === det ? "is-on" : ""}`}
            onClick={() => {
              // a detector change keeps the operating point (the nearest notch), not the index: the scales differ per detector
              if (sw.status === "ready" && ev.status === "ready" && nt) {
                const keep = op ?? "best_event_f1";
                const nn = notches(sw.data, ev.data, d);
                lab.set({ det: d, index: nn[keep], touched: true });
              } else lab.set({ det: d, touched: true });
            }}
            onKeyDown={(k) => { const i = DETECTORS.indexOf(d); if (k.key === "ArrowRight") { k.preventDefault(); lab.set({ det: DETECTORS[(i + 1) % 5]!, index: null, touched: true }); } if (k.key === "ArrowLeft") { k.preventDefault(); lab.set({ det: DETECTORS[(i + 4) % 5]!, index: null, touched: true }); } }}>
            {CODE[d]}{d === "gbm" ? <i className="tab__dot" aria-label="predicted" /> : null}
          </button>
        ))}
      </div>
      {tl && nt && raw !== null ? (
        <div className="slider-wrap">
          <ThresholdSlider steps={tl.length} index={index} notches={(["best_point_f1", "best_event_f1", "far_budget_1_per_day"] as const).map((o) => ({ index: nt[o], text: OP_SHORT[o] }))}
            valueText={`q ${tl[index]}, ${op ? `${OP_NAME[op].toLowerCase()} on val, ` : ""}step ${index + 1} of ${tl.length}`} onChange={setIndex} />
          <p className="slider-read tnum">{`q ${tl[index]} · SCORE ${d2(raw)} · STEP ${index + 1} OF ${tl.length}`}{op ? ` · ${OP_NAME[op]}, CHOSEN ON VAL` : ""}</p>
        </div>
      ) : null}
      <div className="ctl-row">
        <Segmented label="Split" value={st.split} compact options={[{ value: "val", label: "VAL" }, { value: "test", label: "TEST" }]} onChange={(v) => lab.set({ split: v, touched: true })} />
        <label className="sel">
          <span className="sel__label">WINDOW</span>
          <select value={st.windowId} onChange={(e) => lab.set({ windowId: e.target.value, touched: true })} aria-label="Incident window">
            {meta.status === "ready" ? meta.data.windows.map((m) => <option key={m.id} value={m.id}>{`${m.id} · CAT ${m.category}`}</option>) : <option value={st.windowId}>{st.windowId}</option>}
          </select>
        </label>
        <button type="button" className="btn-square" onClick={() => lab.set({ ...LAB_DEFAULT })}>RESET</button>
      </div>
    </>
  );

  const splitL = row ? (
    <Ledger caption={splitCaption(st.split, d2(days).replace(/0$/, ""), row.segments)} scope="SPLIT" cells={splitCells(row)}
      note={st.split === "test" ? "TEST IS SHOWN, NEVER USED FOR CHOOSING (METHODOLOGY)" : undefined} className="ledger--split" />
  ) : null;
  const winL = winM && w ? (
    <>
      <Ledger caption={windowCaption(w.n)} scope="WINDOW" cells={windowCells(winM, w.truncated)} className="ledger--win"
        note={w.truncated ? `SEGMENT CONTINUES BEYOND THIS WINDOW (${incident(st.windowId)?.duration_s ?? "…"} S IN TOTAL)` : undefined} />
      {winM.flagged === 0 ? <p className="note-line plate">NO SECOND IN THIS WINDOW REACHES THE LINE</p> : null}
    </>
  ) : win.status === "ready" || win.status === "initial" || win.status === "loading" ? <p className="state-line state-line--loading" role="status">LOADING WINDOW_{st.windowId}</p> : null;

  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-lab">
      {motion && hl ? <div data-hit className="hair-hit" style={{ left: hl.x0, width: hl.x1 - hl.x0, top: hl.y - 22 }} onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); hairDrag(e); }} onPointerMove={hairDrag} aria-hidden="true" /> : null}
      <div className="sc sc--lab">
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top">
          <p className="scene-kicker">THRESHOLD · THE TRADE-OFF</p>
          <h2 id="lab-title" key={statement2 ? "b" : "a"} tabIndex={-1} data-scene-heading className="sc-title serif title-swap">{statement2 ? "Pay for it somewhere." : "Move the line."}</h2>
          {tour ? <p className="note-line plate">GUIDED TOUR: THE LINE WALKS FROM STRICTEST TO LOOSEST, THEN SETTLES ON BEST EVENT F1. TOUCH ANYTHING TO TAKE OVER.</p> : null}
          {stage.cls !== "M" ? <div className="lab-controls">{controls}</div> : null}
          {stage.cls !== "T" ? splitL : null}
        </div>

        {!motion && w && sw.status === "ready" ? (
          <div className="figs figs--1">
            <LensFigure label="Threshold lab lens" className="lens-fig--flow" deps={[w, st, index, stage.w, ov]}
              tag={<><b>{CODE[det]} · q {tl?.[index]}</b> · <HonestyChip tag={det === "gbm" ? "PREDICTED" : "DERIVED"} /></>}
              build={(wd, hd) => composeLab({ cls: stage.cls, w: wd, h: hd, now: 0, p: 1, motion: false }, { win: w, ov: overview(), det, thrQ: tl![index]!, split: st.split })} />
          </div>
        ) : null}

        <div className="sc-bottom">
          <p className="strip-label">{`${st.split.toUpperCase()} SPLIT · ${row ? d2(days) : "..."} DAYS · BINS AT OR ABOVE THE LINE ARE LIT · SPANS: CAUGHT FILLED, MISSED HOLLOW`}</p>
          <div ref={stripRef} className="strip-slot" aria-hidden={motion ? true : undefined}>{!motion && ov.status === "ready" ? <span className="sr-only">strip</span> : null}</div>
          <div className="ledgers">
            {stage.cls === "T" ? splitL : null}
            {stage.cls !== "M" ? winL : null}
          </div>
          <div className="chip-row">
            <HonestyChip tag={det === "gbm" ? "PREDICTED" : "DERIVED"} detail={det === "gbm" ? "TRAINED ON LABELS" : "VAL LINES"} />
            {stage.cls === "M" ? <button type="button" className="btn-square" aria-expanded={sheet} aria-controls="lab-sheet" onClick={() => { touch(); setSheet(true); }}>CONTROLS</button> : null}
          </div>
        </div>
      </div>
      {stage.cls === "M" ? <Sheet id="lab-sheet" open={sheet} onClose={() => setSheet(false)} title="THRESHOLD LAB CONTROLS"><div className="lab-controls">{controls}</div>{winL}</Sheet> : null}
    </Track>
  );
}
void windowed;
