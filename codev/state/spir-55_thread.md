# spir-55 — Firefox background-drag rotation flake (matrix.spec.ts:224)

Builder thread for Spec 55. STRICT mode (porch-orchestrated). GitHub issue #55.

## Context

Root-cause + fix the Firefox `[firefox] tests/e2e/matrix.spec.ts:224`
"zooms in with the wheel and rotates with a background drag" flake:
the real `mouse.down → move(steps:12) → up` background drag intermittently
produces ~zero camera motion (delta 0.002–0.004 vs `MOTION_FLOOR > 1`).
Survives on verified hardware WebGL, so it is input-path nondeterminism,
not rasterizer timing (unlike closed #33 / #34). Instrument-first, then the
smallest behavior-preserving harness fix. Documentation follow-through
(FR6–FR8) sequenced last.

## Log

### Specify — start
- Resumed in worktree `.builders/spir-55`. `porch status`: phase=specify.
- Spec already exists and is committed (`d626ef5`), fully developed:
  Summary, Problem Analysis (H1/H2/H3 hypotheses over 3 input layers),
  8 Confirmed Decisions, Scope, Constraints, Solution Exploration (A/B/C,
  B selected: instrument-first), FR1–FR8, NFRs, Risks, 5 Acceptance
  Scenarios, Success Criteria, Deps, References.
- Read it fully. It honors the issue's baked constraints (flake discipline,
  CI untouched, harness-first). No rewrite needed — reviewing/improving only.
- Next: `porch done 55` to trigger the 3-way spec consultation.

### Specify — iter 1 consultation
- 3-way ran: **Gemini APPROVE (HIGH)**, **Claude APPROVE (HIGH)**,
  **Codex REQUEST_CHANGES (HIGH)**. Claude independently verified every
  technical claim (line numbers, TrackballControls/DragControls internals,
  config invariants) against the codebase — all confirmed exact.
- Codex's 2 actionable points (both accepted, not rebutted):
  1. Decision 5 lacked a terminal outcome for the doubly-negative branch
     (no repro AND H1 occupancy negative/inconclusive).
  2. Instrumentation final-state ambiguous — committed vs evidence-only.
