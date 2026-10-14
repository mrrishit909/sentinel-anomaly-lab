import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { art } from "../model/testdata";
import { COPY } from "./copy";
import type { Facts, Meta, DetectorEvalFile } from "./types";

const root = join(__dirname, "../..");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
const src = files(join(root, "src")).filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f));
const copyFiles = src.filter((f) => /scenes\/.*\.tsx$|data\/copy\.ts$|components\/.*\.tsx$/.test(f)).concat(join(root, "index.html"));
/** string-literal and JSX text lines only: comments are not copy */
const copyLines = (f: string) => readFileSync(f, "utf-8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

describe("copy rules (VISUAL_DESIGN 5 and rejection criteria)", () => {
  it("no U+2014 or U+2015 anywhere in the site source or index.html", () => {
    for (const f of [...src, join(root, "index.html")]) expect(readFileSync(f, "utf-8"), f).not.toMatch(/[—―]/);
  });
  it("no causal verbs about attribution outside the negation, the dataset column name and the exempt objection", () => {
    for (const f of copyFiles) for (const l of copyLines(f)) {
      for (const m of l.matchAll(/\bcaus(?:e|ed|es|al|ing)\b/gi)) {
        const before = l.slice(Math.max(0, m.index! - 8), m.index!);
        const ok = /not\s$/i.test(before) || /root_$/i.test(before) || /CAUSED IT\?/.test(l) || /causal/i.test(m[0]) || /look-ahead|CAUSAL VERSION/i.test(l);
        expect(ok, `${f}: ${l.trim().slice(0, 120)}`).toBe(true);
      }
    }
  });
  it("never claims real telemetry, production or live inference", () => {
    for (const f of copyFiles) for (const l of copyLines(f)) {
      for (const m of l.matchAll(/real telemetry/gi)) expect(/(not|than)\s+real telemetry/i.test(l.slice(Math.max(0, m.index! - 7), m.index! + 14)), `${f}: ${l.trim().slice(0, 100)}`).toBe(true);
      expect(l, f).not.toMatch(/"[^"]*\b(production|real-time|monitoring now)\b[^"]*"/i);
      expect(l, f).not.toMatch(/>\s*[^<{]*\b(LIVE|real-time)\b[^<]*</);
    }
  });
  it("'server' and 'SMD' appear only in the S07 exchange 1 copy", () => {
    for (const f of copyFiles) {
      if (/S07Evidence/.test(f)) continue;
      for (const l of copyLines(f)) expect(l, f).not.toMatch(/\bserver\b|\bSMD\b/i);
    }
  });
  it("the S01 cards and statement are bound to facts (numbers equal the artifact)", () => {
    const facts = art<Facts>("facts.json");
    const c1 = COPY.card1(facts), c2 = COPY.card2(facts);
    expect(c1.body).toContain("CAUGHT 41 OF 67");
    expect(c1.body).toContain("0.14 FALSE ALERTS A DAY");
    expect(c2.body).toContain("18.6X APART");
    expect(COPY.statementS01(facts)).toMatch(/^Seventeen measurements/);
    expect(COPY.kickerS01(facts)).toContain("96.2%");
  });
  it("built index.html inlines meta.dataset.nature exactly (ED #32)", () => {
    const p = join(root, "dist/index.html");
    if (!existsSync(p)) return;
    const html = readFileSync(p, "utf-8");
    const meta = art<Meta>("meta.json");
    expect(html).toContain(meta.dataset.nature.toUpperCase());
    expect(html).toContain("SYNTHETIC");
  });
  it("thresholds quoted in copy come from detector_eval (PCA best event F1 = 19938)", () => {
    const ev = art<DetectorEvalFile>("detector_eval.json");
    expect(ev.detectors.pca.points.best_event_f1.threshold_q).toBe(19938);
  });
});
