/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ED #32: the SYNTHETIC statement and meta.dataset.nature are on screen from the first S00 frame, so they cannot
 * wait for a fetch. They are inlined into index.html at build time from the published meta.json / facts.json
 * (a Vitest test asserts the built text equals the artifact).
 */
function inlineProvenance(): Plugin {
  return {
    name: "inline-provenance",
    transformIndexHtml(html) {
      const data = (f: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, "public/data", f), "utf-8"));
      const meta = data("meta.json"), facts = data("facts.json").values;
      const v: Record<string, string> = {
        INCIDENT: String(meta.hero_window.source_window),
        DAYS_N0: String(Math.round(Number(facts.days.value))),
        PROV: JSON.stringify({ days: Number(facts.days.value), channels: Number(facts.channels.value), nature: meta.dataset.nature, incident: meta.hero_window.source_window }),
        NATURE: String(meta.dataset.nature).toUpperCase(),
        CHANNELS: String(facts.channels.value),
        DAYS: Number(facts.days.value).toFixed(1),
        HZ: String(meta.dataset.hz),
        VERSION: String(meta.dataset.version),
      };
      return html.replace(/%%(\w+)%%/g, (_, k: string) => v[k] ?? `%%${k}%%`);
    },
  };
}

export default defineConfig({
  base: "/sentinel-anomaly-lab/",
  // no SPA fallback: a missing artifact is a real 404, as on GitHub Pages
  appType: "mpa",
  plugins: [react(), tailwindcss(), inlineProvenance()],
  build: { target: "es2022", sourcemap: false },
  preview: { port: 4361, strictPort: true },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
