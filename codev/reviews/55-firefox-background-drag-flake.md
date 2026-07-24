# Review 55: Root-Cause and Fix the Firefox Background-Drag Rotation Flake (matrix.spec.ts:224)

## Metadata
- **ID**: review-2026-07-24-firefox-background-drag-flake
- **Specification**: [codev/specs/55-firefox-background-drag-flake.md](../specs/55-firefox-background-drag-flake.md)
- **Plan**: [codev/plans/55-firefox-background-drag-flake.md](../plans/55-firefox-background-drag-flake.md)
- **GitHub issue**: #55
- **Protocol**: SPIR (strict, porch-orchestrated)
- **Completed**: 2026-07-24

## Summary of Outcome

The long-standing `[firefox] tests/e2e/matrix.spec.ts` "zooms in with the wheel
and rotates with a background drag" flake — a near-zero camera delta (~`0.002`)
against `MOTION_FLOOR > 1` that **survived on real RTX-3080 hardware** — is
**root-caused and fixed**, with a behavior-preserving harness change and no
weakening of the canonical assertion.

The issue title hypothesized **synthetic-input-delivery nondeterminism**. The
instrument-first investigation **refuted that** and proved a different mechanism:
**H1 stray node capture**. The hard-coded background-drag start point `(150, 450)`
intermittently lands on a graph node whose screen projection grew after the
wheel-zoom-in; the 3d-force-graph DragControls pointer-down raycast then grabs the
node, fires `dragstart`, disables the Trackball camera controls, and the gesture
drags the *node* instead of rotating the camera — delta ≈ 0. Because the raycast
is CPU-side three.js geometry, the outcome is **rasterizer-independent** (explains
hardware survival) and **per-run-random** (random layout seed → a coin flip →
"passes when repeated alone").

The fix replaces the single fixed start pixel with a **probe-verified
genuinely-background start point**: `pickBackgroundDragPoint` raycasts a spread of
lower-left candidates against the live node meshes and returns the point with the
most clearance to the nearest node **edge**, floored at a pixel margin. The drag
moves by the **same vector**, so gesture geometry and rotation magnitude are
unchanged; it remains a real synthetic `down → move → up`; `MOTION_FLOOR` and
`retries: 0` are untouched. Qualified green across **both engines, both rendering
paths (SwiftShader + native-GPU), serial and parallel** — including the #41
opt-in-parallel regime that reproduced the flake on the unfixed tree.

The downstream documentation follow-through (FR6–FR8) is complete: #41's
opt-in-parallel caveat is **retired** (green 3/3 re-qualification), the #41
"revisit the default" follow-up is corrected to **necessary-but-not-sufficient**,
and the historical **"#33" misattributions** are corrected to cite **#55**.

## What Was Built (by phase)

- **Phase 1 — Drag-path instrumentation (harness-side).** Extended
  `tests/e2e/graph-handle.ts` with `__graphNodeOccupancyAtPoint(x, y)` (the
  inverse of `pickNodeScreenPoint` — the H1 discriminator, mirroring the exact
  DragControls hit-test) and an out-of-tree diagnostic harness under
  `tests/diagnostics/55-drag/` (its own `playwright.diag.config.ts`, so
  `testDir: ./tests/e2e` never collects it). Firefox browser installed via the
  repo-pinned Playwright cache (no `package.json`/lockfile change). Canonical
  suite provably unchanged (`playwright test --list` = 22 tests, 0 diagnostics).
- **Phase 2 — Amplified reproduction & root-cause.** Reproduced the flake **26
  times** (24 instrumented diagnostic + 2 canonical-suite) across SwiftShader and
  verified RTX-3080 hardware, parallel and serial. Every reproduction showed
  `occHit` + `fixedNodeCount` 0→1 + `controls.enabled === false` mid-drag with all
  12 pointermoves delivered → **H2 (delivery loss) and H3 (drag-readiness) ruled
  out; H1 confirmed.** Firefox-dominance explained (Firefox zooms ~18–22% closer →
  larger node projections → higher hit probability at the fixed start).
