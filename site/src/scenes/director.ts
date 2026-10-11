/**
 * Lens director: ONE fixed Canvas2D carries the lens across S00 to S06 and S08. Each frame it finds the active scene,
 * asks that scene's composer for a Frame (a pure function of scroll progress, visitor state and loaded artifacts) and
 * draws only when something changed. All strand labels are DOM, positioned from the same frame (QA L13).
 */
import { addFrame } from "../motion/loop";
import { getActive, getProgress } from "../scroll/engine";
import { motionEnabled, subscribeMotion } from "../state/motion";
import { fitCanvas } from "../lens/canvas";
import { drawFrame } from "../lens/draw";
import type { Frame } from "../lens/types";
import { stageH, stageW, viewportClass } from "./viewport";
import type { Ctx } from "./ctx";
import { intro } from "./intro";
import { composeRecordBackdrop, composeSignal } from "./signal";
import { composeScene } from "./compose";
import { anyBusy, markDirty, slots, stateVersion, takeDirty } from "./bus";

export const dbg = { frames: 0, scene: "signal", lens: { cx: 0, cy: 0, R: 0, Mt: 0, f: 0 }, lit: [] as { channel: string; second: number; q: number; threshold: number }[], quality: "high" as "high" | "low", median: 0 };
let canvas: HTMLCanvasElement | null = null;
let labelsEl: HTMLElement | null = null;
const labelNodes = new Map<string, HTMLElement>();
let last: Frame | null = null;
export const lastFrame = () => last;

function node(key: string, cls: string): HTMLElement {
  let el = labelNodes.get(key);
  if (!el) {
    el = document.createElement("span");
    el.className = cls;
    labelsEl!.appendChild(el);
    labelNodes.set(key, el);
  }
  return el;
}
function syncLabels(f: Frame | null, cls: string) {
  if (!labelsEl) return;
  const want = new Set<string>();
  if (f && f.alpha === undefined) {
    for (const s of f.strands) {
      if (!s.label) continue;
      const key = `s:${s.id}`;
      want.add(key);
      const el = node(key, "strand-label");
      const txt = (s.text ?? s.id).toUpperCase();
      if (el.textContent !== txt) el.textContent = txt;
      const x = Math.max(2, f.tx.x0 - (cls === "M" ? 36 : 40));
      el.style.transform = `translate(${x}px, ${(s.y - 6).toFixed(1)}px)`;
      const lit = s.labelLit ? "1" : "0";
      if (el.dataset.lit !== lit) el.dataset.lit = lit;
      el.style.opacity = s.dashed ? "0.5" : "";
    }
  }
  for (const t of f?.tags ?? []) {
    const key = `t:${t.key}`;
    want.add(key);
    const el = node(key, "lens-tag");
    if (el.textContent !== t.text) el.textContent = t.text;
    if (el.dataset.tone !== (t.tone ?? "mute")) el.dataset.tone = t.tone ?? "mute";
    el.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px)${t.align === "c" ? " translateX(-50%)" : t.align === "r" ? " translateX(-100%)" : ""}`;
  }
  for (const [id, el] of labelNodes) {
    if (!want.has(id)) { el.remove(); labelNodes.delete(id); }
  }
}

export function startDirector(c: HTMLCanvasElement, labels: HTMLElement) {
  canvas = c;
  labelsEl = labels;
  let key = "";
  let box = { w: 0, h: 0 };
  const onResize = () => markDirty();
  addEventListener("resize", onResize);
  new ResizeObserver(onResize).observe(document.documentElement);
  subscribeMotion(() => markDirty());
  return addFrame((now) => {
    const motion = motionEnabled();
    const active = intro.playing || intro.frozen >= 0 ? "signal" : getActive() ?? "signal";
    const w = stageW(), h = stageH();
    const p = getProgress(active);
    const running = intro.playing || intro.frozen >= 0 || anyBusy();
    const k = `${active}|${p.toFixed(4)}|${w}x${h}|${stateVersion()}|${motion}`;
    const wasDirty = takeDirty();
    if (!wasDirty && !running && k === key) return;
    key = k;
    if (canvas!.clientWidth !== box.w || canvas!.clientHeight !== box.h) { box = { w: canvas!.clientWidth, h: canvas!.clientHeight }; }
    const { ctx, dpr } = fitCanvas(canvas!, w < 1024 ? 1.5 : 2);
    const topEl = document.querySelector<HTMLElement>(`#${active} .sc-top`);
    slots.topBottom = topEl && getComputedStyle(topEl).visibility !== "hidden" ? topEl.getBoundingClientRect().bottom : 0;
    const botEl = document.querySelector<HTMLElement>(`#${active} .sc-bottom`);
    slots.bottomTop = botEl ? botEl.getBoundingClientRect().top : 9999;
    const c2: Ctx = { cls: viewportClass(), w, h, now, p, motion };
    let f: Frame | null = null;
    if (active === "signal") f = composeSignal(c2);
    else if (active === "record" && motion) f = composeRecordBackdrop(c2);
    else if (motion) f = composeScene(active, c2);
    last = f;
    dbg.scene = active; dbg.frames++;
    if (f) {
      dbg.lens = f.lens ? { cx: f.lens.cx, cy: f.lens.cy, R: f.lens.R, Mt: f.lens.Mt, f: f.lens.f } : dbg.lens;
      drawFrame(ctx, f, dpr);
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
    }
    syncLabels(f, c2.cls);
  }, 100);
}
