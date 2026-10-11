import { useRef, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Threshold slider indexed over ONE detector's own thresholds_q (159 / 160 / 160 / 146 / 90 steps), never a fixed scale.
 * Three light-blue notches mark the val-chosen operating points. role="slider" with aria-valuetext.
 */
export function ThresholdSlider({ steps, index, notches, valueText, onChange, label = "Threshold" }: {
  steps: number; index: number; notches: { index: number; text: string }[]; valueText: string; onChange: (i: number) => void; label?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const at = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onChange(Math.round(t * (steps - 1)));
  };
  const key = (e: KeyboardEvent) => {
    const order = [...notches].sort((a, b) => a.index - b.index);
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowUp") { e.preventDefault(); onChange(Math.min(steps - 1, index + 1)); }
    else if (k === "ArrowLeft" || k === "ArrowDown") { e.preventDefault(); onChange(Math.max(0, index - 1)); }
    else if (k === "PageUp") { e.preventDefault(); const n = order.find((x) => x.index > index); onChange(n ? n.index : steps - 1); }
    else if (k === "PageDown") { e.preventDefault(); const n = [...order].reverse().find((x) => x.index < index); onChange(n ? n.index : 0); }
    else if (k === "Home") { e.preventDefault(); onChange(0); }
    else if (k === "End") { e.preventDefault(); onChange(steps - 1); }
  };
  const pos = steps > 1 ? index / (steps - 1) : 0;
  return (
    <div className="slider" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={steps - 1} aria-valuenow={index} aria-valuetext={valueText}
      onKeyDown={key} onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); at(e); }}
      onPointerMove={(e) => { if (drag.current) at(e); }} onPointerUp={(e) => { drag.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}>
      <div ref={track} className="slider__track">
        <div className="slider__fill" style={{ width: `${pos * 100}%` }} />
        {notches.map((n, k) => (
          <span key={n.text} className={`slider__notch ${k === 1 ? "slider__notch--up" : ""}`} style={{ left: `${(n.index / Math.max(1, steps - 1)) * 100}%` }}><i />{n.text}</span>
        ))}
        <div className="slider__thumb" style={{ left: `${pos * 100}%` }} />
      </div>
    </div>
  );
}
