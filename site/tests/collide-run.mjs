// Collision sweep: node tests/collide-run.mjs <WxH[,WxH...]> [scene:p,...] [reduced] [classic]
import { chromium } from "@playwright/test";
import { collisionScript } from "../e2e/collide.ts";
const [vps, listS, ...flags] = process.argv.slice(2);
const reduced = flags.includes("reduced"), classic = flags.includes("classic");
const DEFAULT = "signal:0,signal:0.78,record:0.14,record:0.4,record:0.6,record:0.8,normal:0.1,normal:0.3,normal:0.55,normal:0.8,detectors:0.2,detectors:0.4,detectors:0.6,detectors:0.9,days:0.1,days:0.3,days:0.5,days:0.7,days:0.8,days:0.95,lab:0.1,lab:0.4,lab:0.8,fine:0.1,fine:0.31,fine:0.45,fine:0.8,evidence:0.05,evidence:0.5,evidence:0.95,replay:0,close:0.5,close:0.9";
const list = (listS && listS !== "all" ? listS : DEFAULT).split(",");
const b = await chromium.launch({ ignoreDefaultArgs: classic ? ["--hide-scrollbars"] : [] });
let total = 0;
for (const vp of vps.split(",")) {
  const [W, H] = vp.split("x").map(Number);
  const ctx = await b.newContext({ viewport: { width: W, height: H }, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: W < 1024, isMobile: W < 768 });
  if (classic) await ctx.addInitScript(() => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "html{overflow-y:scroll}::-webkit-scrollbar{width:15px}"; document.head.append(s); }));
  const page = await ctx.newPage();
  page.on("crash", () => console.log("PAGE CRASH"));
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
  await page.goto("http://localhost:4361/sentinel-anomaly-lab/");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  for (const item of list) {
    const [id, p] = item.split(":");
    process.stdout.write(`. ${id}@${p} `);
    await page.evaluate(([i, q]) => window.__sal.jumpTo(i, Number(q)), [id, p]);
    await page.waitForTimeout(700);
    const r = await page.evaluate(collisionScript());
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (r.hits.length || sw > W) console.log(`${vp} ${id}@${p} boxes=${r.boxes}${sw > W ? ` OVERFLOW sw=${sw}` : ""}\n  ` + r.hits.slice(0, 8).join("\n  "));
    total += r.hits.length;
  }
  await ctx.close();
}
console.log("TOTAL HITS", total);
await b.close();
