import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Nav } from "../components/Nav";
import { jumpTo, registerTrack, resolveInitialHash } from "../scroll/engine";
import { useActiveScene } from "../scroll/hooks";
import { NAV_ITEMS, SCENES, navActive } from "./scenes";
import { useIntro } from "./useIntro";
import { getStore } from "../data/loader";
import { CHANNELS, EVAL, FACTS, HERO, META } from "../data/artifacts";
import { startDirector } from "../scenes/director";
import { SignalLayer } from "../scenes/S01Signal";
import { SceneRoutes } from "../scenes/SceneRoutes";
import { Footer } from "../components/Footer";

/** App: the static S00/S01 track (index.html) plus the React scenes, the lens canvas and the nav. */
export function App() {
  const active = useActiveScene();
  const intro = useIntro();
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = document.getElementById("signal");
    return el ? registerTrack("signal", el, SCENES[0]!.landing) : undefined;
  }, []);
  useEffect(() => {
    // first-paint artifacts (MOTION_SYSTEM 9.3): facts and meta in parallel with JS, then the hero slice and its small inputs
    getStore(FACTS).prefetch(); getStore(META).prefetch();
    getStore(HERO).prefetch(); getStore(CHANNELS).prefetch(); getStore(EVAL).prefetch();
    const off = startDirector(canvas.current!, labels.current!);
    resolveInitialHash();
    return off;
  }, []);
  const portal = document.getElementById("signal-portal");
  return (
    <>
      <Nav items={NAV_ITEMS} active={navActive(active)} onJump={(id) => jumpTo(id, undefined, { push: true, focus: true })}
        introPlaying={!intro.navIn} onSkip={intro.skip} onReplay={intro.replay} />
      <canvas ref={canvas} className="lens-layer" aria-hidden="true" data-lens-canvas />
      <div ref={labels} className="lens-labels" aria-hidden="true" />
      {portal ? createPortal(<SignalLayer introPlaying={intro.playing} />, portal) : null}
      <SceneRoutes onReplayIntro={intro.replay} />
      <Footer introPlaying={intro.playing} />
    </>
  );
}