- **Phase 3 — Minimal behavior-preserving fix.** `pickBackgroundDragPoint` in
  `graph-handle.ts` + the `matrix.spec.ts` change (probe 14 candidates, pick max
  edge-clearance, floor at `DRAG_MARGIN_PX = 10`, drag by the same vector, fail
  loudly if no candidate clears the margin). FR2 trim: heavyweight diagnostics
  relocated to `tests/diagnostics/55-drag/drag-probe.ts` (out of the canonical
  suite); the committed `tests/e2e/` delta is only the fix dependency + the cheap
  node-occupancy probe.
- **Phase 4 — Fix qualification.** ≥60 targeted `:224` repetitions on **both**
  the SwiftShader path (60/60) and the native-GPU hardware lane (60/60,
  probe-bracketed RTX-3080 D3D12); 3 full serial SwiftShader suites (22/22 each,
  incl. a **clean-checkout** `npm run validate`, EXIT 0); 3 full native-GPU lane
  suites (22/22 each). **126 total `:224` executions, 0 below floor.**
- **Phase 5 — #41 GPU-lane parallel re-qualification & caveat (FR6).**
  `E2E_WORKERS=50% npm run test:e2e:gpu` ×3 at `retries: 0` on RTX-3080 hardware
  (10 workers each) → **green 3/3** (the same regime reproduced the flake 2/3 on
  the unfixed tree). README caveat retired; dated addendum appended to review-41.
- **Phase 6 — Record corrections (FR7 + FR8).** #41 "revisit the default"
  follow-up corrected to necessary-but-not-sufficient; "#33" misattributions
  corrected to cite #55 (marked Decision-7 correction notes) in README,
  `playwright.config.ts` (comment-only), reviews 41/52, and spec 52, including
  correcting the *mechanism* prose (synthetic-input hypothesis → stray node
  capture).

## Root Cause (mechanism, FR3)

Discriminated with verbatim instrumented evidence
(`codev/projects/55-firefox-e2e-flake-background-d/evidence/phase2-mechanism.md`
+ logs):

| Signal | Reproduced (below-floor) reps | Passing reps |
|---|---|---|
| node-occupancy hit at start point | `occHit = true`, `withinDisk = true` | `occHit = false` |
| `fixedNodeCount` before → after | `0 → 1` (DragControls locked a node) | `0 → 0` |
| `controls.enabled` during drag | **`false`** throughout (ROTATE suppressed) | `true` |
| pointermoves delivered (down→up) | **12 / 12** (perfect delivery) | 12 / 12 |
| camera delta | ≈ `0.00003`–`0.002` | ≈ 2300–3500 |

The perfect 1:1 correlation is **reproduced ⟺ `fixedNodeCount` 0→1 (actual node
capture) ⟺ mid-drag `controls.enabled === false`**. `occHit` is a ~94% *predictor*
(the rare false-positive is a probe raycast a few frames before pointerdown while
the layout micro-drifts — which is exactly why the fix uses a **pixel margin**,
not a bare point test). All 12 pointermoves delivered in every reproduction
**rules out** the synthetic-input-delivery hypothesis in the issue title.

## Qualification Evidence (FR5, verbatim)

All at `retries: 0`; full logs under
`codev/projects/55-firefox-e2e-flake-background-d/evidence/phase4-*` /
`phase4b-*` / `phase5-*`.

| Run | Path | Engine(s) | Result |
|---|---|---|---|
| Targeted `:224` ×60 | SwiftShader serial | firefox | **60/60** |
| Targeted `:224` ×60 | native-GPU (RTX 3080, probe-bracketed) | firefox | **60/60** |
| Full suite serial ×3 | SwiftShader (incl. clean-checkout `validate`) | chromium+firefox | **22/22 each** |
| Full GPU lane ×3 | native-GPU (RTX 3080) | chromium+firefox | **22/22 each** |
| GPU lane **parallel** ×3 (FR6) | native-GPU, `E2E_WORKERS=50%` (10 workers) | chromium+firefox | **22/22 each** |

