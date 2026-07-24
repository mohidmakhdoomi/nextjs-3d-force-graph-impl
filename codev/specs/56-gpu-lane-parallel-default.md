# Specification 56: Native-GPU e2e Lane Defaults to Parallel Workers (SwiftShader Gate Stays Serial)

## Summary

Make the opt-in native-GPU e2e lane (`npm run test:e2e:gpu`, driven by
`scripts/e2e-gpu-lane.mjs`) default to **hardware-scaled parallel workers**
(`E2E_WORKERS='50%'`) on its **verified-hardware suite runs only**, while the
SwiftShader canonical/CI gate stays **serial and byte-for-byte unchanged**.

Issue #41 shipped serial-default + opt-in-parallel (`DEFAULT_LOCAL_WORKERS = 1`)
because parallel workers deterministically destabilize the SwiftShader path
(4–5 of 22 tests fail on **every** parallel SwiftShader run — CPU contention,
not flakiness). On hardware WebGL that rationale evaporates: rendering is off
the CPU, and #41's own qualification ran the two-engine lane at 10 workers
~4.3× faster. The sole parallel failure back then — the Firefox background-drag
flake — is now **fixed and re-qualified green 3/3 in the exact
`E2E_WORKERS=50%` two-engine parallel regime** (issue #55, closed 2026-07-24;
evidence in `codev/reviews/55-firefox-background-drag-flake.md`, FR6). The
blocker named in issue #56 is therefore resolved, and the lane's parallel
default is realizable.

The mechanism is deliberately small: the lane wrapper injects
`E2E_WORKERS='50%'` into the **hardware** suite environment when the operator
has not set `E2E_WORKERS` themselves. The value then flows through the existing
`resolveWorkers` machinery (`scripts/e2e-workers.mjs`) untouched — no second
worker-resolution path, no change to `resolveWorkers`, its tests, or
`playwright.config.ts`'s `workers:` line.

### Why this is worth building

