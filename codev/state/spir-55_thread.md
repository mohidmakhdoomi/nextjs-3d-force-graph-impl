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
