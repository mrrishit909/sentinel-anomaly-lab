/**
 * Two-pass Canvas2D lens renderer (MOTION_SYSTEM 9.1): an outside pass under an inverse circular clip and an
 * inside pass under the circle clip. No text is drawn on the canvas (QA L13: every label is DOM), no shadowBlur
 * and no ctx.filter. The same function draws the fixed stage canvas and every in-flow figure.
 */
import { ALARM, HIGHLIGHT, INK, THRESH, type Frame, type LensState, type Mark, type Strand } from "./types";

interface Map1 { a: number; b: number } // x = a + b * t

const rgba = (c: string, a: number) => {
  if (c.startsWith("#") && c.length === 7) return `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})`;
  return c;
};

/** Index range of samples whose x falls within [xmin, xmax]. */
function range(s: Strand, m: Map1, xmin: number, xmax: number): [number, number] {
  const n = s.vals.length;
  const tA = (xmin - m.a) / m.b, tB = (xmax - m.a) / m.b;
  let i0 = Math.floor((tA - s.t0) / s.dt) - 1;
  let i1 = Math.ceil((tB - s.t0) / s.dt) + 1;
  if (s.only) {
    i0 = Math.max(i0, Math.floor((s.only[0] - s.t0) / s.dt));
    i1 = Math.min(i1, Math.ceil((s.only[1] - s.t0) / s.dt));
  }
  return [Math.max(0, i0), Math.min(n - 1, i1)];
}
const xAt = (s: Strand, m: Map1, i: number) => m.a + m.b * (s.t0 + (i + 0.5) * s.dt);

/** Append a decimated polyline (min and max per CSS-pixel column when denser than 2 samples per column). */
function trace(ctx: CanvasRenderingContext2D, s: Strand, m: Map1, i0: number, i1: number, yOf: (v: number) => number, getV: (i: number) => number, move: boolean) {
  if (i1 < i0) return;
  const cols = Math.abs(xAt(s, m, i1) - xAt(s, m, i0));
  const count = i1 - i0 + 1;
  if (count <= cols * 2 + 4) {
    for (let i = i0; i <= i1; i++) {
      const x = xAt(s, m, i), y = yOf(getV(i));
      if (i === i0 && move) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    return;
  }
  let col = Math.floor(xAt(s, m, i0)), first = getV(i0), mn = first, mx = first, last = first, started = !move;
  const flush = (c: number) => {
    const x = c + 0.5;
    if (!started) { ctx.moveTo(x, yOf(first)); started = true; } else ctx.lineTo(x, yOf(first));
    ctx.lineTo(x, yOf(mn)); ctx.lineTo(x, yOf(mx)); ctx.lineTo(x, yOf(last));
  };
  for (let i = i0 + 1; i <= i1; i++) {
    const c = Math.floor(xAt(s, m, i)), v = getV(i);
    if (c !== col) { flush(col); col = c; first = mn = mx = last = v; } else { if (v < mn) mn = v; if (v > mx) mx = v; last = v; }
  }
  flush(col);
}

function drawMarks(ctx: CanvasRenderingContext2D, marks: Mark[], m: Map1, clipL: number, clipR: number, inside = false) {
  for (const k of marks) {
    if (k.kind === "bar" && k.insideOnly && !inside) continue;
    ctx.globalAlpha *= 1;
    if (k.kind === "bar") {
      const x0 = Math.max(clipL, m.a + m.b * k.t0), x1 = Math.min(clipR, m.a + m.b * k.t1);
      if (x1 <= x0) continue;
      ctx.save();
      ctx.globalAlpha *= k.alpha ?? 1;
      if (k.hollow) { ctx.strokeStyle = k.color; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, k.y + 0.5, Math.max(1, x1 - x0 - 1), Math.max(1, k.h - 1)); }
      else { ctx.fillStyle = k.color; ctx.fillRect(x0, k.y, Math.max(1, x1 - x0), k.h); }
      ctx.restore();
    } else if (k.kind === "tick") {
      const x = m.a + m.b * k.t;
      if (x < clipL - 4 || x > clipR + 4) continue;
      ctx.save();
      ctx.globalAlpha *= k.alpha ?? 1;
      if (k.hollow) { ctx.strokeStyle = k.color; ctx.lineWidth = 1; ctx.strokeRect(x - k.w / 2 + 0.5, k.y + 0.5, Math.max(1, k.w - 1), k.h - 1); }
      else { ctx.fillStyle = k.color; ctx.fillRect(x - k.w / 2, k.y, k.w, k.h); }
      ctx.restore();
    } else if (k.kind === "square") {
      const x = m.a + m.b * k.t;
      if (x < clipL || x > clipR) continue;
      ctx.fillStyle = k.color;
      ctx.fillRect(x - k.s / 2, k.y - k.s, k.s, k.s);
    } else {
      const x = m.a + m.b * k.t;
      if (x < clipL || x > clipR) continue;
      ctx.save();
      ctx.globalAlpha *= k.alpha ?? 1;
      ctx.fillStyle = k.color;
      ctx.fillRect(x - (k.w ?? 1) / 2, k.y0, k.w ?? 1, k.y1 - k.y0);
      ctx.restore();
    }
  }
}

