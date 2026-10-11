import { useEffect, useRef, type ReactNode } from "react";

/** Bottom sheet for phone controls (MOTION_SYSTEM 5.12). Closes on Escape and on scene change; focus returns to the trigger. */
export function Sheet({ open, onClose, title, id, children }: { open: boolean; onClose: () => void; title: string; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button, select, input, [tabindex]")?.focus({ preventScroll: true });
    return () => removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <div ref={ref} id={id} role="dialog" aria-label={title} aria-hidden={!open} className={`sheet ${open ? "is-open" : ""}`}>
      <div className="sheet__head">
        <span className="sheet__title">{title}</span>
        <button type="button" className="btn-square sheet__close" tabIndex={open ? 0 : -1} onClick={onClose}>CLOSE</button>
      </div>
      <div className="sheet__body">{children}</div>
    </div>
  );
}
