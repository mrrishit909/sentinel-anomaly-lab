import { useEffect, useRef, useState } from "react";
import { WordReveal } from "../components/WordReveal";
import { NotificationCard } from "../components/NotificationCard";
import { HonestyChip } from "../components/HonestyChip";
import { ArtifactStatus, SceneErrors, type Needed } from "../components/StateUI";
import { useArtifact } from "../data/useArtifact";
import { CHANNELS, EVAL, FACTS, HERO, INCIDENTS } from "../data/artifacts";
import { COPY } from "../data/copy";
import { useActiveScene, useProgress } from "../scroll/hooks";
import { easeSymmetric } from "../motion/ease";
import { stepState, windowed } from "../motion/progress";
import { motionEnabled } from "../state/motion";
import { ignition } from "./signal";
import { getStore } from "../data/loader";

/** S01 layer inside the static #signal track: headline shrink, scrim fade, statement, kicker, notification cards. */
export function SignalLayer({ introPlaying }: { introPlaying: boolean }) {
  const [facts, retryFacts] = useArtifact(FACTS);
  const [ev, retryEv] = useArtifact(EVAL);
  const [hero, retryHero] = useArtifact(HERO);
  const [ch, retryCh] = useArtifact(CHANNELS);
  const [inc] = useArtifact(INCIDENTS, false);
  const active = useActiveScene() ?? "signal";
  const [play, setPlay] = useState(0);
  const step = useRef(0);
  const dy = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  // the hero window and channels load right after first paint; incidents (165 KB gz) are off the S00 first-paint path (ED #36)
  useEffect(() => {
    const t = window.setTimeout(() => getStore(INCIDENTS).prefetch(), 400);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (inc.status === "ready" && ignition.incidentsAt < 0) ignition.incidentsAt = performance.now();
  }, [inc.status]);

  const measure = () => {
    const h = document.querySelector<HTMLElement>("h1[data-hero]");
    if (!h) return;
    const prev = h.style.transform;
    h.style.transform = "none";
    const top = h.getBoundingClientRect().top;
    h.style.transform = prev;
    const target = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--s01-h1-top")) || 108;
    dy.current = target - top;
  };
  useEffect(() => {
    measure();
    addEventListener("resize", measure);
    document.fonts?.ready.then(measure);
    return () => removeEventListener("resize", measure);
  }, []);

  useProgress("signal", (p) => {
    const h = document.querySelector<HTMLElement>("h1[data-hero]");
    const scrim = document.querySelector<HTMLElement>("[data-scrim]");
    const foot = document.querySelector<HTMLElement>("[data-s0-foot]");
    const e = motionEnabled() ? easeSymmetric(windowed(p, 0, 0.4)) : 0;
    if (h && !document.documentElement.dataset.noshrink) {
      const s = 1 - (1 - getScale()) * e;
      h.style.transform = e > 0 ? `translate3d(0, ${(dy.current * e).toFixed(1)}px, 0) scale(${s.toFixed(3)})` : "";
    }
    if (scrim) scrim.style.opacity = String(1 - e);
    if (foot) { foot.style.opacity = String(1 - Math.min(1, e * 2.5)); foot.style.visibility = e > 0.4 ? "hidden" : ""; }
    // S01 text and cards stay hidden while S00 owns the frame (the ghost statement must not sit on the headline)
    const vis = motionEnabled() ? windowed(p, 0.28, 0.4) : 1;
    const cv = motionEnabled() ? windowed(p, 0.5, 0.6) : 1;
    const r = root.current;
    if (r) {
      r.style.setProperty("--s01-text", String(vis));
      r.style.setProperty("--s01-cards", String(cv));
      r.dataset.text = vis > 0 ? "1" : "0";
      r.dataset.cards = cv > 0 ? "1" : "0";
    }
    const s = stepState(step.current, p, [0.6], 0.02);
    if (s !== step.current) { step.current = s; if (s === 1) setPlay((k) => k + 1); }
  });

  const needed: Needed[] = [
    { file: "window_142_hero.json", state: hero, retry: retryHero },
    { file: "channels.json", state: ch, retry: retryCh },
    { file: "facts.json", state: facts, retry: retryFacts },
    { file: "detector_eval.json", state: ev, retry: retryEv },
    { file: "incidents.json", state: inc, retry: () => getStore(INCIDENTS).load() },
  ];
  void introPlaying;
  return (
    <div ref={root} className="s01" data-text="0" data-cards="0">
      <SceneErrors active={active === "signal"} items={needed} />
      <ArtifactStatus file="facts.json" state={facts} retry={retryFacts} empty="NO FACTS PUBLISHED">
        {(f) => {
          const c1 = COPY.card1(f), c2 = COPY.card2(f);
          return (
            <>
              <div className="s01__text">
                <WordReveal as="p" className="s01__statement serif" text={COPY.statementS01(f)} mode={{ kind: "scrub", track: "signal", from: 0.35, to: 0.75 }} />
                <p className="s01__kicker">{COPY.kickerS01(f)}</p>
                <HonestyChip tag="SYNTHETIC" detail="SIMULATED SYSTEM, 17 CHANNELS" className="chip--wrap" />
              </div>
              <div className="s01__cards">
                <NotificationCard from={c1.head} when="" body={c1.body} variant="dark" playKey={play} tag={<HonestyChip tag="DERIVED" detail="TEST SPLIT" />} />
                <NotificationCard from={c2.head} when="" body={c2.body} variant="violet" playKey={play} tag={<HonestyChip tag="DERIVED" detail="TEST SPLIT" />} />
              </div>
            </>
          );
        }}
      </ArtifactStatus>
    </div>
  );
}

function getScale() {
  const w = window.innerWidth;
  return w < 768 ? 0.65 : w < 1024 ? 0.62 : 0.5;
}
