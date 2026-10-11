/**
 * QA lessons L1-L22 (docs/QA_LESSONS.md) and the P06 interaction checks. Production build only (tests/serve.mjs, port 4361).
 * These tests open their own browsers and viewports, so they run once (desktop project).
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { collisionScript } from "./collide";

const BASE = "http://localhost:4361/sentinel-anomaly-lab/";
const SCENES: [string, number][] = [["signal", 0], ["signal", 0.78], ["record", 0.14], ["record", 0.5], ["record", 0.8], ["normal", 0.1], ["normal", 0.55], ["normal", 0.8], ["detectors", 0.2], ["detectors", 0.4], ["detectors", 0.9], ["days", 0.1], ["days", 0.5], ["days", 0.7], ["days", 0.8], ["lab", 0.1], ["lab", 0.4], ["fine", 0.1], ["fine", 0.31], ["fine", 0.8], ["evidence", 0.05], ["evidence", 0.5], ["evidence", 0.95], ["replay", 0], ["close", 0.5], ["close", 0.9]];
const VIEWPORTS: [number, number][] = [[1440, 900], [1280, 720], [1024, 768], [768, 1024], [390, 844], [375, 812], [360, 800]];
const SCROLLBAR_CSS = "html { overflow-y: scroll; } ::-webkit-scrollbar { width: 15px; } ::-webkit-scrollbar-thumb { background: #555; }";
type W = { __sal: { jumpTo: (i: string, p?: number) => void; stores: Record<string, { set: (p: object) => void; get: () => Record<string, unknown> }>; classes: () => { js: string; css: string; clientWidth: number; innerWidth: number }; debug: () => { lens: { R: number } | null; scene: string }; introStats: () => { playing: boolean; minR: number; monotonic: boolean }; litAudit: () => { channel: string }[]; freeze: (t: number) => void } };

async function openAt(browser: Browser, w: number, h: number, o: { classic?: boolean; reduced?: boolean; route?: (ctx: import("@playwright/test").BrowserContext) => Promise<void> } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: o.reduced ? "reduce" : "no-preference", hasTouch: w < 1024, isMobile: w < 768 });
  if (o.classic) await ctx.addInitScript((css) => document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }), SCROLLBAR_CSS);
  if (o.route) await o.route(ctx);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => !!(window as unknown as W).__sal);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  return { ctx, page };
}
const go = async (page: Page, id: string, p: number) => { await page.evaluate(([i, q]) => (window as unknown as W).__sal.jumpTo(i as string, q as number), [id, p] as const); await page.waitForTimeout(800); };
const hits = async (page: Page, flow = false) => ((await page.evaluate(collisionScript({ ignoreChrome: flow }))) as { boxes: number; hits: string[] });
const real = async (page: Page, x: number, y: number) => { await page.mouse.click(x, y); };

test.describe("QA lessons", () => {
  test.describe.configure({ timeout: 600_000 });
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "own viewports"));

  test("every scene renders its heading and the page makes no external request and no console error", async ({ browser }) => {
    const bad: string[] = [];
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 });
      const page = await ctx.newPage();
      page.on("request", (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) bad.push(`external ${r.url()}`); });
      page.on("pageerror", (e) => bad.push(`pageerror ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") bad.push(`console ${m.text()}`); });
      await page.goto(BASE);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
      for (const id of ["signal", "record", "normal", "detectors", "days", "lab", "fine", "evidence", "replay", "close"]) {
        await go(page, id, id === "close" ? 0.9 : 0.5);
        const ok = await page.evaluate((i) => !!document.querySelector(`#${i} [data-scene-heading]`) , id);
        if (!ok) bad.push(`${w}: #${id} has no heading`);
      }
      await ctx.close();
    }
    expect(bad).toEqual([]);
  });

  const ROUTES: [string, number, string][] = [
    ["signal", 0.78, "window_142_hero.json"], ["record", 0.14, "window_142.json"], ["normal", 0.55, "window_142.json"], ["detectors", 0.33, "detector_eval.json"],
    ["days", 0.8, "overview.json"], ["lab", 0.4, "threshold_sweep.json"], ["fine", 0.31, "attribution.json"], ["evidence", 0.5, "attribution.json"],
    ["replay", 0, "window_142.json"], ["close", 0.9, "meta.json"],
  ];
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    test(`L4/L12 at ${w}: every consuming scene shows its own error with RETRY, a real pointer recovers it with one re-fetch`, async ({ browser }) => {
      const bad: string[] = [];
      for (const [id, p, file] of ROUTES) {
        let blocked = true, fetches = 0;
        const { ctx, page } = await openAt(browser, w, h, { route: async (c) => {
          await c.route(`**/data/${file}`, (r) => { if (blocked) void r.abort(); else { fetches++; void r.continue(); } });
        } });
        await go(page, id, p);
        await page.waitForTimeout(600);
        const alert = page.locator(`#${id} [role=alert]`).filter({ hasText: file.replace(".json", "").toUpperCase().replace(/_/g, "_") }).first();
        if (!(await alert.isVisible().catch(() => false))) { bad.push(`${id}: no visible alert for ${file}`); await ctx.close(); continue; }
        const btn = alert.locator("button").first();
        const box = await btn.boundingBox();
        if (!box) { bad.push(`${id}: no RETRY box`); await ctx.close(); continue; }
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const inView = cy > 0 && cy < h && cx > 0 && cx < w;
        const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("button")?.textContent ?? "", [cx, cy]);
        if (!inView || !/RETRY/.test(hit)) bad.push(`${id}: RETRY not hit-testable (${hit})`);
        blocked = false;
        const before = fetches;
        await real(page, cx, cy);
        await page.waitForTimeout(1500);
        if (fetches - before !== 1) bad.push(`${id}: ${fetches - before} re-fetches after RETRY`);
        if (await page.locator(`#${id} [role=alert]`).filter({ hasText: file.replace(".json", "").toUpperCase() }).count()) bad.push(`${id}: still failing after RETRY`);
        await ctx.close();
      }
      expect(bad).toEqual([]);
    });
  }

  for (const [w, h] of VIEWPORTS) {
    test(`L2/L11/L13/L19/L22 ${w}x${h}: whole-document collisions in default, toggles and reduced motion`, async ({ browser }) => {
      const all: string[] = [];
      const { ctx, page } = await openAt(browser, w, h);
      for (const [id, p] of SCENES) {
        await go(page, id, p);
        const r = await hits(page, id === "replay");
        all.push(...r.hits.map((x) => `${id}@${p}: ${x}`));
      }
      // every layer and mode toggle (L21)
      const toggles: [string, string, object][] = [
        ["normal", "normal", { view: "residual", zoom: 10, channel: "bfo2" }], ["normal", "normal", { view: "expected", zoom: 1, channel: "bed2" }],
        ["detectors", "detectors", { det: "gbm", op: "best_point_f1" }], ["detectors", "detectors", { det: "robust_z", op: "far_budget_1_per_day" }],
        ["days", "days", { det: "iforest", op: "best_point_f1", all58: true }], ["days", "days", { det: "gbm", op: "far_budget_1_per_day" }],
        ["lab", "lab", { det: "iforest", index: 10, split: "val", windowId: "168", touched: true }], ["lab", "lab", { det: "changepoint", index: 140, split: "test", windowId: "153", touched: true }],
        ["fine", "fine", { protocol: "event", attribution: "robust_z", scope: "test" }], ["fine", "fine", { protocol: "point", attribution: "pca" }],
      ];
      for (const [id, store, st] of toggles) {
        await go(page, id, id === "fine" ? 0.8 : 0.5);
        await page.evaluate(([s, v]) => (window as unknown as W).__sal.stores[s as string]!.set(v as object), [store, st] as const);
        await page.waitForTimeout(900);
        const r = await hits(page);
        all.push(...r.hits.map((x) => `${id}+${JSON.stringify(st)}: ${x}`));
        await page.evaluate(([s]) => (window as unknown as W).__sal.stores[s as string]!.set({ view: null, channel: null, det: s === "days" ? "pca" : "pca", op: s === "days" ? null : "best_event_f1", index: null, all58: false, protocol: null, touched: false, windowId: "142", split: "test", zoom: 3, attribution: "pca", scope: "all" } as object), [store] as const);
      }
      await ctx.close();
      expect(all).toEqual([]);
    });
  }

  for (const [w, h] of [[1280, 720], [768, 1024], [390, 844], [360, 800]] as const) {
    test(`reduced motion ${w}x${h}: scenes read top to bottom, nothing collides, no sideways scroll, figures paint (L5/L14/L15)`, async ({ browser }) => {
      const { ctx, page } = await openAt(browser, w, h, { reduced: true });
      const bad: string[] = [];
      for (const id of ["signal", "record", "normal", "detectors", "days", "lab", "fine", "evidence", "replay", "close"]) {
        const top = await page.evaluate((i) => { const s = document.getElementById(i)!; return s.getBoundingClientRect().top + scrollY; }, id);
        const height = await page.evaluate((i) => document.getElementById(i)!.offsetHeight, id);
        for (let y = top; y < top + height; y += h * 0.8) {
          await page.evaluate((yy) => scrollTo(0, yy), y);
          await page.waitForTimeout(250);
          for (const x of (await hits(page, true)).hits) bad.push(`${id}@${Math.round(y)}: ${x}`);
          const sw = await page.evaluate(() => document.documentElement.scrollWidth);
          if (sw > w) bad.push(`${id}: scrollWidth ${sw} > ${w}`);
        }
      }
      // L15: every in-flow figure has a size and painted pixels
      const figs = await page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>(".lens-fig__canvas")].map((c) => {
        const r = c.getBoundingClientRect();
        let n = 0;
        try { const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 97) if (d[i]) n++; } catch { /* tainted */ }
        return { w: r.width, h: r.height, n, cw: c.width };
      }));
      expect(figs.length).toBeGreaterThan(8);
      for (const f of figs) { if (f.w < 100 || f.h < 100 || f.n < 50) bad.push(`figure ${JSON.stringify(f)}`); }
      await ctx.close();
      expect(bad).toEqual([]);
    });
  }

  test("L19/L22: the DOM-generated collision helper catches an overlapping element with a class name nobody listed", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1280, 720);
    await go(page, "normal", 0.55);
    expect((await hits(page)).hits).toEqual([]);
    await page.evaluate(() => {
      const chip = document.querySelector("#normal .chip")!.getBoundingClientRect();
      const d = document.createElement("div"); d.className = "zz-never-listed"; d.textContent = "OVERPRINT";
      Object.assign(d.style, { position: "fixed", left: `${chip.left}px`, top: `${chip.top}px`, font: "16px monospace", zIndex: "50" });
      document.body.appendChild(d);
    });
    expect((await hits(page)).hits.some((c) => c.includes("OVERPRINT"))).toBe(true);
    // a fixed element over the nav is caught too (L22)
    await page.evaluate(() => { const n = document.querySelector(".nav-bar")!.getBoundingClientRect(); const d = document.createElement("p"); d.textContent = "FIXEDOVER"; Object.assign(d.style, { position: "fixed", left: `${n.left + 10}px`, top: `${n.top + 4}px`, font: "13px monospace", zIndex: "80" }); document.body.appendChild(d); });
    expect((await hits(page)).hits.some((c) => c.includes("FIXEDOVER"))).toBe(true);
    await ctx.close();
  });

  for (const [w, h] of [[1024, 768], [768, 1024]] as const) {
    test(`L1 ${w}x${h} with a forced classic scrollbar: JS class equals CSS class and nothing collides`, async ({ playwright }) => {
      const b = await playwright.chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
      const { ctx, page } = await openAt(b, w, h, { classic: true });
      const c = await page.evaluate(() => (window as unknown as W).__sal.classes());
      expect(c.innerWidth - c.clientWidth, "a classic scrollbar takes layout width").toBeGreaterThanOrEqual(15);
      expect(c.js).toBe(c.css);
      const bad: string[] = [];
      for (const [id, p] of SCENES) { await go(page, id, p); bad.push(...(await hits(page, id === "replay")).hits.map((x) => `${id}@${p}: ${x}`)); }
      await ctx.close(); await b.close();
      expect(bad).toEqual([]);
    });
  }

  for (const w of [360, 375, 390, 768]) {
    test(`L3/L7/L14 at ${w}: honesty chips visible, 11px floor, no sideways scroll against the configured width`, async ({ browser }) => {
      const { ctx, page } = await openAt(browser, w, w === 768 ? 1024 : 800);
      const bad: string[] = [];
      for (const [id, p] of SCENES) {
        await go(page, id, p);
        const r = await page.evaluate((sid) => {
          const root = document.getElementById(sid)!;
          const vis = (e: Element) => (e as HTMLElement).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && (() => { const b = e.getBoundingClientRect(); return b.width > 0 && b.bottom > 0 && b.top < innerHeight; })();
          const small = [...document.querySelectorAll("p, span, h2, h3, button, a, li, label, td, th, summary, dt, dd, option")].filter((e) => vis(e) && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11)
            .map((e) => `${e.tagName}:${e.textContent!.trim().slice(0, 24)} ${getComputedStyle(e).fontSize}`);
          const chips = [...root.querySelectorAll(".chip")].filter(vis).length + [...document.querySelectorAll("[data-nature]")].filter(vis).length;
          return { small, chips, sw: document.documentElement.scrollWidth };
        }, id);
        if (r.sw > w) bad.push(`${id}@${p}: scrollWidth ${r.sw} > ${w}`);
        if (r.small.length) bad.push(`${id}@${p}: <11px ${r.small.slice(0, 3).join(" | ")}`);
        if (r.chips === 0 && id !== "evidence") bad.push(`${id}@${p}: no visible honesty chip`);
      }
      await ctx.close();
      expect(bad).toEqual([]);
    });
  }

  test("L8/L9/L12: corner button clears the pill; every visible control is hit-testable and takes a real pointer", async ({ browser }) => {
    const bad: string[] = [];
    for (const [w, h] of [[390, 844], [360, 800], [768, 1024], [1440, 900]] as const) {
      const { ctx, page } = await openAt(browser, w, h);
      for (const [id, p] of [["normal", 0.55], ["detectors", 0.33], ["days", 0.8], ["lab", 0.4], ["fine", 0.31], ["fine", 0.8], ["replay", 0]] as const) {
        await go(page, id, p);
        const r = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("button, select, input, [role=radio], [role=tab]")].filter((c) => {
          const b = c.getBoundingClientRect();
          return c.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && b.width > 4 && b.top >= 0 && b.bottom <= innerHeight - 70 && b.left >= 0 && b.right <= innerWidth && !c.closest(".menu-panel, .sheet:not(.is-open)") && (() => { const l = c.closest(".inc-list"); if (!l) return true; const r = l.getBoundingClientRect(); return b.top >= r.top && b.bottom <= r.bottom; })();
        }).filter((c) => {
          const b = c.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
          const hit = document.elementFromPoint(x, y);
          return !(hit && (c.contains(hit) || hit.contains(c)));
        }).map((c) => (c.textContent || c.getAttribute("aria-label") || c.className).trim().slice(0, 24)));
        for (const x of r) bad.push(`${w} ${id}@${p}: control covered: ${x}`);
      }
      await ctx.close();
    }
    expect(bad).toEqual([]);
  });

  test("L17: the data table and the phone sheets close when the scene changes", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1440, 900);
    await go(page, "days", 0.8);
    const sum = page.locator("#days summary").first();
    const b = (await sum.boundingBox())!;
    await real(page, b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.locator("#days details[open]")).toHaveCount(1);
    await go(page, "lab", 0.4);
    await expect(page.locator("#days details[open]")).toHaveCount(0);
    await ctx.close();
    const m = await openAt(browser, 390, 844);
    await go(m.page, "lab", 0.4);
    const btn = m.page.locator("#lab").getByRole("button", { name: "CONTROLS" });
    const bb = (await btn.boundingBox())!;
    await real(m.page, bb.x + bb.width / 2, bb.y + bb.height / 2);
    await expect(m.page.locator("#lab-sheet.is-open")).toHaveCount(1);
    await go(m.page, "fine", 0.31);
    await expect(m.page.locator("#lab-sheet.is-open")).toHaveCount(0);
    await m.ctx.close();
  });

  test("L16: pixel-sampled contrast behind every tag, caption and readout is at least 4.5:1", async ({ browser }) => {
    const bad: string[] = [];
    for (const [w, h] of [[1440, 900], [390, 844]] as const) {
      const { ctx, page } = await openAt(browser, w, h);
      for (const [id, p] of [["signal", 0.78], ["normal", 0.55], ["detectors", 0.33], ["days", 0.8], ["lab", 0.4], ["fine", 0.31], ["fine", 0.8]] as const) {
        await go(page, id, p);
        const tg = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".chip, .note-line, .ledger__cap, .readout__row, .caveat, .ledger-line, .scene-kicker, .detcard__line, .sc-body, .strip-label")]
          .filter((e) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && !e.closest(".nav-bar, .menu-panel, .sheet:not(.is-open)")).map((e) => {
            const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
            return { t: (e.textContent ?? "").trim().slice(0, 24), x: r.left, y: r.top, w: r.width, h: r.height, color: cs.color };
          }).filter((b) => b.w > 4 && b.y >= 0 && b.y + b.h <= innerHeight && b.x >= 0 && b.x + b.w <= innerWidth));
        const st = await page.addStyleTag({ content: "*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}.nav-bar,.nav-pill,.corner-btn,.sal-footer{visibility:hidden!important}" });
        await page.waitForTimeout(100);
        const png = (await page.screenshot()).toString("base64");
        await st.evaluate((n) => (n as HTMLElement).remove());
        const low = await page.evaluate(async ([b64, boxes]) => {
          const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
          const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const x = c.getContext("2d")!; x.drawImage(im, 0, 0);
          const sx = im.width / innerWidth;
          const lum = (r: number, g: number, b: number) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
          const out: string[] = [];
          for (const b of boxes as { t: string; x: number; y: number; w: number; h: number; color: string }[]) {
            const d = x.getImageData(Math.round(b.x * sx), Math.round(b.y * sx), Math.max(1, Math.round(b.w * sx)), Math.max(1, Math.round(b.h * sx))).data;
            const ls: number[] = [];
            for (let i = 0; i < d.length; i += 16) ls.push(lum(d[i]!, d[i + 1]!, d[i + 2]!));
            ls.sort((a, b2) => a - b2);
            const bg = ls[Math.floor(ls.length * 0.95)] ?? 0;
            const m = b.color.match(/[\d.]+/g)!.map(Number);
            const a = m[3] ?? 1;
            const fg = lum(m[0]!, m[1]!, m[2]!) * a + bg * (1 - a);
            const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
            if (ratio < 4.5) out.push(`${b.t} ${ratio.toFixed(2)}`);
          }
          return out;
        }, [png, tg] as const);
        for (const l of low) bad.push(`${w} ${id}@${p}: ${l}`);
      }
      await ctx.close();
    }
    expect(bad).toEqual([]);
  });

  for (const reduced of [false, true]) {
    test(`axe: zero violations across scenes (${reduced ? "reduced motion" : "motion"})`, async ({ browser }) => {
      const { ctx, page } = await openAt(browser, 1440, 900, { reduced });
      const out: string[] = [];
      for (const [id, p] of [["signal", 0.78], ["record", 0.14], ["normal", 0.55], ["detectors", 0.33], ["days", 0.8], ["lab", 0.4], ["fine", 0.31], ["fine", 0.8], ["evidence", 0.5], ["replay", 0], ["close", 0.9]] as const) {
        await go(page, id, p);
        const r = await new AxeBuilder({ page }).analyze();
        for (const v of r.violations) out.push(`${id}@${p}: ${v.id} ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
      }
      await ctx.close();
      expect(out).toEqual([]);
    });
  }
});

test.describe("interactions and numbers", () => {
  test.describe.configure({ timeout: 300_000 });
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "own viewports"));

  test("intro: SKIP visible at 100 ms, nav within 400 ms of the click, lens radius never decreases, lit channels are PCA's top 3", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForTimeout(150);
    await expect(page.getByRole("button", { name: "SKIP INTRO" })).toBeVisible();
    await expect(page.locator("[data-nature]")).toContainText("SIMULATED");
    await expect(page.locator(".chip--synthetic").first()).toBeVisible();
    await page.waitForTimeout(3600);
    const st = await page.evaluate(() => (window as unknown as W).__sal.introStats());
    expect(st.monotonic).toBe(true);
    await page.getByRole("button", { name: "SKIP INTRO" }).click();
    await page.waitForTimeout(450);
    await expect(page.locator(".nav-bar.is-fixed")).not.toHaveClass(/is-hidden/);
    const lit = await page.evaluate(() => [...new Set((window as unknown as W).__sal.litAudit().map((l) => l.channel))].sort());
    expect(lit).toEqual(["bfo2", "bso3", "cso1"]);
    await ctx.close();
  });

  test("S05: the slider only lands on real steps, split ledger equals detector_eval at the notch, window ledger recomputes", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1440, 900);
    await go(page, "lab", 0.5);
    const slider = page.locator("#lab").getByRole("slider", { name: "Threshold" });
    const box = (await slider.boundingBox())!;
    const lens = await page.evaluate(async () => { const r = await fetch("data/threshold_sweep.json"); return (await r.json()).detectors.pca.thresholds_q as number[]; });
    for (const f of [0.1, 0.33, 0.5, 0.9]) {
      await real(page, box.x + 8 + (box.width - 16) * f, box.y + 20);
      const t = await slider.getAttribute("aria-valuetext");
      const q = Number(/^q (\d+)/.exec(t ?? "")?.[1]);
      expect(lens).toContain(q);
    }
    await page.locator("#lab").getByRole("button", { name: "RESET" }).click();
    await page.waitForTimeout(400);
    const txt = await page.locator("#lab .ledger--split").innerText();
    expect(txt).toContain("0.47");
    expect(txt).toContain("0.82");
    expect(txt).toContain("41 OF 67");
    const win = await page.locator("#lab .ledger--win").getAttribute("data-scope");
    expect(win).toBe("WINDOW");
    await ctx.close();
  });

  test("scope guard: every ledger cell carries exactly its ledger's scope", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1440, 900);
    for (const [id, p] of [["lab", 0.5], ["replay", 0]] as const) {
      await go(page, id, p);
      const bad = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".ledger")].flatMap((l) => [...l.querySelectorAll<HTMLElement>(".ledger__cell")].filter((c) => c.dataset.scope !== l.dataset.scope).map((c) => c.textContent)));
      expect(bad).toEqual([]);
    }
    await ctx.close();
  });

  test("S06: window 153 shows 2 flagged seconds and 700 counted; protocols step; the caveat and wording are always visible", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1440, 900);
    await go(page, "fine", 0.31);
    await expect(page.locator("#fine .readout")).toContainText("2 SECONDS FLAGGED · 700 COUNTED AS CAUGHT");
    await expect(page.locator("#fine .caveat").first()).toContainText("POINT-ADJUSTED SCORES COUNT A WHOLE LABELLED SEGMENT");
    await go(page, "fine", 0.8);
    await expect(page.locator("#fine .caveat").first()).toContainText("CONTRIBUTING MEASUREMENTS, NOT CAUSES");
    await ctx.close();
  });

  test("REPLAY: play advances the playhead, truncated badge on 168/138/135 only, ATTRIBUTION disabled for IF, RESET restores", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1440, 900);
    await go(page, "replay", 0);
    const items = await page.locator("#replay .inc-item").evaluateAll((els) => els.map((e) => ({ t: e.textContent ?? "", trunc: !!e.querySelector(".badge") })));
    expect(items.filter((i) => i.trunc).map((i) => i.t.slice(0, 3)).sort()).toEqual(["135", "138", "168"]);
    await page.locator("#replay").getByRole("button", { name: "PLAY", exact: true }).click();
    await page.waitForTimeout(1500);
    const ph = await page.evaluate(() => (window as unknown as W).__sal.stores.replay!.get().playhead as number);
    expect(ph).toBeGreaterThan(5);
    await page.locator("#replay").getByRole("tab", { name: "IF" }).click();
    await expect(page.locator("#replay").getByRole("radio", { name: "PCA", exact: true })).toHaveAttribute("aria-disabled", "true");
    await page.locator("#replay").getByRole("button", { name: "RESET" }).click();
    const s = await page.evaluate(() => (window as unknown as W).__sal.stores.replay!.get());
    expect(s.det).toBe("pca");
    expect(s.playhead).toBe(0);
    await ctx.close();
  });

  test("L18: during a detector change in S05 every frame's slider read-out names a step of the selected detector", async ({ browser }) => {
    const { ctx, page } = await openAt(browser, 1440, 900);
    await go(page, "lab", 0.5);
    const sweep = await page.evaluate(async () => (await (await fetch("data/threshold_sweep.json")).json()).detectors as Record<string, { thresholds_q: number[] }>);
    await page.evaluate(() => {
      const w = window as unknown as { __frames: { det: string; q: number }[] };
      w.__frames = [];
      const t0 = performance.now();
      const f = () => {
        const sel = document.querySelector("#lab [role=tab][aria-selected=true]")?.textContent ?? "";
        const q = Number(/^q (\d+)/.exec(document.querySelector("#lab .slider-read")?.textContent ?? "")?.[1]);
        w.__frames.push({ det: sel, q });
        if (performance.now() - t0 < 1500) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await page.locator("#lab").getByRole("tab", { name: "GBM" }).click();
    await page.waitForTimeout(1700);
    const frames = await page.evaluate(() => (window as unknown as { __frames: { det: string; q: number }[] }).__frames);
    const code: Record<string, string> = { RZ: "robust_z", PCA: "pca", IF: "iforest", CP: "changepoint", GBM: "gbm" };
    expect(frames.length).toBeGreaterThan(20);
    for (const f of frames) {
      const d = code[f.det.replace(/[^A-Z]/g, "")];
      if (d && Number.isFinite(f.q)) expect(sweep[d]!.thresholds_q, `${f.det} q ${f.q}`).toContain(f.q);
    }
    await ctx.close();
  });
});
