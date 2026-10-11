/**
 * QA L19/L22: collision boxes are generated from the DOM, never from a selector list. The whole document is walked:
 * every painted text run (one box per line of each text node), every visible control, chip and canvas-label hook, and
 * every position:fixed element anywhere (chapter nav, pill, corner buttons, footer). Two boxes collide when they
 * intersect and neither element contains the other. Skipped: screen-reader-only text, the body of a closed <details>,
 * content clipped away by an overflow ancestor (not painted), and containers hidden by design (non-visible stacked cards).
 */
export interface CollisionReport { boxes: number; hits: string[] }

export function collisionScript(): string {
  return `(() => {
    const OCCLUDED = ".sr-only, details:not([open]) > :not(summary), [aria-hidden='true'] .strand-label";
    const shown = (el) => {
      if (el.closest(OCCLUDED)) return false;
      let o = el, op = 1;
      while (o) {
        const cs = getComputedStyle(o);
        if (cs.display === "none" || cs.visibility === "hidden") return false;
        op *= Number(cs.opacity);
        o = o.parentElement;
      }
      return op > 0.05;
    };
    const boxes = [];
    const nameOf = (el) => el.tagName.toLowerCase() + "." + String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().split(/\\s+/).slice(0, 2).join(".") + ' "' + (el.textContent || "").trim().slice(0, 28) + '"';
    const clipOf = (el) => {
      let l = -1e9, t = -1e9, r = 1e9, b = 1e9;
      for (let o = el; o && o !== document.body; o = o.parentElement) {
        const cs = getComputedStyle(o);
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const q = o.getBoundingClientRect();
          l = Math.max(l, q.left); t = Math.max(t, q.top); r = Math.min(r, q.right); b = Math.min(b, q.bottom);
        }
      }
      return { l, t, r, b };
    };
    const onScreen = (r) => r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent || !n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest("script, style, noscript") || !shown(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of Array.from(rg.getClientRects())) {
        if (!onScreen(r)) continue;
        const h = Math.min(r.height, fs), cy = (r.top + r.bottom) / 2, c = clipOf(el);
        const box = { el, name: nameOf(el), l: Math.max(r.left, c.l), t: Math.max(cy - h / 2, c.t), r: Math.min(r.right, c.r), b: Math.min(cy + h / 2, c.b) };
        if (box.r - box.l > 1 && box.b - box.t > 1) boxes.push(box);
      }
    }
    for (const el of document.querySelectorAll("button, a[href], input, select, summary, [role=radio], [role=tab], [role=slider], .chip")) {
      if (!shown(el) || el.hasAttribute("data-hit")) continue;
      const r = el.getBoundingClientRect();
      const c = clipOf(el);
      const box = { el, name: nameOf(el), l: Math.max(r.left, c.l), t: Math.max(r.top, c.t), r: Math.min(r.right, c.r), b: Math.min(r.bottom, c.b) };
      if (onScreen(r) && box.r - box.l > 1 && box.b - box.t > 1) boxes.push(box);
    }
    const hits = [];
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        // a control and its own text node are the same visual (contains handles it); the lens-hit and slider thumbs are not text
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (w > 2 && h > 2) hits.push(a.name + " x " + b.name + " (" + Math.round(w) + "x" + Math.round(h) + " at " + Math.round(Math.max(a.l, b.l)) + "," + Math.round(Math.max(a.t, b.t)) + ")");
      }
    }
    return { boxes: boxes.length, hits: [...new Set(hits)] };
  })()`;
}
