import { useEffect, useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { Segmented } from "../components/Segmented";
import { HonestyChip } from "../components/HonestyChip";
import { SceneErrors, type Needed } from "../components/StateUI";
import { LensFigure } from "../components/LensFigure";
import { LensHit } from "../components/LensHit";
import { useArtifact } from "../data/useArtifact";
import { CHANNELS, EVAL, INCIDENTS, windowSpec } from "../data/artifacts";
import { TELEMETRY } from "../data/types";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { getProgress, seek, trackSpan } from "../scroll/engine";
import { normal, NORMAL_DEFAULT, type View } from "../state/scenes";
import { decodeWindow } from "./windows";
import { box, MT } from "./geometry";
import { composeNormal, focusAt, SPAN_AT, NOTE_AT, stepView } from "./normal";
import { layoutFor } from "./strands";
import { useStage } from "./useStage";
import { invalidate } from "./bus";
import { d1 } from "../model/format";
import { lerp } from "../lib/math";
import { windowed } from "../motion/progress";
import type { Ctx } from "./ctx";

const VIEWS: { value: View; label: string }[] = [{ value: "raw", label: "RAW" }, { value: "expected", label: "EXPECTED" }, { value: "residual", label: "RESIDUAL" }];
const ZOOMS = [1, 3, 10] as const;

export function S03aNormal({ def }: { def: SceneDef }) {
  const [win, rWin] = useArtifact(windowSpec("142"));
  const [chs, rCh] = useArtifact(CHANNELS);
  const [inc, rInc] = useArtifact(INCIDENTS);
  const [ev, rEv] = useArtifact(EVAL);
  const st = normal.use();
  const motion = useMotion();
  const stage = useStage();
  const active = useActiveScene();
  const data = useMemo(() => (win.status === "ready" && chs.status === "ready" ? decodeWindow(win.data, chs.data) : null), [win, chs]);
  const [p, setP] = useState(0);
  const prevStep = useRef<View>("raw");

  useProgress(def.id, (q) => {
    setP((o) => (Math.abs(o - q) > 0.002 ? q : o));
    const s = stepView(q);
    if (s !== prevStep.current) { prevStep.current = s; if (normal.get().view !== null) normal.set({ view: null }); }
  });
  useEffect(() => { invalidate(); }, [st.view, st.zoom, st.channel]);

  const ctx: Ctx = { cls: stage.cls, w: stage.w, h: stage.h, now: 0, p, motion };
  const view: View = st.view ?? stepView(p);
  const f = data ? focusAt(ctx, data, p, st.zoom) : 60;
  const L2 = box(stage.cls, "L2", stage.w, stage.h);
  const noScale = chs.status === "ready" && chs.data.channels.some((c) => c.group === "telemetry" && !c.resid_scale);

  // readout values at the focus second
  const info = chs.status === "ready" ? chs.data.channels.find((c) => c.id === st.channel) : undefined;
  const z = data && st.channel ? data.z[st.channel]![Math.min(data.n - 1, f)]! + (data.base[st.channel] ?? 0) : null;
  const zr = data && st.channel && data.zres[st.channel] ? data.zres[st.channel]![Math.min(data.n - 1, f)]! : null;
  const labelled = data ? data.labels[Math.min(data.n - 1, f)] === 1 : false;

  const needed: Needed[] = [
    { file: "window_142.json", state: win, retry: rWin }, { file: "channels.json", state: chs, retry: rCh },
    { file: "incidents.json", state: inc, retry: rInc }, { file: "detector_eval.json", state: ev, retry: rEv },
  ];
  const reset = () => { normal.set({ ...NORMAL_DEFAULT, view: "raw" }); };
  const lensDrag = (dx: number, start: number) => {
    if (!data) return;
    const L = layoutFor(ctx, data.n, TELEMETRY.length);
    const nf = start - dx / (L.pxPerS * st.zoom);
    const q = 0.04 + ((nf - 60) / Math.max(1, data.n - 120)) * 0.88;
    seek(def.id, q);
  };
  const lensKey = (e: React.KeyboardEvent) => {
    if (!data || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const step = (e.shiftKey ? 60 : 10) * (e.key === "ArrowRight" ? 1 : -1);
    const nf = f + step;
    seek(def.id, 0.04 + ((nf - 60) / Math.max(1, data.n - 120)) * 0.88);
  };
  void trackSpan; void getProgress; void lerp; void windowed; void MT;
  const showSpan = !motion || p >= SPAN_AT;
  const showNote = !motion || p >= NOTE_AT;
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-normal">
      {motion && data ? <LensHit cx={L2.cx} cy={L2.cy} R={L2.R} label="Focus second of the lens" valueText={`second ${f} of ${data.n}`} min={60} max={data.n - 60} now={f} onDrag={lensDrag} onKey={lensKey} /> : null}
      <div className="sc">
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top">
          <p className="scene-kicker">NORMAL · WINDOW 142 · {data ? `${data.n.toLocaleString("en-US")} S` : "LOADING"}</p>
          <h2 id="normal-title" tabIndex={-1} data-scene-heading className="sc-title serif">Normal has a shape.</h2>
          <p className="sc-body">EXPECTED = THE LAST 61 SECONDS' MEDIAN · SCALED BY THE TYPICAL RESIDUAL IN TRAINING (1.4826 × MAD)</p>
          <div className="ctl-row">
            <Segmented label="View" value={view} compact
              options={VIEWS.map((v) => ({ value: v.value, label: v.label, disabled: v.value === "residual" && noScale, reason: "ROBUST SCALE NOT PUBLISHED" }))}
              onChange={(v) => normal.set({ view: v })} />
            <Segmented label="Zoom" value={st.zoom} compact options={ZOOMS.map((z2) => ({ value: z2, label: `×${z2}` }))} onChange={(v) => normal.set({ zoom: v })} />
            <label className="sel">
              <span className="sel__label">CHANNEL</span>
              <select value={st.channel ?? ""} onChange={(e) => normal.set({ channel: e.target.value || null })} aria-label="Channel">
                <option value="">NONE</option>
                {TELEMETRY.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </label>
            <button type="button" className="btn-square" onClick={reset}>RESET</button>
          </div>
        </div>

        {!motion && data ? (
          <div className="figs figs--3">
            {VIEWS.map((v) => (
              <LensFigure key={v.value} label={`Lens, ${v.label} view`} className="lens-fig--flow" deps={[data, st.zoom, st.channel, stage.w]}
                tag={<><b>{v.label}</b> · <HonestyChip tag={v.value === "raw" ? "SYNTHETIC" : "DERIVED"} /></>}
                build={(w, h) => composeNormal({ cls: stage.cls, w, h, now: 0, p: 0, motion: false }, { win: data, view: v.value, zoom: st.zoom, channel: st.channel, f: Math.max(60, data.start + 60), span: true, box: box(stage.cls, "L2", w, h) })} />
            ))}
          </div>
        ) : null}

        <div className="sc-bottom">
          <div className="readout plate" aria-live="off">
            <p className="readout__row tnum">{`SECOND ${f} OF ${data?.n ?? "..."} · LABELLED: ${labelled ? "YES" : "NO"}`}</p>
            <p className="readout__row">
              {st.channel && z !== null && info
                ? `${st.channel.toUpperCase()}: ${z >= 0 ? "+" : "−"}${d1(Math.abs(z))} SD FROM ITS TRAIN MEAN${zr !== null ? ` · ${d1(zr)} ROBUST UNITS FROM EXPECTED` : ""}`
                : "PICK A CHANNEL TO READ ITS LEVEL AGAINST ITS OWN TRAINING SPREAD."}
            </p>
          </div>
          {showNote ? <p className="note-line plate">IN THIS SIMULATION THE SIGNALS CARRY NO SENSOR NOISE. EVERYTHING YOU SEE MOVING IS THE MACHINE'S NORMAL BEHAVIOUR.</p> : null}
          <div className="chip-row">
            <HonestyChip tag="SYNTHETIC" detail="STRANDS, WHITE SPAN" />
            <HonestyChip tag="DERIVED" detail="EXPECTED, RESIDUAL" />
            {showSpan ? null : null}
          </div>
        </div>
      </div>
    </Track>
  );
}
