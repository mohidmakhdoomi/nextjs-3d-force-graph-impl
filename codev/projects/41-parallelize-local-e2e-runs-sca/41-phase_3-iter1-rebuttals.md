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