- Applied to spec: Decision 5 now defines the doubly-negative terminal
  outcome (no speculative fix; honest negative; consolidate under #55;
  fix-independent FR7/FR8 still done; FR6 caveat re-pointed not retired;
  optional defense-in-depth strengthening allowed but labeled not-root-cause;
  folds in Claude's fourth-mechanism note). FR2 gains an authoritative
  committed-vs-evidence-only rule; Decision 6 + Approach B cross-ref it.
  Added a Consultation Log section to the spec.
- Wrote rebuttal: `55-specify-iter1-rebuttals.md`. Committing spec + consult
  outputs + rebuttal, then `porch done 55` for re-verification.
- Committed `d6e7400`. Gate `spec-approval` reached; notified architect.

### Spec approved → Plan phase
- Architect approved spec (2026-07-24). Porch advanced to plan.
- Codebase recon before drafting the plan (grounding):
  - `matrix.spec.ts:224` matches spec exactly (`move(150,450); down;
    move(450,250,{steps:12}); up;` poll `cameraDelta > MOTION_FLOOR(1)`).
  - Probe `graph-handle.ts` ALREADY exposes the H1/H2/H3 surface:
    `controlsEnabled`, `fixedNodeCount`, `noPan` in `GraphSnapshot`, plus
    `pickNodeScreenPoint`/`fixBestNode`/`nodeScreenPointById`,
    `contextLostCount`. Phase-1 instrumentation is a modest extension
    (pointer counters, node-occupancy-at-arbitrary-point, controls sampling),
    NOT from scratch.
  - `pointer.ts` has `settleHoverThenClick` + `waitForAnimationFrames`
    (frame-settling precedent for a `settleBackgroundDrag` sibling).
  - `playwright.config.ts`: retries 0 local / 2 CI, `E2E_ENGINES` engine
    filter, `resolveWorkers`, firefox project (`webgl.force-enabled`).
  - **Firefox browser NOT installed** (Playwright cache has chromium only)
    → `npx playwright install firefox` is a Phase-1 prereq / top risk.
  - GPU lane `scripts/e2e-gpu-lane.mjs` runnable on this WSL2 host class
    (Firefox HW WebGL proven here); `--engine`, `--probe-only`,
    `E2E_GPU_FORCE_FALLBACK`, `E2E_GPU_REQUIRE`.
  - **Discovered extra `#33` misattribution at `playwright.config.ts:114`**
    ("amplify the known Firefox flake #33 even on hardware") — NOT in FR8's
    file list. Flagging in the plan (comment-only, behavior-preserving; but
    tension with Decision 2 "serial gate untouched" → confirm via review).
- Drafting 6-phase plan (instrument → reproduce/root-cause → fix → qualify →
  #41 re-qual/caveat → record corrections).
- Committed initial plan `1577be3`; checks pass (plan_exists, has_phases_json,
  min_two_phases=6).

### Plan — iter 1 consultation
- 3-way: **Gemini APPROVE (HIGH)**, **Claude APPROVE (HIGH)**,
  **Codex REQUEST_CHANGES (HIGH)**. Gemini + Claude verified all codebase
  refs. Full FR1–FR8 + 8-Decision coverage confirmed.
- Codex's 2 points (both accepted):
  1. `tests/e2e/matrix.drag-diagnostic.spec.ts` WOULD be collected by
     `testDir:./tests/e2e` → changes canonical suite. (Claude wrongly assumed
     the separate file sufficed; Codex correct.)
  2. `playwright.config.ts:114` #33 comment: FR8 wants it corrected; comment-
     only edit doesn't violate Decision 2 → include, don't defer.
- Applied: Phase 1 diagnostic is now **out-of-tree** (`tests/diagnostics/
  55-drag/` + dedicated `--config`), acceptance proves non-collection via
  `playwright test --list`; Phase 3 trim reworded. Phase 6 **includes** the
  config comment fix (comment-only, Decision-2 rationale), grep/risk/docs
  updated. Added plan Consultation Log; wrote `55-plan-iter1-rebuttals.md`.
- Committing plan + consult outputs + rebuttal, then `porch done 55`.

## Implement — Phase 1 (drag-path instrumentation) — 2026-07-24

Plan-approval gate approved (architect, 2026-07-24). Both heads-ups accepted:
(1) install Firefox via playwright cache (no package.json/lockfile change);
(2) include the comment-only `playwright.config.ts:114` `#33`→`#55` fix under
FR8 (deferred to Phase 6). Advanced to implement phase_1.

### Environment prereqs resolved
- Worktree had NO `node_modules` and NO Playwright browsers on entry.
  Ran `npm ci` (toolchain matched contract exactly: node 22.23.1 / npm 10.9.8;
  lockfile v3). Ran `npm run browser:install` (repo-pinned Playwright 1.61.1)
  → chromium-1228 + firefox-1532 in `~/.cache/ms-playwright`. NOTE: an earlier
  bare `npx playwright install firefox` pulled firefox-1532 (ok) but chromium
  needed the pinned 1228 (cache had stale 1217) — `browser:install` fixed it.
  Browser-cache only; no manifest/lockfile change (arch-critical Reproducibility).

### Deliverables (all committed to tests/, zero app-code change)
- `tests/e2e/graph-handle.ts` probe extended (rides every run, silent in
  passing runs):
  - `__graphNodeOccupancyAtPoint(x,y)` — H1 discriminator. Mirrors the three
    DragControls hit-test: NDC from the canvas rect → camera ray → ray-sphere
    against each `node.__threeObj` world sphere. Returns hit/hitNodeId/hitDepth
    + screen-space nearest node (id, px distance, projected radius, within-disk)
    + candidate count. THREE.Vector3 reached via `camera.position.constructor`
    (app exposes no global THREE), so no page-context import.
  - `__graphControlsSample()` — cheap TrackballControls sample (enabled, state
    [_STATE enum], keyState, _moveCurr/_movePrev). For mid-drag sampling.
  - Pointer-event counters via the existing addInitScript: capture-phase
    document listeners (before app code, read-only) counting
    pointerdown/move/up (canvas-tagged too) + bounded coord/timestamp ring
    (`__pointerLog` / `__readPointerLog` / `__resetPointerLog`). H2 delivery
    loss = "0 pointermoves between down and up".
  - Exported wrappers: nodeOccupancyAtPoint / sampleControls / resetPointerLog
    / readPointerLog.
- `tests/diagnostics/55-drag/` OUT-OF-TREE harness (evidence-only; NOT in the
  canonical `testDir: ./tests/e2e`):
  - `playwright.diag.config.ts` — testDir ".", mirrors canonical projects/
    engines/webServer + the PW_CHROMIUM_ARGS SwiftShader-or-hardware hook +
    firefox pref + resolveWorkers (so Phase 2 can point it at the GPU lane /
    E2E_WORKERS parallel). retries: 0.
  - `drag-diagnostic.spec.ts` — reproduces the exact :224 gesture two ways:
    "faithful" (single move({steps:12}) — real dispatch timing, H2 counters)
    and "stepped" (per-segment moves with mid-drag controls/state sampling,
    H1 during-drag). Dumps all discriminating fields on a below-floor drag;
    `DIAG_MOTION_FLOOR` override induces a guaranteed failure to demo the dump.

### Root-cause mechanics confirmed while designing (feeds Phase 2)
- DragControls (per node mesh) raycasts on pointerdown; a hit fires `dragstart`
  → `controls.enabled=false` + locks node → three-render-objects skips
  `controls.update()` → camera cannot move (delta≈0 = the observed signature).
- CRITICAL: 3d-force-graph `dragend` restores `controls.enabled=true` on
  pointerup (`if (state.enableNavigationControls) controls.enabled=true`), so
  the H1 "disabled during drag" signal is ONLY visible MID-drag → the stepped
  variant exists for exactly this. After-drag discriminators: fixedNodeCount
  up + occupancy-hit-at-start.

### Phase-1 acceptance evidence
- Canonical suite provably unchanged: `npx playwright test --list` = 22 tests
  in 3 files (matrix/right-click-release/smoke), 0 diagnostics collected.
  Diagnostic config lists exactly its 4 tests (2 variants × 2 engines).
- Induced-failure dump path proven on BOTH engines (DIAG_MOTION_FLOOR=100000):
  full field dumps captured (occupancy hit=false/nearestPx/projRadius,
  controls.enabled before/after, fixedNodeCount before/after, pointer
  down=1/move=13/up=1, mid-drag step samples state=0 ROTATE → -1 NONE).
- Harness passes cleanly at real floor=1 (firefox both variants green, delta
  ~3500/3112 > 1) — no false-fail.
- `npm run typecheck` clean; `npm run lint` clean on real source (app/tests/
  scripts/config). The ONLY lint errors are in the UNTRACKED builder-harness
  file `.claude/hooks/worktree-write-guard.cjs` (absent from clean checkouts) —
  environment noise per lessons-critical, NOT suppressed in committed config.
- Full canonical two-engine suite: running (background) to confirm green.

### Canonical two-engine suite — GREEN
`npx playwright test` (default config, retries: 0, serial SwiftShader):
**22 passed (11.4m)**, both engines, including `[firefox]
matrix.spec.ts:224` (the flaky test) green at 13.3s — consistent with its
"passes when repeated alone" signature; no regression from the probe
instrumentation. Phase 1 acceptance complete. Committing phase_1.

Note (env hygiene, not a project failure): the node unit suite `npm test`
shows 1/121 failing — `toolchain.test.mjs` "declares the exact Node and npm
baseline" — because this shell's `$npm_config_user_agent` is a stale
`pnpm/10.33.0 npm/?` value (though `which npm` = nvm npm 10.9.8). Proven
pre-existing: it fails identically with my graph-handle.ts change stashed, and
`npm test` (node --test) is NOT part of the `validate` green gate
(validate = lint && typecheck && test:smoke). Same category as the untracked
`.claude/hooks` lint noise. To be re-proven on a clean checkout in Review.

### BLOCKED on porch phase_1 `tests` check — session env contamination
`porch done 55` ran its implement-phase checks: `build` ✓ (9.8s), `tests` ✗
(5.3s). The `tests` check = the node unit suite (`npm test` → node --test).
It fails on exactly ONE assertion: `toolchain.test.mjs` "declares the exact
Node and npm baseline", which requires `$npm_config_user_agent` to start with
`npm/10.9.8`.

Root cause = the pnpm-launched agent-farm session exports
`npm_config_user_agent=pnpm/10.33.0 npm/? node/v22.23.1` (plus a suite of
pnpm `npm_config_*` / `pnpm_config_*` vars, globalconfig=/home/user/.config/
pnpm/rc). The REAL toolchain is genuinely npm 10.9.8 (`which npm` = nvm's npm,
`npm --version` = 10.9.8); the pnpm user-agent is a spurious value inherited
from the session launcher that npm treats as a config override and does not
replace.

Proof it is env-only, not my code and not a project defect:
- `env -u npm_config_user_agent npm test` → **121/121 pass** (0 fail).
- Fails identically with my graph-handle.ts change stashed (git stash) — so
  it would fail on `main` in this same session too.
- Not in the `validate` green gate (validate = lint && typecheck &&
  test:smoke; node --test is separate). CI / clean checkouts set the
  user-agent to npm/10.9.8 naturally, so the assertion passes there.

Proposed resolution (replicates clean-checkout conditions, changes NO committed
file, does NOT weaken the test): invoke porch with the spurious var removed —
`env -u npm_config_user_agent porch done 55`. Escalated to architect for a
go-ahead vs. a session-level env fix before proceeding (strict mode: not
working around a porch check unilaterally).

### Phase_1 — iter 1 consultation (3-way: Gemini, Codex, Claude)
- **Gemini APPROVE (HIGH)**, **Claude APPROVE (HIGH)** — Claude verified the
  raycast math (parametric ray-sphere, behind-camera exclusion), the FR2
  committed-vs-evidence separation, and the 22/22 no-regression. Non-blocking:
  readRenderer used getContext("webgl") (null on three's WebGL2 canvas);
  waitForPointerEnablement duplicated (acceptable).
- **Codex REQUEST_CHANGES (HIGH)** — one legit blocking bug: the diagnostic
  reset the pointer log BEFORE the pre-drag `mouse.move(DRAG_START)`
  positioning move, so that move was counted in `pointerLog.move` and
  mislabeled "pointermoves between down and up"; a true H2 (0 delivered drag
  moves) would still read >=1, masking the discriminator.
- **Applied (both accepted):**
  - Codex: reset pointer log AFTER the positioning move; ALSO added
    `movesBetweenDownAndUp(log)` deriving the count strictly between the down
    and up events from the recorded sequence (belt+suspenders), reported +
    attached. Verified both engines: pointer move=12, movesBetweenDownUp=12
    (was 13). A true 0-move H2 case now reads 0.
  - Claude (non-blocking, but Phase-2 renderer evidence depends on it): fixed
    readRenderer to `getContext("webgl2") ?? getContext("webgl")`.
- Fix is confined to the out-of-tree `drag-diagnostic.spec.ts` (canonical suite
  + graph-handle.ts untouched), so the 22/22 canonical green still stands.
  typecheck + lint clean. Committing, then re-consult (iter 2).

### Phase_1 — iter 2 consultation: UNANIMOUS APPROVE
Gemini APPROVE (HIGH), Codex APPROVE (HIGH), Claude APPROVE (HIGH) — all "no
key issues". Codex confirmed the pointermove-count fix resolves its iter-1
REQUEST_CHANGES. Phase_1 verified complete. Advancing via porch.

## PAUSED after Phase 1 (per user instruction) — 2026-07-24
Phase_1 (drag-path instrumentation) COMPLETE and unanimously approved; porch
committed the transition (`901df83 advance plan phase → phase_2`). Worktree
clean (only untracked builder-harness files). Per user instruction "pause once
phase 1 is complete", stopping here — NOT starting phase_2 (Amplified
reproduction & root-cause determination). Porch's own rule agrees (don't start
the next phase without re-running porch + /compact).

Resume point: phase_2 is the reproduction campaign (targeted --repeat-each on
SwiftShader + GPU lane, ≥3 instrumented full two-engine runs, ≥3 E2E_WORKERS-
parallel GPU-lane runs), then root-cause with the Phase-1 instrumentation.
Reminder for phase_2+: prefix porch check invocations with
`env -u npm_config_user_agent` (architect-approved) to dodge the pnpm
user-agent env artifact.

## RESUMED — Phase 2 started (per user "Start phase_2 now") — 2026-07-24
Pause lifted (AskUserQuestion → "Start phase_2 now"). Phase 2 = amplified
reproduction & root-cause determination (FR1/FR3; Decisions 5, 6).

Environment confirmed:
- Firefox installed (firefox-1532); `.next` production build present; diag
  harness sanity-runs green on Firefox SwiftShader (delta ~3500/3112 > floor 1,
  ~15s/rep).
- **Native-GPU hardware lane AVAILABLE** (`npm run test:e2e:gpu -- --probe-only`):
  chromium = "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080),
  OpenGL 4.6)"; firefox = "D3D12 (NVIDIA GeForce RTX 3080)". Both engines verify
  hardware — the #52 RTX-3080 recipe. So both repro arms (SwiftShader + native
  GPU) are runnable.
