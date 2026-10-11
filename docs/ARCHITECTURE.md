# Architecture: frontend (site/)

Vite + React 18 + TypeScript strict + Tailwind v4 (layout utilities only) + Lenis. Static output under the base path
`/sentinel-anomaly-lab/` (no `portfolio/06-*/project.json` exists, so this is the default slug). No server, no external requests.

## Data flow

`site/public/data/*.json` (published by the Python pipeline) -> `src/data/loader.ts` (one store per file: initial, loading with
byte progress, ready, empty, error, retry) -> hand-written guards in `src/data/types.ts` -> `src/scenes/windows.ts` (u16 base64 to
Float64, z-score against the train spread, 61 s trailing median) -> composers (`src/scenes/*.ts`, pure: scene, progress, visitor
store and artifacts in, `Frame` out) -> `src/lens/draw.ts` (Canvas2D, two clip passes) and DOM labels.

Only `facts.json` and `meta.json` precede first paint. The hero slice, `channels.json` and `detector_eval.json` load right after;
`incidents.json` (165 KB gzip) is requested 400 ms after first paint and gates the S00 ignition (late data is shown late, never faked).
`meta.dataset.nature`, the channel count and the day count are inlined into `index.html` at build time (`vite.config.ts`).

## Modules

- `src/model/`: pure metric code with Vitest parity against `recompute_vectors.json` (17 cases) and the residual vector.
  `metrics.ts` (point, point-adjusted, event), `sweep.ts` (index lookups and the rise staircase), `residual.ts`, `quant.ts`,
  `scope.ts` and `ledgers.ts` (every ledger cell carries exactly one scope, SPLIT or WINDOW).
- `src/lens/`: the frame model (no angle field: the lens never rotates) and the renderer. All text is DOM.
- `src/scenes/director.ts`: the one fixed canvas; finds the active scene, composes, draws only when dirty.
  `viewport.ts` derives the D/C/T/M class from `matchMedia` (QA L1); the canvas box is measured separately.
- `src/scroll/engine.ts`: tracks, progress, instant chapter jumps, one rAF loop (`src/motion/loop.ts`).
- Scenes: `S01Signal` (static HTML in index.html plus a portal), `S02Source` ... `S08Close`, `ReplayScene` (normal flow, own
  `LensFigure` canvas). Under reduced motion every scene is normal flow and uses in-flow `LensFigure` canvases.

## Test hooks

`window.__sal`: `jumpTo`, `stores`, `classes`, `debug`, `labelBoxes`, `litAudit`, `freeze`, `introStats` (QA and evidence only).
