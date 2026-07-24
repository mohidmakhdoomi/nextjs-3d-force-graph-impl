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
