# Plan: Parallelize Local E2E Runs Scaled to Hardware (CI Byte-for-Byte Unchanged)

## Metadata
- **ID**: plan-2026-07-22-parallelize-local-e2e-runs
- **Status**: draft
- **Specification**: [codev/specs/41-parallelize-local-e2e-runs.md](../specs/41-parallelize-local-e2e-runs.md)
- **Created**: 2026-07-22

## Executive Summary

Implements the spec's **Approach B** (selected): `playwright.config.ts` resolves
`workers` through a small, importable, **pure helper** — `1` whenever `CI` is
set (absolute guard), otherwise a hardware-relative scaled value governed by an
`E2E_WORKERS` override (positive integer or `NN%` percentage) with a scaled
default of `'50%'`; an invalid override fails loudly (fail-closed, mirroring the
config's existing `E2E_ENGINES` guard). The helper lives in a `.mjs` file so it
is directly unit-testable by `node --test` (mirroring the proven
`scripts/e2e-gpu-lane.mjs` ⇐ `tests/gpu-lane.test.mjs` pattern) while the config
imports it as a thin consumer.

CI is provably untouched by two mechanisms working together: the unconditional
`CI → 1` guard (so the 4-shard matrix's per-job serial contract holds
automatically) and a **zero-diff `.github/workflows/validation.yml`** (the file
must never appear in the PR diff). The native-GPU lane
(`scripts/e2e-gpu-lane.mjs`) needs **no code change** — it never sets `workers`,
so it inherits the config's scaled default automatically; it is the primary
qualification vehicle (FR7/FR9).

The parallel local **default** is evidence-gated per the spec's **Decision 4
(the canonical rule)**: it ships as the default only if the parallel
qualification (≥3 consecutive full two-engine green runs, `retries: 0`) is green;
if SwiftShader parallel contention destabilizes the timing-sensitive
`matrix.spec.ts` assertions, the default reverts to serial (`workers: 1`) and
parallelism becomes opt-in via `E2E_WORKERS`, with the trade-off documented.
That branch is decided in Phase 3 from recorded evidence — never assumed, never
masked with retries, never by weakening a canonical assertion.

Work is decomposed into three self-contained, independently testable,
independently committable phases. Per issue #41's **PR Strategy**, all three
phases ship as git commits on a single branch under one PR (opened after the
final phase), not one PR per phase.

## Success Metrics

Copied from the spec's Success Criteria (the definition of done):

- [ ] Local e2e runs use multiple workers scaled to the machine's cores; CI runs
  are unchanged (`validation.yml` untouched in the diff and `workers` resolves to
  `1` under `CI=1`).
- [ ] The full two-engine local suite passes repeatedly (≥3 consecutive runs)
  under parallel execution, **or** the parallel path is clearly separated from
  the qualified serial gate with the trade-off documented (Decision 4 branch).
- [ ] `playwright.config.ts` comment block updated to the new contract (the stale
  "Do NOT raise `workers`" guidance removed, not edited around).
- [ ] `npm run validate` wall-clock improves measurably on multi-core hardware
  when the parallel default is qualified green, **or** the documented serial
  trade-off path is taken.
- [ ] `E2E_WORKERS` override works (integer + percentage); invalid values fail
  loudly; `CI` precedence over `E2E_WORKERS` is tested.
- [ ] No dependency/lockfile/toolchain movement; `app/**` untouched; local
  `retries: 0` preserved; flakes never masked; no new `package.json` script.

Implementation-specific metrics:

- [ ] Worker-resolution logic is a pure, unit-tested helper (`node --test`), not
  scattered conditionals in the config.
- [ ] `npm test` (node unit tests, incl. the new helper suite + migrated
  `automation.test.mjs`) is green locally and in CI's `quality` job.
- [ ] `npm run lint` and `npm run typecheck` are green with the `.mjs` import.

## Phases (Machine Readable)

<!-- REQUIRED: porch uses this JSON to track phase progress. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Pure worker-resolution helper + unit tests"},
    {"id": "phase_2", "title": "Wire helper into config, migrate consumer, update comment"},
    {"id": "phase_3", "title": "Qualify parallel execution, finalize default, document"}
  ]
}
```

## Phase Breakdown

### Phase 1: Pure worker-resolution helper + unit tests
**Dependencies**: None

#### Objectives
- Establish the tested worker-resolution **contract** as a standalone, pure,
  importable module before any config wiring — so the contract is proven in
  isolation and the config becomes a thin consumer (spec FR8, "Maintainability").
- Deliver the full FR8 resolution matrix as executable `node --test` coverage.

#### Deliverables
- [ ] New `scripts/e2e-workers.mjs` exporting a pure `resolveWorkers(env)`, a
  `DEFAULT_LOCAL_WORKERS` constant (`'50%'`), and a `WorkerConfigError` class
  (mirroring `LaneUsageError` in `scripts/e2e-gpu-lane.mjs`).
- [ ] New `tests/e2e-workers.test.mjs` asserting the full FR8 matrix.
- [ ] JSDoc on `resolveWorkers` so the inferred signature stays clean for the
  config's `tsc` typecheck (Phase 2 depends on this).

#### Implementation Details
- **File**: `scripts/e2e-workers.mjs` (plain ESM `.mjs` — importable by both
  `node --test` and, in Phase 2, `playwright.config.ts`; this format is the
  proven one for `scripts/e2e-gpu-lane.mjs`).
- **`resolveWorkers(env)` contract** (env is a `Record<string,string|undefined>`,
  passed explicitly so the function is pure and unit-testable without mutating
  `process.env`; the config calls `resolveWorkers(process.env)`):
  1. **CI guard (absolute, first):** if `env.CI` is truthy → return the number
     `1`. Returning before reading `E2E_WORKERS` makes `CI` precedence
     structural. (Truthy check matches the config's existing
     `process.env.CI ? … : …` idiom for `retries`/`timeout`, so CI resolution is
     consistent with the rest of the config.)
  2. **`E2E_WORKERS` override:** let `raw = env.E2E_WORKERS`. If `raw` is
     `undefined` or trims to empty → treat as unset (fall to default; a wrapper
     exporting `E2E_WORKERS=""` must not hard-fail). Otherwise, on the trimmed
     value:
     - matches `/^[1-9][0-9]*$/` → return `Number(raw)` (positive integer).
     - matches `/^[1-9][0-9]*%$/` → return the string `raw` (percentage; passed
       through to Playwright, which computes the count from `os.cpus().length`).
     - anything else (`0`, `0%`, `-1`, `abc`, `12x`, `1.5`, `%`) → `throw new
       WorkerConfigError(...)` with a loud message naming the offending value and
       the accepted forms — never a silent fallback (spec FR2; mirrors the
       `E2E_ENGINES` "matched no known engines" guard).
  3. **Scaled default:** return `DEFAULT_LOCAL_WORKERS` (`'50%'`). Playwright
     floors a percentage at ≥1 worker, so a low-core host degrades gracefully.
- No `process.env` access inside the helper; no I/O; no Playwright import —
  purity keeps it trivially unit-testable and decoupled from Playwright.
- **`'50%'` is the working default** (spec Decision 2's recommended value); Phase
  3 confirms or, on adverse evidence, flips the default to serial (Decision 4).

#### Acceptance Criteria
- [ ] `node --test tests/e2e-workers.test.mjs` passes; every FR8 row is covered:
  `{CI:'1'}` ⇒ `1`; `{CI:'1', E2E_WORKERS:'4'}` ⇒ `1` (CI precedence);
  `{E2E_WORKERS:'4'}` ⇒ `4`; `{E2E_WORKERS:'50%'}` ⇒ `'50%'`;
  `{E2E_WORKERS:'0'|'abc'|'12x'|'0%'|'-1'|'1.5'}` ⇒ throws `WorkerConfigError`;
  `{}` (no CI, no override) ⇒ `'50%'`; `{E2E_WORKERS:''}` ⇒ `'50%'` (empty=unset).
- [ ] `npm test` stays green (new file included via the `tests/*.test.mjs` glob).
- [ ] `npm run lint` passes on the new files.
- [ ] `.github/workflows/validation.yml` unchanged (not touched this phase).

#### Test Plan
- **Unit Tests**: `tests/e2e-workers.test.mjs` — the full matrix above, driving
  the pure function directly with literal env objects (behavior, not mocks; no
  Playwright, no `process.env` mutation).
- **Integration Tests**: none this phase (helper not yet wired — Phase 2).
- **Manual Testing**: none required; the unit suite is the contract.

#### Rollback Strategy
Delete the two new files. Nothing else references them yet, so rollback is
inert (no existing behavior touched).

#### Risks
- **Risk**: Percentage/integer regex admits an unintended form (e.g. leading
  zeros, `1e2`).
  - **Mitigation**: Explicit anchored regexes plus negative test rows for
    `1.5`, `01`?, `1e2`, `%`, `12x` in the unit suite; decide leading-zero
    disposition explicitly in a test.

---

### Phase 2: Wire helper into config, migrate consumer, update comment
**Dependencies**: Phase 1

#### Objectives
- Make `playwright.config.ts` resolve `workers` via the Phase-1 helper, delivering
  hardware-scaled local parallelism with the absolute `CI → 1` guard (FR1/FR3).
- Replace the stale `workers: 1` comment block with the new contract (FR10).
- Migrate the source-text consumer in `tests/automation.test.mjs` so the suite
  reflects reality (FR8) without weakening the CI-contract test.

#### Deliverables
- [ ] `playwright.config.ts`: import `resolveWorkers` from
  `./scripts/e2e-workers.mjs`; replace `workers: 1` with
  `workers: resolveWorkers(process.env)`.
- [ ] `playwright.config.ts`: rewrite the lines ~96–103 comment block to the new
  contract (local hardware-scaled parallel via `E2E_WORKERS`/`'50%'` default; CI
  hard-pinned serial via the guard; local `retries: 0` preserved; qualification
  rationale). Remove the "Do NOT raise `workers`" text (do not edit around it).
- [ ] `tests/automation.test.mjs`: migrate the `/workers: 1/` assertion (line 90)
  to assert the config **delegates** to the helper (e.g.
  `/workers: resolveWorkers\(process\.env\)/`) and update the adjacent comment;
  keep `fullyParallel: true` (89) and the retries assertion (93) as-is (retries
  are unchanged).

#### Implementation Details
- **Import in the `.ts` config**: `import {resolveWorkers} from
  "./scripts/e2e-workers.mjs";`. `tsconfig` `include` covers `playwright.config.ts`
  and `checkJs` is off, so the JS import is not error-checked internally; the
  JSDoc from Phase 1 keeps the inferred return type (`number | string`) clean
  where it flows into `defineConfig`'s `workers` field.
- **CI-serial contract now behavioral**: the "CI runs each shard serially"
  guarantee moves from a literal `workers: 1` source line to
  `resolveWorkers({CI:…}) === 1`, which is covered by the Phase-1 unit suite. The
  `automation.test.mjs` migration therefore asserts *delegation* (the config uses
  the tested resolver) rather than re-testing the matrix there — keeping the CI
  source-contract test meaningful without duplicating Phase 1.
- **No `package.json` change** (no new script; `E2E_WORKERS` is an env var), so
  `automation.test.mjs`'s "documents every direct package command" test is
  unaffected.
- **Retries untouched** (FR5): the `retries: process.env.CI ? 2 : 0` line and its
  assertion stay exactly as-is.

#### Acceptance Criteria
- [ ] `npm run typecheck` passes with the `.mjs` import.
- [ ] `npm test` passes (migrated `automation.test.mjs` + Phase-1 unit suite).
- [ ] **Config import resolves** (the novel `.mjs`-from-`.ts` path works):
  `E2E_ENGINES=chromium npx playwright test --list` completes without a config
  load/import error. NOTE: `--list` proves the config *loads* but does **not**
  print the worker count — the next item is the actual worker-count proof.
- [ ] **Resolved worker count proven by the run banner** (the deterministic
  observable; `--list` does not report workers): a minimal real run — a single
  fast test via `--grep`, or the full suite — prints Playwright's
  `Running N tests using M worker(s)` banner, and `M` is asserted per env:
  default ⇒ `M > 1` on this multi-core host; `CI=1` ⇒ `M = 1`;
  `E2E_WORKERS=4` ⇒ `M = 4`. This closes the gap between "config loaded" and
  "config applied the resolved count".
  (Lessons-critical: "it compiled" ≠ "it works" — exercise the real path.)
- [ ] `E2E_WORKERS=50%` → hardware-relative worker count in the banner;
  `E2E_WORKERS=abc` → loud `WorkerConfigError` at config resolution, **no run
  starts** (no silent serial).
- [ ] The `workers: 1` comment block is gone; the new contract comment is present.
- [ ] `.github/workflows/validation.yml` unchanged (verified:
  `git diff --name-only` does not list it).

#### Test Plan
- **Unit Tests**: migrated `tests/automation.test.mjs` (delegation + unchanged CI
  workflow contract); Phase-1 helper suite still green.
- **Integration Tests**: (a) `npx playwright test --list` once to confirm the
  `.mjs` import loads the config; (b) a minimal real run whose worker banner
  (`using M worker(s)`) is observed under default / `CI=1` / `E2E_WORKERS=4`
  (the deterministic worker observable — `--list` does not print it); plus the
  `E2E_WORKERS=abc` loud-failure case (no run starts). The full-suite ≥3× run is
  Phase 3's qualification.
- **Manual Testing**: eyeball Playwright's "Running X tests using N workers"
  banner for default vs `CI=1`.

#### Rollback Strategy
Revert `playwright.config.ts` to `workers: 1` and restore the original comment;
revert the `automation.test.mjs` assertion. The Phase-1 helper can remain
(unreferenced) or be reverted with Phase 1.

#### Risks
- **Risk**: Playwright's config loader cannot import the sibling `.mjs`.
  - **Mitigation**: The end-to-end `--list` acceptance run catches this
    immediately. Fallback if it fails: co-locate the helper as a `.ts` re-export
    or inline a thin `.ts` shim the config imports while the test keeps importing
    the `.mjs` — decided only if the real run fails, not preemptively.
- **Risk**: A stray `E2E_WORKERS` in a CI-like environment parallelizes a shard.
  - **Mitigation**: FR3 absolute `CI → 1` guard (returns before reading
    `E2E_WORKERS`), asserted in Phase 1 and re-verified by the `CI=1 --list` run.

---

### Phase 3: Qualify parallel execution, finalize default, document
**Dependencies**: Phase 2

#### Objectives
- Qualify parallel execution with recorded, honest evidence (FR9) and, per
  Decision 4, **finalize the local default** (parallel `'50%'` vs. serial +
  opt-in) from that evidence.
- Confirm the native-GPU lane inherits parallel workers (FR7) with no code change.
- Document the new contract (FR11) and prove CI is untouched (FR4).

#### Deliverables
- [ ] Qualification evidence gathered (for transcription into the Review):
  **≥3 consecutive full two-engine runs** with per-test pass/fail, wall-clock,
  resolved worker count, `retries: 0` — **primary vehicle: the native-GPU lane**
  (`E2E_GPU_REQUIRE=1` so a silent software fallback cannot pollute evidence),
  plus a contemporaneous **serial baseline** wall-clock (`E2E_WORKERS=1`) for
  comparison.
- [ ] If the parallel `npm run validate` default is adopted:
  **SwiftShader-parallel** stability evidence (≥3 consecutive
  `npm run validate` runs at the scaled default), same recording discipline.
- [ ] **Default finalized in `scripts/e2e-workers.mjs`**: keep
  `DEFAULT_LOCAL_WORKERS='50%'` if qualified green; **or** flip the default to
  serial (`1`) with parallel remaining opt-in via `E2E_WORKERS`, if evidence
  shows instability — with the trade-off recorded (Decision 4 / Scenario 5).
- [ ] FR7 verified: the GPU lane runs the full suite under the scaled workers by
  inheritance (no `scripts/e2e-gpu-lane.mjs` change); if — contrary to analysis —
  it pins workers, apply the minimal fix to let it inherit/honor `E2E_WORKERS`.
- [ ] `README.md` updated (FR11): local runs are parallel + hardware-scaled by
  default (or the opt-in + serial-default outcome, whichever qualified); how to
  tune with `E2E_WORKERS` (integer or `%`); CI unchanged (`workers: 1` whenever
  `CI` is set); local `retries: 0` preserved; the qualification outcome. Touch
  points: the script/table lines (~70–72), the lane "same `workers: 1`" line
  (~178), the "#41 … sequenced after" note (~284–285, now delivered), and the
  lane env-var table (~222–228, add `E2E_WORKERS`).
- [ ] CI-untouched proof: `git diff --name-only origin/main` does not list
  `.github/workflows/validation.yml`.

#### Implementation Details
- **GPU-hardware contingency (WSL2 builder):** the GPU lane requires a verifiable
  hardware WebGL adapter; on this builder that may be unavailable, so
  `E2E_GPU_REQUIRE=1` may abort. Evidence-gated branch (no outcome assumed):
  1. **GPU lane verifies hardware** → run it ≥3× under scaled parallel workers;
     this is the primary, contention-free qualification (Decision 3).
  2. **GPU lane cannot verify hardware here** → record that honestly; qualify the
     parallel **`validate`** default on the SwiftShader path instead (≥3×), which
     is the path that actually gates. Note the missing contention-free substrate
     as a limitation.
  3. **SwiftShader parallel destabilizes** the timing-qualified `matrix.spec.ts`
     tests (the exact risk the old comment named; #34/#33 may amplify) → take
     Decision 4's fallback: default serial, parallel opt-in via `E2E_WORKERS`,
     trade-off documented; any instability dispositioned per flake discipline
     (fixed or explicitly accepted+documented) — **never masked with retries,
     never by weakening a canonical assertion**.
- All wall-clocks/worker-counts/per-test results recorded **verbatim**; a single
  host's parallel result is never generalized (Evidence honesty).
- The `README` CI-decomposition lines that state each shard runs `workers: 1`
  remain **true** (CI is unchanged) and are kept; only the *local*-run and *lane*
  descriptions change.

#### Acceptance Criteria
- [ ] ≥3 consecutive full two-engine parallel runs recorded with the required
  detail (worker count, per-test, wall-clock, `retries: 0`), on the GPU lane
  under `E2E_GPU_REQUIRE=1` where hardware is available — else the documented
  SwiftShader-`validate` path with the limitation noted.
- [ ] The finalized default matches the evidence (parallel `'50%'` green, or
  serial + opt-in documented); Success Metric 4 met (measurable `validate`
  speedup) or the documented trade-off taken.
- [ ] `README` states the new contract; a reader who hasn't seen the spec can
  find: parallel + hardware-scaled local runs, `E2E_WORKERS` tuning, CI unchanged,
  `retries: 0` preserved, the qualification outcome (Scenario 6).
- [ ] `npm test`, `npm run lint`, `npm run typecheck` green;
  `automation.test.mjs`'s README assertions (`E2E_ENGINES=chromium`,
  `playwright install --with-deps chromium`, script list) still pass.
- [ ] `.github/workflows/validation.yml` absent from the PR diff.

#### Test Plan
- **Unit Tests**: if the default flips, update/confirm the Phase-1 matrix row for
  the default; otherwise unchanged.
- **Integration Tests**: the repeat-run qualification IS the integration test —
  the real full suite under the real resolved config, ≥3×.
- **Manual Testing**: read the rendered README section for accuracy; confirm
  `git diff` cleanliness for `validation.yml`.

#### Rollback Strategy
README and any default flip are revertible in isolation. If qualification cannot
be completed on the builder hardware (no GPU + SwiftShader-parallel unstable),
the safe landing is the serial-default + opt-in-parallel branch, which is a
strict superset of today's behavior (default identical to current serial) plus a
new opt-in — so it never regresses the gate.

#### Risks
- **Risk**: No GPU on the builder blocks the *primary* (contention-free)
  qualification.
  - **Mitigation**: Contingency branch above; SwiftShader-`validate`
    qualification still gates the shippable default; escalate to the architect via
    `afx send` only if neither branch can produce honest evidence.
- **Risk**: Parallel contention amplifies #34 (click-to-focus) / #33 (Firefox
  pointer-nav) flakes.
  - **Mitigation**: `retries: 0` keeps them visible (FR5); dispositioned per flake
    discipline, never masked; if they block the parallel default, take the serial
    fallback and document.

## Dependency Map
```
Phase 1 (pure helper + unit tests)
   └─→ Phase 2 (wire config, migrate consumer, comment)
          └─→ Phase 3 (qualify, finalize default, document)
```
Strictly linear: Phase 2 needs the tested helper to import; Phase 3 needs the
wired config to run the qualification and finalize the default.

## Risk Analysis

### Technical Risks
| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| SwiftShader parallel contention destabilizes timing-qualified `matrix.spec.ts` | M-H | M | FR9 repeat-run at `retries: 0`; Decision-4 evidence-gated default + documented serial fallback; primary qualification on the contention-free GPU lane | builder |
| No verifiable GPU on the WSL2 builder → primary qualification vehicle unavailable | M | M | Phase-3 contingency: SwiftShader-`validate` qualifies the shippable default; note the limitation; escalate only if no honest evidence is reachable | builder |
| Playwright config loader can't import the sibling `.mjs` | L | M | Phase-2 end-to-end `--list` run catches it; `.ts` shim fallback decided only if it fails | builder |
| Open flakes #34 / #33 amplified under parallel contention | M | M | `retries: 0` keeps them visible (FR5); disposition per flake discipline, never masked | builder |
| Stray `E2E_WORKERS` in a CI-like env parallelizes a shard | L | H | FR3 absolute `CI → 1` guard (returns before reading `E2E_WORKERS`), tested (FR8) + re-verified | builder |
| Config change drifts the qualified CI contract | L | H | FR4 zero-diff `validation.yml` + CI green; guard is a one-line tested invariant | builder |
| Invalid `E2E_WORKERS` silently falls back and misleads | L | M | FR2 fail-closed `WorkerConfigError`, tested (FR8) | builder |
| `automation.test.mjs` source-text assertion left stale, hiding the change | M | L | FR8 migration is in Phase 2 scope | builder |

### Schedule Risks
Not applicable — no time estimates (AI-driven development; progress measured by
completed phases).

## Validation Checkpoints
1. **After Phase 1**: `node --test tests/e2e-workers.test.mjs` green; full FR8
   matrix covered; `npm test` and `npm run lint` green.
2. **After Phase 2**: `npm run typecheck` / `npm test` green; real `playwright
   test --list` resolves workers correctly under default / `CI=1` /
   `E2E_WORKERS`; invalid override fails loudly; comment block replaced;
   `validation.yml` untouched.
3. **After Phase 3 (before PR)**: ≥3-run parallel qualification recorded; default
   finalized from evidence; README reflects the outcome; full `npm run validate`
   green; `git diff` shows no `validation.yml` change.
4. **PR / CI**: PR CI (quality + 4 SwiftShader e2e shards + gate) green,
   confirming CI behavior is byte-for-byte preserved.

## Integration Points
### External Systems
None. No external services, APIs, or infrastructure — this is
test-harness/config/tooling and documentation work.

### Internal Systems
- **`playwright.config.ts`** — consumes `resolveWorkers` (Phase 2).
- **`scripts/e2e-gpu-lane.mjs`** — inherits the scaled default with no code
  change (verified Phase 3); primary qualification substrate.
- **`tests/automation.test.mjs`**, **`tests/e2e-workers.test.mjs`** — the config
  source-contract and helper-matrix test consumers.

## Documentation Updates Required
- [ ] `README.md` (FR11): local-parallel default / `E2E_WORKERS` tuning / CI
  unchanged / `retries: 0` preserved / qualification outcome; update the lane
  "same `workers: 1`" line and the "#41 sequenced after" note; add `E2E_WORKERS`
  to the lane env-var table.
- [ ] `playwright.config.ts` comment block (FR10) — done in Phase 2.
- [ ] N/A: API docs, architecture diagrams, runbooks, deployment/config guides
  (no such surfaces are affected).
- Arch/lessons governance-doc updates, if any durable facts emerge, are handled
  in the Review phase via the `update-arch-docs` skill (not a code phase).

## Resource Requirements
- **Environment**: the pinned toolchain (Node 22.23.1 / npm 10.9.8, `npm ci`,
  lockfile v3); a multi-core host to observe the parallel speedup; ideally a
  verifiable hardware-WebGL adapter for the GPU-lane qualification (contingency if
  absent — see Phase 3).
- **Infrastructure**: none (no DB, services, config, or monitoring changes).

## Notes
- **Module-format decision**: the helper is a `.mjs` (plain ESM) so `node --test`
  imports it directly (the config's `.ts` is not runnable by `node --test`); the
  `.ts` config imports the `.mjs`. This mirrors the established
  `scripts/e2e-gpu-lane.mjs` ⇐ `tests/gpu-lane.test.mjs` pattern.
- **Default value**: `'50%'` is the spec's recommended working default; Phase 3
  either confirms it or flips it to serial per recorded evidence (Decision 4).
- **No new npm script / no dependency movement**: `E2E_WORKERS` is an env var;
  the lockfile shows no delta; `app/**` is untouched.
- **PR strategy**: one PR, three phase-commits, opened after Phase 3 (issue #41).
  CI is a stakeholder only in being provably unaffected.

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-22 | Initial implementation plan | Spec 41 approved; decompose into 3 phases | builder (spir-41) |