interface Pass { m: Map1; amp: number; xmin: number; xmax: number; inside: boolean }

function strandLine(ctx: CanvasRenderingContext2D, s: Strand, p: Pass, vals: ArrayLike<number>, color: string, width: number, alpha: number) {
  const [i0, i1] = range(s, p.m, p.xmin, p.xmax);
  const yOf = (v: number) => s.y - v * p.amp;
  const get = (i: number) => vals[i]!;
  ctx.strokeStyle = rgba(color, alpha);
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (s.skip) {
    const k = Math.floor((s.skip[0] - s.t0) / s.dt), l = Math.ceil((s.skip[1] - s.t0) / s.dt);
    if (k > i0) trace(ctx, s, p.m, i0, Math.min(i1, k), yOf, get, true);
    if (l < i1) trace(ctx, s, p.m, Math.max(i0, l), i1, yOf, get, true);
  } else trace(ctx, s, p.m, i0, i1, yOf, get, true);
  ctx.stroke();
}

function drawLit(ctx: CanvasRenderingContext2D, s: Strand, p: Pass, glow: number) {
  if (!s.lit?.length || s.litRef === undefined) return;
  const ref = s.litRef;
  const refV = (i: number) => (typeof ref === "number" ? ref : ref[i]!);
  for (const span of s.lit) {
    const a = Math.max(0, Math.floor((span.t0 - s.t0) / s.dt)), b = Math.min(s.vals.length - 1, Math.ceil((span.t1 - s.t0) / s.dt) - 1);
    if (b < a) continue;
    const xa = p.m.a + p.m.b * span.t0, xb = p.m.a + p.m.b * span.t1;
    if (xb < p.xmin || xa > p.xmax) continue;
    const yOf = (v: number) => s.y - v * p.amp;
    // the polygon between the measured path and the reference
    const lo = Math.max(a, range(s, p.m, p.xmin, p.xmax)[0]), hi = Math.min(b, range(s, p.m, p.xmin, p.xmax)[1]);
    if (hi < lo) continue;
    let best = lo, bd = -1;
    for (let i = lo; i <= hi; i++) { const d = Math.abs(s.vals[i]! - refV(i)); if (d > bd) { bd = d; best = i; } }
    const g0 = span.g ?? 1;
    if (g0 <= 0.001) continue;
    const val = (i: number) => refV(i) + (s.vals[i]! - refV(i)) * g0;
    const yM = yOf(val(best)), yR = yOf(refV(best));
    const g = ctx.createLinearGradient(0, yM, 0, Math.abs(yR - yM) < 1 ? yM + 8 : yR);
    g.addColorStop(0, HIGHLIGHT); g.addColorStop(0.35, ALARM); g.addColorStop(1, "rgba(255,76,37,0.05)");
    ctx.save();
    ctx.globalAlpha *= 0.55 + 0.45 * span.k;
    ctx.beginPath();
    trace(ctx, s, p.m, lo, hi, yOf, val, true);
    for (let i = hi; i >= lo; i--) ctx.lineTo(xAt(s, p.m, i), yOf(refV(i)));
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    // glow: widened strokes of the measured edge, no filter and no shadow
    const passes = [[6, 0.18], [12, 0.1], [20, 0.05]].slice(0, Math.round(glow));
    for (const [w, a2] of passes) {
      ctx.beginPath();
      trace(ctx, s, p.m, lo, hi, yOf, val, true);
      ctx.strokeStyle = rgba(ALARM, a2! * span.k * g0);
      ctx.lineWidth = w!;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    ctx.beginPath();
    trace(ctx, s, p.m, lo, hi, yOf, val, true);
    ctx.strokeStyle = rgba(ALARM, (0.55 + 0.45 * span.k) * g0);
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawStrand(ctx: CanvasRenderingContext2D, f: Frame, s: Strand, p: Pass, lens: LensState | null, gap: number) {
  if (p.inside && lens) {
    const ridgeH = s.ridgeH ?? gap * 0.45;
    if (s.ridge !== false && !s.dashed && lens.ridge > 0.01) {
      const [i0, i1] = range(s, p.m, p.xmin, p.xmax);
      const base = (v: number) => s.y - v * p.amp;
      const get = (i: number) => s.vals[i]!;
      // a ribbon of constant vertical thickness under the measured path: opaque dark (it occludes the strands behind it),
      // then four bands fading from white 20% at the line to 0 at 45% of the strand gap
      const ribbon = (d0: number, d1: number) => {
        ctx.beginPath();
        trace(ctx, s, p.m, i0, i1, (v) => base(v) + d0, get, true);
        for (let i = i1; i >= i0; i--) ctx.lineTo(xAt(s, p.m, i), base(s.vals[i]!) + d1);
        ctx.closePath();
      };
      ctx.save();
      ribbon(0, ridgeH);
      ctx.fillStyle = "#0b0b0b";
      ctx.fill();
      const K = 4;
      for (let k = 0; k < K; k++) {
        ribbon((ridgeH * k) / K, (ridgeH * (k + 1)) / K);
        ctx.fillStyle = `rgba(255,255,255,${(0.2 * lens.ridge * (1 - (k + 0.5) / K)).toFixed(3)})`;
        ctx.fill();
      }
      ctx.restore();
    }
  }
  if (s.dashed) ctx.setLineDash([3, 4]);
  strandLine(ctx, s, p, s.vals, INK, 1, p.inside ? s.ink : s.alpha);
  if (s.dashed) ctx.setLineDash([]);
  drawLit(ctx, s, p, f.glow);
  if (p.inside && s.hairline !== undefined) {
    const y = s.y - s.hairline * p.amp;
    ctx.fillStyle = rgba(THRESH, s.hairlineAlpha ?? 1);
    ctx.fillRect(p.xmin, y - 0.5, p.xmax - p.xmin, 1);
  }
  if (p.inside && s.expected) {
    ctx.setLineDash([2, 4]);
    const st: Strand = s.expectedRange ? { ...s, only: s.expectedRange } : s;
    strandLine(ctx, st, p, s.expected, INK, 1, 0.5);
    ctx.setLineDash([]);
  }
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, f.w, f.h);
  ctx.globalAlpha = f.alpha ?? 1;
  const L = f.lens;
  const gap = f.strands.length > 1 ? Math.abs(f.strands[1]!.y - f.strands[0]!.y) : 70;
  const wx = f.writeX ?? Infinity;
  const outM: Map1 = { a: f.tx.x0, b: f.tx.pxPerS };

  // outside pass
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, Math.min(f.w, wx), f.h);
  if (L) { ctx.moveTo(L.cx + L.R, L.cy); ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2, false); }
  ctx.clip("evenodd");
  drawMarks(ctx, f.marks, outM, 0, Math.min(f.w, wx));
  for (const s of f.strands) {
    drawStrand(ctx, f, { ...s, expected: null, lit: undefined, hairline: undefined }, { m: outM, amp: s.amp, xmin: 0, xmax: Math.min(f.w, wx), inside: false }, null, gap);
  }
  ctx.restore();

  // inside pass
  if (L) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, L.R, 0, Math.PI * 2);
    ctx.clip();
    const b = f.tx.pxPerS * L.Mt;
    const inM: Map1 = { a: L.cx - L.f * b, b };
    ctx.fillStyle = `rgba(255,255,255,${L.glass})`;
    ctx.fillRect(L.cx - L.R, L.cy - L.R, L.R * 2, L.R * 2);
    if (Number.isFinite(wx)) { ctx.beginPath(); ctx.rect(0, 0, wx, f.h); ctx.clip(); }
    const xmin = Math.max(0, L.cx - L.R), xmax = Math.min(f.w, L.cx + L.R);
    drawMarks(ctx, f.marks, inM, xmin, xmax, true);
    for (const s of f.strands) {
      drawStrand(ctx, f, s, { m: inM, amp: s.amp * L.Ma, xmin, xmax, inside: true }, L, gap);
    }
    if (f.topBar?.length) {
      ctx.fillStyle = INK;
      for (const r of f.topBar) {
        const x0 = Math.max(xmin, inM.a + inM.b * r.t0), x1 = Math.min(xmax, inM.a + inM.b * r.t1);
        if (x1 > x0) ctx.fillRect(x0, L.cy - L.R * 0.86, Math.max(3, x1 - x0), 3);
      }
    }
    ctx.restore();
  }
  if (f.strip) drawStrip(ctx, f);
  ctx.globalAlpha = 1;
}

