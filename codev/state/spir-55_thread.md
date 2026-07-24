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
