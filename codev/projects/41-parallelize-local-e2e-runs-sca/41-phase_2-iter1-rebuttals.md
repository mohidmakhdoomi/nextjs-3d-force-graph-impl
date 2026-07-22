# Phase 2 — Iteration 1 Review Rebuttals

**Verdicts:** Gemini APPROVE (HIGH) · Claude APPROVE (HIGH) · Codex REQUEST_CHANGES (HIGH)

Gemini and Claude approved with no issues. Codex raised a single, narrow,
legitimate point, which I **accepted and fixed**. Details below.

## Codex — `playwright.config.ts` comment overstates qualification status (ACCEPTED, FIXED)

> `playwright.config.ts:115-118` overstates the qualification status: "the
> parallel local default is qualified by repeated full two-engine runs…" is not
> true yet in phase 2. Per the spec/plan, qualification evidence and final
> default disposition belong to phase 3, so this comment should describe the
> rationale/evidence gate without asserting completion.

**Agreed — this is a correct catch.** The Phase-2 scope is *wiring* the resolver
into the config; the ≥3-run repeat qualification and the final default
disposition (keep `'50%'` parallel vs. revert to serial) are explicitly **Phase
3** per the plan and spec Decision 4. My comment used the present-tense "is
qualified by…", which reads as *completed* qualification and is premature.

**Change made** (comment-only, no behavioral change):

- Before: "…the parallel local default **is qualified by** repeated full
  two-engine runs on the native-GPU lane (issue #41), while CI keeps that serial
  contract automatically via the guard above."
- After: "…this parallel local default **is being qualified by** repeated full
  two-engine runs on the native-GPU lane (issue #41) — **that evidence, not this
  wiring, decides whether it remains the default or reverts to serial.** CI keeps
  its serial contract automatically via the guard above regardless of that
  outcome."

This now frames the parallel default as an in-progress, evidence-gated decision
owned by Phase 3, rather than asserting the qualification is done.

## Codex — non-blocking confirmations (no action needed)

> the helper is wired in correctly (`playwright.config.ts:120`), the stale
> `workers: 1` source-text assertion was migrated appropriately in
> `tests/automation.test.mjs`, and the phase-2 scope appears otherwise aligned
> with the plan.

No change required — noted as positive confirmation of the wiring and the
`automation.test.mjs` migration.

## Verification after the fix

The change is comment-only; the `workers: resolveWorkers(process.env)` line is
untouched, so the migrated `automation.test.mjs` assertion still matches. Re-ran:

- `npm test` → 121/121 pass
- `npm run typecheck` → clean (`.mjs`-from-`.ts` import resolves)
- `.github/workflows/validation.yml` remains absent from `git diff` (CI unchanged)