function drawStrip(ctx: CanvasRenderingContext2D, f: Frame) {
  const st = f.strip!;
  const n = st.bins.length;
  const cols = Math.max(1, Math.floor(st.w));
  ctx.save();
  ctx.globalAlpha *= st.alpha;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(st.x, st.y + st.h - 1, st.w, 1);
  ctx.fillStyle = INK;
  for (let c = 0; c < cols; c++) {
    const b0 = Math.floor((c / cols) * n), b1 = Math.max(b0 + 1, Math.floor(((c + 1) / cols) * n));
    let lit = false;
    for (let b = b0; b < b1 && b < n; b++) if (st.bins[b]! >= st.thr) { lit = true; break; }
    if (lit) ctx.fillRect(st.x + c, st.y + st.h - 14, 1, 14);
  }
  for (const sp of st.spans) {
    const x0 = st.x + (sp.b0 / n) * st.w, x1 = st.x + (sp.b1 / n) * st.w;
    ctx.fillStyle = ALARM;
    if (sp.caught) ctx.fillRect(x0, st.y, Math.max(2, x1 - x0), st.h - 18);
    else { ctx.strokeStyle = ALARM; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, st.y + 0.5, Math.max(2, x1 - x0) - 1, st.h - 19); }
  }
  ctx.restore();
}
