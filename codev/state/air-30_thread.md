# air-30 thread — Issue #30: shard Playwright e2e to cut CI wall clock

Protocol: AIR (strict). Phase: implement.

## Goal
Validation workflow ~15 min → ~5-6 min by sharding the e2e suite. `npm run validate`
stays the single-command local gate; CI runs a **contract-equivalent decomposition**.

## Plan (from issue #30 recommended approach + governance)
1. `playwright.config.ts`: `fullyParallel: true`, keep `workers: 1` (per-test shardable,
   still serial within a job). Add env-gated `blob` reporter for shard merging (local
   behavior unchanged — `list` + `html` when env unset).
2. `.github/workflows/validation.yml`: decompose the single job into
   - `quality` job: lint, typecheck, `npm test` (unit), both audits (full + production,
     validate-audit-report + upload). ~1.5 min.
   - `e2e` job: matrix `shard: [1,2,3,4]`, `--shard=N/4`, `E2E_ENGINES=chromium`,
     build per shard, Playwright browser cache (`~/.cache/ms-playwright`, keyed on
     resolved Playwright version). Blob report per shard.
   - `merge-reports` job (`if: always()`): merge blob reports → one `playwright-report`.
   - `gate` job (`needs: [quality, e2e]`): single stable green status for branch protection.
   - Every dep-installing job re-verifies Node 22.23.1 / npm 10.9.8 + `npm ci`.
3. Update `tests/automation.test.mjs` to encode the NEW decomposed contract (old test
   asserts the single "Validate" step — must be rewritten to the equivalence invariants).
4. Update `codev/resources/arch.md` Validation Baseline: CI decomposition is
   contract-equivalent to `npm run validate`.
5. Update `README.md` CI section to describe sharding.
6. Add `blob-report/**` to `.gitignore` + eslint ignores (+ toolchain test expected list).

## Governance guardrails honored
- Full e2e set preserved (no test dropped); Chromium engine gate via `E2E_ENGINES=chromium`.
- Audit evidence (full + production) capture/validate/upload preserved.
- Exact Node/npm baseline + `npm ci` in every dep-installing job.
- Do NOT touch per-test waits / camera-settle polls / `workers: 1` / CI timeouts.

## Notes
- 10 e2e tests total: 9 in `tests/e2e/matrix.spec.ts` + 1 in `tests/e2e/smoke.spec.ts`.

## Implementation status (implement phase)
Done: playwright.config (`fullyParallel: true`), workflow decomposition (quality /
e2e matrix / merge-reports / gate), automation.test rewrite to the decomposed
contract, toolchain.test + eslint + gitignore blob-report ignores, arch.md +
README updates. Local gate: `npm test` 29/29, typecheck clean, `npm run build` clean.

### Verification findings
- `--shard=N/4 --list` confirms clean test-level partition (3+3+2+2 = 10, no drop/dup)
  once `fullyParallel: true` is set. Mechanism works.
- Lint: the ONLY 18 errors are in untracked `.claude/hooks/worktree-write-guard.cjs`
  (builder-harness file, absent from clean checkouts) — environment noise per
  lessons-critical. None of my changed files lint-fail. Proving on clean checkout.
- Full local chromium e2e (shared port 3000) came back 8 passed / 2 failed, BUT the
  2 failures are `net::ERR_CONNECTION_REFUSED` at `page.goto`, i.e. the Next server
  vanished mid-run — NOT assertion failures. Root cause: sibling builder **spir-13**
  is running its own e2e on the same hardcoded port 3000 (`clean-13-rematrix`); the
  two runs raced for the port. Reordered-schedule tests that actually executed all
  passed. Re-verifying on an isolated port (31730) via a throwaway scratchpad config
  to get an uncontended clean pass. (Did NOT kill spir-13's active server.)

### Verification COMPLETE (all green)
- Isolated-port (31730) full chromium e2e: **10/10 passed (11.4m)** with
  `fullyParallel: true` — tests still ran serially (workers:1), test independence
  intact. Confirms the earlier 2 failures were the spir-13 shared-port-3000 race,
  not my change. Throwaway config torn down; port freed cleanly.
- Clean detached-checkout gate (real `npm ci`, no `.claude/hooks`): lint exit 0,
  typecheck exit 0, `npm test` 29/29. Proves the 18 local lint errors were purely
  the untracked harness file (environment noise), not committed code.
- Committed as 66b3ccb on builder/air-30. Proceeding to PR (porch flow).

## PR phase
- **PR #32** opened → main (review embedded in body per AIR).
  https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/pull/32
- porch PR-phase checks: `pr_exists` ✓, `e2e_tests` ✓ (the check runs
  `npm run test:e2e || echo skipped`; no such script → skip echo, and it's
  optional — the real e2e was verified manually above, not by this check).
- `porch gate 30` → **GATE: pr requested, waiting for human approval.** Did NOT
  `porch approve` (human-only). Architect notified via `afx send`. STOPPING here.
- Reviewer note in PR: if branch protection pins the old `validation` check name,
  repoint it at the new `gate` job (needs quality + e2e).

## Architect follow-up #1 — gate hardening (2026-07-20T21:38Z)
Human gate decision: approve AFTER hardening. Applied:
- `gate` job now `if: always()` + explicit `test "${{ needs.quality.result }}" =
  success` and same for `e2e`. Without this, a needs-only gate is SKIPPED on
  upstream failure/cancel, and a skipped required check can be misread as passing.
  Now the gate goes actively RED on any failed/skipped/cancelled upstream. (Matrix
  e2e aggregate result is success only when all 4 shards pass.)
- automation.test.mjs asserts the hardened gate (if: always + both result checks).
- Committed 88d4e45, pushed. `npm test` 29/29.

### CI evidence (real GitHub runners)
- Two prior PR #32 runs already completed **success in 6m13s / 6m10s** wall clock
  (down from ~15m) — sharded design proven on CI, target ≤~6m met.
- Watching the post-hardening run 29781097474 to green, then re-request the pr gate.
