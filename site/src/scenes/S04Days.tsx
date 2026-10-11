import { useEffect, useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { Segmented } from "../components/Segmented";
import { HonestyChip } from "../components/HonestyChip";
import { SceneErrors, type Needed } from "../components/StateUI";
import { LensFigure } from "../components/LensFigure";
import { Sheet } from "../components/Sheet";
import { LensHit } from "../components/LensHit";
import { Tooltip } from "../components/Tooltip";
import { useArtifact } from "../data/useArtifact";
import { ALERTS, CHANNELS, EVAL, FACTS, INCIDENTS, META, OVERVIEW, windowSpec } from "../data/artifacts";
import { DETECTORS, OPS, type DetId, type OpId } from "../data/types";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { jumpTo } from "../scroll/engine";
import { days, replay, REPLAY_DEFAULT } from "../state/scenes";
import { decodeWindow } from "./windows";
import { box, lens } from "./geometry";
import { BIN, composeDays, daysGeometry, opAtDays, DAYS_TOTAL } from "./days";
import { CODE } from "./detectors";
import { overview, incident } from "./data";
import { useStage } from "./useStage";
import { invalidate } from "./bus";
import { fv } from "../data/copy";
import { cap, d2, n0, words } from "../model/format";
import { clamp } from "../lib/math";
import type { Ctx } from "./ctx";

const OP_LABEL: Record<OpId, string> = { best_point_f1: "BEST POINT F1", best_event_f1: "BEST EVENT F1", far_budget_1_per_day: "1 FALSE ALERT A DAY" };
const DAY_BINS = 144;

export function S04Days({ def }: { def: SceneDef }) {
  const [win, rWin] = useArtifact(windowSpec("142"));
  const [chs, rCh] = useArtifact(CHANNELS);
  const [ev, rEv] = useArtifact(EVAL);
  const [facts, rFacts] = useArtifact(FACTS);
  const [meta, rMeta] = useArtifact(META);
  const [ov, rOv] = useArtifact(OVERVIEW);
  const [inc, rInc] = useArtifact(INCIDENTS);
  const [al, rAl] = useArtifact(ALERTS);
  const st = days.use();
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const [p, setP] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const data = useMemo(() => (win.status === "ready" && chs.status === "ready" ? decodeWindow(win.data, chs.data) : null), [win, chs]);
  const prevOp = useRef<OpId | null>(null);
  useProgress(def.id, (q) => {
    setP((o) => (Math.abs(o - q) > 0.002 ? q : o));
    const o = opAtDays(q);
    if (o !== prevOp.current) { prevOp.current = o; if (days.get().op !== null) days.set({ op: null }); }
  });
  useEffect(() => { invalidate(); }, [st.det, st.op, st.all58, st.focusBin]);
  useEffect(() => { if (active !== def.id) { setTableOpen(false); setSheet(false); } }, [active, def.id]);

  const op: OpId | null = st.op ?? (motion ? opAtDays(p) : "best_event_f1");
  const ctx: Ctx = { cls: stage.cls, w: stage.w, h: stage.h, now: 0, p, motion };
  const ovd = overview();
  const geom = data ? daysGeometry(ctx, data, st.all58).end : null;
  const L4 = box(stage.cls, "L4", stage.w, stage.h);
  const e = ev.status === "ready" && op ? ev.data.detectors[st.det].points[op] : null;
  const focusBin = st.focusBin ?? (data ? Math.floor((data.row0 + data.n / 2) / BIN) : 0);

  const needed: Needed[] = [
    { file: "window_142.json", state: win, retry: rWin }, { file: "channels.json", state: chs, retry: rCh },
    { file: "detector_eval.json", state: ev, retry: rEv }, { file: "facts.json", state: facts, retry: rFacts }, { file: "meta.json", state: meta, retry: rMeta },
    { file: "overview.json", state: ov, retry: rOv }, { file: "incidents.json", state: inc, retry: rInc }, { file: "alerts.json", state: al, retry: rAl },
  ];

  const onHit = (ev2: React.PointerEvent<HTMLDivElement>) => {
    if (!geom || !ovd || ev2.pointerType === "touch") return;
    const rect = ev2.currentTarget.getBoundingClientRect();
    const px = ev2.clientX;
    const t = (px - geom.x0) / geom.pxPerS;
    let best: { id: number; d: number } | null = null;
    for (const tk of ovd.ticks) {
      const d = Math.abs(geom.x0 + (tk.bin * BIN + BIN / 2) * geom.pxPerS - px);
      if (d < 8 && (!best || d < best.d)) best = { id: tk.id, d };
    }
    void t; void rect;
    if (!best) { setTip(null); return; }
    const i = incident(best.id);
    if (!i) return;
    const det = op ? i.detection_by_op[op][st.det] : null;
    setTip({ x: ev2.clientX, y: ev2.clientY, text: `INCIDENT ${i.id} · CATEGORY ${i.category} · ${i.split.toUpperCase().replace("_", " ")} · ${i.duration_s} S · ${det ? (det.detected ? `CAUGHT AFTER ${det.delay_s} S` : "MISSED") : "LABELLED SPAN"}` });
  };
  const dragFocus = (dx: number, start: number) => {
    if (!geom) return;
    const dBins = (dx / geom.pxPerS) / BIN;
    days.set({ focusBin: clamp(Math.round(start + dBins), 0, (ovd?.bins ?? 8334) - 1) });
  };
  const keyFocus = (k: React.KeyboardEvent) => {
    if (k.key !== "ArrowLeft" && k.key !== "ArrowRight") return;
    k.preventDefault();
    days.set({ focusBin: clamp(focusBin + (k.key === "ArrowRight" ? DAY_BINS : -DAY_BINS), 0, (ovd?.bins ?? 8334) - 1) });
  };
  const rows = useMemo(() => {
    if (!ovd || !op) return [];
    return ovd.ticks.flatMap((t) => {
      const i = incident(t.id);
      if (!i || i.split !== "test") return [];
      return [{ id: i.id, category: i.category, dur: i.duration_s, det: i.detection_by_op[op][st.det], hasWindow: !!i.window }];
    });
  }, [ovd, op, st.det, inc]);
  const openReplay = (id: number) => {
    replay.set({ ...REPLAY_DEFAULT, incidentId: id, det: st.det, op: op ?? "best_event_f1", touched: true });
    jumpTo("replay", 0, { push: true, focus: true });
  };

  const nDays = facts.status === "ready" ? Math.round(fv(facts.data, "days")) : 58;
  const nInc = facts.status === "ready" ? fv(facts.data, "incidents") : 200;
  const nTest = facts.status === "ready" ? fv(facts.data, "split.test.segments") : 67;
  const controls = (
    <>
      <div className="tabs" role="tablist" aria-label="Detector">
        {DETECTORS.map((d: DetId) => (
          <button key={d} type="button" role="tab" aria-selected={d === st.det} tabIndex={d === st.det ? 0 : -1} className={`tab ${d === st.det ? "is-on" : ""}`}
            onClick={() => days.set({ det: d })}
            onKeyDown={(k) => { const i = DETECTORS.indexOf(d); if (k.key === "ArrowRight") { k.preventDefault(); days.set({ det: DETECTORS[(i + 1) % 5]! }); } if (k.key === "ArrowLeft") { k.preventDefault(); days.set({ det: DETECTORS[(i + 4) % 5]! }); } }}>
            {CODE[d]}{d === "gbm" ? <i className="tab__dot" aria-label="predicted" /> : null}
          </button>
        ))}
      </div>
      <Segmented label="Operating point" value={op} compact options={OPS.map((o) => ({ value: o, label: OP_LABEL[o] }))} onChange={(v) => days.set({ op: v })} />
      <div className="ctl-row">
        {stage.cls === "M" ? <button type="button" className="btn-square" aria-pressed={st.all58} onClick={() => days.set({ all58: !st.all58 })}>{st.all58 ? `SHOWING ALL ${nDays} DAYS` : `SHOW ALL ${nDays} DAYS`}</button> : null}
        <button type="button" className="btn-square" onClick={() => days.set({ det: "pca", op: null, all58: false, focusBin: null })}>RESET</button>
        <details className="table-details" open={tableOpen} onToggle={(k) => setTableOpen((k.target as HTMLDetailsElement).open)}>
          <summary className="btn-square">→ DATA TABLE: {nTest} TEST INCIDENTS</summary>
          <div className="table-panel plate">
            <table>
              <thead><tr><th>ID</th><th>CAT</th><th>S</th><th>CAUGHT</th><th>DELAY S</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td><td>{r.category}</td><td>{r.dur}</td><td>{r.det.detected ? "YES" : "NO"}</td><td>{r.det.delay_s ?? "-"}</td>
                    <td>{r.hasWindow ? <button type="button" className="btn-square" onClick={() => openReplay(r.id)}>REPLAY</button> : null}</td>
                  </tr>
                ))}
                {!rows.length ? <tr><td colSpan={6}>CHOOSE AN OPERATING POINT TO SCORE THE TEST INCIDENTS.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </>
  );
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-days">
      {motion && data && geom ? (
        <>
          <div data-hit className="tick-hit" style={{ left: geom.left, width: geom.right - geom.left, top: geom.rowTick - 10, height: 42 }}
            onPointerMove={onHit} onPointerLeave={() => setTip(null)} />
          <LensHit cx={L4.cx} cy={L4.cy} R={L4.R} label="Day under the lens" valueText={`day ${Math.floor(focusBin / DAY_BINS) + 1} of ${nDays}`} min={0} max={(ovd?.bins ?? 8334) - 1} now={focusBin} onDrag={dragFocus} onKey={keyFocus} />
        </>
      ) : null}
      <div className="sc sc--days">
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top sc-top--split">
          <div className="sc-top__l">
            <p className="scene-kicker">58 DAYS · THE WHOLE RECORD</p>
            <h2 id="days-title" tabIndex={-1} data-scene-heading className="sc-title serif">{cap(words(nDays))} days. {cap(words(nInc))} faults.</h2>
            <p className="ledger-line tnum plate">
              {e
                ? `VAL: ${d2(e.val.event.false_alerts_per_day)} / DAY · TEST: ${d2(e.test.event.false_alerts_per_day)} / DAY · CAUGHT ${e.test.event.detected} OF ${nTest} (TEST) · MEDIAN DELAY ${e.test.event.delay_median_s === null ? "NONE" : `${n0(e.test.event.delay_median_s)} S`}`
                : `LABELLED SPANS ONLY · ${nInc} FAULTS · NO DETECTOR SCORED YET`}
              {op === "best_point_f1" && al.status === "ready" && !al.data.operating_points_included.includes("best_point_f1") ? " · FALSE ALERTS HERE ARE 10-MINUTE BINS WITH ANY SECOND ABOVE THE LINE" : ""}
            </p>
          </div>
          <div className="sc-top__r ctl-col">
            {stage.cls === "M" ? (
              <button type="button" className="btn-square" aria-expanded={sheet} aria-controls="days-sheet" onClick={() => setSheet(true)}>CONTROLS</button>
            ) : controls}
            <div className="chip-row">
              <HonestyChip tag="DERIVED" detail="SCORES, ALERTS" />
              <HonestyChip tag="SYNTHETIC" detail="LABELS" />
            </div>
          </div>
        </div>

        {!motion && data && ovd ? (
          <div className="figs figs--col">
            {[0, 0.47, 1].map((u, i) => (
              <LensFigure key={i} label={["Window, seconds", "One day", "The whole record"][i]!} className="lens-fig--flow" deps={[data, st.det, op, st.all58, stage.w]}
                tag={<b>{["WINDOW 142 · SECONDS", "ONE DAY · MAX PER 10 MINUTES", `${nDays} DAYS · MAX PER 10 MINUTES`][i]}</b>}
                build={(w, h) => composeDays({ cls: stage.cls, w, h, now: 0, p: 0, motion: false }, { win: data, ov: ovd, det: st.det, op: u === 1 ? op : null, u, bandsT: u === 1 ? 1 : 0, ticksT: u === 1 ? 1 : 0, all58: true, focusBin: st.focusBin })} />
            ))}
          </div>
        ) : null}

        <div className="sc-bottom">
          <p className="note-line plate">CAUGHT = AT LEAST ONE FLAGGED SECOND INSIDE THE LABELLED SPAN · FALSE ALERT = OVERLAPS NO SPAN (+{meta.status === "ready" ? meta.data.metric_params.tol_after_s : 60} S)</p>

        </div>
      </div>
      {stage.cls === "M" ? <Sheet id="days-sheet" open={sheet} onClose={() => setSheet(false)} title="58-DAY CONTROLS"><div className="lab-controls">{controls}</div></Sheet> : null}
      <Tooltip x={tip?.x ?? 0} y={tip?.y ?? 0} visible={!!tip}>{tip?.text}</Tooltip>
    </Track>
  );
}
void lens; void DAYS_TOTAL;
