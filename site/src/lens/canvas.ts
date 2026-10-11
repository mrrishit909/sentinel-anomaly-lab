/** Size a canvas to its CSS box at a capped DPR (MOTION_SYSTEM 9.2: 2 on D, 1.5 on T/M, 1 on LOW). */
export function fitCanvas(canvas: HTMLCanvasElement, cap = 2) {
  const dpr = Math.min(devicePixelRatio || 1, cap);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  return { ctx: canvas.getContext("2d")!, w, h, dpr };
}
