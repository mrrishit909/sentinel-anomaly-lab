import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "lenis/dist/lenis.css";
import "./styles/app.css";
import "./styles/scenes.css";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { App } from "./app/App";
import { getProgress, jumpTo, startEngine } from "./scroll/engine";
import { dbg, lastFrame } from "./scenes/director";
import { intro, introTime } from "./scenes/intro";
import { cssClass, viewportClass, stageW } from "./scenes/viewport";
import { invalidate } from "./scenes/bus";
import { normal, detectors, days, lab, fine, replay } from "./state/scenes";

// Test and evidence hook: the same instant-jump path the nav uses (deterministic captures).
Object.assign(window, {
  __sal: {
    jumpTo, getProgress, invalidate,
    stores: { normal, detectors, days, lab, fine, replay },
    freeze: (t: number) => { intro.frozen = t; if (t >= 0) intro.playing = true; },
    introStats: () => ({ minR: intro.minR, monotonic: intro.monotonic, playing: intro.playing, t: introTime(performance.now()) }),
    debug: () => ({ ...dbg, lens: lastFrame()?.lens ?? null }),
    /** L1: the JS composition class and the CSS one must agree */
    classes: () => ({ js: viewportClass(), css: cssClass(), clientWidth: stageW(), innerWidth }),
    /** L13: all strand labels are DOM, so the label boxes are plain rects */
    labelBoxes: () => [...document.querySelectorAll<HTMLElement>(".strand-label")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.textContent, x: r.x, y: r.y, w: r.width, h: r.height }; }),
    litAudit: () => lastFrame()?.strands.flatMap((s) => (s.lit ?? []).map((l) => ({ channel: s.id, t0: l.t0, t1: l.t1, g: l.g ?? 1 }))) ?? [],
  },
});

startEngine();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
