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
