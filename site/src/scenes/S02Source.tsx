import { useMemo } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { StoryDeck, type DeckCard } from "../components/StoryDeck";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { CHANNELS, FACTS, INCIDENTS, META, OVERVIEW, QUALITY, RECON, windowSpec } from "../data/artifacts";
import { fv } from "../data/copy";
import { decodeWindow } from "./windows";
import { cap, d1, n0, words } from "../model/format";
import { CONTEXT, TELEMETRY } from "../data/types";
import { useMotion } from "../scroll/hooks";
import { useActiveScene } from "../scroll/hooks";
import type { Channels, WindowFile } from "../data/types";

function Strands17({ hero, ch }: { hero: WindowFile; ch: Channels }) {
  const w = useMemo(() => decodeWindow(hero, ch), [hero, ch]);
  const ids = [...TELEMETRY, ...CONTEXT];
  const W = 190, H = 150, row = H / ids.length;
  const step = 6;
  const path = (id: string, k: number) => {
    const z = w.z[id]!;
    const pts: string[] = [];
    const amp = id.startsWith("a") ? row * 0.4 : row * 0.09;
    for (let i = 0; i < z.length; i += step) pts.push(`${((i / z.length) * W).toFixed(1)},${(row * k + row / 2 - Math.max(-6, Math.min(6, z[i]!)) * amp).toFixed(1)}`);
    return pts.join(" ");
  };
  const x = Array.from(w.z.bfo2!, (v, i) => ({ a: v, b: w.z.cso1![i]! }));
  const tpath = x.filter((_, i) => i % 6 === 0).map((p, i) => `${(215 + 40 + Math.max(-14, Math.min(14, p.a)) * 3).toFixed(1)},${(75 - Math.max(-14, Math.min(14, p.b)) * 3).toFixed(1)}#${i}`);
  const cut = Math.floor(w.start / 6);
  const mk = (arr: string[]) => arr.map((s) => s.split("#")[0]).join(" ");
  return (
    <svg viewBox="0 0 310 150" className="mini" role="img" aria-label="Seventeen strands of window 142 and a phase plot of bfo2 against cso1">
      {ids.map((id, k) => (
        <polyline key={id} points={path(id, k)} fill="none" stroke="#fff" strokeOpacity={k < 10 ? 0.75 : 0.35} strokeWidth="1" strokeDasharray={k < 10 ? undefined : "3 3"} />
      ))}
      <polyline points={mk(tpath.slice(0, cut + 1))} fill="none" stroke="#fff" strokeWidth="1" strokeOpacity="0.8" />
      <polyline points={mk(tpath.slice(cut))} fill="none" stroke="#ff4c25" strokeWidth="1.5" />
    </svg>
  );
}

function Ticks200({ inc, ov }: { inc: NonNullable<ReturnType<typeof useArtifact<import("../data/types").IncidentsFile>>[0] & { status: "ready" }>["data"]; ov: import("../data/types").OverviewFile }) {
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const i of inc.incidents) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [inc]);
  const W = 310;
  return (
    <div className="mini-col">
      <svg viewBox={`0 0 ${W} 54`} className="mini" role="img" aria-label="Two hundred injected fault ticks across the record">
        <line x1="0" x2={W} y1="46" y2="46" stroke="#fff" strokeOpacity="0.25" />
        {ov.incident_bins.map(([bin, id]) => <line key={id} x1={(bin / ov.bins) * W} x2={(bin / ov.bins) * W} y1="6" y2="40" stroke="#ff4c25" strokeWidth="1.2" />)}
      </svg>
      <ul className="cat-counts" aria-label="Faults per category">
        {counts.map(([c, n]) => <li key={c}><span>{c}</span>{n}</li>)}
      </ul>
    </div>
  );
}

const ROOMS = ["train", "gbm_fit", "val", "test"] as const;
const ROOM_NAME = { train: "TRAIN", gbm_fit: "GBM FIT", val: "VAL", test: "TEST" };

