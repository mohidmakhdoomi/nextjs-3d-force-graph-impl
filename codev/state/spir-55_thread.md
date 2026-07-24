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
