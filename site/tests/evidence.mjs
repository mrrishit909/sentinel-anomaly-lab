#!/usr/bin/env node
// Evidence for P06-FE-001: node tests/evidence.mjs [--only 1440x900,390x844] [--skip-video]
// Screenshots per scene at 7 viewports + 1280x720, classic-scrollbar and reduced-motion runs, a full scroll recording with a
// 1 fps contact sheet per viewport, and rAF frame pacing during a scripted scroll through every scene (device stated).
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { cpus } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "artifacts", "evidence", "fe-001");
const BASE = "http://localhost:4361/sentinel-anomaly-lab/";
const VPS = [[1920, 1080], [1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844], [375, 812], [360, 800]];
const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const SCENES = [["signal", 0], ["signal", 0.78], ["record", 0.14], ["record", 0.6], ["normal", 0.3], ["normal", 0.55], ["detectors", 0.2], ["detectors", 0.55], ["days", 0.2], ["days", 0.8], ["lab", 0.15], ["lab", 0.5], ["fine", 0.2], ["fine", 0.8], ["evidence", 0.5], ["replay", 0], ["close", 0.9]];
const mk = (p) => mkdirSync(p, { recursive: true });
const SCROLLBAR_CSS = "html{overflow-y:scroll}::-webkit-scrollbar{width:15px}::-webkit-scrollbar-thumb{background:#555}";

async function open(browser, w, h, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1024, isMobile: w < 768, reducedMotion: o.reduced ? "reduce" : "no-preference",
    ...(o.video ? { recordVideo: { dir: o.video, size: { width: Math.min(w, 1280), height: Math.round((Math.min(w, 1280) * h) / w) } } } : {}) });
  if (o.classic) await ctx.addInitScript((css) => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); }), SCROLLBAR_CSS);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => !!window.__sal);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const go = async (page, id, p) => { await page.evaluate(([i, q]) => window.__sal.jumpTo(i, q), [id, p]); await page.waitForTimeout(900); };

const browser = await chromium.launch();
for (const [w, h] of VPS) {
  const label = `${w}x${h}`;
  if (only && !only.has(label)) continue;
  for (const mode of ["", "classic", "reduced"]) {
    if (mode === "classic" && !(w === 1024 || w === 768)) continue;
    if (mode === "reduced" && ![1440, 390].includes(w)) continue;
    const dir = join(OUT, "screenshots", label + (mode ? `-${mode}` : ""));
    mk(dir);
    const { ctx, page } = await open(browser, w, h, { classic: mode === "classic", reduced: mode === "reduced" });
    for (const [id, p] of SCENES) {
      await go(page, id, p);
      await page.screenshot({ path: join(dir, `${id}-${String(p).replace(".", "_")}.png`) });
    }
    if (!mode) {
      const m = await page.evaluate(() => window.__sal.debug());
      writeFileSync(join(dir, "debug.json"), JSON.stringify(m));
    }
    await ctx.close();
  }
  if (!args.includes("--skip-video") && [1440, 390].includes(w)) {
    const vdir = join(OUT, "recordings", `tmp-${label}`);
    mk(vdir);
    const { ctx, page } = await open(browser, w, h, { video: vdir });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    const fdir = join(OUT, "contact-sheets", `frames-${label}`);
    rmSync(fdir, { recursive: true, force: true });
    mk(fdir);
    for (let i = 0; i <= 160; i++) {
      await page.evaluate((y) => scrollTo(0, y), (total * i) / 160);
      await page.waitForTimeout(90);
      if (i % 4 === 0) await page.screenshot({ path: join(fdir, `f-${String(i).padStart(3, "0")}.png`) });
    }
    execFileSync("python3", [join(HERE, "tile.py"), fdir, join(OUT, "contact-sheets", `${label}.png`), "10", "240"], { stdio: "inherit" });
    rmSync(fdir, { recursive: true, force: true });
    const v = page.video();
    await ctx.close();
    const src = await v.path();
    mk(join(OUT, "recordings"));
    renameSync(src, join(OUT, "recordings", `${label}.webm`));
    rmSync(vdir, { recursive: true, force: true });
}
}
// frame pacing: rAF deltas through a scripted scroll over every scene
const pacing = [];
for (const [w, h, throttle] of [[1440, 900, 1], [1440, 900, 4], [390, 844, 4]]) {
  const { ctx, page } = await open(browser, w, h);
  const cdp = await ctx.newCDPSession(page);
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await page.evaluate(() => { window.__d = []; let last = performance.now(); const f = () => { const n = performance.now(); window.__d.push(n - last); last = n; if (window.__run) requestAnimationFrame(f); }; window.__run = true; requestAnimationFrame(f); });
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let i = 0; i <= 200; i++) { await page.evaluate((y) => scrollTo(0, y), (total * i) / 200); await page.waitForTimeout(40); }
  const d = await page.evaluate(() => { window.__run = false; return window.__d; });
  const s = [...d].sort((a, b) => a - b), q = (x) => s[Math.floor(s.length * x)];
  pacing.push({ viewport: `${w}x${h}`, cpuThrottle: throttle, frames: d.length, p50_ms: q(0.5), p95_ms: q(0.95), over16_7: d.filter((x) => x > 16.7).length / d.length, over33: d.filter((x) => x > 33).length / d.length });
  await ctx.close();
}
writeFileSync(join(OUT, "frame-pacing.json"), JSON.stringify({ device: `${cpus()[0].model}, ${cpus().length} cores, headless Chromium (no GPU claim), scripted scroll through every scene`, measuredAt: new Date().toISOString(), runs: pacing }, null, 2));
console.log(JSON.stringify(pacing));
await browser.close();
