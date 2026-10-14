import { useEffect, useRef, useState } from "react";
import { drawFrame } from "../lens/draw";
import { fitCanvas } from "../lens/canvas";
import type { Frame } from "../lens/types";
import { RAIL } from "../scenes/geometry";
import { viewportClass } from "../scenes/viewport";
import { useFrame } from "../scroll/hooks";

/**
 * In-flow lens figure: its own canvas plus a DOM label overlay. Used by every scene under reduced motion and by REPLAY
 * (a normal-flow section; the fixed stage canvas cannot serve it). QA L15: the box has an explicit height, and the figure
 * paints on mount, on resize and whenever its frame inputs change.
 */
export function LensFigure({ build, deps, animate = false, watch, label, className = "", tag }: {
  build: (w: number, h: number) => Frame | null;
  deps: unknown[];
  animate?: boolean;
  /** a store whose changes redraw the figure (REPLAY's playhead) without re-rendering the owning scene */
  watch?: { subscribe: (l: () => void) => () => void };
  label: string;
  className?: string;
  tag?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [labels, setLabels] = useState<{ id: string; x: number; y: number; lit: boolean; key: string; text: string; tone?: string }[]>([]);
  const last = useRef("");
  const draw = () => {
    const c = canvas.current, b = box.current;
    if (!c || !b) return;
    const { ctx, w, h, dpr } = fitCanvas(c, innerWidth < 1024 ? 1.5 : 2);
    if (w < 2 || h < 2) return;
    const f = build(w, h);
    if (!f) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); setLabels([]); return; }
    drawFrame(ctx, f, dpr);
    const cls = viewportClass();
    const x = Math.max(2, f.tx.x0 - (cls === "M" ? 36 : 40));
    const next = [
      ...f.strands.filter((s) => s.label).map((s) => ({ id: s.id, key: `s${s.id}`, text: (s.text ?? s.id).toUpperCase(), x, y: s.y - 6, lit: !!s.labelLit })),
      ...(f.tags ?? []).map((t) => ({ id: t.key, key: `t${t.key}`, text: t.text, x: t.x, y: t.y, lit: false, tone: t.tone })),
    ];
    const sig = JSON.stringify(next);
    if (sig !== last.current) { last.current = sig; setLabels(next); }
  };
  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  });
  useEffect(draw, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; });
  useEffect(() => watch?.subscribe(() => drawRef.current()), [watch]);
  useFrame(() => { if (animate) draw(); }, 110);
  void RAIL;
  return (
    <figure className={`lens-fig ${className}`} ref={box} aria-label={label}>
      <canvas ref={canvas} className="lens-fig__canvas" />
      <div className="lens-fig__labels" aria-hidden="true">
        {labels.map((l) => (
          <span key={l.key} className={l.key.startsWith("s") ? "strand-label" : "lens-tag"} data-lit={l.lit ? "1" : "0"} data-tone={l.tone} style={{ transform: `translate(${l.x}px, ${l.y}px)` }}>{l.text}</span>
        ))}
      </div>
      {tag ? <figcaption className="lens-fig__tag">{tag}</figcaption> : null}
    </figure>
  );
}
