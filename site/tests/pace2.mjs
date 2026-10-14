import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4361/sentinel-anomaly-lab/");
await page.waitForFunction(() => !!window.__sal);
await page.keyboard.press("Escape");
await page.waitForTimeout(2500);
const id = process.argv[2] ?? "days";
await page.evaluate((i) => window.__sal.jumpTo(i, 0), id);
await page.waitForTimeout(500);
const r = await page.evaluate(async (i) => {
  const sec = document.getElementById(i); const top = sec.getBoundingClientRect().top + scrollY; const h = sec.offsetHeight - innerHeight;
  const out = [];
  for (let k = 0; k <= 30; k++) { scrollTo(0, top + (h * k) / 30); const t = performance.now(); await new Promise((r) => requestAnimationFrame(() => r())); const dd = window.__sal.debug(); out.push([performance.now() - t, dd.drawMs, dd.composeMs, k / 30]); }
  return out;
}, id);
for (const x of r) console.log(x.map((v) => v.toFixed(2)).join("  "));
await b.close();
