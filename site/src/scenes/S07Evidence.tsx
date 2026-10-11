import { useMemo, useRef, useState } from "react";
import { Track } from "../scroll/Track";
import type { SceneDef } from "../app/scenes";
import { HonestyChip } from "../components/HonestyChip";
import { SceneErrors, type Needed } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { ATTRIBUTION, EVAL, FACTS, INCIDENTS, META } from "../data/artifacts";
import { DETECTORS, type Tag } from "../data/types";
import { fv } from "../data/copy";
import { stepState } from "../motion/progress";
import { useActiveScene, useMotion, useProgress } from "../scroll/hooks";
import { d1, d2 } from "../model/format";
import { CODE } from "./detectors";
import { incident } from "./data";

export const EV_STEPS = [0.02, 0.15, 0.28, 0.41, 0.54, 0.67, 0.8];

interface Ex { q: string; a: string; tag: Tag; detail: string; visual: React.ReactNode }

export function S07Evidence({ def }: { def: SceneDef }) {
  const [facts, rF] = useArtifact(FACTS);
  const [meta, rM] = useArtifact(META);
  const [ev, rE] = useArtifact(EVAL);
  const [at, rA] = useArtifact(ATTRIBUTION);
  const [inc, rI] = useArtifact(INCIDENTS);
  const motion = useMotion();
  const active = useActiveScene();
  const [shown, setShown] = useState(0);
  const ref = useRef(0);
  useProgress(def.id, (p) => { const s = stepState(ref.current, p, EV_STEPS); if (s !== ref.current) { ref.current = s; setShown(s); } });

  const unavailable = <p className="state-line">UNAVAILABLE</p>;
  const ex = useMemo((): Ex[] => {
    const out: Ex[] = [];
    const nature = meta.status === "ready" ? meta.data.dataset.nature.toUpperCase() : "";
    out.push({
      q: "IS THIS REAL SERVER DATA?",
      a: meta.status === "ready" ? `NO. ${nature} THE PLANNED SERVER DATASET HAD NO DATASET LICENCE, SO WE DID NOT USE IT.` : "UNAVAILABLE",
      tag: "SYNTHETIC", detail: "SOURCE",
      visual: (
        <ul className="src-rows">
          <li><b>CATS V2 · CC BY 4.0</b><span>USED</span></li>
          <li><b>SMD · NO DATASET LICENCE</b><span>NOT USED</span></li>
        </ul>
      ),
    });
    const pca = ev.status === "ready" ? ev.data.detectors.pca.pr_curve.test : null;
    out.push({
      q: "WHY NOT JUST QUOTE THE BEST F1?",
      a: ev.status === "ready" ? `${ev.data.caveat_point_adjust.toUpperCase()} ISOLATION FOREST: ×${d1(ev.data.detectors.iforest.test_point_f1_vs_point_adjusted.inflation)}.` : "UNAVAILABLE",
      tag: "DERIVED", detail: "PCA PRECISION-RECALL, TEST",
      visual: pca ? (
        <figure className="pr">
          <svg viewBox="0 0 120 80" role="img" aria-label="PCA precision against recall on the test split">
            <polyline fill="none" stroke="#000" strokeWidth="1.5" points={pca.recall.map((r, i) => `${(r * 116 + 2).toFixed(1)},${(78 - pca.precision[i]! * 74).toFixed(1)}`).join(" ")} />
          </svg>
          <figcaption><span>RECALL 0</span><span>1</span></figcaption>
        </figure>
      ) : unavailable,
    });
    out.push({
      q: "DID YOU TUNE ON THE TEST SET?",
      a: "NO. EVERY THRESHOLD WAS CHOSEN ON VAL. SHUFFLING TEST LABELS LEAVES THEM UNCHANGED.",
      tag: "DERIVED", detail: "SPLITS",
      visual: <div className="rooms rooms--mini"><span className="room"><span className="room__bar" /><b>VAL</b> CHOSEN</span><span className="room"><span className="room__bar" /><b>TEST</b> REPORTED</span></div>,
    });
    const rz = ev.status === "ready" ? ev.data.detectors.robust_z.points.far_budget_1_per_day : null;
    out.push({
      q: "WILL ONE FALSE ALERT A DAY HOLD?",
      a: rz ? `NOT EXACTLY. THE ROBUST Z-SCORE'S ONE-A-DAY LINE GAVE ${d2(rz.val.event.false_alerts_per_day)} ON VAL AND ${d2(rz.test.event.false_alerts_per_day)} ON TEST.` : "UNAVAILABLE",
      tag: "DERIVED", detail: "ROBUST Z, 1 A DAY",
      visual: rz ? (
        <div className="hbars">
          {([["VAL", rz.val.event.false_alerts_per_day], ["TEST", rz.test.event.false_alerts_per_day]] as const).map(([n, v]) => (
            <div key={n} className="hbar"><span>{n}</span><i style={{ width: `${Math.min(100, (v / Math.max(rz.val.event.false_alerts_per_day, rz.test.event.false_alerts_per_day, 0.01)) * 100)}%` }} /><b className="tnum">{d2(v)}</b></div>
          ))}
        </div>
      ) : unavailable,
    });
    const top = incident(142)?.attribution.pca.top3;
    out.push({
      q: "SO BFO2 CAUSED IT?",
      a: at.status === "ready" ? at.data.wording.toUpperCase() : "UNAVAILABLE",
      tag: "DERIVED", detail: "PCA RANKING, INCIDENT 142",
      visual: top ? <p className="rank-list tnum">{top.map((c, i) => `${i + 1} ${c.toUpperCase()}`).join(" · ")} · CONTRIBUTING, NOT CAUSE</p> : inc.status === "error" ? unavailable : <p className="state-line">LOADING INCIDENTS.JSON</p>,
    });
    const ci = facts.status === "ready" ? fv(facts.data, "event_recall_ci_halfwidth") : null;
    const rec = ev.status === "ready" ? ev.data.detectors.pca.points.best_event_f1.test.event.recall : null;
    out.push({
      q: ev.status === "ready" && facts.status === "ready" ? `ISN'T ${ev.data.detectors.pca.points.best_event_f1.test.event.detected} OF ${fv(facts.data, "split.test.segments")} PRECISE?` : "ISN'T THE RECALL IMPRECISE?",
      a: ci !== null ? `ABOUT ± ${d2(ci)} WITH ${facts.status === "ready" ? fv(facts.data, "split.test.segments") : ""} INCIDENTS AND ONE RUN. A FEW INCIDENTS' DIFFERENCE IS NOT SIGNIFICANT.` : "UNAVAILABLE",
      tag: "DERIVED", detail: "EVENT RECALL, TEST",
      visual: ci !== null && rec !== null ? (
        <svg viewBox="0 0 160 26" className="ci" role="img" aria-label="Event recall with its interval">
          <line x1="2" x2="158" y1="13" y2="13" stroke="#000" strokeOpacity="0.35" />
          <rect x={Math.max(0, (rec - ci) * 156 + 2)} width={Math.min(156, ci * 2 * 156)} y="7" height="12" fill="#000" fillOpacity="0.28" />
          <rect x={rec * 156 + 1} width="3" y="3" height="20" fill="#000" />
        </svg>
      ) : unavailable,
    });
    const prev = 58900 / 1250000;
    out.push({
      q: "WHY IS ISOLATION FOREST SO WEAK?",
      a: "THESE FAULTS ARE RELATIONS BETWEEN CHANNELS, NOT RARE VALUES. ITS SETTINGS WERE FIXED BEFORE WE LOOKED AT RESULTS.",
      tag: "DERIVED", detail: "AVERAGE PRECISION, TEST",
      visual: ev.status === "ready" ? (
        <div className="hbars">
          {DETECTORS.map((d) => <div key={d} className="hbar"><span>{CODE[d]}</span><i style={{ width: `${ev.data.detectors[d].average_precision.test * 100}%` }} /><b className="tnum">{d2(ev.data.detectors[d].average_precision.test)}</b></div>)}
          <p className="hbar-note">RANDOM = {d2(prev)}</p>
        </div>
      ) : unavailable,
    });
    return out;
  }, [facts, meta, ev, at, inc]);

  const n = motion ? shown : 7;
  const needed: Needed[] = [
    { file: "facts.json", state: facts, retry: rF }, { file: "meta.json", state: meta, retry: rM }, { file: "detector_eval.json", state: ev, retry: rE },
    { file: "attribution.json", state: at, retry: rA }, { file: "incidents.json", state: inc, retry: rI },
  ];
  return (
    <Track id={def.id} height={def.track} landing={def.landing} label="How we know" className="scene scene-evidence">
      <div className="sc sc--evidence">
        <SceneErrors active={active === def.id} items={needed} />
        <div className="sc-top"><p className="scene-kicker">{`EVIDENCE · ${ex.length} OBJECTIONS`}</p><h2 id="evidence-title" tabIndex={-1} data-scene-heading className="sc-title serif">How we know.</h2></div>
        <ol className="ev-stack" aria-label="Seven objections and their answers">
          {ex.slice(0, n).map((e, i) => {
            const cur = i === n - 1;
            return (
              <li key={e.q} className={`ev-ex ${cur ? "is-cur" : "is-old"}`}>
                <article className="ev-q" data-objection><p>{e.q}</p></article>
                {cur || !motion ? (
                  <article className="ev-a">
                    <p>{e.a}</p>
                    {e.visual}
                    <div className="ev-tag"><HonestyChip tag={e.tag} detail={e.detail} onLight /></div>
                  </article>
                ) : null}
              </li>
            );
          })}
        </ol>
        <aside className="ev-limits">
          <p className="ev-limits__h">WHAT THIS DOES NOT SHOW</p>
          <ul>
            <li>A SIMULATED SYSTEM WITH EXACT LABELS IS EASIER THAN REAL TELEMETRY.</li>
            <li>ONE RUN, ONE SEED, ONE RECORD: DIFFERENCES OF A FEW INCIDENTS ARE NOT SIGNIFICANT.</li>
            <li>THRESHOLDS CHOSEN ON VAL DO NOT COST THE SAME ON TEST.</li>
            <li>{facts.status === "ready" ? `${fv(facts.data, "windows_published")} INCIDENT WINDOWS ARE PUBLISHED, NOT THE WHOLE RECORD AT 1 HZ.` : "ONLY INCIDENT WINDOWS ARE PUBLISHED AT 1 HZ."}</li>
          </ul>
        </aside>
      </div>
    </Track>
  );
}