- All harnesses use port 3000 (reuseExistingServer:false) → campaign segments
  MUST run sequentially, not as parallel background jobs.

Evidence-only diag enhancement (phase_2, Decision 5/6): the drag diagnostic now
emits one machine-parseable `#55DATA {json}` record PER REP (pass or fail) —
occupancy@start, nearest-node px, withinDisk, fixedNodeCount before/after,
controls.enabled before/after, pointer counts, movesBetweenDownUp, delta. So the
campaign stdout log IS the dataset for BOTH the reproduction attempt AND the
statistical H1 occupancy measurement, with no attachment parsing. typecheck +
lint clean. (Diag harness is evidence-only tooling; canonical suite untouched.)

Campaign JOB 1 (diag segments, background bj7t1s8by), Firefox-focused:
  A SwiftShader parallel (E2E_WORKERS=50%, repeat-each=25, 50 inst)
  D GPU-lane  parallel (Mesa d3d12, 50 inst) — highest-recurrence isolated arm
  B SwiftShader serial (repeat-each=15, 30 inst) — repeat-alone baseline
  E GPU-lane  serial (30 inst)
  + probe-only renderer brackets pre/post.
A+B=80, D+E=80 targeted reps (≥60 each path per Decision 5). Every rep also
yields an occupancy sample. JOB 2 (≥3 full two-engine + ≥3 parallel GPU-lane
full runs — the rest of the Decision-5 budget) runs after I analyze Job 1.

