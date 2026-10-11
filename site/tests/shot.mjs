// Quick visual probe: node tests/shot.mjs <outDir> <WxH> <scene:p[,scene:p...]> [reduced] [classic]
import { chromium } from "@playwright/test";
const [out, vpS, listS, flag1, flag2] = process.argv.slice(2);
const [W, H] = vpS.split("x").map(Number);
const reduced = [flag1, flag2].includes("reduced"), classic = [flag1, flag2].includes("classic");
const b = await chromium.launch({ ignoreDefaultArgs: classic ? ["--hide-scrollbars"] : [] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, reducedMotion: reduced ? "reduce" : "no-preference", hasTouch: W < 1024, isMobile: W < 768 });
const page = await ctx.newPage();
const errs = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
await page.goto("http://localhost:4361/sentinel-anomaly-lab/?quality=high");
await page.waitForTimeout(600);
for (const item of listS.split(",")) {
  const [id, p] = item.split(":");
  if (id === "intro") {
    await page.evaluate((t) => window.__sal.freeze(Number(t)), p);
    await page.waitForTimeout(500);
  } else {
    await page.evaluate(() => window.__sal.freeze(-1));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.evaluate(([i, q]) => window.__sal.jumpTo(i, Number(q)), [id, p]);
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${out}/${W}x${H}-${id}-${p}${reduced ? "-rm" : ""}.png` });
}
if (errs.length) console.log("CONSOLE:", errs.slice(0, 8));
await b.close();
