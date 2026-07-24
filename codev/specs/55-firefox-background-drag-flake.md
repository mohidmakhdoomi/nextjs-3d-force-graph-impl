# Specification 55: Root-Cause and Fix the Firefox Background-Drag Rotation Flake (matrix.spec.ts:224)

## Summary

`[firefox] tests/e2e/matrix.spec.ts:224` — "zooms in with the wheel and rotates
with a background drag" — intermittently fails: the real `mouse.down → move
(steps: 12) → up` background drag produces essentially **no camera motion**
(measured deltas `0.002`–`0.004` against the canonical `MOTION_FLOOR > 1`),
then the 5 s settle poll expires. The flake has recurred across **three
independent qualification campaigns** (#41, #44/#52 feasibility, PR #50), on
**both** the SwiftShader software path and — decisively — on **verified native
hardware WebGL** (ANGLE/D3D12 on an RTX 3080). The hardware control arm
eliminates the "software-WebGL is too slow" explanation that fixed the
neighboring flakes #33 and #34: this is input-path nondeterminism, not
rasterizer timing. To date the project has (correctly) only accepted +
documented it — never masked with retries, never weakened the assertion — but
it has never been root-caused. This issue instruments the drag input path,
identifies the mechanism with discriminating evidence, applies the **smallest
behavior-preserving fix** (harness-first), qualifies it with repeated runs on
both engines and both rendering paths, and then completes the documentation
follow-through the tracking issue (#55) enumerates: re-run issue #41's GPU-lane
parallel qualification toward a green 3/3 opt-in path, correct the #41 review's
"revisit the default" follow-up so it cannot be misread, and fix the historical
"#33" misattributions to cite this issue.

### Why this is worth building

1. **It is the last open flake in the local qualification matrix.** #33 and
   #34 are closed; this is the only remaining `retries: 0` failure mode on the
   serial local gate, and it recurs roughly once per qualification campaign —
   each recurrence costs a full re-run plus disposition paperwork.
2. **It blocks a clean opt-in parallel story.** It was the *only* failure in
   #41's GPU-lane parallel qualification (1 of 3 runs). With it fixed, the
   opt-in parallel path (~4× faster local iteration) can be re-qualified green
   and its caveat retired.
3. **The flake-discipline debt compounds.** Three review documents and the
   README carry "known Firefox flake" caveats with a misattributed tracker
   (#33). Root-causing once ends the recurring per-campaign disposition cost
   and corrects the record.

## Problem Analysis

### Current state — failure signature and recurrence record

The test (`tests/e2e/matrix.spec.ts:224`) wheel-zooms in, waits for the camera
distance to stabilize, then performs a real background drag:

```ts
await page.mouse.move(150, 450);
await page.mouse.down();
await page.mouse.move(450, 250, {steps: 12});
await page.mouse.up();
// poll: cameraDelta(beforeDrag, snapshot) > MOTION_FLOOR (1), 5 s local
```

Recorded recurrences (all Firefox, all `retries: 0`):

| Campaign | Environment | Recurrence | Measured delta |
| --- | --- | --- | --- |
| #52 feasibility (3 full hardware runs) | Firefox, native D3D12 hardware WebGL | 1 / 3 | ≈ 0.002 |
| PR #50 local runs | Firefox local arm | 1 / 2 | — |
| #41 serial SwiftShader baseline | Firefox, software WebGL, serial | 1 run | 0.0038 |
| #41 GPU-lane parallel (10 workers) | Firefox, hardware WebGL, parallel | 1 / 3 | 0.00197 |
| #52 qualification (HW-1, Q-1..Q-3) | Firefox, hardware WebGL | 0 / 4 (13.2–13.3 s steady) | — |
| Repeated alone after #52 repro | Firefox, hardware | 0 / 5 | — |

Key facts the next investigation must respect:

- **It survives on verified hardware WebGL** — the renderer was asserted
  (`ANGLE ... D3D12 (NVIDIA GeForce RTX 3080)`), so SwiftShader/llvmpipe frame
  latency is *not* the mechanism (unlike closed issues #33 and #34).
- **The failure deltas are ~zero** (0.002–0.004), not "partial rotation."
  Auto-rotation is paused and zoom inertia settled at that point
  (`waitForStableCameraDistance`), so the signature says **no rotation was
  ever applied** — not "rotation was applied too slowly" or "only a fraction
  of the drag registered." Prior qualifications measured active rotation at
  ~440 units / 0.8 s, so even a single applied drag segment should clear
  `MOTION_FLOOR = 1` by orders of magnitude.
- **It is Firefox-dominant** on the serial/hardware paths (every serial and
  GPU-lane recurrence is `[firefox]`; Chromium fails this test only under the
  deterministic SwiftShader parallel-contention regime, which is a separate,
  out-of-scope artifact documented by #41).
- **It passes when repeated alone** (5/5 after the #52 reproduction) and
  passed 4/4 in #52's final qualification set — consistent with a
  per-run-randomized trigger (each test navigates fresh, and the force layout
  is randomly seeded per page load).

### Input-path anatomy (what sits between Playwright and the camera)

Investigation of the shipped code identifies three cooperating layers, each a
candidate failure point:

1. **Playwright → Firefox synthetic dispatch.** `page.mouse.move(..., {steps:
   12})` issues 12 protocol-level move messages through Firefox's Juggler
   remote agent. Delivery to the content process as DOM `pointermove` events
   is subject to Firefox's event coalescing (spec-sanctioned: `pointermove` is
   delivered at most once per animation frame, with intermediates available
   only via `getCoalescedEvents()`) and to scheduling nondeterminism.
2. **`TrackballControls` (three/addons).** Attaches `pointerdown` on the
   canvas; the document-level `pointermove`/`pointerup` listeners are attached
   only *inside* the pointerdown handler
   (`TrackballControls.js:663-664`). Rotation state is a `_movePrev →
   _moveCurr` pair: each pointermove advances the pair, and the delta is
   consumed once per `update()` frame (`_rotateCamera()` ends with
   `_movePrev.copy(_moveCurr)`). Consequences: (a) multiple moves landing
   between two frames collapse to the final segment; (b) if `update()` is not
   called, no rotation is ever applied regardless of what was delivered.
3. **`3d-force-graph` node `DragControls` — a second, competing consumer on
   the same canvas.** When `enableNodeDrag && enablePointerInteraction` (both
   true post-enablement in `FocusGraph.tsx`), `3d-force-graph` instantiates
   three.js `DragControls` over **every node mesh**
   (`3d-force-graph.mjs:353-375`). On its own pointerdown raycast hitting a
   node it fires `dragstart`, which executes `controls.enabled = false`
   ("Disable controls while dragging") and **locks the node** (`fx/fy/fz`
   set). `three-render-objects` then skips the Trackball entirely
   (`state.controls.enabled && state.controls.update(...)`,
   `three-render-objects.mjs:264`) — the camera cannot move, no matter how
   faithfully the drag was delivered.

### Hypotheses to discriminate (with the evidence each predicts)

**H1 — Stray node capture (geometry/probability, layer 3).** The "background"
start point `(150, 450)` occasionally has a node mesh under it: the test drags
*after* wheel-zooming in, node projections grow with proximity, and the force
layout is randomly seeded per run. If the pointerdown raycast hits a node,
`DragControls` captures the gesture, disables the Trackball, and the drag
moves a *node* instead of the camera — delta ≈ 0, exactly the observed
signature. This would also explain Firefox dominance mechanically: the
click-to-focus test documents that per-`deltaY` zoom effect "differs by an
order of magnitude between engines," so the same `wheel(0, -240)` leaves
Firefox's camera much closer → larger node projections → higher hit
probability at the fixed screen point. Predicted discriminators on a failing
run: `fixedNodeCount ≥ 1` after the drag (dragstart locks the node),
`controls.enabled === false` during the drag window, `DragControls`
`dragstart` fired, a node raycast-hit at `(150, 450)` at pointerdown time.

**H2 — Firefox synthetic-input delivery loss (layer 1→2).** The pointer
stream is delivered defectively: no `pointermove` arrives between down and up
(all coalesced away or dropped), or moves arrive after `pointerup` detaches
the listeners, or the `pointerdown` itself is not delivered to the canvas (so
the document listeners never attach). Predicted discriminators: page-side
event counters show the defect directly (0 moves between down and up, or
missing down); `controls.enabled` stays `true` throughout; `fixedNodeCount`
stays 0; Trackball `_state` never reaches ROTATE or reaches it with no
delta. Note the ~zero deltas argue against the milder "moves collapsed to the
final segment" variant — a single 25 px segment should still clear the floor —
so if H2 is the mechanism it is *total* non-delivery, which counters are
well-suited to prove.

**H3 — Drag-readiness race (layer 2/app).** The drag is issued before the
control is actually drag-ready (e.g. an enabled-toggle or listener-attach
ordering issue at that instant). The test already waits for
`controlsEnabled === true` via the probe before dragging, so this is the least
likely; instrumentation should still record `controls.enabled` and listener
state at pointerdown to close it out.

These hypotheses are exhaustive over the three layers, mutually discriminable
from **one** instrumented failing occurrence, and none require modifying app
behavior to observe.

### Desired state

- The mechanism is identified and documented with discriminating evidence
  (not a plausible story — recorded instrumentation output from a failing or
  statistically demonstrative run).
- The smallest behavior-preserving fix lands (harness strongly preferred),
  the test still performs a **real** background `down → move → up` drag
  asserted against the **unchanged** `MOTION_FLOOR`, and repeated
  qualification runs are green on both engines, both rendering paths.
- #41's GPU-lane parallel qualification is re-run and (absent this flake) the
  opt-in-parallel caveat is retired; the #41 "revisit the default" follow-up
  is corrected; the historical "#33" misattributions cite this issue.

### Stakeholders

- **Local qualification operators** — run the serial gate and GPU lane; carry
  the per-campaign disposition cost today.
- **CI contract** — must remain byte-for-byte untouched (this is a local-arm
  flake; Firefox does not run in CI).
- **Future flake triage** — inherits the corrected record and the
  instrumentation approach for any successor flake.

## Confirmed Decisions

1. **Flake discipline is inviolable.** No retries are added anywhere local;
   the canonical `MOTION_FLOOR > 1` assertion is not weakened, relocated
   behind a retry loop, or made conditional. A drag-retry loop inside the
   harness is likewise **masking** and is rejected (it hides the mechanism
   the same way `retries: 1` would).
2. **CI and the serial gate are untouched.** `.github/workflows/validation.yml`
   must not appear in the diff; `workers: 1` under `CI` and the serial local
   default (`DEFAULT_LOCAL_WORKERS = 1`) are out of scope regardless of
   outcome (the Chromium SwiftShader parallel-contention blocker is untouched
   by this issue — see FR7).
3. **Instrument first, fix second.** No fix may land ahead of recorded
   discriminating evidence identifying the mechanism (H1/H2/H3 or a
   demonstrated fourth). A fix justified only by "it stopped happening" is
   insufficient — the mechanism must explain the historical signature
   (~zero delta, Firefox-dominant, hardware-surviving, repeat-alone-green).
4. **Harness-first fix ownership.** The fix belongs in `tests/e2e/`
   (`pointer.ts` / `matrix.spec.ts` / `graph-handle.ts` probe) unless the
   evidence demonstrates an app defect; any app change must be
   behavior-preserving for real users and separately justified. The drag must
   remain a real synthetic pointer gesture — no programmatic camera rotation,
   no `page.evaluate` camera manipulation substituting for input.
5. **Bounded reproduction budget with an honest fallback.** Reproduction uses
   amplification (targeted `--repeat-each` of the single Firefox test,
   instrumented full-suite runs, and `E2E_WORKERS` parallel GPU-lane runs —
   the historical highest-rate regime). If, after a recorded budget of at
   least ~60 instrumented targeted repetitions plus ≥ 3 instrumented full
   two-engine runs plus ≥ 3 parallel GPU-lane runs, no failure reproduces,
   the H1 geometry question is still decidable **statistically without a
   failure** (measure node-occupancy of the start point across N fresh
   layouts post-zoom, per engine); a preventive fix may then ship only if
   that measurement demonstrates the mechanism, with the disposition
   documented honestly in the review.
6. **Instrumentation must ride along cheaply.** Diagnostic capture must be
   active in the same runs used for reproduction (page-side counters/probe
   fields, dumped on failure), so a single failing occurrence yields the
   discriminating evidence — reproduction is too expensive to burn on
   uninstrumented failures. Instrumentation is harness-side observation
   (`addInitScript` / probe extension); the app is not modified for
   observability.
7. **Documentation follow-through is in scope and sequenced last.** The #41
   parallel re-qualification, caveat retirement, follow-up correction, and
   "#33" misattribution fixes (FR6–FR8) are part of this issue's Definition
   of Done, executed after the fix is qualified so the wording reflects the
   actual outcome. Historical review/spec documents are corrected via clearly
   marked correction notes citing #55 — not silent rewrites of qualification
   history.
8. **Numbering.** This project is Spec 55, tracking GitHub issue #55; the
   three documents are `codev/{specs,plans,reviews}/55-firefox-background-drag-flake.md`.

## Scope

### In scope

- Amplified, instrumented reproduction of the Firefox background-drag failure
  (`matrix.spec.ts:224`) per Decision 5.
- Harness-side instrumentation of the drag input path (pointer event
  counters, Trackball/DragControls state capture, node-under-point raycast
  probe, `fixedNodeCount`/`controls.enabled` before/after drag).
- Root-cause determination with recorded discriminating evidence.
- The minimal behavior-preserving fix (harness-first), e.g. a
  `settleBackgroundDrag`-style helper in `tests/e2e/pointer.ts` (frame-settled
  down/move/up, analogous to `settleHoverThenClick`) and/or a probe-verified
  genuinely-background start point — whichever the evidence selects.
- Qualification: repeated green runs, both engines, SwiftShader path and
  native-GPU lane, `retries: 0`, recorded verbatim.
- #41 GPU-lane parallel FR9 re-qualification and caveat/documentation
  updates (FR6–FR8).

### Out of scope (non-goals)

- The Chromium SwiftShader parallel-contention failures (deterministic 4–5/22
  under parallel; documented by #41; unaffected by this fix).
- Flipping `DEFAULT_LOCAL_WORKERS` or any change to the serial local default
  (explicitly blocked on the SwiftShader contention problem — FR7 makes the
  record say exactly this).
- Any CI workflow change, any `package.json`/lockfile change, any app feature
  work.
- Re-fixing or re-opening #33 / #34 (closed, different tests, different
  mechanisms).

## Constraints and Invariants

- **Flake discipline**: `retries: 0` locally; canonical assertion and
  `MOTION_FLOOR` unchanged; no skipped or weakened test (arch-critical:
  Validation Baseline; lessons-critical: Validation Evidence).
- **CI contract**: `.github/workflows/validation.yml` byte-for-byte
  unchanged; `workers: 1` whenever `CI` is set; `E2E_ENGINES=chromium` in CI.
- **Reproducibility contract**: exact Node/npm from `package.json`/`.nvmrc`,
  lockfile v3, `npm ci`; no dependency regeneration.
- **Green gate**: `npm run validate` green on the final tree; evidence for
  nonzero diagnostics preserved, not suppressed.
- **Honest evidence**: every qualification claim carries the verbatim run
  banner/per-test output in the review, per the #41/#52 house pattern;
  silent truncation of the reproduction budget is recorded as such.
- **Test semantics preserved**: the test must still prove "a real background
  drag rotates the camera" — a fix may make the *background* premise true
  (verified-background start point) or the *delivery* reliable
  (frame-settled gesture), but may not substitute programmatic camera motion
  or assert anything weaker.

## Solution Exploration

### Approach A: Blind timing/step retune (more steps, slower moves, longer settles)

Bump `steps`, add `waitForTimeout`s, and hope. Rejected: unevidenced — it
cannot distinguish H1 (which no amount of slower moving fixes: the node is
*under the start point* before the first move) from H2 (which it might merely
make less probable), leaves the mechanism unknown, and repeats the exact
pattern the project's flake discipline exists to prevent. Any timing change
that does ship must be selected *by* the evidence, not instead of it.

### Approach B: Instrument-first root-cause, then the minimal targeted fix (selected)

Extend the existing harness observation layer (`graph-handle.ts` probe /
`addInitScript`) with drag-path diagnostics that discriminate H1/H2/H3 from a
single occurrence: per-event counters on canvas and document
(`pointerdown/move/up` with coordinates and timestamps), `controls.enabled`
sampled across the drag window, `fixedNodeCount` before/after, and a
raycast/`DragControls`-objects check of the start point at pointerdown.
Reproduce under amplification (Decision 5), capture a failing occurrence,
document the mechanism, then apply the smallest fix the evidence selects:

- **If H1**: pick the drag start point through the probe — an inverse of
  `pickNodeScreenPoint` returning a screen point verified node-free (with a
  pixel margin) in the current layout — so the "background drag" premise is
  actually true every run; optionally combined with a frame-settled gesture
  helper. This *strengthens* test fidelity (today's fixed `(150, 450)` only
  probabilistically hits background).
- **If H2**: a `settleBackgroundDrag` helper in `pointer.ts` mirroring the
  `settleHoverThenClick` precedent (#34): real animation frames between
  down / each move segment / up, so every segment is delivered and consumed
  by an `update()` frame; step count/geometry chosen from the recorded
  delivery evidence.
- **If H3**: settle frames between `down` and the first `move` (subsumed by
  the H2 helper shape).

The committed canonical suite keeps only behavior-preserving harness changes;
heavyweight diagnostics stay in scratch/evidence unless they are cheap,
silent-in-passing-runs probe fields worth keeping for future triage.

### Approach C: Bounded in-harness drag retry ("drag again if the camera didn't move")

Would keep the assertion intact syntactically while hiding the mechanism
operationally — a retry by another name. Rejected per Decision 1; the #52
review's disposition language ("never mask") binds this issue too.

## Functional Requirements

### FR1 — Amplified, instrumented reproduction

Reproduce the failure under instrumentation using, in increasing order of
cost: targeted `--repeat-each` runs of the single Firefox test (SwiftShader
path and GPU lane), full two-engine suite runs, and `E2E_WORKERS`-parallel
GPU-lane runs (historically the highest recurrence rate). Record every run
(environment, renderer evidence for GPU-lane runs, seed conditions, verbatim
result) whether or not it fails. The Decision-5 budget bounds the effort; its
exhaustion (if reached) is recorded, and the statistical H1 fallback engages.

### FR2 — Discriminating instrumentation, harness-side only

Diagnostics sufficient to attribute one failing occurrence to H1, H2, H3, or
a demonstrated fourth mechanism: pointer-event counters/log (canvas +
document), `controls.enabled` trace across the drag window, `fixedNodeCount`
before/after the drag, start-point node-occupancy at pointerdown, and camera
position samples. All capture is harness-side (`addInitScript`, probe
extension, or a diagnostic spec variant); app code is not modified for
observability; passing-run overhead is negligible so the instrumentation can
ride every reproduction run (Decision 6).

### FR3 — Root cause documented with evidence

The review document states the mechanism, the discriminating evidence
(verbatim instrumentation output), and why it explains the full historical
signature: ~zero deltas, Firefox dominance, hardware survival, repeat-alone
greens, and amplification under parallel contention. If the statistical
fallback was used, the review says so explicitly and shows the measurement.

### FR4 — Minimal behavior-preserving fix

The evidence-selected fix from Approach B, constrained by Decisions 1–4: the
test still issues a real background `down → move → up`; `MOTION_FLOOR` and
`retries: 0` unchanged; no app behavior change for real users; no retry
loops. The diff is minimal and confined to `tests/e2e/` unless FR3's evidence
demonstrates an app defect (in which case the app change is
behavior-preserving and separately argued in the review).

### FR5 — Fix qualification, both engines, both rendering paths

At `retries: 0`, all recorded verbatim in the review:

- Targeted repetition of the fixed test on the Firefox arm at a volume that
  meaningfully exceeds the historical recurrence rate (≥ the Decision-5
  targeted budget), on both the SwiftShader path and the native-GPU lane.
- ≥ 3 consecutive green full two-engine serial runs on the SwiftShader path
  (`npm run test:smoke` semantics — the gate's environment).
- ≥ 3 consecutive green full two-engine runs on the native-GPU lane with
  renderer evidence asserted (the #44/#52 lane pattern).
- `npm run validate` green on the final tree.

Chromium must remain green throughout (no regression from harness changes —
the helper/start-point change executes on both engines).

### FR6 — #41 GPU-lane parallel re-qualification and caveat retirement

After FR5, re-run issue #41's GPU-lane **parallel** qualification
(`E2E_WORKERS=50%` on the hardware lane, 3 runs, `retries: 0`). On a green
3/3: update `README.md`'s opt-in-parallel "Known Firefox flake" caveat
(retire it) and append the re-run evidence to
`codev/reviews/41-parallelize-local-e2e-runs.md` ("Qualification Evidence",
as a dated addendum). If the re-run is *not* 3/3 green, record the outcome
honestly, disposition any new failure per flake discipline (dedicated issue,
no masking), and update the caveat to cite the new tracker instead of
retiring it. This requirement does **not** change the serial default (FR7).

### FR7 — Correct the #41 "revisit the default" follow-up

Amend `codev/reviews/41-parallelize-local-e2e-runs.md`'s Follow-up item so it
cannot be misread as "this flake fixed ⇒ parallel default": fixing #55 is
necessary-but-not-sufficient; flipping `DEFAULT_LOCAL_WORKERS` additionally
requires solving the deterministic Chromium SwiftShader parallel-contention
failures (4–5/22 on every parallel run), e.g. fewer workers on the
SwiftShader path or the gate moving off SwiftShader — neither of which this
issue attempts.

### FR8 — Correct the "#33" misattributions (last, wording reflects the outcome)

Update, via clearly marked correction notes citing issue #55 (Decision 7):

- `codev/reviews/41-parallelize-local-e2e-runs.md` — the "flake #33" mentions
  in "Qualification Evidence" and "Flaky Tests / Disposition" (and the README
  cross-references they anchor).
- `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md` and
  `codev/specs/52-firefox-hardware-webgl-gpu-lane.md` — the "#33 family" /
  "Known Stability Caveat" mentions.
- `README.md` — the "Known Firefox flake" note (updated or removed per FR6's
  outcome; all remaining references cite #55, not #33).

## Non-Functional Requirements

### Evidence honesty

Every reproduction, qualification, and re-qualification run appears in the
review with verbatim banners/per-test lines; failed or aborted runs are
recorded, not discarded; budget exhaustion and fallbacks are labeled as such.

### Behavior preservation

Real-user behavior of the app is unchanged; the canonical CI path is
byte-for-byte unchanged; the serial local gate contract is unchanged.

### Reproducibility

Toolchain per the repo contract (`.nvmrc`, lockfile v3, `npm ci`); no
dependency changes; GPU-lane runs record the verified renderer strings.

### Maintainability

Any retained probe/diagnostic fields are documented in `graph-handle.ts` at
the existing comment standard; the fix helper (if any) lives beside
`settleHoverThenClick` with the same mechanism-explaining comment style.

## Risks and Mitigations

- **The flake does not reproduce within budget.** Mitigation: Decision 5's
  statistical H1 fallback (node-occupancy measurement across fresh layouts is
  failure-independent); instrumentation rides every run so no occurrence is
  wasted; the budget and outcome are recorded honestly either way.
- **The fix reduces what the test proves.** Mitigation: FR4's semantics
  constraint — a verified-background start point *strengthens* the premise;
  frame-settled delivery only adds self-scaling waits (the
  `settleHoverThenClick` precedent trimmed nothing).
- **The #41 parallel re-run surfaces a different failure.** Mitigation: FR6's
  explicit non-green branch — honest disposition, dedicated tracker, caveat
  updated rather than retired.
- **Hardware dependence of the GPU-lane evidence.** The lane requires the
  qualified local host (WSL2 Mesa d3d12 / RTX 3080). Mitigation: the
  SwiftShader arm of FR5 is host-independent; GPU-lane runs record renderer
  evidence per the lane's own honesty rules.
- **Chromium regression from a shared harness change.** Mitigation: FR5
  qualifies both engines; the helper is exercised on both.

## Acceptance Scenarios

### Scenario 1 — Instrumented reproduction

An instrumented run reproduces the failure; the captured diagnostics
unambiguously select one hypothesis (e.g. `fixedNodeCount` 0→1 with
`controls.enabled === false` during the drag ⇒ H1; zero pointermoves between
down and up with controls enabled ⇒ H2). The evidence is committed to the
review.

### Scenario 2 — Fix under targeted repetition

The fixed test, repeated on the Firefox arm beyond the historical recurrence
volume on both rendering paths at `retries: 0`, is green throughout, with the
unchanged `MOTION_FLOOR` assertion.

### Scenario 3 — Gates and lanes green

`npm run validate` green; ≥ 3/3 green serial SwiftShader full runs; ≥ 3/3
green GPU-lane full runs with asserted renderers.

### Scenario 4 — #41 parallel re-qualification

`E2E_WORKERS=50%` GPU-lane runs ×3 recorded; on 3/3 green the README caveat
is retired and review 41 gains the dated addendum; otherwise the honest
branch executes.

### Scenario 5 — Record corrected

No remaining document attributes this flake to #33; all caveat/flake
references cite #55 with wording that matches the actual outcome; the #41
follow-up states the necessary-but-not-sufficient relationship.

## Success Criteria

- [ ] Failure reproduced under instrumentation (or Decision-5 fallback
      engaged and recorded) — FR1/FR2.
- [ ] Mechanism documented with discriminating evidence — FR3.
- [ ] Minimal behavior-preserving fix landed; no retries, no weakened
      assertion, CI untouched — FR4.
- [ ] Both-engine, both-path qualification recorded green — FR5.
- [ ] #41 GPU-lane parallel FR9 re-run executed and dispositioned; caveat
      retired or re-targeted — FR6.
- [ ] #41 "revisit the default" follow-up corrected — FR7.
- [ ] "#33" misattributions corrected to cite #55 — FR8.
- [ ] `npm run validate` green on the final tree.

## Dependencies

- Playwright toolchain and browsers already pinned by the repo.
- Native-GPU lane (`npm run test:e2e:gpu`, specs #44/#52) available on the
  qualified local host for the hardware arms of FR1/FR5/FR6.
- No new packages; no dependency version changes.

## References

- GitHub issue #55 (this tracker; Definition of Done mirrored above).
- `tests/e2e/matrix.spec.ts:224` (the test), `tests/e2e/pointer.ts`
  (`settleHoverThenClick`, the #34 precedent), `tests/e2e/graph-handle.ts`
  (probe).
- `node_modules/three/examples/jsm/controls/TrackballControls.js` (rotation
  state machine; document-listener attach at pointerdown),
  `node_modules/3d-force-graph/dist/3d-force-graph.mjs:353-375`
  (`DragControls` + `controls.enabled = false` on node dragstart),
  `node_modules/three-render-objects/dist/three-render-objects.mjs:264`
  (`update()` gated on `controls.enabled`).
- `codev/reviews/41-parallelize-local-e2e-runs.md` (qualification evidence,
  flake disposition, follow-up to correct);
  `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md` and
  `codev/specs/52-firefox-hardware-webgl-gpu-lane.md` (Known Stability
  Caveat / Decision 10); `README.md` (Known Firefox flake note).
- Closed issues #33 (enable-delay inertness race — distinct) and #34
  (click-to-focus hover race — distinct); issues #44/#52 (native-GPU lane).