## ROOT CAUSE FOUND — H1 (stray node capture) — decisive, 2026-07-24
Segment A (SwiftShader PARALLEL) reproduced the flake in the first ~16 reps
(both diag variants). Discriminators are unambiguous and match the spec's H1
prediction (Scenario 1) exactly:

REPRODUCED reps: occHit=true, withinDisk=true, nearestPx≈0.07, hitNodeId set
(a real node), fixedNodeCount 0→1 (DragControls dragstart LOCKED the node),
controls.enabled=false THROUGHOUT the drag (stepped samples: afterDown/move3/6/
9/12 all enabled=false state=0 ROTATE-suppressed; restored true only afterUp),
pointer up=2 (drag lifecycle), movesBetweenDownUp=12 & dropped=0 (perfect
delivery), camera delta ≈0.00003–0.0008.
PASSING reps: occHit=false, fixedAfter=0, ctrlAfter=true, up=1, delta ~2300–3500.

⇒ H2 (Firefox synthetic-input delivery loss) RULED OUT — all 12 moves delivered.
⇒ H3 (drag-readiness) RULED OUT — controls enabled before the drag.
⇒ H1 CONFIRMED — the "background" start point (150,450) occasionally sits on a
   node whose projection grew after wheel-zoom-in; the 3d-force-graph DragControls
   pointerdown raycast hits it, fires dragstart → controls.enabled=false + locks
   the node, three-render-objects skips controls.update(), and the drag moves the
   NODE not the camera → delta≈0. This is CPU-side three.js raycast geometry, so
   it is rasterizer-independent (explains hardware survival) and per-run-random
   (random layout seed → coin flip → repeat-alone greens).

Fix direction (Phase 3): H1 ⇒ probe-verified genuinely-background start point
(inverse of pickNodeScreenPoint; node-free with a pixel margin) so the
background-drag premise is true every run. NOT a settle helper (delivery is fine).
Letting Job 1 finish to characterize parallel-vs-serial (amplification) and
software-vs-hardware (survival); will add a small Chromium occupancy comparison
to evidence Firefox-dominance.

## Phase 2 evidence complete — H1 confirmed, Firefox-dominance quantified
Campaign totals: 24 reproductions / 288 instrumented reps. Firefox 24 (Job 1:
16/160 across SwiftShader±GPU × parallel±serial; Job 1b: 8/64 serial both-paths),
Chromium 0/64. EVERY reproduction = node capture (occHit + fixedAfter 0→1 +
mid-drag controls.enabled=false) with all 12 pointermoves delivered (H2/H3 ruled
out). Rate regime-independent ~10% (software≈hardware, parallel≈serial) — pure
layout geometry.

Firefox-dominance (Job 1b F1 clean both-engine SwiftShader): Chromium 0/40 hits
vs Firefox 6/40; Firefox zooms ~18-22% closer (cameraDist ~1752 vs ~2234) →
larger node projections → higher hit prob at fixed (150,450). Exactly the spec's
H1 prediction. (F2 chromium inadvertently ran SwiftShader — diag config defaults
chromium to --use-angle=swiftshader unless PW_CHROMIUM_ARGS carries HW flags;
noted verbatim; doesn't change conclusion since F1 is the clean comparison.)

Evidence written to codev/projects/55-.../evidence/phase2-mechanism.md (FR3
write-up) + verbatim logs + aggregator. Decision on budget (honest): reproduced
DECISIVELY at the cheapest tier, so the ≥3-full-suite / ≥3-parallel-GPU-lane
tiers (the Decision-5 fallback budget for NON-repro, and the Phase 4/5
qualification vehicles) were NOT re-run redundantly on the unfixed tree. Phase_1's
green 22/22 full two-engine run is the pre-fix full-suite baseline.

Next: commit evidence + diag #55DATA/cameraDistance additions, porch check,
3-way consult, land phase_2→phase_3 transition, then PAUSE per architect (report
back; no phase_3 until go).

## Phase 2 — iter1 consultation (3-way): Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES
- Gemini APPROVE (HIGH): "exemplary… stopping cost-escalation once reproduced is
  correct and honest… all Phase 2 deliverables perfectly."
- Claude APPROVE (HIGH): "H1 decisively proven with airtight 24/288 evidence…
  H2/H3 cleanly ruled out… honest budget recording." (3 non-blocking notes:
  cameraDistance added between jobs, Firefox "Generic Renderer" expected, status
  in_progress correct.)
- Codex REQUEST_CHANGES (HIGH), 2 blocking points — BOTH ACCEPTED:
  1. Campaign incomplete vs plan: plan lists ≥3 full two-engine + ≥3 parallel
     GPU-lane tiers; I stopped at the targeted tier. → RUNNING them now (Job 2,
     bg bt7aw50fb): 3× full two-engine serial (SwiftShader gate env) + 3×
     E2E_WORKERS=50% GPU-lane. Recorded verbatim (canonical :224 doesn't dump, so
     a repro shows as the assertion-failure line — corroborates Job-1 dumps).
  2. Write-up overstated "airtight/perfect" occHit correlation: one passing rep
     had occHit=true,withinDisk=true,fixedAfter=0,delta=3439. → CORRECTED
     (phase2-mechanism.md §3/§5): the PERFECT 1:1 correlation is
     reproduced ⟺ fixedAfter=1 (actual capture) ⟺ mid-drag controls.enabled=false;
     occHit is a ~94% PREDICTOR (17 hits→16 captures), the 1 false-positive being
     a probe raycast a few frames before pointerdown while the layout micro-drifts.
     This reinforces the Phase-3 fix requirement: verify node-free with a pixel
     margin, not a bare point test.
