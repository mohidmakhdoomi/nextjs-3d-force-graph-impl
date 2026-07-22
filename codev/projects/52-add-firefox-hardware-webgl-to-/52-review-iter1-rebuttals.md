# Rebuttal — Review phase (PR consult), iteration 1

**Verdicts**: Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES.

## Codex issue 1 — Firefox reported `skipped (unverified — unverified)` when Chromium failed but Firefox verified (ACCEPTED, FIXED)

Correct, and a real per-engine reporting-honesty bug. In the non-strict fallback,
when `chromium.verified === false` but `firefox.verified === true`, `computeRunPlan`
set the Firefox outcome to `{state: "skipped", reason: verdicts.firefox?.reason ??
"unverified"}`. A *verified* Firefox verdict carries no `reason`, so the reason
collapsed to the literal `"unverified"`, and `engineReportLine` prefixes another
`"unverified — "`, producing `skipped (unverified — unverified)` — which both
mislabels a hardware-verified engine as unverified and reads as nonsense.

**Fix** (`scripts/e2e-gpu-lane.mjs`):
- Added a distinct `not-run` verdict state for an engine that **verified hardware
  but is not run** because the combined two-engine hardware run needs both engines
  and the sibling (Chromium) failed — so the run fell back to Chromium SwiftShader
  (Decision 6: Firefox has no software equivalent to pair with the fallback).
- `computeRunPlan`'s non-strict fallback now branches on `verdicts.firefox.verified`:
  verified ⇒ `not-run` with an honest reason (`not run (Chromium unverified — a
  two-engine hardware run needs both engines…)`); unverified ⇒ the existing
  `skipped (unverified — <its own reason>)`.
- `engineReportLine` renders `not-run` as `not run (<reason>)`.
- Unit test added: `computeRunPlan: default 'all', Chromium fails but Firefox
  VERIFIES ⇒ Firefox reported 'not run', never 'unverified'` (asserts the line
  does not match `unverified — unverified` or `skipped (unverified`).
- README report block gains the `not run (<reason>)` variant.

**Scope note**: all other skip outputs are byte-identical — a genuinely
unverified Firefox still reads `skipped (unverified — software renderer "…")`, and
the forced-fallback path still reads `skipped (unverified — forced fallback,
Firefox has no software equivalent)` (verified against the running code). So the
recorded FB-1 evidence and the existing tests remain accurate.

## Codex issue 2 — `npm test` fails in `tests/audit-report.test.mjs` (DISPUTED: environment artifact, not a regression)

This is a Codex-sandbox environment artifact, not a defect in this branch:

- **Untouched by this branch**: `git diff main..HEAD -- tests/audit-report.test.mjs
  package.json package-lock.json` is empty. This branch changes only
  `scripts/e2e-gpu-lane.mjs` + `tests/gpu-lane.test.mjs` (plus docs).
- **The test shells out to the environment**: it uses `spawnSync` to run the audit
  validator and asserts on `npm audit` report shapes, including an explicit
  `EAI_AGAIN` "registry unavailable" case — i.e. it is sensitive to subprocess /
  registry availability that differs in a sandboxed reviewer environment.
- **Green here and on the gate**: on the qualification host `npm test` is **95/95**
  (audit-report.test.mjs **4/4**), and porch's own `tests` check
  (`npm test -- --exclude='**/e2e/**'`) passed at every phase. The GPU-lane suite
  Codex itself confirmed passes (`node --test tests/gpu-lane.test.mjs`).

No code change is warranted; re-proof is recorded above and in the review.

## Codex issue 3 — plan says `Status: draft` (ACCEPTED, FIXED)

`codev/plans/52-firefox-hardware-webgl-gpu-lane.md` line 5 updated to
`Status: completed (all three implement phases built, reviewed, and committed;
PR #53)`.

## Additional fixes — architect integration review (PR #53)

Folded into this iteration alongside the Codex fixes:

- **Blocking**: `runProbeOnly()` returned `1` on a `E2E_GPU_REQUIRE=1` abort
  **without** printing `formatReport()`, violating the "probe-only always reports"
  contract (README / plan / the function's own doc comment). Unlike the full lane
  (which aborts before doing any build/suite work), a probe-only run has already
  produced its verdicts — the report is the deliverable, most useful exactly when
  an engine failed. Fixed by extracting a pure `probeOnlyOutcome(...)` →
  `{report, exitCode}` that always builds the per-engine report (`mode: abort` on
  a REQUIRE abort) and is called before returning the exit code. Unit-tested
  (`probeOnlyOutcome: probe-only ALWAYS reports, even when E2E_GPU_REQUIRE
  aborts` — asserts the full report AND `exitCode === 1`).
- **Minor**: `--candidate` / `--channel` are Chromium-only; `parseArgs` now
  rejects them with `--engine=firefox` (usage error) instead of silently ignoring
  them. Unit-tested; `--engine=all --candidate=…` stays valid.

## Verification after fixes

`npm test` 95/95 (→ with the new cases); `npx eslint scripts/e2e-gpu-lane.mjs
tests/gpu-lane.test.mjs` clean; `npm run typecheck` clean. Verified end-to-end:
`E2E_GPU_REQUIRE=1 --probe-only` with an unverified engine prints the per-engine
report (`mode: abort`) then exits 1; `--engine=firefox --candidate=…` exits 2.
Canonical gate still byte-identical to `main` (`playwright.config.ts` unchanged).
