import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4361/sentinel-anomaly-lab/");
await page.waitForFunction(() => !!window.__sal);
await page.keyboard.press("Escape");
await page.waitForTimeout(2500);
for (const id of ["signal", "record", "normal", "detectors", "days", "lab", "fine", "evidence", "replay", "close"]) {
  await page.evaluate((i) => window.__sal.jumpTo(i, 0), id);
  await page.waitForTimeout(500);
  const r = await page.evaluate(async (i) => {
    const sec = document.getElementById(i); const top = sec.getBoundingClientRect().top + scrollY; const h = Math.min(sec.offsetHeight - innerHeight, 3000);
    const d = []; let last = performance.now();
    for (let k = 0; k <= 60; k++) { scrollTo(0, top + (h * k) / 60); await new Promise((r) => requestAnimationFrame(() => r())); const n = performance.now(); d.push(n - last); last = n; }
    d.sort((a, b) => a - b); return [d[30], d[57], d[60]];
  }, id);
  console.log(id, "p50", r[0].toFixed(1), "p95", r[1].toFixed(1), "max", r[2].toFixed(1));
}
await b.close();
