import { useCallback, useEffect, useState } from "react";
import { addFrame } from "../motion/loop";
import { Reveal } from "../motion/reveal";
import { motionEnabled } from "../state/motion";
import { INTRO_MS, intro, introTime } from "../scenes/intro";
import { invalidate } from "../scenes/bus";
import { clamp } from "../lib/math";

const KEY = "sal.intro";
const seen = () => { try { return sessionStorage.getItem(KEY) === "done"; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(KEY, "done"); } catch { /* storage blocked: plays again next load */ } };

/**
 * S00 "The Focus" clock (MOTION_SYSTEM 5.1): the canvas timeline lives in scenes/signal.ts; this drives the DOM from the
 * same clock: corner labels (200-500 ms), the headline sharpening (3400-4100 ms, 80 ms stagger) and the nav (4100 ms).
 * SKIP, Esc and any scroll input complete it in 350 ms; scroll is never locked. Once per session; reduced motion renders
 * the end state on the first frame. The SYNTHETIC chip and meta.dataset.nature are visible from the first frame.
 */
export function useIntro() {
  const [playing, setPlaying] = useState(() => motionEnabled() && !seen());
  const [navIn, setNavIn] = useState(() => !playing);
  const [run, setRun] = useState(0);

  const complete = useCallback(() => {
    if (!intro.playing || intro.completeFrom >= 0 || intro.frozen >= 0) return;
    const now = performance.now();
    intro.completeFrom = introTime(now);
    intro.completeAt = now;
    setNavIn(true);
  }, []);

  useEffect(() => {
    const h = document.querySelector<HTMLElement>("h1[data-hero]");
    const reveal = h ? new Reveal(h) : null;
    const corners = document.querySelectorAll<HTMLElement>("[data-intro-corner]");
    const rule = document.querySelector<HTMLElement>("[data-lit-rule]");
    document.documentElement.dataset.intro = playing ? "playing" : "done";
    if (!playing) {
      intro.playing = false;
      reveal?.set(1);
      corners.forEach((c) => (c.style.opacity = ""));
      if (rule) rule.style.opacity = "";
      return;
    }
    Object.assign(intro, { playing: true, start: 0, completeFrom: -1, completeAt: 0, arrival: -1, minR: Infinity, monotonic: true, lastR: 0 });
    reveal?.set(0);
    if (rule) rule.style.opacity = "0";
    let navShown = false;
    const off = addFrame((now) => {
      const t = introTime(now);
      corners.forEach((c) => (c.style.opacity = String(clamp((t - 200) / 300))));
      reveal?.timed(t - 3400, 350, 80);
      if (rule) rule.style.opacity = String(clamp((t - 3400) / 700));
      if (!navShown && t >= 4100) { navShown = true; setNavIn(true); }
      if (t >= INTRO_MS && intro.frozen < 0) {
        off();
        intro.playing = false;
        reveal?.set(1);
        corners.forEach((c) => (c.style.opacity = ""));
        if (rule) rule.style.opacity = "";
        document.documentElement.dataset.intro = "done";
        markSeen();
        setPlaying(false);
        invalidate();
      }
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", "ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "End", "Home"].includes(e.key)) complete();
    };
    addEventListener("wheel", complete, { passive: true });
    addEventListener("sal:jump", complete);
    addEventListener("touchmove", complete, { passive: true });
    addEventListener("keydown", onKey);
    return () => {
      off();
      removeEventListener("wheel", complete);
      removeEventListener("sal:jump", complete);
      removeEventListener("touchmove", complete);
      removeEventListener("keydown", onKey);
    };
  }, [playing, run, complete]);

  const replay = useCallback(() => {
    scrollTo(0, 0);
    if (!motionEnabled()) return; // the 0ms version is the end state
    setNavIn(false);
    setPlaying(true);
    setRun((r) => r + 1);
  }, []);

  return { playing, navIn, skip: complete, replay };
}
