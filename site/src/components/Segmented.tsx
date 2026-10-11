import { useLayoutEffect, useRef, type ReactNode } from "react";

export interface SegOption<T extends string | number> { value: T; label: ReactNode; disabled?: boolean; reason?: string; aria?: string }
interface Props<T extends string | number> {
  label: string;
  value: T | null;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  compact?: boolean;
}

/**
 * Parameter segmented control (MOTION_SYSTEM 5.14): a radiogroup whose active block is #690DE2 with white text and slides
 * between items (transform only). A disabled item is aria-disabled with its reason in the tooltip and is never applied silently.
 */
export function Segmented<T extends string | number>({ label, value, options, onChange, className = "", compact }: Props<T>) {
  const root = useRef<HTMLDivElement>(null);
  const block = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const place = () => {
    const r = root.current, b = block.current;
    if (!r || !b) return;
    const a = r.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!a) { b.style.opacity = "0"; return; }
    b.style.transition = placed.current ? "" : "none";
    b.style.opacity = "1";
    b.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop}px)`;
    b.style.width = `${a.offsetWidth}px`;
    b.style.height = `${a.offsetHeight}px`;
    placed.current = true;
  };
  useLayoutEffect(place);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(place);
    if (root.current) ro.observe(root.current);
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, []);
  const enabled = options.filter((o) => !o.disabled);
  const move = (dir: 1 | -1) => {
    const i = enabled.findIndex((o) => o.value === value);
    const n = enabled[(i + dir + enabled.length) % enabled.length];
    if (n) onChange(n.value);
  };
  return (
    <div ref={root} role="radiogroup" aria-label={label} className={`seg-ctl ${compact ? "seg-ctl--compact" : ""} ${className}`}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      }}>
      <span ref={block} className="seg-ctl__block" aria-hidden="true" />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} aria-disabled={o.disabled || undefined} aria-label={o.aria}
            title={o.disabled ? o.reason : undefined} tabIndex={on || (value === null && o === enabled[0]) ? 0 : -1}
            className={`seg-ctl__item ${o.disabled ? "is-disabled" : ""}`}
            onClick={() => { if (!o.disabled) onChange(o.value); }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
