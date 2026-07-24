# Plan: Native-GPU e2e Lane Defaults to Parallel Workers (SwiftShader Gate Stays Serial)

## Metadata
- **ID**: plan-2026-07-24-gpu-lane-parallel-default
- **Status**: draft
- **Specification**: codev/specs/56-gpu-lane-parallel-default.md
- **Created**: 2026-07-24

## Executive Summary

Implement Approach B from the spec: `scripts/e2e-gpu-lane.mjs` injects
`E2E_WORKERS='50%'` into the **hardware-mode** suite env it composes (via
`suiteEnvFor`), only when the operator has not set `E2E_WORKERS` (unset or
whitespace-only). The value flows through the untouched `resolveWorkers`
machinery — no second worker-resolution path. The `software-fallback` env,
`skip-empty`/`abort` guards, CI, `npm run validate`, and `test:smoke` are all
byte-for-byte unaffected.

Three phases: (1) the default-injection mechanism with full unit coverage;
(2) worker visibility in lane log output and the machine-greppable report
(additive `workers:` line); (3) docs reconciliation plus re-qualification
evidence under the new default path (serial baseline + ≥3 consecutive green
plain parallel runs), which gates shipping per spec Decision 8.

## Success Metrics

- [ ] All spec FR1–FR9 satisfied; acceptance Scenarios 1–6 pass.
- [ ] `npm run validate` green on the pinned toolchain (`npm ci`).
- [ ] `tests/gpu-lane.test.mjs` covers every FR7 case; existing tests
      (including `tests/e2e-workers.test.mjs`, unmodified) stay green.
- [ ] Zero diff in `.github/workflows/validation.yml`,
      `scripts/e2e-workers.mjs`, `tests/e2e-workers.test.mjs`, and the
      `workers:` line of `playwright.config.ts`.