- Renderer evidence (native-GPU lane): `renderer.chromium: ANGLE (… D3D12
  (NVIDIA GeForce RTX 3080) …)`, `renderer.firefox: D3D12 (NVIDIA GeForce RTX
  3080)`, `mode: hardware` — the same control arm the flake originally survived.
- `npm run validate` (`lint && typecheck && test:smoke`) **green (EXIT 0, 22/22)**
  on a **clean detached-HEAD worktree** with real `npm ci` (the in-worktree
  `eslint .` failure is solely the untracked `.claude/hooks/*` builder-harness
  file, absent from clean checkouts — environment noise, not suppressed in
  committed config; lessons-critical clean-checkout rule).

## Spec Compliance (FR1–FR8)

- **FR1** (amplified, instrumented reproduction) — ✅ 26 reproductions under
  instrumentation across regimes.
- **FR2** (discriminating instrumentation, harness-side only; committed-vs-
  evidence-only) — ✅ heavyweight diagnostics live out-of-tree under
  `tests/diagnostics/55-drag/`; committed `tests/e2e/` delta is the fix + the
  cheap probe. No app-code change.
- **FR3** (mechanism documented with evidence) — ✅ H1 confirmed; H2/H3 ruled out;
  full historical signature explained (zero deltas, Firefox dominance, hardware
  survival, repeat-alone greens, parallel amplification).
- **FR4** (minimal behavior-preserving fix) — ✅ real `down → move → up`, same drag
  vector, `MOTION_FLOOR`/`retries: 0`/`.github/workflows/validation.yml`
  untouched; no retries, no camera manipulation.
