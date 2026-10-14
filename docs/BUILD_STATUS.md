# Build status: 06-sentinel-anomaly-lab

Owner of this file: orchestrator only.

| Phase | Status | Evidence |
|---|---|---|
| 01-13 Sources, contracts, data, detectors, evaluation | PASSED (orchestrator reran pytest 30/30; Zenodo licence field confirmed cc-by-4.0). Dataset is CATS v2 (SIMULATED), not SMD | dc0f41c..4d11c5d |
| 14-17 Creative direction | PASSED (The Lens) | |
| 18-30 Frontend build (P06-FE-001) | REVIEW (frontend agent): see rows below; independent QA not yet run | site/ commits on main |
| FE tsc / eslint / Vitest | PASSED (tsc strict, eslint 0, Vitest 43/43 incl. 17 metric vectors and residual vector) | `npm run typecheck && npm run lint && npm test` |
| FE Playwright | see handoff for the final count | `site/e2e/qa.spec.ts` |
| FE Lighthouse x3 | desktop perf 1.0, a11y 1.0, LCP 0.41 s; mobile perf 0.99, a11y 1.0, LCP 1.82 s, CLS 0, load 5-8 | `artifacts/evidence/fe-001/lighthouse/` |
| FE visual evidence | screenshots at 8 viewports + classic + reduced motion, contact sheets, frame pacing (headless, software raster) | `artifacts/evidence/fe-001/` |