- [ ] Re-qualification: serial baseline + ≥3 consecutive green plain
      `npm run test:e2e:gpu` parallel runs recorded (FR8).

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "phase_1", "title": "Lane hardware-mode worker default (mechanism + unit tests)"},
    {"id": "phase_2", "title": "Worker visibility: lane log line and additive report line"},
    {"id": "phase_3", "title": "Docs reconciliation and re-qualification evidence"}
  ]
}
```

## Phase Breakdown

### Phase 1: Lane hardware-mode worker default (mechanism + unit tests)
**Dependencies**: None
**Status**: pending

#### Objectives
- Plain hardware-mode lane runs get `E2E_WORKERS='50%'` by default; operator
  overrides pass through untouched; fallback/no-run paths unchanged (FR1–FR3,
  FR5, FR7).

#### Deliverables
- [ ] `scripts/e2e-gpu-lane.mjs`:
  - Exported constant `LANE_DEFAULT_WORKERS = "50%"` (spec Decision 3).
  - Exported pure helper (e.g. `operatorWorkersSet(baseEnv)`) implementing
    "operator has set `E2E_WORKERS`" = value exists and is not
    whitespace-only (spec Decision 4, mirroring `resolveWorkers` unset/empty
    semantics).
  - `suiteEnvFor(plan, baseEnv)`: in the `hardware` branch only (both the
    Chromium-inclusive and Firefox-only arms), set
    `env.E2E_WORKERS = LANE_DEFAULT_WORKERS` when the operator has not set
    it. The `software-fallback` branch and the guard throw are untouched.
    No pre-validation of operator values (spec Decision 5). `baseEnv` is
    never mutated (existing `composeEnv`/`fallbackEnv` copy semantics).
- [ ] `tests/gpu-lane.test.mjs` additions (FR7):
  - hardware two-engine plan ⇒ suite env has `E2E_WORKERS === "50%"`;
  - Firefox-only hardware plan ⇒ default injected;
  - operator `E2E_WORKERS=4` and `E2E_WORKERS=1` ⇒ passed through verbatim
    (no override by the lane);
  - whitespace-only `E2E_WORKERS="   "` ⇒ treated as unset, default injected;
  - malformed operator value (e.g. `banana`) ⇒ passed through verbatim (the
    lane does not validate; `WorkerConfigError` remains config-load's job);
  - software-fallback plan ⇒ no lane-injected `E2E_WORKERS`; operator value
    still passes through;
  - base env object not mutated by `suiteEnvFor`;
  - `LANE_DEFAULT_WORKERS` exported and equal to `"50%"`.

#### Implementation Details
- All changes are in the pure, already-unit-tested `suiteEnvFor` layer —
  `runFullLane` call sites are untouched in this phase.
- Files: `scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs` (2 files).
- Explicitly NOT touched: `scripts/e2e-workers.mjs`,
  `tests/e2e-workers.test.mjs`, `playwright.config.ts`,
  `.github/workflows/validation.yml` (spec FR4/FR5).

#### Acceptance Criteria
- [ ] All new FR7 unit tests pass; full `npm run validate` green.
- [ ] `git diff --name-only` shows only the two files above.

#### Test Plan
- **Unit**: the FR7 matrix above via the existing node test harness.
- **Integration/manual**: deferred to Phase 3 (real lane runs).

#### Rollback Strategy
Revert the phase commit — the change is additive and confined to two files.

#### Risks
- **Risk**: injecting in the wrong branch parallelizes SwiftShader fallback.
  - **Mitigation**: injection lives structurally inside the `hardware`
    branch; a dedicated fallback unit test asserts absence.

---

### Phase 2: Worker visibility — lane log line and additive report line
**Dependencies**: Phase 1
**Status**: pending

#### Objectives
- The effective worker decision is visible in lane logs and the
  machine-greppable final report (FR6, spec Decision 7).

#### Deliverables
- [ ] `scripts/e2e-gpu-lane.mjs`:
  - Exported pure helper (e.g. `workerDecisionFor(plan, baseEnv)`) returning
    the effective value + provenance:
    `{value: "50%", provenance: "lane default"}` |
    `{value: <operator value>, provenance: "operator override"}` |
    `{value: "1", provenance: "config serial default"}` for
    software-fallback with no operator value (and operator override
    provenance when set on fallback).
  - `formatReport` gains one **additive** `workers: <value> (<provenance>)`
    line; all existing report lines keep their phrasing verbatim (spec 52
    FR10 consumers grep by line prefix). Report call sites that run a suite
    (`runFullLane` success + build-failure paths, fallback path) pass the
    decision; `--probe-only` and `skip-empty` reports show
    `workers: n/a (no suite run)` — additive and honest.
  - A `log(...)` line before the suite stage stating the decision.
  - Header comment updated where it says workers are "untouched" (lines
    621–623 area) to describe the hardware-mode default.
- [ ] `tests/gpu-lane.test.mjs`: unit tests for `workerDecisionFor`
  (default / override / fallback / whitespace-unset) and for `formatReport`
  emitting the `workers:` line while preserving existing line phrasing.

#### Implementation Details
- Files: `scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs` (2 files).
- `formatReport` signature change is internal to the lane script and its
  tests; no external consumer imports it.

#### Acceptance Criteria
- [ ] Report contains exactly one `workers:` line in every mode that prints
      a report; all pre-existing line assertions in the test file pass
      unmodified (proving stable phrasing).
- [ ] `npm run validate` green.

#### Test Plan
- **Unit**: decision helper + report formatting matrix.
- **Manual**: `node scripts/e2e-gpu-lane.mjs --probe-only` output eyeballed.

#### Rollback Strategy
Revert the phase commit; Phase 1 behavior (silent default) still stands.

#### Risks
- **Risk**: breaking a grep consumer of the report.
  - **Mitigation**: additive-only line; existing tests assert verbatim
    phrasing of prior lines.

---

### Phase 3: Docs reconciliation and re-qualification evidence
**Dependencies**: Phase 2
**Status**: pending

#### Objectives
- Documentation matches the split model; the default ships only on green
  re-qualification (FR8, FR9, spec Decision 8).

#### Deliverables
- [ ] `README.md`: "Opt-in native-GPU e2e lane" section states
      parallel-by-default on verified hardware (`50%`), tunable/serial via
      `E2E_WORKERS`, serial on software fallback; "Local test parallelism"
      note and the lane env-table `E2E_WORKERS` row updated to match.
- [ ] `codev/reviews/41-parallelize-local-e2e-runs.md`: dated correction
      under "Revisiting the serial default" — lane-scoped parallel default
      shipped by spec 56; global default remains serial (SwiftShader
      contention unsolved, CI GPU-less, lane never the gate).
- [ ] `scripts/e2e-gpu-lane.mjs` top-of-file header comment updated if it
      describes worker behavior.
- [ ] Re-qualification evidence captured for the review document (recorded
      in full during the Review phase):
      (a) serial baseline `E2E_WORKERS=1 npm run test:e2e:gpu` — per-test
      results + wall clock + report;
      (b) ≥3 **consecutive green** plain `npm run test:e2e:gpu` runs (no
      `E2E_WORKERS` in env), each report showing `workers: 50% (lane
      default)` and hardware renderer lines for both engines.
- [ ] Final `npm run validate` green; Scenario 5 diff audit
      (`git diff main --name-only` excludes all frozen files).

#### Implementation Details
- Files: `README.md`, `codev/reviews/41-parallelize-local-e2e-runs.md`,
  possibly `scripts/e2e-gpu-lane.mjs` comments (≤3 files).
- Evidence runs happen on this qualified host (20-core WSL2 + RTX 3080,
  Mesa d3d12). Any non-green run resets the consecutive count; a genuine
  flake **blocks shipping** — per spec Decision 8 the default reverts to
  opt-in and the flake gets its own issue, escalated to the architect.

#### Acceptance Criteria
- [ ] FR8 evidence complete (baseline + 3/3 green under the default path).
- [ ] FR9 docs updated; no stale "serial by default" claims about the lane.
- [ ] All spec acceptance scenarios verified.

#### Test Plan
- **Integration**: the qualification runs themselves (Scenarios 1, 2, 4).
- **Manual**: Scenario 3 spot check (`E2E_WORKERS=banana` fails loud).

#### Rollback Strategy
If qualification fails: revert Phases 1–2 commits (or gate the default off)
and report to the architect — spec Decision 8 forbids shipping.

#### Risks
- **Risk**: a latent flake (e.g. #34/#58 click-to-focus family) surfaces
  under the parallel default.
  - **Mitigation**: `retries: 0` keeps it visible; Decision 8 blocks the
    ship; issue filed/linked; architect notified.
- **Risk**: host busy during qualification skews timings/flakes.
  - **Mitigation**: run on a quiet host; rerun resets the count.

## Dependency Map
```
Phase 1 ──→ Phase 2 ──→ Phase 3
```

## Resource Requirements
- **Environment**: pinned Node/npm (`.nvmrc`/`package.json`) via `npm ci`;
  the qualified GPU host for Phase 3 evidence runs. No new dependencies, no
  lockfile movement (reproducibility contract).

## Integration Points
- Internal only: the lane's suite env → `playwright.config.ts` →
  `resolveWorkers` (`scripts/e2e-workers.mjs`, unmodified). No external
  systems.

## Risk Analysis
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Fallback path accidentally parallelized | L | H | Structural injection in hardware branch only + dedicated unit test |
| Report grep consumers break | L | M | Additive-only line; existing verbatim-phrasing tests |
| Qualification flake blocks ship | M | M | Decision 8 protocol: don't ship, file issue, notify architect |
| CI leak of lane default | — | H | Impossible by structure (`CI⇒1` before `E2E_WORKERS` read); existing tests prove it |

## Validation Checkpoints
1. **After Phase 1**: FR7 unit matrix green; frozen-file diff audit.
2. **After Phase 2**: report/log visibility green; `npm run validate`.
3. **After Phase 3 (before PR)**: FR8 evidence complete; Scenario 5 audit;
   full validate on clean state.

## Documentation Updates Required
- [ ] README lane section, parallelism note, env table (Phase 3)
- [ ] #41 review follow-up correction (Phase 3)
- [ ] Lane script header comments (Phases 2–3)

## Post-Implementation Tasks
- [ ] Review document with lessons learned + FR8 evidence
      (`codev/reviews/56-gpu-lane-parallel-default.md`)
- [ ] Arch/lessons doc routing check (hot/cold tiers) during Review phase

## Expert Review
Porch runs 3-way consultation on this plan; feedback and adjustments will be
recorded here.

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-24 | Initial plan | — | builder spir-56 |

## Notes
- Commit message format per phase:
  `[Spec 56][Phase: <name>] type: description`. Phases are commits on this
  branch, not separate PRs; the PR opens after Phase 3.
- "No time estimates" honored; progress is phase completion only.