export function S02Source({ def }: { def: SceneDef }) {
  const [facts, rFacts] = useArtifact(FACTS);
  const [meta, rMeta] = useArtifact(META);
  const [hero, rHero] = useArtifact(windowSpec("142"));
  const [ch, rCh] = useArtifact(CHANNELS);
  const [inc, rInc] = useArtifact(INCIDENTS);
  const [ov, rOv] = useArtifact(OVERVIEW);
  const [q, rQ] = useArtifact(QUALITY);
  const [rec, rRec] = useArtifact(RECON);
  const motion = useMotion();
  void useActiveScene;

  const unavailable = (file: string, st: { status: string; reason?: string; attempt?: number }, retry: () => void) =>
    st.status === "error" ? (
      <div className="state-error" role="alert">
        <p className="state-line state-line--error">UNAVAILABLE: COULD NOT LOAD {file.toUpperCase()} ({st.reason}){(st.attempt ?? 0) > 1 ? ` (ATTEMPT ${st.attempt})` : ""}</p>
        <button type="button" className="btn-square" onClick={retry}>RETRY</button>
      </div>
    ) : <p className="state-line state-line--loading" role="status">LOADING {file.toUpperCase()}</p>;

  const cards: DeckCard[] = [
    {
      variant: "dark", chip: "SOURCE 01 · THE RECORD",
      title: facts.status === "ready" ? "A simulated machine." : "A simulated machine.",
      body: facts.status === "ready" ? (
        <p>{`${fv(facts.data, "channels")} CHANNELS AT ${meta.status === "ready" ? meta.data.dataset.hz : 1} HZ FOR ${d1(fv(facts.data, "days"))} DAYS: ${fv(facts.data, "telemetry_channels")} READINGS, ${fv(facts.data, "channels") - fv(facts.data, "telemetry_channels")} CONTEXT INPUTS. THE AUTHORS CALL IT SYNTHETIC.`}</p>
      ) : unavailable("facts.json", facts, rFacts),
      visual: hero.status === "ready" && ch.status === "ready" ? <Strands17 hero={hero.data} ch={ch.data} /> : hero.status === "error" ? unavailable("window_142.json", hero, rHero) : ch.status === "error" ? unavailable("channels.json", ch, rCh) : <p className="state-line state-line--loading" role="status">LOADING WINDOW_142.JSON</p>,
      tag: <HonestyChip tag="SYNTHETIC" detail="CC BY 4.0" />,
      fine: meta.status === "ready" ? meta.data.attribution.join(" ") : undefined,
    },
    {
      variant: "dark", chip: "SOURCE 02 · THE FAULTS",
      title: facts.status === "ready" ? `${cap(words(fv(facts.data, "incidents")))} injected faults.` : "Injected faults.",
      body: facts.status === "ready" ? (
        <p>{`${d1(fv(facts.data, "contamination_pct"))}% OF SECONDS LABELLED · MEDIAN FAULT ${n0(fv(facts.data, "median_incident_duration_s"))} S · CATEGORIES UNNAMED IN THE DATASET. EACH HAS AN EXACT START, END AND CHANNEL LABEL.`}</p>
      ) : unavailable("facts.json", facts, rFacts),
      visual: inc.status === "ready" && ov.status === "ready" ? <Ticks200 inc={inc.data} ov={ov.data} /> : inc.status === "error" ? unavailable("incidents.json", inc, rInc) : ov.status === "error" ? unavailable("overview.json", ov, rOv) : <p className="state-line state-line--loading" role="status">LOADING INCIDENTS.JSON</p>,
      tag: <HonestyChip tag="SYNTHETIC" detail="LABELS" />,
    },
    {
      variant: "blue", chip: "SOURCE 03 · THE ROOMS",
      title: "Four rooms, one direction.",
      body: <p>DETECTORS LEARN NORMAL FIRST. THRESHOLDS ARE CHOSEN ON VAL. TEST IS ONLY EVER REPORTED, NEVER TUNED.</p>,
      visual: meta.status === "ready" ? (
        <div className="rooms">
          {ROOMS.map((r) => (
            <div key={r} className="room" style={{ flexGrow: meta.data.splits[r].days }}>
              <span className="room__bar" />
              <span className="room__name">{ROOM_NAME[r]}</span>
              <span className="room__n">{d1(meta.data.splits[r].days)} D · {meta.data.splits[r].segments} FAULTS</span>
              {r === "val" ? <span className="room__note">CHOSEN HERE</span> : r === "test" ? <span className="room__note">REPORTED, NEVER TUNED</span> : null}
            </div>
          ))}
        </div>
      ) : unavailable("meta.json", meta, rMeta),
      tag: <HonestyChip tag="DERIVED" detail="SPLITS" onLight={false} />,
    },
    {
      variant: "dark", chip: "SOURCE 04 · THE CHECKS",
      title: "Checked, not trusted.",
      body: facts.status === "ready" ? <p>{`${fv(facts.data, "quality_checks_passed")} OF ${fv(facts.data, "quality_checks_total")} CHECKS PASSED. LABELS REBUILT FROM METADATA MATCH EVERY ROW.`}</p> : unavailable("facts.json", facts, rFacts),
      visual: q.status === "ready" ? (
        <div className="checks" role="img" aria-label={`${q.data.passed} checks passed, ${q.data.failed} failed`}>
          {q.data.checks.map((c) => <span key={c.id} className={`check ${c.passed ? "check--ok" : "check--bad"}`} title={c.description}>{c.passed ? "✓" : "✕"}</span>)}
        </div>
      ) : unavailable("quality.json", q, rQ),
      tag: rec.status === "ready" ? (
        <div className="card-fine">
          <p>{`${rec.data.labels.segments_from_y} SEGMENTS FROM LABELS = ${rec.data.labels.segments_metadata} IN METADATA · ${rec.data.labels.mismatched_rows} MISMATCHED ROWS · END TIME EXCLUSIVE`}</p>
          <p>{`DATA.PARQUET MD5 ${rec.data.files.find((f) => f.name === "data.parquet")?.md5.slice(0, 12) ?? ""}`}{meta.status === "ready" ? ` · PIPELINE V${meta.data.pipeline_version} · GENERATED ${meta.data.generated_at.slice(0, 10)}` : ""}</p>
          <HonestyChip tag="DERIVED" detail="CHECKS" />
        </div>
      ) : unavailable("reconciliation.json", rec, rRec),
    },
  ];
  void ArtifactStatus;
  return (
    <Track id={def.id} height={def.track} landing={def.landing} className="scene scene-record">
      <p className="scene-kicker s02-kicker">SOURCE · A SIMULATED SYSTEM WITH INJECTED FAULTS · NOT REAL INFRASTRUCTURE</p>
      <h2 id="record-title" tabIndex={-1} data-scene-heading className="sr-only">{def.title}</h2>
      <StoryDeck track={def.id} cards={cards} />
      <span hidden>{String(motion)}</span>
    </Track>
  );
}
