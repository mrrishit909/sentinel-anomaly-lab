import { useRef, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Invisible circular hit area over the lens for horizontal drags (S03a focus, S04 lens along the strip, REPLAY scrub).
 * It sits under every control (lower z-index), so controls always win hit-testing (QA L9/L12), and uses touch-action: pan-y
 * so a vertical swipe still scrolls the page (rejection criterion 10).
 */
export function LensHit({ cx, cy, R, label, valueText, min, max, now, onDrag, onKey, active = true }: {
  cx: number; cy: number; R: number; label: string; valueText: string; min: number; max: number; now: number;
  /** dx in px since the drag began, and the value of `now` when it began */
  onDrag: (dx: number, start: number) => void;
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
  active?: boolean;
}) {
  const st = useRef<{ x: number; v: number; id: number } | null>(null);
  const down = (e: PointerEvent<HTMLDivElement>) => {
    st.current = { x: e.clientX, v: now, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (st.current) onDrag(e.clientX - st.current.x, st.current.v);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    if (st.current) { e.currentTarget.releasePointerCapture(st.current.id); st.current = null; }
  };
  if (!active) return null;
  return (
    <div role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={now} aria-valuetext={valueText}
      className="lens-hit" data-hit style={{ left: cx - R, top: cy - R, width: R * 2, height: R * 2 }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={onKey} />
  );
}
