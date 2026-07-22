### Iteration 1 Reviews
- gemini: APPROVE — Phase 3 successfully executed the qualification plan, accurately finalized the default to serial based on recorded evidence, and updated documentation accordingly.
- codex: REQUEST_CHANGES — Phase 3 mostly lands the intended serial-default/opt-in-parallel outcome, but two evidence/documentation inaccuracies should be fixed before approval.
- claude: APPROVE — Phase 3 delivers honest qualification evidence, correctly finalizes the serial default per Decision 4, and documents the contract comprehensively — all deliverables complete with no issues.

### Builder Response to Iteration 1
# Phase 3 — Iteration 1 Review Rebuttals

**Verdicts:** Gemini APPROVE (HIGH) · Claude APPROVE (HIGH) · Codex REQUEST_CHANGES (HIGH)

Gemini and Claude approved with no issues. Codex raised two narrow consistency
points — both **accepted and fixed**. They were residue from a mid-phase honesty
correction (after the serial-default confirmation run revealed my original
"no speedup" framing compared parallel-SwiftShader against the wrong baseline). I
had swept most occurrences but missed these two.

## Codex #1 — review still said parallel "gives no SwiftShader speedup" (ACCEPTED, FIXED)

> `codev/reviews/41-parallelize-local-e2e-runs.md:162-165` says parallel "gives no
> SwiftShader speedup," but the same review records ~`3.3m` parallel vs `11.7m`
> serial at lines 105-106. Since evidence honesty is a phase requirement, this
> contradiction should be corrected.

**Agreed — a real internal contradiction.** Parallel SwiftShader IS faster (~3.3m
vs 11.7m serial ≈ 3.5×); the reason to reject it as the default is
**destabilization** (4–5/22 timing failures every run), not slowness. The
acceptance-criteria bullet now reads: "SwiftShader parallel is faster (~3.3m vs
11.7m serial) but **breaks the gate** (4–5/22 timing failures every run), so serial
is retained; the ~4× speedup is available opt-in on the GPU lane." This aligns with
the evidence table (§B) and the summary, both of which already state the
destabilization-not-slowness framing. (My grep for the fix missed this line because
it was phrased "no SwiftShader speedup", not "no speedup".)

## Codex #2 — helper inline comment still said "Scaled default" (ACCEPTED, FIXED)

> `scripts/e2e-workers.mjs:93` still says "Scaled default" even though Phase 3
> flipped the default to serial `1`. The finalized default contract should be
> documented consistently in the shipped helper comments.

**Agreed.** When I flipped `DEFAULT_LOCAL_WORKERS` to `1` I updated the module
header, the constant's own comment, and the JSDoc, but left the function-body
inline comment as `// 3. Scaled default.` — now inconsistent with the shipped
serial default. Fixed to: `// 3. Serial default (see DEFAULT_LOCAL_WORKERS).
Parallel is opt-in only, via the E2E_WORKERS branch above.`

## Verification after fixes

Both changes are comment/prose-only (no behavior change). Re-ran and swept:

- `node --test tests/e2e-workers.test.mjs` → 24/24; `npm test` → 121/121;
  `npm run typecheck` → clean; `eslint` on the helper files → clean.
- Broad audit of every `speedup|faster|slower` mention across README,
  `playwright.config.ts`, `scripts/e2e-workers.mjs`, and the review — all now
  consistently state "parallel is faster but destabilizes (SwiftShader) / mostly
  green (~4× on the GPU lane)". No "Scaled default" text remains.


### Iteration 2 Reviews
- gemini: APPROVE — The qualification evidence was properly recorded and the serial-fallback default was correctly implemented and documented per Decision 4.
- codex: REQUEST_CHANGES — Phase 3 lands the serial-default/opt-in-parallel decision correctly, but the recorded qualification evidence is not yet detailed enough to satisfy the phase’s per-test evidence requirement.
- claude: APPROVE — Phase 3 qualification is thorough, honest, and evidence-driven — the serial-default + opt-in-parallel landing is correctly mandated by Decision 4 and the recorded destabilization evidence, with all deliverables (default flip, review, README, config comment, CI untouched proof) complete and internally consistent.

### Builder Response to Iteration 2
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


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
