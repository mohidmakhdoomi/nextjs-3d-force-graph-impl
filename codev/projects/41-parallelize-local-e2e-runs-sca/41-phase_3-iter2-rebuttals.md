# Phase 3 — Iteration 2 Review Rebuttals

**Verdicts:** Gemini APPROVE (HIGH) · Claude APPROVE (HIGH) · Codex REQUEST_CHANGES (HIGH)

Both Codex points **accepted and fixed**.

## Codex #1 — review lacked full per-run / per-test results (FR9) (ACCEPTED, FIXED)

> `codev/reviews/…:48-125` records worker counts, wall clocks, aggregate pass/fail
> counts, and some failing-test detail, but does **not** provide the full per-run /
> per-test results the spec and phase_3 plan call for … the review currently
> summarizes those runs instead of preserving that evidence verbatim.

**Agreed — FR9 explicitly requires "per-test pass/fail" for the ≥3 qualification
runs, and the architect's landing guardrail asked for verbatim evidence.** I had
preserved the banners, wall-clocks, aggregate counts, and the *failing* tests
verbatim, but not the full per-test list for each run.

**Fix:** added an **"Appendix — Per-test results (verbatim, FR9)"** to the review
containing the complete per-test `✓`/`✘` output (worker-index-prefixed, straight
from Playwright's `list` reporter) for **all eight** qualification runs: the 3 GPU
parallel runs, the GPU serial baseline, the 3 SwiftShader parallel runs, and the
SwiftShader serial baseline / finalized-default confirmation. Every one of the 22
tests per run is now recorded with its pass/fail verdict — no summarization.

## Codex #2 — stale `automation.test.mjs` comment (ACCEPTED, FIXED)

> `tests/automation.test.mjs:87-92` … says "local runs scale to hardware," but
> Phase 3 finalized the shipped contract as **serial by default** with
> `E2E_WORKERS` opt-in parallelism.

**Agreed** — that comment was written in Phase 2 (when `'50%'` was still the
proposed default) and went stale when Phase 3 flipped the default to serial. The
assertion itself (delegation to `resolveWorkers`) was and remains correct; only the
explanatory comment drifted. Fixed to: "locally the default is also serial (1),
with parallelism opt-in via E2E_WORKERS (Phase-3 qualification kept the gate
serial)."

## Verification after fixes

Both changes are prose/evidence-only (no behavior change; the migrated assertion is
untouched). Re-ran: `npm test` → 121/121; `eslint tests/automation.test.mjs` →
clean. The review appendix preserves all 8×22 per-test verdicts verbatim.
