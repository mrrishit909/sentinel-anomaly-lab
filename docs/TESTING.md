# Testing (data and analytics)

`uv run pytest -q` (42 tests, about 35 s; data-dependent tests skip with a reason if `data/raw` and `data/processed` are absent; run `uv run python -m pipelines.run_all` first).

| File | What it proves |
|---|---|
| `tests/test_metrics.py` | Hand-computed toy cases: perfect, empty, all-flagged, point-adjust inflation (10 of 100 points flagged gives recall 0.1 vs 1.0), merge gap boundary at 30/31, tolerance boundary at 59/60, false alerts per day, event vs point, and 25 random series vs an independent plain-loop reference |
| `tests/test_parity.py` | `recompute_vectors.json` equals the independent plain-loop implementation in `tests/ref_metrics.py` (the browser must reproduce the same numbers); window score decoding and label alignment; sweep monotonicity and consistency with split sizes; quantization round trip |
| `tests/test_pipeline.py` | Label alignment with the index base verified (metadata end is exclusive; inclusive reading mismatches 200 rows); 22 data-quality checks; train-only fitting (corrupting val/test data leaves train statistics unchanged); feature causality (changing future rows leaves past features unchanged); threshold leakage (permuting test labels leaves thresholds unchanged, changing val labels changes them); GBM fitted before val; unsupervised scores recompute from X alone; attribution ranks |
| `tests/test_artifacts.py` | Every artifact validates against its JSON Schema; each under 400 KB gzip; no U+2014 or U+2015 characters anywhere; honesty tags valid and telemetry never tagged OBSERVED; licence and attribution text present; operating points lie on the sweep grid and equal the sweep rows; point-adjusted recall >= point recall; facts equal the evaluation artifact; attribution wording; best detectors beat chance by 3x |
| `tests/test_requests.py` | DR-1 to DR-7: resid scale equals the pipeline's and the `zres_window_142` vector equals an independent numpy median; `rise` rebuilds `ev_detected` and `delay_median_s` for every sweep threshold, and every `detection_by_op`; alert runs reproduce `alerts` and `false_alerts` counts and the tolerance rule; fact additions; category 13 window; hero slice equals the window prefix; per-second contributions reproduce `incidents[].attribution.top3` |

Site-side checks (Vitest parity against `recompute_vectors.json`, Playwright, axe) are owned by the site track.

## Frontend (P06-FE-001)

Run from `site/`: `npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run build`, then `node tests/serve.mjs` (port 4361) and
`npx playwright test` (one worker). Production build only.

| Suite | What it proves |
|---|---|
| `src/model/model.test.ts` | metric parity with all 17 `recompute_vectors` cases, residual parity (`zres_window_142`), sweep lookups equal `detector_eval` at each operating point, detection rebuilt from the rise staircase at every sweep step, window 153 recount (2 flagged, 700 counted), hero slice equals window 142 |
| `src/data/copy.test.ts` | no U+2014/U+2015, no causal wording about attribution, no real-telemetry or live claims, S01 copy bound to facts, provenance inlined in the built HTML |
| `e2e/qa.spec.ts` | per-scene render and zero external requests; route-block RETRY for every consuming scene at 1440 and 390 with a real pointer; DOM-generated whole-document collision walk (fixed nav, pill, corner buttons, footer, canvas label hooks are DOM) at 1440x900, 1280x720, 1024x768, 768x1024, 390x844, 375x812, 360x800 in default, every toggle and reduced motion; planted unlisted-class and fixed-over-nav fixtures; forced 15 px classic scrollbar (L1); overflow against the configured width; reduced-motion figures sized and painted (L15); control hit-testing (L9/L12); panels close on scene change (L17); pixel-sampled contrast (L16); axe in both motion modes; intro, lab, S06 counts, REPLAY, L18 swap frames |
| `tests/evidence.mjs` | screenshots at 8 viewports, classic scrollbar and reduced-motion runs, scroll recordings with contact sheets, frame pacing |

Harness notes: `e2e/collide.ts` builds boxes from the DOM; under reduced motion the fixed nav is excluded because normal-flow content
scrolls beneath it by design. Playwright's bundled ffmpeg has no `fps`/`scale` filters, so contact sheets are tiled from screenshots taken during the recorded scroll.