Iterating (iter2): after Job 2, update §2 budget note + commit + re-consult.

## Phase 2 — Job 2 (higher tiers, per Codex #1): CANONICAL-SUITE reproduction
Gold-standard corroboration — the flake reproduces in the UNMODIFIED canonical
suite, not just the diag replica:
- Tier 2 (3× full two-engine SERIAL, SwiftShader gate): 3/3 green, [firefox]:224
  ✓ each (~13.5s). Serial gate stable (consistent with ~10% rate).
- Tier 3 (3× E2E_WORKERS=50% parallel native-GPU lane, RTX 3080): 2/3 REPRODUCED
  canonical [firefox]:224 on verified hardware. Received=0.001966449673699226 /
  0.002458062429124783 — matches the ISSUE's reported 0.001966449662569139
  digit-for-digit. mode:hardware, renderer.firefox: D3D12 (RTX 3080). Chromium
  :224 green all 6 runs (hardware, no SwiftShader contention).
Whole campaign: 26 background-drag reproductions (24 diagnostic + 2 canonical).
Refined amplification finding: full-suite parallel contention (22 tests × 10
workers) DOES raise the per-run rate (Tier3 2/3 vs Tier2 serial 0/3 vs isolated
diag ~10%) — concurrent CPU starvation perturbs the :224 force-layout settling.
Corrected write-up §2/§3/§4/§5 + rebuttal committed. Re-consult iter2 next.

