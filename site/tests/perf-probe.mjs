import { chromium } from "@playwright/test";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:4361/sentinel-anomaly-lab/");
await page.waitForFunction(() => !!window.__sal);
await page.keyboard.press("Escape");
await page.waitForTimeout(2000);
for (const [id, p] of [["signal", 0], ["signal", 0.3], ["record", 0.9], ["normal", 0.5], ["detectors", 0.3], ["days", 0.1], ["days", 0.3], ["days", 0.8], ["lab", 0.5], ["fine", 0.2], ["fine", 0.8], ["close", 0.9]]) {
  await page.evaluate(([i, q]) => window.__sal.jumpTo(i, q), [id, p]);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => { const out = []; for (let k = 0; k < 8; k++) { window.__sal.invalidate(); await new Promise((r) => requestAnimationFrame(() => r())); const d = window.__sal.debug(); out.push([d.drawMs, d.composeMs]); } return out; });
  const avg = (i) => (r.reduce((a, x) => a + x[i], 0) / r.length).toFixed(1);
  console.log(id, p, "draw ms", avg(0), "compose ms", avg(1));
}
await b.close();