- The two-engine hardware lane is ~4× faster parallel (~4–5 min vs ~18 min on
  the qualified host class) and is now proven flake-free in that regime
  (#55 FR6, green 3/3). Making the fast path the default removes a footgun:
  today a plain `npm run test:e2e:gpu` silently runs 4× slower than the lane's
  qualified capability.
- It delivers the #41 review's "revisit the default" follow-up in the only
  scope where it is deliverable: the *lane-scoped* default. The *global*
  serial default must stay (SwiftShader parallel contention is unsolved, CI
  has no GPU, hardware is not reproducible, and "the lane is never the gate"
  is a Baked Decision — #44 Decision 1, #52 Decision 1).

## Problem Analysis

### Current state

- `playwright.config.ts` sets `workers: resolveWorkers(process.env)`.
  `resolveWorkers` (pure, unit-tested in `tests/e2e-workers.test.mjs`)
  resolves: (1) `CI` truthy ⇒ `1`, structurally before reading anything else;
  (2) `E2E_WORKERS` override — positive integer or percentage, malformed ⇒
  loud `WorkerConfigError`; (3) default `DEFAULT_LOCAL_WORKERS = 1`.
- `scripts/e2e-gpu-lane.mjs` probes per-engine hardware, then runs build +
  one Playwright suite invocation with an env composed by `suiteEnvFor(plan,
  baseEnv)`. The suite env starts from the pristine inherited env, so an
  operator's `E2E_WORKERS` already passes through — the lane is parallelizable
  today, but **only** by explicit opt-in.
- `suiteEnvFor` already branches on run mode: `hardware` (injects the verified
  recipe env + `E2E_ENGINES`), `software-fallback` (SwiftShader defaults,
  Chromium-only), and guards `skip-empty`/`abort` (no suite runs).

### Desired state

- A plain `npm run test:e2e:gpu` that verifies hardware runs the suite with
  `E2E_WORKERS='50%'` (hardware-scaled; 10 workers on the qualified 20-core
  host class).
- A lane run that **falls back to SwiftShader keeps the serial default** — the
  exact regime that deterministically fails 4–5/22 in parallel must never
  become a parallel default through the lane's back door.
- Operator control is unchanged: `E2E_WORKERS` still overrides on the lane
  (including `E2E_WORKERS=1` to force serial for diagnostics), and malformed
  values still fail loud via `WorkerConfigError` at config load.
- CI and the plain SwiftShader suite (`npm run validate`, `test:smoke`) are
  byte-for-byte unaffected.

### Stakeholders

- **Developers running the lane** get the qualified fast path by default.
- **The green gate** (`npm run validate`, CI) must be provably untouched.
- **Future qualification work** (FR9-style evidence) needs runs that
  self-document their worker count.

## Confirmed Decisions

1. **Lane-wrapper default, not a `resolveWorkers` hardware signal.** The issue
   allows either. Selected: `scripts/e2e-gpu-lane.mjs` defaults `E2E_WORKERS`
   in the suite env it composes. Rejected: having `resolveWorkers` key off
   lane-recipe env (`GALLIUM_DRIVER`, `PW_CHROMIUM_ARGS`) — those keys can
   legitimately exist in an operator's shell for unrelated reasons, it would
   couple the pure worker module to lane-recipe internals, and it would break
   the config's simple contract ("reads only `CI` and `E2E_WORKERS`"). The
   lane already owns the "is this verified hardware?" decision; the default
   belongs where the knowledge lives.
2. **The parallel default applies to `hardware`-mode suite runs only** —
   including two-engine, Chromium-only, and Firefox-only hardware runs. The
   `software-fallback` suite env gets **no injected default** (an operator's
   explicit `E2E_WORKERS` still passes through to fallback, exactly as
   today — explicit opt-in remains the operator's call and stays honest).
3. **Default value is the string `'50%'`** — the same hardware-relative value
   #41 recommended and #55 re-qualified. Exported as a named constant (e.g.
   `LANE_DEFAULT_WORKERS`) so tests and docs reference one value.
4. **"Operator has not set `E2E_WORKERS`" means unset or whitespace-only**,
   mirroring `resolveWorkers`'s own unset/empty semantics so the two layers
   can never disagree about whether an override exists.
5. **No pre-validation in the lane.** A malformed `E2E_WORKERS` passes through
   and fails loud at config load (`WorkerConfigError`) — `resolveWorkers`
   remains the single validation source of truth.
6. **`scripts/e2e-workers.mjs` is not in the diff.** `DEFAULT_LOCAL_WORKERS`
   stays `1`; `resolveWorkers` and `tests/e2e-workers.test.mjs` are untouched.
   The CI guard therefore remains structural: even with the lane's injected
   `E2E_WORKERS`, a truthy `CI` resolves to `1` before `E2E_WORKERS` is read.
7. **Workers become visible in lane output.** The lane logs the effective
   worker decision (defaulted vs. operator-set vs. fallback-serial), and the
   machine-greppable final report gains one **additive** `workers:` line so
   qualification evidence is self-documenting. Existing report lines keep
   their stable phrasing (spec 52 FR10 consumers grep by line prefix; an
   added line breaks none of them).
8. **Ship only on green re-qualification.** The parallel default does not
   merge without ≥3 consecutive green parallel two-engine lane runs under the
   *new default path itself* (plain `npm run test:e2e:gpu`, no `E2E_WORKERS`),
   plus a serial-lane baseline for comparison. If a new flake surfaces (e.g.
   the #34/#58 click-to-focus family), the default must not ship — the change
   reverts to opt-in and the flake gets its own issue.

## Scope

### In scope

- `scripts/e2e-gpu-lane.mjs`: inject the `E2E_WORKERS='50%'` default into the
  hardware-mode suite env (pure change inside/alongside `suiteEnvFor`);
  workers log line + additive report line; header-comment updates.
- `tests/gpu-lane.test.mjs`: unit coverage of the new default semantics.
- Re-qualification evidence (serial baseline + ≥3 green parallel default
  runs) recorded in the review document.
- Documentation: README ("Opt-in native-GPU e2e lane" section, the "Local
  test parallelism" note, the lane env-var table row for `E2E_WORKERS`);
  reconcile the #41 review's "Revisiting the serial default" follow-up item
  (this delivers the lane-scoped default; the global default remains blocked
  on SwiftShader contention).

### Out of scope (non-goals)

- Changing `DEFAULT_LOCAL_WORKERS`, `resolveWorkers`, or anything in
  `scripts/e2e-workers.mjs` / `tests/e2e-workers.test.mjs`.
- Touching `.github/workflows/validation.yml` or any CI behavior.
- Changing the plain suite / `npm run validate` / `test:smoke` defaults.
- Solving the SwiftShader parallel-contention failures (the standing global
  blocker — #41 review Follow-up Items).
- A `test:smoke:parallel` convenience script (#41 review follow-up; separate).
- New dependencies, lockfile, or toolchain movement.
- Weakening or retuning any canonical assertion; changing `retries: 0`.

## Constraints and Invariants

- **CI byte-for-byte unchanged**: `.github/workflows/validation.yml` not in
  the diff; the absolute `CI → workers: 1` guard stays structural (a lane
  default can never parallelize a CI shard, even hypothetically, because
  `resolveWorkers` returns before reading `E2E_WORKERS`).
- **Canonical serial gate unchanged**: SwiftShader `npm run validate` /
  `test:smoke` remain serial by default; the lane's **fallback** path also
  remains serial by default (Decision 2).
- **`E2E_WORKERS` override precedence on the lane**: any operator-set value —
  including `1` — beats the lane default; invalid values fail loud
  (`WorkerConfigError`), never silently.
- **Local `retries: 0` preserved**; flakes never masked; canonical assertions
  never weakened.
- **Reproducibility contract**: exact Node/npm from `package.json`/`.nvmrc`,
  lockfile v3, `npm ci`; no new dependencies.
- **The lane is never the gate** (Baked Decision, #44/#52): nothing here may
  be cited as, or wired into, the green gate.

## Solution Exploration

### Approach A: `resolveWorkers` detects a lane signal

Have `resolveWorkers` return a scaled value when lane-recipe env
(`GALLIUM_DRIVER`, `PW_CHROMIUM_ARGS`) is present. Rejected (Decision 1):
false-positive prone (those keys are not lane-exclusive), couples the pure
module to lane internals, complicates the config contract, and forces changes
to a module this issue explicitly wants untouched.

### Approach B: Lane wrapper defaults `E2E_WORKERS` in the hardware suite env (selected)

`suiteEnvFor` already knows the run mode and composes the suite env from a
pristine base. Injecting `E2E_WORKERS = '50%'` there — only for `hardware`
mode, only when the operator hasn't set it — is a few lines, pure,
unit-testable with the existing test harness, and reuses `resolveWorkers`
end-to-end (the injected value is resolved, validated, and CI-guarded by the
exact same code as an operator export).

### Approach C: Flip the global default (`DEFAULT_LOCAL_WORKERS = '50%'`)

Rejected — restated for the record (issue #56 "Why not…" section, #41 review
follow-up): the SwiftShader gate deterministically fails 4–5/22 parallel; CI
has no GPU (Firefox cannot create a WebGL context on GitHub runners; the
Kaggle GPU-CI path was rejected on AUP grounds, #42); hardware WebGL is
probed, evidence-dated, and not reproducible; the lane is never the gate.

## Functional Requirements

### FR1 — Hardware lane runs default to hardware-scaled parallel workers

When the lane's run plan is `hardware` (two-engine, Chromium-only, or
Firefox-only) and the inherited env has no operator-set `E2E_WORKERS`
(unset or whitespace-only), the suite env composed by the lane MUST contain
`E2E_WORKERS` set to the exported lane default constant (`'50%'`). The value
MUST flow through the existing `resolveWorkers` path — no second
worker-resolution mechanism anywhere in the diff.

### FR2 — Operator override fully preserved

An operator-set `E2E_WORKERS` (integer, percentage, or `1` to force the lane
serial for diagnostics) MUST pass through unchanged and beat the lane default.
A malformed value MUST still fail loud with `WorkerConfigError` at config
load; the lane MUST NOT pre-validate or rewrite it (single source of truth).

### FR3 — Fallback and no-run paths untouched

The `software-fallback` suite env MUST NOT contain a lane-injected
`E2E_WORKERS` (operator passthrough only, exactly today's behavior), so a
SwiftShader fallback run stays serial by default. `skip-empty` and `abort`
run no suite and remain guarded as today.

### FR4 — CI provably unaffected

`.github/workflows/validation.yml` MUST NOT appear in the diff. The existing
structural guard (CI resolves to `1` before `E2E_WORKERS` is read) MUST be
called out in the review as the reason a lane default cannot leak into CI;
existing `tests/e2e-workers.test.mjs` coverage already proves it and MUST
remain green and unmodified.

### FR5 — Plain-suite defaults unchanged

`scripts/e2e-workers.mjs` (including `DEFAULT_LOCAL_WORKERS = 1`),
`tests/e2e-workers.test.mjs`, and the `workers:` wiring in
`playwright.config.ts` MUST be unchanged. `npm run validate` and `test:smoke`
MUST remain serial by default and green.

### FR6 — Worker visibility in lane output

The lane MUST log the effective worker decision for the suite run (lane
default applied / operator override honored / fallback serial default) and
MUST add one additive `workers: <value> (<provenance>)` line to the final
machine-greppable report. All existing report lines keep their stable
phrasing verbatim.

### FR7 — Unit coverage of the default semantics

`tests/gpu-lane.test.mjs` MUST cover at minimum: hardware two-engine run
injects the default; Firefox-only hardware run injects the default; operator
`E2E_WORKERS=4` and `E2E_WORKERS=1` pass through un-overridden; whitespace-only
`E2E_WORKERS` is treated as unset (default injected); software-fallback env
has no injected `E2E_WORKERS` while operator passthrough is preserved; the
base env is never mutated.

### FR8 — Re-qualification evidence under the new default

Recorded in the review, FR9-style (#41): (a) one serial-lane baseline
(`E2E_WORKERS=1 npm run test:e2e:gpu`) with per-test results and wall clock;
(b) **≥3 consecutive green** parallel two-engine lane runs invoked as a plain
`npm run test:e2e:gpu` (no `E2E_WORKERS` in the env — the default path itself
is what qualifies), each report showing the `workers:` line and hardware
renderers for both engines. Any non-green run resets the consecutive count
and, if a genuine flake, blocks shipping the default (Decision 8).

### FR9 — Documentation reconciled

README updates: the "Opt-in native-GPU e2e lane" section states the lane is
parallel-by-default on verified hardware, tunable/serial via `E2E_WORKERS`,
and serial on software fallback; the "Local test parallelism" note and the
lane's `E2E_WORKERS` env-table row are updated to match. The #41 review's
"Revisiting the serial default" follow-up gains a dated correction noting the
lane-scoped parallel default shipped here, while the **global** default
remains serial, still blocked on SwiftShader parallel contention. Header
comments in `scripts/e2e-gpu-lane.mjs` are updated where they describe worker
behavior.

## Non-Functional Requirements

### Behavior preservation

Every non-lane path byte-identical in behavior: CI, `npm run validate`,
`test:smoke`, plain `npx playwright test`. Within the lane, probe logic,
candidate lifecycle, fallback semantics, engine gating, and exit codes are
unchanged — only the suite env's worker default (hardware mode) and the
output lines change.

### Evidence honesty

Qualification runs are evidence-dated and host-class-specific, like the lane
recipe itself. A fallback run's serial default and a hardware run's parallel
default must both be visible in output (FR6) so no transcript can be
misread.

### Reproducibility

No dependency, lockfile, or toolchain movement. `npm run validate` green on
the exact pinned toolchain via `npm ci`.

### Maintainability

The default lives in one exported constant next to the code that applies it;
`resolveWorkers` remains the only validation/resolution logic.

## Risks and Mitigations

- **Host variance**: parallel qualification holds on the qualified host class
  (20-core WSL2 + RTX 3080, Mesa d3d12), not universally. Mitigation: the
  default is hardware-relative (`50%`), the lane already only applies it on
  *verified* hardware, `E2E_WORKERS=1` remains a one-variable escape hatch,
  and docs state the evidence-dated nature.
- **A latent flake surfaces under the parallel default** (e.g. the #34/#58
  click-to-focus family): Decision 8 — do not ship; revert to opt-in; file or
  link the flake issue. `retries: 0` guarantees it stays visible.
- **Accidental fallback parallelism** (the SwiftShader 4–5/22 failure mode):
  structurally prevented by injecting only in the `hardware` branch (FR3) and
  covered by unit tests (FR7).
- **Report-format consumers**: the `workers:` line is additive only; existing
  line phrasing is untouched (Decision 7).

## Acceptance Scenarios

### Scenario 1 — Plain lane run on verified hardware

`npm run test:e2e:gpu` on the qualified host: both engines verify hardware,
the suite runs with `E2E_WORKERS=50%` (10 workers on the 20-core host), all
tests green, and the report shows `mode: hardware`, both hardware renderer
lines, and `workers: 50% (lane default)` (exact phrasing per implementation).

### Scenario 2 — Operator forces the lane serial

`E2E_WORKERS=1 npm run test:e2e:gpu`: hardware run executes serially; report
shows the operator-provided value.

### Scenario 3 — Malformed override still fails loud

`E2E_WORKERS=banana npm run test:e2e:gpu`: the suite invocation fails at
config load with `WorkerConfigError`; the lane surfaces the non-zero exit.

### Scenario 4 — Software fallback stays serial

`E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu` (and the organic-exhaustion
path): Chromium SwiftShader suite runs with the config's serial default; no
injected `E2E_WORKERS` in the suite env.

### Scenario 5 — Gate untouched

`npm run validate` green; `git diff` contains no changes to
`.github/workflows/validation.yml`, `scripts/e2e-workers.mjs`,
`tests/e2e-workers.test.mjs`, or the `workers:` line of
`playwright.config.ts`; existing worker-resolution tests pass unmodified.

### Scenario 6 — Re-qualification recorded

The review contains the serial baseline plus ≥3 consecutive green plain
`npm run test:e2e:gpu` parallel runs with per-test results, wall clocks, and
reports (FR8).

## Success Criteria

- The lane's default path is the qualified fast path: plain
  `npm run test:e2e:gpu` ≈ 4× faster than the serial baseline on the
  qualified host, green 3/3.
- Zero behavioral movement outside the lane's hardware suite env and output
  lines; CI and gate provably untouched.
- Docs and the #41 follow-up record accurately describe the split model:
  lane parallel-by-default, gate serial, global default unchanged.

## References

- Issue #56 (this spec); issue #41 (worker machinery, serial-default
  rationale, GPU-parallel qualification); issue #55 (blocker — fixed, closed
  2026-07-24, green 3/3 parallel re-qualification); issues #44/#52 (the lane;
  "lane is never the gate" Baked Decision); issue #42 (GPU-in-CI rejected).
- `scripts/e2e-gpu-lane.mjs` (`suiteEnvFor`, `computeRunPlan`, report format),
  `scripts/e2e-workers.mjs` (`resolveWorkers`, `DEFAULT_LOCAL_WORKERS`),
  `playwright.config.ts`, `tests/gpu-lane.test.mjs`,
  `tests/e2e-workers.test.mjs`.
- `codev/reviews/41-parallelize-local-e2e-runs.md` (qualification evidence,
  "Revisiting the serial default" follow-up),
  `codev/reviews/55-firefox-background-drag-flake.md` (FR6 re-qualification,
  green 3/3), README "Opt-in native-GPU e2e lane" / "Local test parallelism".