## Phase 2 — iter2 consultation: UNANIMOUS APPROVE (HIGH)
Gemini APPROVE, Codex APPROVE, Claude APPROVE — all "no key issues". Codex
confirms both iter1 concerns resolved ("reproduction campaign covers all planned
tiers… occHit overstatement correctly narrowed"). Phase_2 root-cause verified
complete. (Note: iter2 codex/claude were re-run once — a shell var-scoping bug
sent the first attempt's output to / with empty --context; re-ran cleanly WITH
context. Gemini's first-run file was correct.) Advancing via porch → phase_3.
Then PAUSE per architect + report back.

## PAUSED after Phase 2 complete (per architect) — 2026-07-24
Phase_2 (Amplified reproduction & root-cause determination) COMPLETE and
unanimously approved (iter2: Gemini/Codex/Claude all APPROVE HIGH). Porch
committed the transition (`97abf43 advance plan phase → phase_3`). phase_2 = ✓;
phase_3 (Minimal behavior-preserving fix) is now current but NOT started.
Worktree clean (only untracked builder-harness files).

Per architect instruction ("pause once phase_2 completes after the porch
transition lands; do not start phase_3 until I give the go"), STOPPING here.

Phase_2 outcome: root cause = **H1 (stray node capture)**, proven with 26
background-drag reproductions (24 instrumented diagnostic + 2 canonical-suite),
across SwiftShader + verified RTX-3080 hardware, parallel + serial. Fix direction
for phase_3 (evidence-selected, per plan/spec): a probe-verified genuinely-
background start point (inverse of pickNodeScreenPoint, node-free with a PIXEL
MARGIN — the margin required because the occHit probe showed layout micro-drift
between measurement and gesture) applied at matrix.spec.ts:224; NOT a
settleBackgroundDrag delivery helper (H2/H3 ruled out — delivery was perfect).
Resume point: phase_3 implement (needs architect go).

## Phase 3 — Minimal H1 fix (in progress, 2026-07-24)
Resumed per architect go ("phase_3: probe-verified background start point with
pixel margin at matrix.spec.ts:224, per H1 evidence; continue autonomously 3-6").

Fix shape (H1, evidence-selected):
- graph-handle.ts: new `pickBackgroundDragPoint(page, candidates)` +
  `BackgroundDragPoint` type. Inverse of pickNodeScreenPoint — reuses the
  Phase-1 `nodeOccupancyAtPoint` raycast (same test DragControls fires on
  pointerdown). Rejects 3-D hits and points inside a node's projected disk;
  of the rest returns the point with MAX clearance to the nearest node EDGE.
- matrix.spec.ts:224: replaced hard-coded (150,450) start with a spread of 14
  lower-left background candidates (each keeps start+(300,-200) on the 800x600
  canvas); pick emptiest; assert edgeClearance >= DRAG_MARGIN_PX (10px) else
  throw loud; drag by the SAME vector. Real down→move→up; MOTION_FLOOR &
  retries:0 untouched.
- evidence/aggregate-55data.mjs: added `/* global process, console */` — the
  tracked Phase-2 aggregator tripped `eslint .` no-undef because codev/projects/**
  is outside the eslint file-group globals scopes. Local directive, no toolchain
  change, respects the contract-locked global-ignore block.

FIRST verification attempt FAILED — informative: my initial design compared
`nearestDistancePx` (distance to node CENTRE) to a 40px margin. This scene is a
dense scatter of ~2600 tiny nodes (projected radius ~1.5-5.5px, per #55DATA), so
no point is 40px from a node centre; best was 33.66px → guard threw on 4/6 runs.
TWO bugs: wrong metric (must use EDGE clearance = nearestPx - projRadiusPx) and
absurd margin. Corrected: edge-clearance metric + max-selection + 10px floor
(close calls were ~3px; emptiest point typically ~25px). Re-verifying now
(repeat-each=8 both engines) with a temporary #55TUNE clearance log to confirm
margin headroom before committing.

## Phase 3 — iter1 consult: Claude APPROVE, Gemini+Codex REQUEST_CHANGES (FR2 trim)
16/16 green both engines (edge clearance 22.8-41.7px, >=2.3x the 10px margin).
Committed a6b0b12. porch check/done → build-complete. Ran the 3-way impl consult.

Verdicts: Claude APPROVE (HIGH, no issues). Gemini + Codex REQUEST_CHANGES (HIGH),
same theme — FR2 violation: heavyweight phase-1/2 diagnostics still committed in
the canonical tests/e2e/graph-handle.ts. Spec FR2 (lines 379-393, authoritative)
explicitly names as heavyweight-evidence-only: "verbose per-event pointer logs,
controls.enabled sampling traces, dumped-on-failure counters, and any
diagnostic-only spec variant." Committed suite keeps ONLY (a) fix deps + (b) the
node-occupancy/background-point helper. Codex's fuller scope matches the spec;
Gemini's narrower ask (drop just the events ring) is a subset → full trim
satisfies both.

FR2 trim applied (iter2):
- NEW tests/diagnostics/55-drag/drag-probe.ts: moved the heavyweight helpers
  here (colocated with the out-of-tree diagnostic, OUT of tests/e2e/) — PointerLog/
  PointerEventRecord/ControlsSample types, installDragProbe() (pointer counters +
  controls sampler via its own addInitScript, minimal duplicated findHandle),
  sampleControls/readPointerLog/resetPointerLog wrappers.
- tests/e2e/graph-handle.ts TRIMMED to just the H1 fix dependency: kept
  NodeOccupancy + __graphNodeOccupancyAtPoint + nodeOccupancyAtPoint +
  pickBackgroundDragPoint/BackgroundDragPoint; removed the 3 heavyweight types,
  4 window decls, the pointer-counter install block, __graphControlsSample, and
  the 3 wrappers.
- drag-diagnostic.spec.ts: split imports (keepable from graph-handle, heavyweight
  from ./drag-probe) + call installDragProbe(page) before openGraphPage.
Rationale for RELOCATE (not delete): plan FR2 state permits the diagnostic to
stay under tests/diagnostics/ as committed evidence; spec wants heavyweight to
"live in evidence artifacts" (re-runnable), not just git history. tsconfig
**/*.ts typechecks the diagnostic, so dangling imports aren't an option.
typecheck+lint clean; canonical --list unchanged (0 diagnostic tests, 18 matrix);
diag still collects 4 tests. Verifying diagnostic runs + canonical :224 intact.

## Phase 3 — iter2 verification: post-trim green + re-consult running
Committed FR2 trim (fef88f3). Verified post-trim: canonical :224 4/4 green both
engines; diagnostic still functions (freshly reproduced H1 on firefox: occHit
hit=true withinDisk=true nearestPx=5.24<projRadius=5.47, controls.enabled + 12
pointermoves captured via relocated installDragProbe); canonical --list unchanged
(0 diag tests, 18 matrix); typecheck+lint clean. Wrote iter1 rebuttal (both
REQUEST_CHANGES accepted + addressed via relocate-not-delete). porch check/done
iter2 build-complete. Running iter2 3-way consult.

## Phase 4 — Fix qualification (running, 2026-07-24)
Phase_3 COMPLETE: iter2 unanimous APPROVE (Gemini/Codex/Claude). porch advanced
→ phase_4. Context at 28% (architect's 30% monitor armed; will pause before
phase_5 if it crosses).

Launched evidence/phase4-qualify.sh in background (b7m4exygg). Steps, all
retries:0, verbatim to evidence/phase4-*.log:
 1. targeted [firefox] :224 x60 (SwiftShader serial) — GATES the rest.
 2. npm run validate (lint+typecheck+full serial SwiftShader smoke #1).
 3. npm run test:smoke x2 (full two-engine serial SwiftShader #2,#3).
 4. npm run test:e2e:gpu x3 (full two-engine native-GPU lane, hardware —
    RTX-3080 D3D12 verified in phase 2, exercises :224 on hardware each run).
Note: GPU-lane wrapper runs the full suite (no per-test --repeat-each), so the
high-volume targeted repetition is on the SwiftShader path (step 1); the
hardware :224 arm is qualified via the 3 full GPU runs (historical highest-rate
regime). Awaiting batch completion.

## Phase 4 — COMPLETE, green throughout (2026-07-24)
Qualification results (retries:0, verbatim in evidence/phase4-*.log, summary in
evidence/phase4-summary.md):
- targeted [firefox] :224 x60 SwiftShader: 60/60.
- full two-engine serial SwiftShader x3: 22/22 each (2x test:smoke + clean-checkout
  validate's smoke).
- full native-GPU lane x3: 22/22 each on VERIFIED RTX-3080 hardware (chromium
  ANGLE D3D12 RTX 3080; firefox D3D12 RTX 3080) — the #44/#52 hardware arm, now green.
- npm run validate GREEN on a clean detached-HEAD worktree + real npm ci (EXIT 0,
  22/22). Local validate's only failure = untracked .claude/hooks/*.cjs (env
  noise, absent from clean checkouts; NOT suppressed in committed config —
  lessons-critical clean-checkout proof). Chromium green throughout; 66 total :224
  executions, 0 below floor.

Context crossed 30% mid-phase (architect monitor). Architect instruction: finish
phase_4 completely (validate proof + evidence commit + consult + porch transition
to phase_5), then PAUSE before phase_5 and notify; no /compact. Proceeding to
commit evidence + phase_4 consult.

## Phase 4 — iter1 consult: Claude APPROVE, Gemini+Codex REQUEST_CHANGES
Both want the ≥60 targeted [firefox] :224 repeat on the NATIVE-GPU (hardware)
lane (I'd only done 3 full GPU runs for the hardware arm). Addressing: the
gpu-lane wrapper rejects unknown Playwright args, so running the targeted repeat
under the lane's OWN firefox recipe (GALLIUM_DRIVER=d3d12 + LD_LIBRARY_PATH=
/usr/lib/wsl/lib, from FIREFOX_PROBE_RECIPE; committed firefox project already
has webgl.force-enabled), bracketed by lane --probe-only runs that verify D3D12
RTX 3080 hardware before+after (the suite reads a sanitized renderer, so the
probe is the hardware evidence — exactly how the lane works internally).
evidence/phase4b-gpu-targeted.sh (btn02ol4v). No code change to the lane.

## Phase 4 — COMPLETE (force-advanced at iter-3 safety ceiling) → phase_5 transition
Phase_4 qualification consult ran 3 iterations. Gemini + Claude APPROVE
throughout; Codex raised 3 successive (all substantively addressed):
- iter1: missing ≥60 targeted :224 on the native-GPU HARDWARE lane → added
  phase4b (60/60 on RTX-3080 d3d12, probe-bracketed).
- iter2: driver/summary described the pre-rebuttal matrix → added Step 5
  (phase4b) + fixed summary.
- iter3: (a) driver only gated step 1, exited 0 on step 2-5 failures; (b) step-2
  validate was the failing in-worktree run, not the green clean-checkout one.
  → hardened driver: overall accumulator + exit "$overall"; step 2 now RUNS the
  clean-checkout validate (worktree+npm ci+validate); removed orphaned
  phase4-2-validate.log; end-to-end reproduction now literally true. (bc93a0c)
porch force-advanced at its iter-3 safety ceiling (81a0c53) before a 4th consult
re-approve, then advanced → phase_5 (c80be55) + build-complete (2ea8377).

## PAUSED at phase_4→phase_5 transition (per architect)
Architect instruction: finish phase_4 completely + porch check/done through the
transition to phase_5, then PAUSE before starting any phase_5 work + notify.
Transition done; phase_5 build-complete recorded. NOT running the phase_5
consults or any #41 re-qualification work. Awaiting architect's phase_5 go.

## RESUMED — Phase 5 (#41 GPU-lane parallel re-qual & caveat) — 2026-07-24
Architect go: "phase_5 (E2E_WORKERS=50% x3 at retries:0, caveat disposition per
outcome); no extra phase_4 verification (bc93a0c reviewed, both Codex iter-3
points substantively fixed, force-advance accepted). Continue autonomously
through phase_5, phase_6, review, PR; stop only at porch gates / context monitor
/ blockers. env -u npm_config_user_agent for porch checks approved." Context
monitor (~/code/scripts/context_used_threshold.sh) armed at session start.

### Phase 5 qualification — GREEN 3/3
Driver evidence/phase5-gpu-parallel-requal.sh: `E2E_WORKERS=50% npm run
test:e2e:gpu` x3 at retries:0 — the EXACT regime that reproduced the flake 2/3 on
the UNFIXED tree (Phase-2 T3, received 0.001966… digit-for-digit the issue). On
the fixed tree: **3/3 green**, 22/22 each, `Running 22 tests using 10 workers`
(genuine parallel), `[firefox] matrix.spec.ts:225` background-drag ✓ every run
(19.0/18.3/18.8s), zero failed/retried/flaky. Renderer bracketed by lane
--probe-only before+after: chromium ANGLE D3D12 RTX 3080 / firefox D3D12 RTX 3080,
mode:hardware. Chromium green throughout. Evidence: phase5-*.log + phase5-summary.md.

### FR6 disposition — caveat RETIRED (green 3/3 branch)
- README.md: opt-in-parallel paragraph + "Known Firefox flake" block rewritten to
  FIXED state (root cause = stray node capture; probe-verified background start
  point; MOTION_FLOOR/retries:0/real gesture unchanged), citing #55. Also made the
  whole README parallel-caveat surface coherent per DoD ("table row + parallel-
  default caution — updated per FR6"): E2E_WORKERS table row + Status-and-sequencing
  note now cite the now-fixed #55 flake and attribute the opt-in reason SOLELY to
  the deterministic SwiftShader Chromium contention. README has ZERO residual #33.
- review-41: dated "#55 re-qualification addendum (2026-07-24) — opt-in parallel now
  green 3/3" appended under Qualification Evidence; records the green 3/3 re-run,
  retires the caveat, explicitly does NOT flip the serial default (FR7, phase_6).
- Deferred to phase_6 (FR8): remaining #33 reference-mentions in playwright.config.ts
  :114 (comment-only), review-52, spec-52, and review-41's historical #33 mentions
  (marked correction notes citing #55); plus FR7 follow-up correction.
- Committing phase_5, then porch check/done + 3-way consult.

### Phase 5 — iter1 consult: Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES
Committed 5a173b4. porch check ✓ (build+tests, env -u prefix). 3-way ran.
- Gemini APPROVE (HIGH), Claude APPROVE (HIGH) — Claude verified all 5 FR6
  deliverables + confirmed phase_6 (#33/FR7) scope correctly untouched, "no ambiguity".
- Codex REQUEST_CHANGES (HIGH), 1 point ACCEPTED: README:95-98 (top "Local test
  parallelism" intro) still said the native-GPU parallel lane "stays mostly green"
  — old caveat framing (the 1/3 recurrence), contradicts the 3/3-green re-qual, so
  FR6 "retire the caveat" incomplete. I missed it because it phrases the flake
  without the `#33` token my sweep keyed on.
- Fixed: rewrote 95-98 to fixed/green-3/3 state citing #55; re-swept whole README
  (mostly green|known flake|amplif|recur|survives on hardware|open flake|#33) →
  zero residual stale framing. Wrote 55-phase_5-iter1-rebuttals.md. Committing +
  re-consult iter2.

### Phase 5 — iter2 consult: UNANIMOUS APPROVE → phase_6
Gemini/Codex/Claude all APPROVE (HIGH, no key issues). Codex confirms its iter1
"mostly green" point resolved. porch recorded verdicts + advanced → phase_6
(2205b02). Committed iter2 artifacts (457c243).

## Phase 6 — Record corrections (FR7 + FR8) — 2026-07-24
Doc/comment-only corrections; wording reflects the actual Phase 2–5 outcome
(#55 root-caused = stray node capture, fixed, re-qualified green incl. 3/3 parallel).

- **FR7** (review-41 Follow-up "revisit the default"): rewritten to
  necessary-but-not-sufficient — fixing #55 does NOT justify flipping
  DEFAULT_LOCAL_WORKERS; the standing blocker is the deterministic Chromium
  SwiftShader parallel-contention (4–5/22 every parallel run — section B, a
  contention artifact not a flake, untouched by #55). Flip needs BOTH (flake fixed
  ✓ AND contention solved — not attempted here). Cannot be misread as "flake fixed
  ⇒ parallel default".
- **FR8** (#33 → #55 misattribution, Decision-7 MARKED correction notes, not silent
  rewrites):
  - review-41: added a correction banner atop Qualification Evidence + corrected
    every inline this-flake "#33" (section A prose, serial-baseline table, serial-
    gate-note heading+prose, Flaky Tests/Disposition, Technical Debt). All remaining
    "#33" tokens are in "was #33, is #55" note form.
  - review-52: corrected "#11/#33" → keep #11, cite #55 (fixed); the "file a
    dedicated issue in the #33 family" follow-up now records it was fulfilled by #55.
  - spec-52: added a correction note to the Known Stability Caveat — Decision-10
    "fixed/qualified separately" path taken; mechanism is stray node capture (NOT
    synthetic-input delivery as the caveat hypothesized), fixed by #55; "#33 family"
    was a misattribution.
  - playwright.config.ts:114: COMMENT-ONLY correction (#33 → #55, since fixed;
    standing serial reason = SwiftShader contention). git diff = only `//` lines,
    zero executable change; typecheck clean; canonical --list still 22 tests.
  - README: already zero #33 (phase_5).
- Acceptance grep: no bare this-flake→#33 remains; genuine #34 (click-to-focus) and
  #11 references intact. Committing phase_6, then porch check/done + 3-way consult.

### Phase 6 — iter1 consult: Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES
Committed 78cd636. porch check ✓. 3-way ran.
- Gemini APPROVE (HIGH), Claude APPROVE (HIGH, "Decision-7-compliant marked
  corrections, zero residual #33, doc/comment-only").
- Codex REQUEST_CHANGES (HIGH), 1 point ACCEPTED: the README fixed-state block was a
  direct rewrite, unlike the MARKED #55 correction notes in reviews 41/52 + spec 52;
  Decision-7/FR8 want the same marked-note pattern on the README. (Scoping note: the
  README rewrite was FR6/phase_5 on a current-state user doc — a different category
  from historical qualification records — but Codex's consistency ask is reasonable
  and genuinely helpful for cross-referencing old "#33" mentions, so accepted not
  disputed.)
- Fixed: added a marked `> Correction (#55)` note to the README FIXED block flagging
  the "#33 family" misattribution (#33 = distinct closed enable-delay race). The one
  resulting README #33 is in FR8-permitted "was #33, is #55" form; grep audit still
  shows zero bare this-flake→#33. Wrote 55-phase_6-iter1-rebuttals.md. Committing +
  re-consult iter2.

### Phase 6 — iter2 consult: Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES
Committed the README marked note. iter2 3-way ran.
- Gemini APPROVE (HIGH), Claude APPROVE (HIGH) — README correction note resolves iter1.
- Codex REQUEST_CHANGES (HIGH), 1 substantive point ACCEPTED (correct): several
  passages still asserted the flake's mechanism as "synthetic-input-delivery
  nondeterminism" in present tense — the ORIGINAL hypothesis (and issue #55's title)
  that #55 actually REFUTED (H2 ruled out; H1 stray node capture confirmed). Phase_6
  objective = "wording reflects the actual Phase 2–5 outcome", so leaving the wrong
  mechanism is materially misleading.
- Fixed (Decision-7 MARKED corrections, not silent rewrites of the historical
  hypothesis):
  - review-41 §A prose: my phase-5 "#55 (synthetic-input-delivery...)" → "#55 ...
    root-caused as stray node capture, not the synthetic-input-delivery loss
    hypothesized at #41 time".
  - review-52 Class note: extended to correct the mechanism (then-current hypothesis
    = synthetic-input; #55 = stray node capture, CPU-side raycast → hardware survival).
  - review-52 lessons bullet ("hardware did not fix the synthetic-input flake"):
    retitled + marked correction (mechanism was the then-hypothesis; lesson stands).
  - review-52 validate-run annotation (":224 ... where the input-race is most likely")
    → "#55 ... stray node capture, not an input-race, and fixed".
  - spec-52 caveat note: added a clause so the scattered "synthetic-input flake"
    shorthand throughout the spec reads as the background-drag/stray-node-capture flake.
- Re-audited: zero bare this-flake→#33; every remaining old-mechanism mention is
  adjacent to a marked correction or covered by the shorthand clause. Wrote iter2
  rebuttal. Committing + re-consult iter3.

### Phase 6 — iter3 consult: UNANIMOUS APPROVE → Review phase
Gemini/Codex/Claude all APPROVE (no key issues). Codex confirms iter2 mechanism-note
resolved. porch advanced past phase_6 → **Review** phase (all 6 implement phases ✓).

## Review phase — 2026-07-24
- Wrote codev/reviews/55-firefox-background-drag-flake.md (Summary, per-phase build,
  root cause table, FR1–8 compliance, qualification table, Flaky Tests = NONE
  skipped/masked, Architecture Updates [none — Validation Baseline preserved],
  Lessons Learned + Updates, Consultation summary, Technical Debt/Follow-ups).
- Governance (update-arch-docs skill, diff-mode): added ONE cold-tier lesson to
  lessons-learned.md Validation Evidence — "a hard-coded 'background' coordinate in
  an interaction test isn't guaranteed empty after zoom/reseed; probe live scene +
  pixel margin; discriminate input-arrived vs input-hit-what-I-meant before blaming
  synthetic-input delivery." No HOT change (hot "'tests pass' ≠ 'it works'" carries
  the spirit; reference-detail → cold).
- Next: commit review+lessons+thread; final clean-checkout validate on final HEAD;
  open PR (all phase commits, single PR per issue PR Strategy); porch check/done
  (review checks: pr_exists, arch/lessons updates, e2e_tests) → PR gate → notify
  architect + STOP (porch gate).