- **FR5** (both engines × both paths qualification) — ✅ table above.
- **FR6** (#41 GPU-lane parallel re-qualification + caveat) — ✅ green 3/3; caveat
  **retired**.
- **FR7** (#41 "revisit the default" correction) — ✅ necessary-but-not-sufficient;
  the standing blocker is the deterministic Chromium SwiftShader parallel-
  contention (untouched by #55).
- **FR8** ("#33" misattribution correction) — ✅ zero bare this-flake→#33; marked
  correction notes cite #55; genuine #11/#34 references intact; `playwright.config.ts`
  correction is comment-only (zero executable change).

## Flaky Tests / Disposition

**None skipped, none masked, no assertion weakened.** This project *fixed* the
flake rather than accepting it. The drag remains a real synthetic gesture,
`MOTION_FLOOR > 1` and `retries: 0` are unchanged, and the fix strengthens the
test premise (the "background drag" is now verified to start on background). The
one pre-existing environment artifact encountered — the node unit suite's
`toolchain.test.mjs` failing under this pnpm-launched shell's stale
`npm_config_user_agent` — was proven env-only (`env -u npm_config_user_agent
npm test` → 121/121; fails identically with changes stashed) and is not part of
the `validate` gate.

## Deviations from Plan

- **Budget honesty (Phase 2):** the flake reproduced *decisively* at the cheapest
  (targeted) tier, so the ≥3-full-suite / ≥3-parallel-GPU tiers — framed in the
  plan as the Decision-5 fallback budget for a *non*-reproduction — were run for
  corroboration (Job 2) rather than as a search, and recorded as such. No masking.
- **Phase 4 driver hardening** across consult iterations (gate step 1, accumulate
  steps 2–5 into the exit code, run the *clean-checkout* validate as the recorded
  green) — a rigor improvement, not a scope change.
- No app-code change was needed (H1 is a test-harness assumption, not an app
  defect); the diff stays confined to `tests/` + doc/comment corrections.

## Architecture Updates

No system-shape (`arch.md` / `arch-critical.md`) change: this work adds no
toolchain, dependency, CI, or framework change (Decision 2 / arch-critical
Validation Baseline preserved — `npm run validate` remains the green gate,
`.github/workflows/validation.yml` byte-for-byte unchanged, `workers: 1` under
`CI`). The native-GPU lane and `E2E_WORKERS` opt-in are unchanged in behavior; the
only durable change is that the opt-in-parallel path is now flake-free on
hardware.

## Lessons Learned Updates

Routed to the **COLD** `codev/resources/lessons-learned.md` (Validation Evidence)
— a reusable e2e-harness lesson (reference detail; the HOT lesson "'tests pass' is
not 'it works' — verify the real user path" already carries the spirit, so no
hot-tier cap pressure):

> **A hard-coded "background"/empty screen coordinate in an interaction test is
> not guaranteed to stay empty when the scene changes.** After a camera zoom or a
> reseeded layout, a fixed pixel can land on a pickable object, so the gesture
> hits the object instead of the intended background — a near-zero, per-run-random,
> **rasterizer-independent** failure that survives on real hardware and passes when
> repeated alone (so it looks like input-delivery flake but isn't). Probe the live
> scene and pick a verified-empty point with a pixel margin; don't trust a static
> coordinate. Discriminate "did the input arrive?" (pointer counters) from "did it
> hit what I meant?" (occupancy raycast) before blaming synthetic-input delivery.

## Lessons Learned (retrospective)

**What went well.** Instrument-first paid off decisively — the occupancy probe +
pointer counters turned a 4-years-loose "Firefox synthetic-input" folk diagnosis
into a proven, falsifiable mechanism in one reproduction campaign, and cleanly
*refuted* the issue's own title. Fixing the true cause (not the symptom) let the
canonical assertion stay exactly as strict.

**Challenges.** The first fix attempt used distance-to-node-*centre* against a
40px margin and failed on a dense ~2600-node scatter (no point is 40px from any
centre); the corrected **edge-clearance** metric + max-selection + 10px floor was
the right model. Porch's iteration state machine needed an extra `porch done`
after each fix commit to move from the revision bundle to the next consult round.

**What would be done differently.** Nothing structural. The multi-iteration Codex
reviews (mechanism-prose correctness in Phase 6) materially improved the doc set's
honesty and were worth the rounds.

## Consultation Feedback (summary)

Every phase reached **unanimous 3-way APPROVE** (Gemini, Codex, Claude). Codex
drove the highest-value refinements: Phase 1 (pointer-log reset ordering), Phase 3
(FR2 heavyweight-diagnostic trim), Phase 4 (driver actually enforcing the full
matrix + clean-checkout validate), Phase 5 (fully retiring the README "mostly
green" framing), Phase 6 (marked correction notes + correcting the *mechanism*
prose, not just the #33 label). Gemini and Claude independently verified codebase
claims and the evidence chain throughout. Full per-iteration outputs + rebuttals
under `codev/projects/55-firefox-e2e-flake-background-d/`.

## Technical Debt / Follow-up Items

- **Flipping `DEFAULT_LOCAL_WORKERS` to parallel remains blocked** on the
  deterministic Chromium **SwiftShader parallel-contention** (4–5/22 on every
  parallel run) — unrelated to #55 and untouched here. Fixing #55 was
  *necessary-but-not-sufficient* (FR7). Options if revisited: fewer workers on the
  SwiftShader path, or moving the local gate off SwiftShader.
- **Click-to-focus flake #34** remains a separate open item (distinct test).
- The cheap node-occupancy probe (`__graphNodeOccupancyAtPoint` /
  `pickBackgroundDragPoint`) is retained in `tests/e2e/graph-handle.ts` for future
  background-point triage; the heavyweight diagnostic stays out-of-tree under
  `tests/diagnostics/55-drag/` as re-runnable evidence.
