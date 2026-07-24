# Phase 2 — Root-cause determination (issue #55, matrix.spec.ts:224)

**Verdict: H1 — stray node capture. Reproduced decisively under instrumentation
with airtight discriminating evidence. H2 and H3 ruled out.**

This is the evidence artifact for FR1/FR3; it is consolidated into
`codev/reviews/55-*.md` in the Review phase. All figures are the verbatim
`#55DATA` records emitted by the out-of-tree diagnostic
(`tests/diagnostics/55-drag/drag-diagnostic.spec.ts`); the raw per-segment logs
live beside this file (`phase2-*.log`).

## 1. The mechanism

The "background" drag start point `(150, 450)` is **not reliably background**.
The app renders a dense ~2,734-node graph (`app/graph/data.ts`); after the test
wheel-zooms in (`wheel(0, -240)`), ~2,630 nodes sit in front of the camera and
their screen projections grow. `FocusGraph` runs with `enableNodeDrag` and
`enablePointerInteraction` both true post-enablement
(`app/components/FocusGraph.tsx:200-201`), so `3d-force-graph` has a three.js
`DragControls` raycasting **every node mesh** on pointerdown.

When the pointerdown raycast at `(150, 450)` pierces a node sphere, the
following cascade fires (exactly the spec's layer-3 analysis):

1. `DragControls` `dragstart` runs `controls.enabled = false` ("disable controls
   while dragging") and **locks the node** (`fx/fy/fz` set → `fixedNodeCount`
   0 → 1).
2. `three-render-objects` gates the Trackball on `controls.enabled`
   (`state.controls.enabled && state.controls.update(...)`), so with controls
   disabled the Trackball `update()` **never runs** for the whole drag.
3. The 12 delivered pointermoves therefore drag the **node**, not the camera.
   The camera never rotates → `cameraDelta ≈ 0` → below `MOTION_FLOOR (1)` →
   the 5 s settle poll expires → the recorded failure.

This is CPU-side three.js **raycast geometry**, evaluated before any pixel is
rasterized — which is why it is rasterizer-independent (see §4, hardware
survival).

## 2. Reproduction campaign (Decision 5 / FR1)

Firefox-focused (the flake's engine), the out-of-tree diagnostic replicates the
**exact** `matrix.spec.ts:224` preamble + gesture
(`move(150,450) → down → move(450,250,{steps:12}) → up`) and dumps discriminators
on any below-floor drag. Instrumentation rides every rep (Decision 6), so each
rep is simultaneously a reproduction attempt and a statistical H1 occupancy
sample. Renderer evidence for the GPU-lane arms is the bracketing `--probe-only`
reports (`phase2-probe-pre.log` / `phase2-probe-post.log`):
`renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)`,
`renderer.chromium: ANGLE (… D3D12 (NVIDIA GeForce RTX 3080) …)`.

| Segment | Path | Concurrency | Reps | Reproduced | Rate |
| --- | --- | --- | --- | --- | --- |
| A | SwiftShader (default) | parallel (`E2E_WORKERS=50%`) | 50 | 6 | 12% |
| B | SwiftShader (default) | serial | 30 | 3 | 10% |
| D | native GPU (Mesa d3d12, RTX 3080) | parallel (`E2E_WORKERS=50%`) | 50 | 5 | 10% |
| E | native GPU (Mesa d3d12, RTX 3080) | serial | 30 | 2 | 7% |
| **Total** | | | **160** | **16** | **10%** |

**Reproduced well within budget at the cheapest tier** (targeted reps), so the
cost-escalation to the full-suite / parallel-GPU-lane tiers — the Decision-5
budget for *non*-reproduction — was not needed for reproduction. Those tiers are
the Phase 4/5 qualification vehicles (run on the fixed tree); Phase 1 already
recorded a green 22/22 full two-engine suite run as the pre-fix full-suite
baseline (thread, phase_1). This is honest budget recording: reproduction
succeeded at tier 1; higher-cost tiers were not run redundantly on the unfixed
tree.

## 3. Discriminating evidence — H1 confirmed, H2/H3 ruled out

The correlation across all 160 reps is airtight:

**reproduced (delta ≤ floor)  ⟺  node captured (`fixedAfter = 1`)  ⟺  raycast
hit at start (`occHit = true`).** All 16 reproductions, both diagnostic variants,
all four segments, show identically:

- `occHit = true`, `withinDisk = true` (15/16; 1 marginal at
  nearestPx 3.43 vs projRadius 3.34 — the 3-D raycast hit even where the
  screen-disk approximation rounded just outside), nearestPx 0.07 – 5.1.
- `fixedNodeCount before=0 after=1` — the drag locked a node.
- `movesBetweenDownUp = 12`, `dropped = 0` — **every** pointermove delivered.
- `up = 2` — the DragControls drag lifecycle (vs `up = 1` on passing reps).
- camera delta 0.00003 – 0.0048 — the ~zero signature.
- Stepped variant mid-drag samples: `enabled=false state=0` at
  afterDown/move3/move6/move9/move12, restored `enabled=true` only afterUp —
  the Trackball was disabled the **entire** drag.

Passing reps (144/160): `occHit=false`, `fixedAfter=0`, `up=1`, delta
2,300 – 3,500 (orders of magnitude over the floor).

- **H2 (Firefox synthetic-input delivery loss) — RULED OUT.** Every rep,
  reproduced or not, delivered all 12 pointermoves (`movesBetweenDownUp=12`,
  `dropped=0`, `canvasMove=12`). Delivery is never the failure.
- **H3 (drag-readiness race) — RULED OUT.** `controls.enabled` was `true`
  *before* every drag (`ctrlBefore=true`); the control was ready. Disablement is
  a *consequence* of the node-capture dragstart, mid-drag, not a pre-drag
  readiness gap.

## 4. Explaining the full historical signature (FR3)

- **~zero deltas (not partial rotation).** The Trackball is disabled for the
  whole drag, so *no* rotation is ever applied — not "too little." Matches the
  historical 0.002 – 0.004 exactly.
- **Hardware survival.** H1 is CPU-side raycast geometry, independent of the
  rasterizer. Segments D & E reproduce it on **verified RTX 3080 hardware**
  (probe brackets) at the same ~7-10% rate as the SwiftShader segments A & B —
  decisively confirming the spec's key insight (this is not a software-WebGL
  timing problem, unlike closed #33/#34).
- **Repeat-alone greens.** The force layout is randomly seeded per page load, so
  whether `(150,450)` lands on a node is a per-run ~10% coin flip; short repeated
  runs pass by chance (P(9 consecutive passes) ≈ 0.86⁹ ≈ 0.26, consistent with
  the historical 0/5 and 0/4 streaks).
- **Amplification under parallel contention — HONEST refinement.** The per-run
  H1 rate is **regime-independent** within noise (A 12% / B 10% / D 10% / E 7%;
  software ≈ hardware, parallel ≈ serial), because it is pure layout geometry.
  Parallel qualification campaigns surface it more often not by raising the
  per-instance probability but by executing far more test instances
  (workers × repeats), raising the *absolute* count of ~10% events. #41's "1 of
  3 GPU-parallel" is one such surfacing.
- **Firefox dominance.** A both-engine serial comparison (Job 1b;
  `phase2-F1-swift-both-serial.log`, `phase2-F2-gpu-both-serial.log`) is decisive:

  | Path | Chromium | Firefox |
  | --- | --- | --- |
  | F1 SwiftShader (both engines) | 0/40 hit, cameraDist ≈ 2234 | **6/40 hit**, cameraDist ≈ 1752 |
  | F2 GPU env (Chromium fell to SwiftShader†, Firefox = HW) | 0/24 hit, cameraDist ≈ 2127 | **2/24 hit**, cameraDist ≈ 1752 |
  | **Total (serial)** | **0 / 64** | **8 / 64 (12.5%)** |

  Chromium **never** captured a node in 64 serial reps; Firefox hit 12.5%. The
  cause is exactly the spec's H1 prediction: Firefox's `wheel(0, -240)` settles
  the camera ~18-22% **closer** (cameraDistance ≈ 1752 vs Chromium ≈ 2130-2234
  — a stable, engine-intrinsic difference, identical across both paths), so node
  screen projections are proportionally larger and the fixed point `(150, 450)`
  falls inside a node far more often. Firefox reproduces on **both** the
  SwiftShader path (F1) and verified hardware (F2 Firefox renderer "Generic
  Renderer" via the Mesa env; probe brackets = D3D12 RTX 3080); Chromium on
  neither. This matches the historical record (every serial/GPU-lane recurrence
  is `[firefox]`; Chromium fails `:224` only under the separate, out-of-scope
  SwiftShader *parallel-contention* regime).

  † F2's Chromium arm inadvertently ran SwiftShader: the diagnostic config
  defaults Chromium to `--use-angle=swiftshader` unless `PW_CHROMIUM_ARGS`
  carries the hardware ANGLE flags, which the Firefox-only Mesa env did not set
  (Firefox needs no launch flags to reach the d3d12 adapter). This does not
  affect the conclusion: the zoom-depth difference is engine-intrinsic (F1 is a
  clean same-path both-engine comparison, and Chromium's cameraDistance/projected
  radius are the same on both F1 and F2), and Chromium reproduced zero times on
  either path. Recorded verbatim for honesty.

Whole-campaign tally: **24 reproductions across 288 instrumented reps** — Firefox
24 (Job 1: 16/160; Job 1b: 8/64), Chromium **0/64**. Every single reproduction,
without exception, is a node capture (`occHit`+`fixedAfter=1`+mid-drag
`controls.enabled=false`) with all 12 pointermoves delivered.

## 5. Fix direction for Phase 3 (informs, does not pre-decide)

The evidence selects the spec's **H1 fix**: a probe-verified, genuinely-background
drag start point (the inverse of `pickNodeScreenPoint` — a screen point verified
node-free with a pixel margin in the current post-zoom layout), applied at
`matrix.spec.ts:224`, so the "background drag" premise is true every run. This
*strengthens* test fidelity (today's fixed `(150,450)` is only ~90% background)
and preserves the real `down → move → up` gesture and the unchanged
`MOTION_FLOOR`. A `settleBackgroundDrag` delivery helper is **not** indicated —
delivery was perfect in every rep (H2 ruled out). The `nodeOccupancyAtPoint`
probe is validated as the background-verification primitive: `occHit`
correlates perfectly with actual node capture.
