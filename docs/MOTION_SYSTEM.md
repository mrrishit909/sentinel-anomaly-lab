# Motion system: Sentinel Anomaly Lab

This is the phase 17 motion bible. It pairs with `VISUAL_DESIGN.md`, and all references point there:

- scene ids S00-S08 and REPLAY
- lens states L0 (giant), L1 (aside), L2 (normal), L3 (detectors), L4 (days), L5 (lab), L6 (fine print) and L7 (replay)
- interaction numbers 1-11

Every value here is binding for the frontend engineer. A deviation needs a written reason in `docs/ENGINEERING_DECISIONS.md` (the orchestrator owns that file).

## Contents

1. [Global principles and the six motion layers](#1-global-principles-and-the-six-motion-layers)
2. [Hard rules](#2-hard-rules)
3. [Token mapping](#3-token-mapping)
4. [The scroll engine and the lens model](#4-the-scroll-engine-and-the-lens-model)
5. [Animation specifications](#5-animation-specifications)
6. [Navigation, chapter jumps, interruption](#6-navigation-chapter-jumps-interruption)
7. [Operational state motion](#7-operational-state-motion)
8. [Reduced motion](#8-reduced-motion)
9. [Performance budgets and rendering](#9-performance-budgets-and-rendering)
10. [Technical stack recommendation](#10-technical-stack-recommendation)
11. [Motion test plan](#11-motion-test-plan)

---

## 1. Global principles and the six motion layers

1. **Motion performs the analysis. Nothing moves to decorate.** Every motion is the visible form of an analytical operation:

   | Motion | Operation |
   |---|---|
   | The record *writes* (strands ink on, left to right) | Loading a time-ordered record |
   | The lens *focuses* (magnification and ridges come up) | Looking closer: the detector's view of a stretch of time |
   | The lens *travels* along time | Reading the record second by second |
   | Expected paths *appear* | The detector's model of normal |
   | The residual *ignites* | An alert above a val-chosen threshold, on its top contributing measurements |
   | Normal *collapses* to the baseline (RESIDUAL view) | Subtracting the expected |
   | Time *pulls back* (seconds to days) | From one incident to the whole record |
   | The hairline *slides* | Choosing a threshold |
   | Orange *paints* across a span | Point-adjust scoring |
   | A span *collapses* to one tick | Event-level scoring |

2. **Along time, never around.** Everything moves horizontally (along time) or changes scale. Nothing rotates, nothing sweeps around a centre, and nothing travels along the lens's circumference. Radar, rings and sweeps are banned for P06 (VISUAL_DESIGN 0). P01 owns the stepping dial and P07 owns travelling nodes on an arc.
3. **Two motion modes,** from the reference:
   - **Scrubbed.** A pure function of scroll progress, reversible and stateless: lens camera moves, lens travel in S03a, the S04 pull-back, card decks, word reveals.
   - **Stepped.** A threshold triggers a timed, retargetable transition: VIEW steps, detector steps, operating-point steps, protocol steps, argument cards, the echo.
4. **Data is shown only at real states.**
   - Every strand is a published or recomputed series; every threshold is a published `thresholds_q` step or a val operating point.
   - **Metric numerals never tween.** A number on screen is the measurement of one real threshold, so a change is a 120ms crossfade between two real values. A count-up through numbers that belong to no threshold would be a fabrication.
   - **Strands never morph between two series.** Changing a detector or a window is a crossfade (200ms) between two real strand sets, never a point-wise interpolation of their shapes.
   - **The hairline moves continuously while dragged,** but it snaps to the nearest sweep step on every frame, and the lit seconds and ledgers always correspond to the snapped step.
5. **Never fake live.** Strands never drift by themselves as if streaming. Only REPLAY's play state advances the playhead, and it is labelled `REPLAY OF SIMULATED DATA · ×{{speed}}`.
6. **One luminous form at a time:**
   - In S00 and S08 it is the giant lens (L0) with its lit residual and glow.
   - From S01 to REPLAY it is the lens at scene size, or the 58-day strip with its riding lens (S04). In S02 it dims to 20%, and in S07 to 15%, behind the cards.
7. **Slow structure, quick data.** Lens camera moves take 800-1200ms or are scrubbed. Strand crossfades take 200ms, ignition 600ms, the paint 600ms, and numerals switch in 120ms.
8. **Keyed continuity:**
   - every strand by `channel id` (telemetry and context) or `detector id` (score strands)
   - every incident tick by `incident id`
   - every threshold by `(detector, index)`
   - every window by `id`

   Keyed things keep their position and identity across a change. They never swap identity in a crossfade.
9. **Settle, don't bounce.** There is no overshoot on data marks. Springs (damping ratio 1.0 or more) are allowed only on bottom sheets.
10. **The visitor always wins.** Any input retargets or completes an animation immediately. Nothing queues and nothing blocks scroll.

### The six motion layers (directive requirement)

| Layer | Where it lives | Spec |
|---|---|---|
| 1. Intro | S00 The Focus: the record writes, the lens focuses, the expected paths appear, the residual ignites, the headline and the nav | 5.1 |
| 2. Navigation transitions | Bottom bar active block, MENU pill, chapter jumps with a stage fade, focus moves | 6 |
| 3. Scroll storytelling | Lens camera moves, lens travel (S03a), detector steps (S03b), the pull-back (S04), the lab tour (S05), protocol steps (S06), the echo (S08) | 4, 5.3-5.9, 5.13 |
| 4. Component interaction | Segmented controls, the threshold hairline drag, the lens drag, listboxes, the inspector, bottom sheets, the REPLAY rail and play bar | 5.8, 5.12, 5.14 |
| 5. Data transitions | Strand crossfades, ignition and extinguish, the paint and the collapse, caught/missed tick switches, LOD switch, numeral crossfades | 5.5-5.10 |
| 6. Microinteractions | Hover, press and focus on squares and chips, tooltips, alert markers dropping, ✓ marks, the RESET confirmation | 5.12, 5.14, 7 |

## 2. Hard rules

Each rule is checked in QA.

| Rule | Test |
|---|---|
| **LCP:** `h1[data-hero]` is in the HTML and painted from first paint as ghost text (opacity 0.55, `filter: blur(12px)`, ENGINEERING_DECISIONS #10), never at opacity 0. The display font is preloaded, with a metric-matched fallback. The canvas is created after first paint | Lighthouse: the LCP element is `h1[data-hero]`, LCP is 2.5s or less and CLS is 0.1 or less (mobile and desktop presets) |
| **Nothing heavy on the LCP path.** First paint needs only `facts.json` (2.1 KB gz) and `meta.json` (2.1 KB gz). The hero window loads right after first paint (9.3) | A Lighthouse waterfall shows no window, sweep or overview request before FCP |
| **No numeral tween, no strand morph.** Numerals crossfade between two real values. Strands crossfade between two real series | Vitest on the numeral component: no rendered value outside the set {old, new}. Debug hook: during a detector change, every drawn strand equals one of the two series (sampled 10 frames) |
| **Lit means alerted.** At every frame, every lit second satisfies `q ≥ threshold_q` for the active detector, and every lit channel is in that detector's ranking (VISUAL_DESIGN 0) | Debug hook `__sentinel.lit()` returns `{channel, second, q, threshold}` for all lit seconds; Playwright asserts the rule at S00 end, S03b each step, S05 three notches and REPLAY default |
| **Along time only.** No rotation transform on any element, and no angle parameter in the lens model | Grep finds no `rotate(` in `src/lens` and `src/scenes`; the lens model's type has no angle field |
| Animate only `transform`, `opacity` and `filter` (at most 14 word spans at once) in the DOM. The canvas draws its own pixels. Never animate layout properties or `backdrop-filter` | A DevTools trace shows no Layout events inside scrubbed frames |
| **One `requestAnimationFrame` loop** owns everything: Lenis, progress, tweens, REPLAY playback and the canvas draw | Grep finds one `requestAnimationFrame` call site (`src/motion/loop.ts`) |
| **Snapped thresholds.** The displayed threshold is always a member of `thresholds_q[detector]` | Vitest on the slider model; Playwright drags the hairline through 40 positions and checks each `aria-valuetext` |
| No artificial delays, no fake progress, no fake spinner | Code review: no `setTimeout` gates any data display |
| No drawing on hidden stages. The canvas redraws only when dirty (progress changed, a transition is active, REPLAY is playing, a drag is active) | Playwright: with S07 centred, the canvas frame counter is flat for 2s once the cards settle |

## 3. Token mapping

| Token | Value | Used for |
|---|---|---|
| `--motion-fast` | 200ms | Nav hover (reference `0.2s ease-in-out`), tooltips, **strand crossfades** (detector, window, VIEW), legend swaps, pill label swap. Numerals use a shorter 120ms crossfade (a measurement swap, not a transition) |
| `--motion-standard` | 350ms | Argument card stack (reference `all .35s ease-in-out`), intro completion on input, chapter-jump stage fade, segmented active block, inspector exit, operating-point hairline settle |
| `--motion-panel` | 600ms | **Ignition** and extinguish, **the paint** (PA flood), the event collapse, caught/missed tick switches, inspector enter, data entering after load, the unwrite in S08 |
| `--motion-card` | 800ms | Story-card settle, lens state moves on a jump or a non-scrubbed change, the lens refocus in S08 |
| `--motion-scene` | 1200ms | **Lens record writing** (S00, S08), lens focus in S00, detector-step settles in S03b (the reference's `transform 1.2s cubic-bezier(.33,1,.68,1)`) |
| `--ease-premium` `cubic-bezier(.5,0,0,1)` | | Entrances and departures: cards, nav enter, inspector, the record writing |
| `--ease-symmetric` `cubic-bezier(.5,0,.5,1)` | | Every scrubbed interpolation (lens camera, S03a travel, the pull-back), so reverse scroll feels identical |
| `--ease-smooth` `cubic-bezier(.33,1,.68,1)` | | Stepped settles: ignition, the paint, hairline settles, word sharpening, the S00 focus |
| `linear` | | Story progress segments, REPLAY playback (time is linear), loading percentages (no easing on measurements) |
| `ease-in-out` | | Nav hover only (matches the reference) |

These all fall inside the directive's ranges:

| Directive category | Directive range (ms) | Our value (ms) |
|---|---|---|
| Hover | 120-250 | 200 |
| Buttons | 150-300 | 200-350 |
| Panels | 250-600 | 350-600 |
| Charts | 400-1000 | 600-800 (numerals: a 120ms swap by rule 4) |
| Section transitions | 700-1800 | 800-1200 |
| Cinematic | 1000-3000 | 1200, plus the 4.6s composite intro |

## 4. The scroll engine and the lens model

Reuse the app shell already ported through P01-P05 (`site/src/motion`, `scroll`, the loader and the nav). Do not rebuild it.

**The scroll engine:**

- **Tracks.** A `<section>` with the track height from VISUAL_DESIGN 3.1, and a sticky `100dvh` stage inside it. Progress is `p = clamp((scrollY - trackTop) / (trackHeight - innerHeight), 0, 1)` from Lenis's value, with geometry cached and re-measured on resize.
- **Active set.** Only the scene at the viewport centre and the next scene receive `update(p, dt)`. The single canvas is shared by every scene except S07's cards. Each frame it draws only the active scene's state.
- **Scrubbed** functions take the form `s = ease((p - a) / (b - a))`, clamped. They hold no state.
- **Stepped** thresholds use **hysteresis ±0.02**.
- **Lenis:** `lerp 0.1` on D, native touch scroll on T/M (`syncTouch: false`), and off under reduced motion.

**The lens model** (`src/lens/model.ts`):

- **State.** `Lens = {cx, cy, R, Mt, Ma, f, glass, ridge}`. There is no angle. A camera move interpolates `cx, cy` linearly and `R, Mt` in log space (VISUAL_DESIGN 3.3). `glass` (0-0.065) and `ridge` (0-1) are opacities.
- **Mapping.** Outside: `x(t) = x0 + t × pxPerS`, `y = baseline_k − z × A_out`. Inside: `x(t) = cx + (t − f) × pxPerS × Mt`, `y = baseline_k − z × A_out × Ma`. The **focus clamp** keeps `f ± R / (pxPerS × Mt)` inside `[0, n)`.
- **Series.** Every strand is a `Float32Array` per channel (decoded once from u16 per window, in a worker for windows over 2,000 rows). Detector scores stay in `q` units (Uint16Array) and are mapped through the scene's amplitude.
- **Decimation.** For each device-pixel column, the strand draws the min and max of the seconds in that column (an M4-style reduction), cached per `(window, pxPerS, Mt)` and recomputed only when the scale changes. A 2,600 s window at 1440px and the 58-day record (8,334 bins) both draw at most 2 × width points.
- **Lit set.** `lit(t, k) = q_active[t] ≥ T && k ∈ top3(detector, incident)` (DR-4 per second when published). The lit set is computed once per (window, detector, threshold) as run-length spans, not per frame.
- **Retargeting.** A new lens target mid-move starts from the current interpolated values. No queue.

## 5. Animation specifications

Format for each entry:

- **Trigger**
- **Initial → End**
- **Duration / Easing**
- **Sync** (scrubbed or stepped)
- **Interruption**
- **Input**
- **Reduced motion**
- **Performance**

### 5.1 S00 intro: "The Focus" (4.6s total)

| Time (ms) | What happens | Duration / easing |
|---|---|---|
| 0 | Black. Layer order is **canvas, then scrim, then h1**. The left scrim (D) or band scrim (T/M) is present at full strength from frame 0, black on black. `h1[data-hero]` sits **above** the scrim and is visible from first paint as ghost text (0.55, blur 12px). SKIP INTRO is visible (bottom right) | n/a |
| 200-500 | Corner labels fade in: `SENTINEL ANOMALY LAB` top-left; `CATS V2 · 17 CHANNELS · 1 HZ · 57.9 DAYS` and the `meta.dataset.nature` line top-right. The SYNTHETIC chip appears bottom-left **now**, before any data is drawn | 300ms premium |
| 400-1600 | **The record writes.** The 10 telemetry strands of window 142 ink on from x 0 to the right edge (a clip that advances with time, all strands together), 1px white at 30%. Channel labels fade in at the left | 1200ms premium |
| 1600-2400 | **The lens focuses** at full L0 position and radius from its first frame: `glass` 0 → 0.065, `Mt` 1 → 3 (D; 1 → 6 on M), `Ma` 1 → 2, ridge fills 0 → 1. As `Mt` rises, the strands inside the circle stretch about the focus second, and the circle's edge appears as the discontinuity grows. **The lens never grows from a point, and its radius does not animate** | 800ms smooth |
| 2400-2900 | Expected paths (dotted, 50%) draw inside the lens for the three channels in PCA's top 3, left to right within the lens | 500ms premium |
| 2900-3500 | **Ignition.** From the first second where PCA's `q ≥ threshold_q` (best_event_f1, val), the residual fill grows from the expected path to the measured path: `bfo2` (rank 1, intensity 1.0) at 2900, `cso1` (0.75) at 3020, `bso3` (0.5) at 3140. Each measured line turns 2px orange. The glow passes come up | 600ms smooth each, 120ms stagger |
| 3400-4100 | The headline sharpens word by word (5.2, time-based, 80ms stagger). The 11px lit-rule line appears under the chip | 700ms premium |
| 4100-4600 | Nav enters (translateY 16px to 0, opacity) | 400ms premium |

- **What it is not.** No radial growth, no ring, no sweep, no rotation, no strand scrolling by itself. Nothing lights before the detector's alert second.
- **Interruption.** Any wheel, touch-scroll, key or SKIP completes to the end state within 350ms: the write clip opens fully, the lens snaps to its L0 values, and ignition completes. Re-entry within the session starts at the end state.
- **Reduced motion.** The end state renders at once. REPLAY INTRO plays the 0ms version.
- **Performance.** During the write, each frame draws the strands up to the clip x (decimated). During focus, the outside and inside passes are redrawn per frame (two clips). After 3500ms, the frame is static and the canvas stops drawing.

### 5.2 Word blur reveal (S00 headline, S01 statement, S08 paragraph, statement swaps)

As P01-P05 5.2: words go from ghost (0.55, blur 12px) to sharp (1, 0px), with at most 14 spans animating `filter` at once.

- Scrubbed in S01 and S08: each word owns a p sub-range.
- Time-based in S00: 80ms stagger, 350ms per word, smooth.
- **Statement swaps** (S05, S06): the old line exits (opacity to 0, y −8px, 350ms premium) and the new one reveals.

### 5.3 Lens camera moves (L0 → L1 → L2 → L3 → L4 → L5 → L6, L7, and back to L0)

- **Trigger:** scene progress windows (VISUAL_DESIGN 3.4), or a jump.
- **Interpolation.** `cx, cy` linear; `R` and `Mt` in **log space**. The DOM channel labels re-place each frame (10-17 labels, cheap).
- **Sync:** scrubbed, symmetric (S01 0-0.4, S02 final 15%, S03a 0.92-1, S04 0-0.4, S08 0-0.35). On a chapter jump, the target state renders directly (6.2). A resize snaps.
- **Never:** rotation, non-uniform scale, a stroke appearing on the edge, or a radius below the state's value during S00 and S08.
- **Performance:** a camera move redraws both clip passes per frame; the decimation cache is reused while `pxPerS × Mt` changes by less than 5%, then rebuilt (under 2ms for 2,600 s × 10 channels).

### 5.4 Story-card choreography (S02)

- **Deck translation:** scrubbed with the shared deck component (0.8s premium settle on release, the reference's card motion).
- **Progress segments:** the active segment fills with a linear `scaleX` tied to the card's sub-progress.
- **Card visuals:**
  - Card 1: the 17 mini-strands write in (400ms premium), then the `bfo2` × `cso1` trajectory draws along time (800ms linear), turning orange inside the labelled span.
  - Card 2: the 200 ticks appear in time order (600ms linear sweep across the strip, **left to right**, never radial).
  - Card 3: the four split bands grow from left to right in time order (150ms each, staggered).
  - Card 4: the 22 ✓ marks draw (200ms each, 30ms stagger). A ✗ draws in `--state-error` and never repeats.
- **Lens behind:** held at L1, 20%.

### 5.5 Lens travel and VIEW steps (S03a)

- **Travel.** Scrubbed: `f` is a function of p over 0.04-0.92, integer-snapped (`f = round(...)`), symmetric ease. The lens position does not change; the record moves under it. Outside the lens the full window is static. The readout updates on each integer second (numeral swap, no tween).
- **VIEW steps** (p 0.20, 0.45; or a click):
  - RAW → EXPECTED: dotted expected paths draw in left to right across the lens chord (400ms premium).
  - EXPECTED → RESIDUAL: each inside strand crossfades (200ms) to `measured − expected` against its baseline. **No morph:** the old and new series crossfade.
- **ZOOM:** `Mt` changes in log space (600ms smooth). The focus clamp is applied at the target.
- **Lens drag:** pointer-x delta maps to `f` by scrolling the track (`lenis.scrollTo(target, {immediate: true})`), so scroll stays the single source of truth.
- **Reduced motion:** 3 static lenses (VISUAL_DESIGN interaction 2).

### 5.6 Five Eyes (S03b)

- **Entry** (p 0.92-1 of S03a): the 10 telemetry strands crossfade (200ms) to the 5 score strands. The baselines re-space from 10 to 5 rows in 600ms smooth. This is a layout move of baselines, not a morph of any series.
- **Detector steps** (p 0.10 / 0.28 / 0.46 / 0.64 / 0.82; hysteresis ±0.02):
  - The outgoing detector's strand dims to 35% and its lit seconds extinguish (300ms).
  - The incoming strand rises to 100% (350ms premium), its hairline settles (350ms smooth), then its lit seconds ignite (600ms smooth).
  - The detector card crossfades (200ms).
  - Total settle 1200ms (the reference's stepped settle).
- **OPERATING POINT:** each of the 5 hairlines slides to the new `threshold_q` (350ms smooth). Lit seconds update after the slide.
- **Interruption:** a new step retargets from the current opacities.

### 5.7 The Pull-back (S04)

- **Scrubbed time zoom** (p 0-0.40, symmetric): `pxPerS` interpolates in log space from window 142's scale (1440 / 2,600 px/s on D) to the 58-day scale (1248 / 5,000,000 px/s on D). The lens shrinks L3 → L4 in the same window.
- **LOD switch:** while one 600 s bin is wider than 1 device px, the strands draw the window's 1 Hz scores (with neighbouring context from `overview` outside the window, labelled `10-MIN MAX` there). When a bin reaches 1 device px or less, the 1 Hz layer crossfades out (200ms, triggered at the crossing with hysteresis ±5% in scale). From then on, the label `MAX PER 10 MINUTES` is shown.
- **Split bands and ticks** (p 0.40-0.55): the split bands grow left to right (400ms each, staggered 100ms); the 200 ticks appear left to right with the time order (600ms linear).
- **Operating-point steps** (p 0.60 / 0.75 / 0.90): the hairline is drawn only inside the riding lens. Ticks switch caught ↔ missed with a 600ms fill or unfill (never a colour blend). The false-alert ticks fade in (300ms) or out. The ledger numerals swap (120ms).
- **Lens drag along the strip:** `focusBin` follows the pointer (pointer-x in strip coordinates), with no inertia. Keyboard Left/Right moves one day (144 bins) with a 350ms smooth settle.
- **Reduced motion:** a 3-frame static strip of the pull-back, then the end state.

### 5.8 Threshold Lab (S05)

- **Guided tour** (p 0-0.3, scrubbed): the slider index is a function of p, from the strictest index down to the loosest and then back to the BEST EVENT F1 notch. Every frame shows a real step: the index is integer-snapped and the ledger swaps (120ms).
- **Live drag** (from p 0.3):
  - The hairline follows the pointer, then snaps to the nearest step on each frame (no easing while the pointer is down; a 120ms smooth settle on release).
  - Lit seconds in the lens update on every snapped change (the run-length lit set is recomputed for the window: under 1ms for 3,600 seconds).
  - The split ledger swaps (120ms). The window ledger recomputes (the shared metric function, under 1ms) and swaps.
  - The strip's lit bins switch instantly (the threshold is a measurement).
- **Keyboard:** arrow keys move one step with a 120ms settle; Page Up/Down jump to the next notch with a 350ms smooth hairline slide.
- **DETECTOR change:** strands crossfade (200ms) and the hairline moves to the new detector's nearest notch (350ms smooth). The index scale changes with the detector; the slider's step count re-renders with a 200ms crossfade of its tick marks.
- **SPLIT change:** ledger swap (120ms) and the strip crossfades to the other split's bins (200ms).
- **Touch:** a drag starts only on the hairline's 44px hit zone or a horizontal-dominant gesture on the slider; vertical swipes scroll.

### 5.9 The Paint and attribution (S06)

- **PROTOCOL steps** (p 0.12 / 0.26 / 0.40, or a click):
  - POINT: the 2 lit seconds glow; the rest of the span is a hollow orange outline.
  - POINT-ADJUSTED, **the paint:** orange floods outward from each lit second to both ends of the labelled span (600ms smooth, a clip that widens along time). The readout `2 SECONDS FLAGGED · 700 COUNTED AS CAUGHT` swaps in when the flood completes.
  - EVENT, **the collapse:** the painted span contracts along time to a single tick at the span start (600ms smooth), then `CAUGHT · DELAY {{delay}} S` appears.
  - Reverse steps play the inverse motions.
- **Bars:** each detector's point bar and PA outline bar grow from the left on entry (600ms smooth, 80ms stagger). The `×` labels fade in after.
- **Part 2 entry** (p 0.55): the lens crossfades to window 142's telemetry (200ms) and the lens moves L6 → L6 at window 142's segment start (focus travel 800ms smooth).
- **ATTRIBUTION toggle:** the lit channels extinguish (300ms) and the other method's top 3 ignite (600ms, 120ms stagger, by rank). Per-channel rows swap with a 200ms crossfade.

### 5.10 Data transitions (keyed, everywhere)

| Change | Motion |
|---|---|
| Detector | Strand crossfade 200ms, keyed by detector id; hairline slide 350ms; then ignition 600ms |
| Window (S05, REPLAY) | The outgoing strands unwrite right to left (300ms premium); the incoming record writes left to right (600ms premium); the lens focus is held; ignition after the write |
| Threshold step | Hairline snap; lit set switch (instant while dragging; 300ms fade on keyboard steps); numerals 120ms swap |
| Operating point | Hairline slide 350ms smooth; ticks fill or unfill 600ms |
| VIEW | Crossfade 200ms (never a morph) |
| Ignite / extinguish | Residual fill grows from the expected path to the measured path (600ms smooth) / recedes (300ms) |
| Caught ↔ missed | Fill or unfill 600ms smooth; never a colour blend |
| LOD | Crossfade 200ms at the 1 device px per bin crossing (hysteresis ±5%) |
| Numerals | 120ms crossfade between the two real values. Never a count-up |

### 5.11 Argument stack (S07)

As P01-P05 5.11:

- Each step adds an objection card (`#292929`), then 350ms later the orange answer card, with `all .35s ease-in-out` (reference).
- Older exchanges recede by palette and scale (scale 0.96, muted palette; opacity is never below the AA floor, ENGINEERING_DECISIONS #13).
- The answer's mini-visual draws after the card settles: bars grow from the left (400ms smooth), and the S07 answer 2 PR curve draws along its path (600ms linear).
- M shows only the latest exchange, with older ones as 8px slivers.
- The lens behind holds at L1, 15%, and does not redraw.

### 5.12 REPLAY

- **Playback.** Play advances the playhead linearly at `speed` simulated seconds per real second (×1, ×10, ×60), driven by the one rAF loop with `dt` (never `setInterval`). The lens focus follows the playhead (`f = playhead`, clamped). Outside the lens the full window stays static, and a 1px white playhead tick sits at the top edge.
- **Alert markers.** When the playhead passes a first flagged second of an alert, an orange 8px square drops onto the strand (translateY −8px to 0, 200ms smooth) with the label `ALERT AFTER {{delay}} S` (or `FALSE ALERT`, white square, if the alert overlaps no span plus tolerance). Scrubbing backward removes markers past the playhead instantly.
- **Scrub:** the playhead follows the pointer with no easing; the lens follows.
- **Speed and pause:** instant; no ramp.
- **Window change:** 5.10.
- **Rail controls:** 5.14. RESET: values tween to the defaults (350ms controls), then the window rewrites if it changed, and the button shows `RESET ✓` for 1.2s (`aria-live`).
- **Inspector:** enters from the right (D) or as a bottom sheet (T/M) with a 600ms premium ease; exits in 350ms.

### 5.13 Closing: the signal, found again (S08)

| p | Motion |
|---|---|
| 0-0.35 | Scrubbed lens move to L0 (log space), scrim rises (opacity, symmetric) |
| 0.35-0.65 | Paragraph word reveal (scrubbed) |
| 0.70 | **The echo** (stepped, once per down-crossing): corner labels fade in (300ms); the strands **unwrite** right to left (600ms premium); the record **writes** again (1200ms premium); the lens **refocuses** (`Mt` 1 → L0 value, 800ms smooth, radius held at L0); **ignition** with the visitor's detector and threshold (600ms, 120ms stagger). If nothing crosses the line, the caption `NOTHING CROSSED YOUR LINE. THAT IS ALSO AN ANSWER.` fades in instead (350ms) |
| 0.80-1 | Links fade in (350ms premium, 60ms stagger) |

- **Never:** the lens shrinking below L0, a rising arc, an orb regrowing from a point, a push into a surface, a radial drain, or grains re-sorting.
- **Reverse:** scrolling up past 0.70 does not replay the echo; the end state holds until p falls below 0.35.

### 5.14 Component microinteractions

| Component | Behaviour |
|---|---|
| Square buttons and chips | Hover: background to white and text to black (200ms ease-in-out). Press: scale 0.97 (120ms). Focus: a 2px white outline offset 2px on `:focus-visible` |
| Parameter segmented controls (VIEW, ZOOM, OPERATING POINT, SPLIT, PROTOCOL, ATTRIBUTION, SPEED) | The active block is **`#690DE2` with white text** and slides between items (Motion `layoutId`, 350ms premium). The nav's active block stays white (shared shell) |
| Threshold slider | 4px track at 16% white; the filled part white; a 12x28 violet thumb. The three val notches are 1px light-blue ticks with `VAL` labels. The value text swaps in 120ms |
| Threshold hairline (in the lens) | 1px `#58B8E1`. Hover: 2px plus `DRAG TO MOVE` (200ms). Dragging: 2px, with the label following at the right lens edge |
| The lens (drag in S03a, S04, REPLAY) | Cursor `ew-resize` inside the lens; no visual change to the edge (never a stroke on hover) |
| Strands (pointer on D) | Hover raises the strand to 100% (120ms) and shows the tooltip `{{channel}} · {{z|d1}} SD · {{TELEMETRY|CONTEXT}}` |
| Incident ticks (S04, S05) | Hover grows the tick to 4px wide (120ms) with the tooltip line from VISUAL_DESIGN interaction 5 |
| Listboxes (CHANNEL, WINDOW, INCIDENT) | The list opens with a clip-path reveal (200ms premium). The active option is highlighted white with black text |
| Disabled controls | 50% white and a 45° hatch at 25%. No hover motion. The tooltip appears after 80ms and gives the reason |
| Tooltips | Opacity 0 to 1 and y 4px to 0 (200ms, 80ms delay). Out in 120ms. They follow the pointer at a 12px offset, clamped to the viewport |
| ✓ / ✗ marks | The stroke draws over 200ms. ✗ uses `--state-error` and never animates repeatedly |
| Status lines | Text crossfade 200ms. Loading percentages jump (they are measurements) |

## 6. Navigation, chapter jumps, interruption

### 6.1 Nav

The nav is the shared shell, identical to P01-P05 6.1:

- **D bar.** Bottom centre, `--surface-glass` with a static 16px blur, and square 13px mono items. The white active block slides (350ms premium) and hover is 200ms ease-in-out. The right end holds REPLAY INTRO and MOTION ON/OFF.
- **T/M MENU pill.** A 160x32 white pill showing the current label (200ms crossfade). A tap opens a clip-path list upward (300ms premium, 30ms item stagger), and the icon morphs from "=" to "-". Close is 250ms.
- **Labels:** SIGNAL · SOURCE · NORMAL · DETECTORS · 58 DAYS · THRESHOLD · FINE PRINT · EVIDENCE · REPLAY. S08 keeps REPLAY active.

### 6.2 Direct chapter jumps: instant, with a stage fade

We jump instantly (the reference reached its target within 190ms). Smooth-scrolling across S03a would replay the lens travel and S04 the whole pull-back, which is noise. **Procedure:**

1. `lenis.scrollTo(target, {immediate: true})`.
2. The DOM layer fades in over 350ms. The canvas renders the target state directly (no transition).
3. Every stepped state between the old and new positions is resolved without animation.
4. The hash is written with `replaceState` (`#threshold`). `popstate` jumps the same way.
5. Focus moves to the scene heading.

**Landing progress per scene.** Each value sits at least 0.03 clear of every threshold ± hysteresis.

| Scene | Landing p | Why |
|---|---|---|
| S01 | 0.78 | Statement revealed, cards typing |
| S02 | 0.14 | Card 1 centred |
| S03a | 0.55 | RESIDUAL view, the focus inside the segment |
| S03b | 0.33 | PCA active, lit |
| S04 | 0.80 | 58 days, BEST EVENT F1 caught/missed shown |
| S05 | 0.40 | Lab live at PCA, BEST EVENT F1, TEST |
| S06 | 0.31 | POINT-ADJUSTED, the paint complete |
| S07 | 0.05 | First objection |
| REPLAY | section top | |

### 6.3 Scroll interruption

| Case | Behaviour |
|---|---|
| Reverse scroll | Scrubbed phases reverse exactly. Steps use hysteresis. Transitions retarget from current values. |
| Rapid scroll / fling | S03a travel hard-steps (integer seconds, no crossfade). Detector, operating-point and protocol steps go straight to the final state. A scene entered and left within 200ms gets its stepped state set directly. The S04 pull-back is scrubbed, so a fling simply shows the target scale. |
| Mid-transition exit | Transitions finish their remaining time (time-based), then the scene pauses. A scene re-entered within 1.2s continues from its current values. |
| Resize / orientation | A `ResizeObserver` (debounced 150ms) records the scene and p, snaps transitions to their ends, re-measures, recomputes the lens geometry from the D/T/M table (breakpoints 768 / 1024), resizes the canvas (DPR cap), invalidates the decimation cache and restores scrollY. Nothing animates during a resize. |
| Tab hidden | The loop stops, and REPLAY pauses (the playhead does not advance while hidden). Time-based transitions are evaluated at their end on return. |
| Long task | Frames are skipped, never queued. Transitions are time-based; REPLAY advances by real `dt` (capped at 250ms per frame, so a stall never jumps the playhead by minutes). |
| Drag in progress during scroll | A threshold or lens drag holds its pointer capture; wheel scroll still scrolls the page, and the drag ends on pointerup or on leaving the stage. |

## 7. Operational state motion

| State | Motion |
|---|---|
| **Initial** | Strand baselines at 10% if the scene's geometry is known; nothing else. No shimmer. |
| **Loading** | The mono line `LOADING {ARTIFACT} · {n}%` with real byte progress (jumps, no tween). It fades in (200ms) only if loading lasts 150ms or longer. |
| **Ready** | The record writes (5.10 window change), then the scene's own transition runs (focus, ignition). |
| **Empty** | Strands stay; the empty copy fades in (350ms). Controls stay live. (Example: `NO SECOND IN THIS WINDOW REACHES THE LINE`.) |
| **Error** | The loading line crossfades (200ms) to `COULD NOT LOAD {ARTIFACT} ({reason})` in `--state-error`, plus `RETRY`. No shake. A schema-guard failure reads `{ARTIFACT} FAILED ITS CHECKS`. The last good state stays on screen. |
| **Retry** | The same fetch re-runs. The button shows `RETRYING`. A second failure adds `(ATTEMPT 2)`. |
| **Disabled** | 50% white plus hatch, `aria-disabled`, and a tooltip with the reason. No hover motion. |
| **Reset** | Values tween to the defaults (350ms controls), then one window rewrite if needed, and `RESET ✓` for 1.2s (`aria-live`). |

## 8. Reduced motion

It is triggered by `prefers-reduced-motion: reduce` **or** the MOTION OFF toggle. The tokens zero their durations and blur. In addition:

1. The intro shows its end state at once. REPLAY INTRO plays the 0ms version.
2. Lenis is off, and native scroll is used.
3. **Pinned tracks become normal flow:**

| Scene | Static rendering |
|---|---|
| S01 | Statement, the lens at L1, and the cards |
| S02 | 4 cards stacked vertically |
| S03a | 3 lenses (RAW, EXPECTED, RESIDUAL) at the segment start: a row on D, stacked on T/M. ZOOM and CHANNEL redraw all 3 |
| S03b | 5 lenses in a column, one per detector, at BEST EVENT F1; OPERATING POINT live |
| S04 | A 3-frame pull-back strip (window, 1 day, 58 days), then the 58-day strip with PCA at BEST EVENT F1; DETECTOR and OPERATING POINT live |
| S05 | The lab, live, with instant updates |
| S06 | Three lenses (POINT, POINT-ADJUSTED, EVENT), the bars, then the attribution view with live controls |
| S07 | All 7 exchanges as a vertical list |
| REPLAY | Fully functional, with no autoplay (scrub only) and instant updates |
| S08 | The static giant lens (end state), caption and links |

4. No glow fade, no write, no focus ramp, no ignition growth, no paint flood (the end states switch), no blur and no word reveals.

**Tests (Playwright `reducedMotion: 'reduce'`):**

- The document height is below the pinned height.
- No sticky positioning inside scenes.
- The canvas frame counter is stable after idle.
- Every control still changes the visible state.

## 9. Performance budgets and rendering

### 9.1 Rendering decisions

**Rendering: Canvas2D, one viewport-sized canvas, two clip passes per frame.**

| Option | Cost | Verdict |
|---|---|---|
| WebGL (raw or R3F), MASTER_PLAN's "WebGL telemetry waterfall" | Line rendering in WebGL needs a thick-line shader and gradient fills by hand; three/R3F adds about 150-220 KB gz (ENGINEERING_DECISIONS #27) | Rejected: the content is at most 17 polylines × 2 × width points, and a waterfall would read as P03's core |
| SVG | 17 paths of up to 2,880 points, re-built on every lens move | Rejected for the lens (path re-parse per frame). **Kept for** the S07 mini-visuals and the S06 bars (static, under 40 elements) |
| **Canvas2D** | Per frame: an outside pass (inverse clip: `rect` + `arc` with `evenodd`), strands as decimated polylines; an inside pass (`arc` clip, reference 35), glass tint, ridge fills (`createLinearGradient`, reference 36), measured lines, expected dotted paths, residual fills and glow | **Chosen.** No WebGL dependency, and the same code runs everywhere. Precedent: P04 is Canvas2D (#21) |

- **Glow without filters.** The residual glow is 3 extra fill passes of the residual polygon at 0.18 / 0.10 / 0.05 alpha, offset by 0 and expanded with `lineWidth` 6 / 12 / 20 strokes in `#FF4C25`, with `lineJoin = 'round'`. No `ctx.filter` and no `shadowBlur` (both are slow or inconsistent on Safari).
- **Ridge occlusion.** Strands inside the lens are drawn top to bottom. Each ridge fills `#0b0b0b` under its line to the next baseline before its gradient, so lower ridges occlude the fills above them.
- **Static layers.** The outside pass is cached to an offscreen canvas whenever the record and the outside scale are static (S03a travel, S05, REPLAY), so a frame redraws only the inside pass and composites the cache (a `drawImage`).
- **Picking.** Strand hover is by baseline band (`floor((y − y0) / gap)`), and ticks by x bins. No hit canvas.

### 9.2 Budgets

| Item | Desktop D | Tablet T / Mobile M | LOW tier |
|---|---|---|---|
| Frame budget | 16.7ms (60fps); JS + draw 6ms or less | 33ms (30fps); JS + draw 14ms or less | same targets |
| Canvas DPR cap | 2 | 1.5 | 1 |
| Points per strand per pass | 2 × CSS width at most (decimated) | same | 1 × width (max only) |
| Strands per pass | 10 telemetry (+7 context in REPLAY), or 5 score strands | same | same |
| Glow passes | 3 | 2 | 0 (lit fill only) |
| Decimation rebuild | 2ms or less (2,600 s × 10 channels) | 4ms or less | same |
| Lit-set recompute (threshold change) | 1ms or less for 3,600 s | same | same |
| Window decode (u16 to Float32) | Worker, 3ms or less for 3,600 × 22 series | same | same |

- **Tier detection.** Measure the median frame time over the first 60 frames after the intro. Above 12ms on D or 25ms on M means LOW. The result is recorded in `window.__sentinelQuality`. `?quality=low|high` forces a tier.
- **Offscreen pause.** The canvas draws only when dirty, and draws nothing in S07 once the cards settle.
- **Measured, not claimed.** FPS, LCP, TBT and frame times come only from real runs (Lighthouse desktop and mobile presets, a Playwright trace with frame pacing on a stated device, and the evidence harness).

### 9.3 Loading budget (Lighthouse perf 90+, LCP 2.5s or less, CLS 0.1 or less)

The sizes below are gzip values from `meta.artifact_bytes` where they exist, or DR estimates where they do not.

| Resource | Budget (gz) | When |
|---|---|---|
| HTML + critical CSS (headline, ghost state, chips) | 25 KB or less | first paint |
| Main JS (React, shell, loop, Lenis, Motion lazy core, lens renderer, metric code) | 130 KB or less | deferred module |
| Fonts (2 latin woff2, display preloaded) | 120 KB or less | first paint |
| `facts` (2.1 KB), `meta` (2.1 KB) | 5 KB or less | in parallel with JS |
| `window_142` (73.9 KB) or DR-7 (about 15-20 KB), `channels` (1.3 KB), `incidents` (8.1 KB + DR-2), `detector_eval` (13.3 KB) | 100 KB or less | right after first paint (S00) |
| `threshold_sweep` (16.8 KB), `quality` (1.1 KB), `reconciliation` (0.7 KB), `attribution` (0.6 KB) | 20 KB or less | idle after the intro |
| `overview` (83.0 KB), DR-3 (60 KB or less) | 145 KB or less | S03b entry |
| `window_153` (39.5 KB) | 40 KB | S05 entry |
| Other windows (28-108 KB each) | on selection | S05 WINDOW, REPLAY |
| `recompute_vectors` (17.9 KB) | never in production | tests only |

## 10. Technical stack recommendation

| Layer | Choice | Reason |
|---|---|---|
| App | React 18 + TypeScript strict + Vite, using the shared shell (`site/src/motion`, `scroll`, loader, nav, primitives) | Program standard. No rebuild |
| Styles | `tokens.css` + CSS Modules. Project overrides: `--accent-primary: #FF4C25`, `--accent-secondary: #58B8E1`, `--control-fill: #690DE2` (fill only), `--alarm-highlight: #FFC23D` | Tokens own the language |
| Scroll | Lenis plus the one rAF loop | Same as P01-P05 |
| GSAP | Not used | The intro is a keyframe table run by the shared tween (P01 decision 6) |
| Component motion | Motion (`motion/react`, `LazyMotion` + `domAnimation`) | `layoutId` active blocks, inspector, sheets |
| Lens and strands | Canvas2D in `src/lens/` (`model.ts` state and camera, `decimate.ts`, `draw.ts` two-pass renderer, `lit.ts` lit spans, `glow.ts`), plus a `decode.worker.ts` for windows | 9.1 |
| Card mini-visuals, S06 bars | Small SVG components, no chart library, no `d3-axis` | Stays in the visual language |
| Models | Pure functions, each with Vitest parity against artifact fixtures: `src/model/metrics.ts` (point, point-adjusted, event: the shared definition, parity against all 17 `recompute_vectors` cases), `sweep.ts` (index lookups, derived precision/recall/F1), `residual.ts` (61 s trailing median and robust z, DR-1 parity), `quant.ts` (q ↔ score from `meta.detectors[d].quant`), `scope.ts` (`scopeOf`), `copy.ts` (the causal-verb and real-infrastructure lint over copy files) | |
| Data | `fetch` with stream progress, plus hand-written type guards from the JSON Schemas | Validation at the trust boundary |

## 11. Motion test plan

Playwright runs against `npm run build && npm run preview` at D, T and M.

1. **Intro.**
   - SKIP is visible at 100ms, and the nav appears within 400ms of the click.
   - A wheel at 1s completes the intro within 400ms.
   - A same-session reload starts at the end state.
   - Under reduced motion, the end state shows in the first screenshot.
   - The SYNTHETIC chip and `meta.dataset.nature` line are in the DOM and visible at 600ms.
2. **LCP and CLS.** In the Lighthouse JSON, the LCP element is `h1[data-hero]`, LCP is 2.5s or less, CLS is 0.1 or less, and only `facts` and `meta` precede FCP.
3. **Track release.** At each scene's end plus 10px, the next heading is in view. No traps.
4. **Reverse and rapid.**
   - Fling S01 to S06 and back: the final frames match a direct load (screenshot diff under 0.5%).
   - S03b at p 0.33 shows PCA active both forward and backward.
   - S04 at p 0.20, reached in reverse, matches a forward load.
5. **Chapter jumps.** For every nav item: scrollY lands within 2px of the landing progress within 200ms, the hash updates, back/forward work, and focus is on the heading.
6. **Resize mid-scene.** At S04 p 0.20 (mid pull-back), resize 1440 to 390: the scene and p are preserved within ±0.01, there are no console errors, and the L4-M geometry matches the table.
7. **Lit means alerted.** The debug hook's lit list satisfies `q ≥ threshold` and `channel ∈ ranking` at the S00 end, each S03b step, the three S05 notches, and the REPLAY default. For IF, change-point and GBM, no channel is lit.
8. **Real states only.**
   - During a 40-position hairline drag, every `aria-valuetext` names a member of `thresholds_q[detector]`.
   - During 10 sampled frames of a detector change, every drawn strand equals one of the two series (debug hook).
   - No sampled numeral is outside {old, new} during a swap.
9. **Metric parity.** At each operating point, the S05 split ledger equals `detector_eval` exactly; the window ledger equals the Python reference on all 6 real-window vectors; the S06 window 153 counts are 2 flagged and 700 point-adjusted.
10. **Scope guard.** No ledger cell renders both `SPLIT` and `WINDOW` scope (DOM data attribute check across S05 and REPLAY).
11. **Truncation.** Selecting windows 168, 138 or 135 shows `SEGMENT CONTINUES BEYOND THIS WINDOW` in the status line.
12. **Touch safety.** On M, a vertical swipe starting on the lens, the hairline's surroundings or a chip row scrolls the page. Only a horizontal-dominant drag or a hairline-targeted drag moves a parameter.
13. **Reduced motion.** No sticky in scenes, no animated filter, a stable canvas counter, and every control still works.
14. **Pause offscreen.** With S07 centred (after the cards settle), the canvas frame counter is flat for 2s. REPLAY pauses when the tab is hidden.
15. **Giant geometry and the P01-P05 confusion check (QA evidence).**
    - A debug hook reports the lens radius at or above the L0 value (D 560, T 620, M 507) from 1600ms into S00 to its end, never decreasing, and again at S08 p 0.75.
    - At the S00 end state and S08 p 0.75, a screenshot check at D, T and M finds strand-discontinuity pixels along the lens edge outside every scrim rectangle: the D left arc, the T top-left and bottom-left arcs, and the M bottom-left arc.
    - Luminance check: the mean luminance inside the lens (outside lit areas) exceeds the outside's by at least 1.3x on the 240px tile.
    - The evidence harness writes `artifacts/evidence/<stage>/p01-p05-vs-p06-open-close.png`: S00 frames (0.6s, 1.8s, 3.2s, end) and S08 frames (p 0.3, 0.75, 0.9) of all six sites, at D and M, as 240px-tall tiles, with real P04 and P05 frames once they exist.
    - An independent QA reviewer confirms that no P06 frame shows any of these:
      - a stroked ring or rim on the lens
      - concentric circles, a radar or a sweep
      - nodes on a circumference, or chords
      - wedges or spokes
      - a smooth glow disc, or a small orb
      - square cells or a limb
      - dots or grains
      - a striped sun with a grid floor
      - a vertical colour-band column (P03's core)

      The reviewer must also be able to identify the circle on the 240px sheet. Rejection criteria 2, 7 and 17 apply. (The design-time version of this sheet is `design/sketches/distinctness-sheet.png`.)
16. **Frame pacing** (evidence harness). Scroll recordings at D and M report p50/p95 frame times on a stated device and browser, including the S00 focus, the S04 pull-back and a 10-second S05 hairline drag. These are recorded, never estimated.
