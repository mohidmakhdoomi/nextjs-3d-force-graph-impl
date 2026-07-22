# Specification 41: Parallelize Local E2E Runs Scaled to Hardware (CI Byte-for-Byte Unchanged)

## Summary

Give the **local** Playwright e2e suite hardware-scaled parallelism. Today
`playwright.config.ts` pins `workers: 1` for every environment, so a local run
(`npm run test:smoke` / `npm run validate`) executes every test one at a time —
across both engines (Chromium + Firefox) — even on a 20-core machine, while CI
gets its speed from a 4-shard matrix of isolated VMs (each shard still
`workers: 1`). This issue makes local runs use multiple workers **scaled to the
machine's cores** (Playwright-native `'50%'`-style scaling with an explicit
`E2E_WORKERS` override), leveraging the `fullyParallel: true` that is already
set.

The **GitHub Actions workflow stays byte-for-byte the same**: same 4-shard
matrix, same `workers: 1` inside each shard, same `E2E_ENGINES=chromium`, same
blob-report merge. `.github/workflows/validation.yml` must not appear in the PR
diff at all. The config must pin `workers: 1` **whenever `CI` is set**, so the
sharded matrix's per-job serial contract is preserved automatically regardless
of any local default (arch-critical: Validation Baseline).

The one contract this issue **deliberately revisits** is the local
`workers: 1` qualification. The current config comment
(`playwright.config.ts:96-113`) forbids raising workers on purpose: Chromium
renders WebGL through SwiftShader (CPU-bound software rasterization) and the
compound interaction tests in `tests/e2e/matrix.spec.ts` carry timing-sensitive
camera-settle / drag / click-to-focus assertions qualified against a
contention-free **serial** environment. Implementing this issue means
re-qualifying the local arm under parallel execution and recording the evidence
— not merely deleting the comment. The **native-GPU local e2e lane** shipped by
specs #44 (Chromium) and #52 (Firefox) — `npm run test:e2e:gpu`,
`scripts/e2e-gpu-lane.mjs` — is the primary qualification vehicle: on
hardware-accelerated WebGL the SwiftShader CPU-contention rationale for
`workers: 1` largely evaporates, exactly as those issues' reviews sequenced
(#44 review Follow-up: "#41 should qualify `workers > 1` **on this lane** using
the FR8 methodology").

### Why this is worth building

1. **Faster local iteration and a faster local gate.** On multi-core hardware a
   serial two-engine run leaves most cores idle; parallel workers cut local
   wall-clock materially.
2. **Local finally mirrors CI's parallelism model** — CI already fans the suite
   out (across VMs); local has had no equivalent.
3. **The prerequisite already exists.** `fullyParallel: true` is set, the
   native-GPU lane (#44/#52) provides a contention-free environment to qualify
   parallelism honestly, and Playwright's `workers` accepts a hardware-relative
   percentage natively.

## Problem Analysis

### Current state

- `playwright.config.ts` hard-codes `workers: 1` (line 105) for **every**
  environment. `fullyParallel: true` (line 104) is set only so CI's `--shard`
  splits the suite at the test level; within any single process execution is
  strictly serial.
- Local runs (`npm run test:smoke`, `npm run validate`) therefore execute the
  full two-engine suite — 11 Chromium tests + 11 Firefox tests (22 total) —
  one test at a time, regardless of available cores.
- CI (`.github/workflows/validation.yml`) gets its speed from a 4-shard matrix
  (`shard: [1, 2, 3, 4]`), 4 isolated VMs, each shard still `workers: 1` with
  `E2E_ENGINES=chromium`; blob reports are merged by `merge-reports`. This is
  the qualified CI timing environment and must not change.
- The `workers: 1` comment block (lines 96-113) documents the rationale: raising
  in-job parallelism reintroduces SwiftShader CPU contention that the
  timing-sensitive `matrix.spec.ts` assertions were qualified against.
- Local `retries: 0` (line 113) is intentional so flakes surface immediately;
  CI uses `retries: 2`. Two flake classes are still open — the click-to-focus
  test (#34, flaked even under serial CI) and the Firefox pointer-nav race
  (#33) — and parallel CPU contention could amplify both.
- `tests/automation.test.mjs` asserts the current config source directly:
  `/workers: 1/` (line 90) and `/retries: process\.env\.CI \? 2 : 0/` (line 93).
  These source-text assertions are consumers that must migrate with the config
  change.
- The native-GPU lane (specs #44/#52, `scripts/e2e-gpu-lane.mjs`) runs the full
  suite on verified hardware WebGL and already delegates the suite run to
  `playwright.config.ts` (it sets `E2E_ENGINES` / `PW_CHROMIUM_ARGS`, not
  workers). Its reviews recorded serial-hardware baselines (Chromium ≈ 94-97 s
  suite; two-engine ≈ 196 s suite) and explicitly deferred `workers > 1`
  qualification to this issue.

### Desired state

- A local e2e run uses **multiple workers scaled to the machine's cores** by
  default, via Playwright-native percentage scaling (e.g. `'50%'`), with an
  explicit `E2E_WORKERS` override (integer or percentage) so users can tune it.
- **CI is provably unchanged**: `.github/workflows/validation.yml` does not
  appear in the PR diff; `workers` resolves to `1` whenever `CI` is set,
  ignoring any `E2E_WORKERS`; the 4-shard matrix, engine pinning, and
  blob-merge are untouched.
- The parallel local path is **qualified** — the full two-engine local suite
  passes repeatedly (≥3 consecutive parallel runs) — with the primary
  qualification on the native-GPU lane (contention-free) and, where the target
  is a parallel `npm run validate`, on the SwiftShader path as well. If
  SwiftShader parallel contention proves the timing-qualified tests unstable,
  parallelism is scoped to the opt-in path and the serial gate is retained,
  with the trade-off documented (never masked with retries).
- The `workers: 1` comment block is replaced with the actual new contract:
  local hardware-scaled parallel, CI hard-pinned serial, the retries policy,
  and the qualification rationale.
- `npm run validate` wall-clock improves measurably on multi-core hardware
  (when the parallel local default is qualified green).

### Stakeholders

- **Primary**: the project developer(s) running local e2e iteration and the
  local `npm run validate` gate.
- **Secondary**: the native-GPU lane (#44/#52) — this issue consumes its
  contention-free environment as the qualification substrate; flake triage for
  #34 (click-to-focus) and #33 (Firefox pointer race), which parallel execution
  stresses.
- **Technical**: builder implementing this spec; CI is a stakeholder only in
  that it must be provably unaffected.

## Confirmed Decisions

1. **CI is byte-for-byte unchanged and hard-guarded.**
   `.github/workflows/validation.yml` must not appear in the PR diff. The config
   pins `workers: 1` whenever `CI` is set — an unconditional guard so the
   4-shard matrix's per-job serial contract holds automatically, independent of
   any local default. `CI` precedence is absolute: when `CI` is set,
   `E2E_WORKERS` is ignored and workers resolve to `1`.

2. **Playwright-native, hardware-relative scaling with an env override.** Local
   worker count uses Playwright's percentage form (adapts to any machine) — not
   a hard-coded core count — with an explicit `E2E_WORKERS` override accepting
   either a positive integer or a percentage string (e.g. `4` or `'50%'`). The
   recommended scaled default is `'50%'`; the exact default value is confirmed
   by qualification (Decision 4). An invalid `E2E_WORKERS` value is a loud
   hard failure (fail-closed, mirroring the config's existing
   `E2E_ENGINES`-matched-no-engines guard), never a silent fallback.

3. **The native-GPU lane is the primary qualification vehicle.** Parallelism is
   qualified first on `npm run test:e2e:gpu` (hardware WebGL), where the
   SwiftShader CPU-contention rationale for `workers: 1` does not exist — the
   sequencing #44 and #52 established. The lane runs the full suite under scaled
   parallel workers; its machine-greppable report and wall-clock reflect the
   parallel run and become this issue's qualification evidence, using the #44/#52
   FR8 methodology (`E2E_GPU_REQUIRE=1`, ≥3 consecutive green full-suite runs,
   per-test results and wall-clocks recorded).

4. **Local default: parallel, evidence-gated; documented serial fallback.** The
   target is that the local default is parallel (the scaled value from Decision
   2) so `npm run validate` wall-clock improves (Success Criterion 4). This is
   contingent on qualification: the full two-engine **local** suite must pass
   ≥3 consecutive parallel runs at the scaled worker count. If SwiftShader
   parallel contention destabilizes the timing-qualified `matrix.spec.ts` tests
   (the exact risk the current comment names; #34/#33 may amplify), the local
   default reverts to serial (`workers: 1`) and parallelism becomes opt-in via
   `E2E_WORKERS` plus the GPU lane's own scaled default — with the trade-off
   recorded as a qualification finding. The decision is driven by recorded
   evidence, never assumed, and any instability is dispositioned per the
   project's flake discipline (fixed or explicitly accepted+documented), **never
   masked with retries and never by weakening a canonical assertion**.

5. **Local `retries: 0` is preserved, parallel or not.** The parallel local path
   keeps `retries: 0`; it does **not** adopt CI's `retries: 2`. Parallel
   contention amplifying a flake is precisely what must surface, not be hidden —
   consistent with the config's existing rationale and spec #52 Decision 10.

6. **Shared web server, one invocation, no local sharding.** All workers reuse
   the single `webServer` on port 3000 (Playwright starts it once per
   invocation); no port parameterization is needed or added. Running the suite
   as multiple concurrent `--shard` processes locally is explicitly out of scope
   — workers on one machine subsume it.

7. **No new dependencies or toolchain movement.** Worker scaling is
   Playwright-native. `engines`, `dependencies`, `devDependencies`, and the
   lockfile are untouched — the lockfile shows no delta (arch-critical:
   reproducibility contract: Node 22.23.1, npm 10.9.8, lockfile v3, `npm ci`).

8. **App code is not touched.** This is test-harness / config / tooling work.
   `app/**` is not modified; committed test assertions are not retuned for
   parallel timing (Decision 4 governs any instability). Test/harness changes
   are limited to what the worker-scaling contract and its migration require.

## Scope

### In scope

- Making `playwright.config.ts` `workers` resolve to: `1` under `CI`; otherwise
  a hardware-scaled value governed by an `E2E_WORKERS` override (integer or
  percentage) with a scaled default. Invalid overrides fail loudly.
- Recommended (plan's choice): extracting the worker-resolution logic into a
  small importable pure helper so it is directly unit-testable (mirroring the
  way `scripts/e2e-gpu-lane.mjs` exports pure functions for
  `tests/gpu-lane.test.mjs`), keeping the config a thin consumer.
- Ensuring the native-GPU lane runs the full suite under scaled parallel workers
  (inheriting the parallel default and/or honoring `E2E_WORKERS`), and that its
  report/wall-clock reflect the parallel run — the primary qualification vehicle.
- Updating the config's `workers: 1` comment block (lines 96-113) to the new
  contract: local hardware-scaled parallel, CI hard-pinned serial, retries
  policy, qualification rationale.
- Migrating the source-text consumers in `tests/automation.test.mjs` (the
  `/workers: 1/` and retries assertions) to the new contract, and adding
  coverage that asserts the worker-resolution matrix (CI→1; `E2E_WORKERS`
  integer/percentage parsed; invalid→throws; CI precedence over `E2E_WORKERS`;
  default scaled).
- Repeat-run qualification evidence (≥3 consecutive full two-engine parallel
  runs) recorded in the review, primarily on the GPU lane, with a
  contemporaneous serial baseline wall-clock for comparison, and — if the
  parallel `validate` default is adopted — SwiftShader-parallel stability
  evidence too.
- Documentation of the new local-parallel contract and `E2E_WORKERS` (README /
  the surface where the e2e workflow and the GPU lane are already documented),
  including the CI-unchanged guarantee and the qualification outcome.
- Proof the CI workflow is untouched (Success Criterion 1 / Scenario "CI
  untouched").

### Out of scope (non-goals)

- Any change to `.github/workflows/validation.yml`, the 4-shard matrix, CI
  `E2E_ENGINES=chromium`, CI `workers: 1`, CI `retries: 2`, or the blob-report
  merge. CI stays byte-for-byte identical.
- Local sharding (multiple concurrent `--shard` processes on one machine).
- Adopting CI's `retries: 2` locally, or otherwise masking flakes with retries.
- Retuning / loosening committed `matrix.spec.ts` (or any test's) timing
  assertions to accommodate parallel contention (Decision 4/8).
- App (`app/**`) code changes, new dependencies, toolchain/lockfile movement.
- Fixing the open #34 / #33 flakes (they are dispositioned per the flake
  discipline if they recur under parallel execution; a code fix is not mandated
  here).
- Any GPU-in-CI work (the #42 lesson stands; CI stays SwiftShader-only).

## Constraints and Invariants

- **CI untouched** (arch-critical: Validation Baseline): `npm run validate` is
  the green gate and its CI decomposition is contract-equivalent;
  `.github/workflows/validation.yml` must not appear in the PR diff, and
  `workers: 1` must be effective whenever `CI` is set.
- **Reproducibility contract** (arch-critical): Node 22.23.1, npm 10.9.8,
  lockfile v3, `npm ci`; no dependency regeneration. This work adds no packages —
  the lockfile shows no delta.
- **Evidence honesty** (lessons-critical: Validation Evidence): record the exact
  worker count, per-run and per-test results, and wall-clocks verbatim; never
  broaden a single machine's parallel result into a universal claim; preserve
  nonzero/diagnostic evidence rather than normalizing it. A parallel run that
  flakes is reported as flaky — that visibility is intentional.
- **No flake masking** (lessons-critical; spec #52 Decision 10): the parallel
  path keeps `retries: 0` locally; instability is fixed or explicitly
  accepted+documented, never hidden behind retries or a weakened assertion.
- **Committed-tree proof discipline** (lessons-critical): if a local gate check
  fails only on an untracked harness file, prove the gate on a clean worktree
  (`git worktree add --detach HEAD` + real `npm ci`) rather than suppressing it
  in committed config.

## Solution Exploration

### Approach A: Separate parallel script, serial config untouched

**Description**: Keep `playwright.config.ts` at `workers: 1`; add a new npm
script that invokes `playwright test --workers=<n>` for a parallel local run.

**Pros**: The qualified serial gate is literally byte-for-byte untouched; zero
config risk.

**Cons**: A `--workers` CLI flag is not hardware-relative (no percentage on the
CLI without extra plumbing), so it can't "scale to the machine" without a
wrapper computing a count — reintroducing exactly the hard-coded-count the issue
warns against. It also does not make `npm run validate` faster (Success
Criterion 4), and it forks suite invocation into a second command that drifts
from `validate`/`test:smoke` and the GPU lane. Fails the "scaled to hardware"
and "validate improves" criteria.

**Complexity**: Low. **Risk**: Low (but under-delivers).

### Approach B: Config-level hardware-scaled `workers` with a CI guard and env override (selected)

**Description**: `playwright.config.ts` resolves `workers` to `1` under `CI`,
otherwise to a hardware-relative scaled value governed by an `E2E_WORKERS`
override (integer or percentage) with a scaled default. Worker-resolution logic
lives in a small importable pure helper so it is unit-testable and the config
stays a thin consumer. Parallelism is qualified primarily on the native-GPU lane
(contention-free), with the local default's parallel/serial disposition
evidence-gated (Decision 4). CI is provably untouched by the guard + a zero-diff
`validation.yml`.

**Pros**: Uses Playwright-native percentage scaling (adapts to any machine);
`E2E_WORKERS` gives explicit tuning; one suite invocation for all paths (no
drift); `npm run validate` and the GPU lane both benefit from a single change;
the CI guard is a one-line, testable invariant; qualification lands where it is
safe (hardware lane) per the #44/#52 sequencing.

**Cons**: Touches the qualified config, so the byte-identical-default posture of
#44/#52 does **not** fully apply to the local arm — the local serial
qualification is deliberately revisited and must be re-qualified with evidence;
the `tests/automation.test.mjs` source-text assertions must migrate.

**Complexity**: Medium. **Risk**: Medium (mitigated by the CI guard, the
evidence-gated default, and the GPU-lane qualification).

**Selected** — it is the only approach that delivers hardware-relative scaling,
a faster `npm run validate`, a single non-drifting suite invocation, and a
provably untouched CI, while placing qualification where the architecture says
it is safe.

### Approach C: Re-qualify a parallel SwiftShader `validate` as the sole path

**Description**: Make the local default parallel and qualify only the SwiftShader
path, without leaning on the GPU lane.

**Pros**: Directly targets Success Criterion 4 (faster `validate`).

**Cons**: SwiftShader is CPU-bound; N parallel workers all software-rasterizing
contend heavily, and the timing-sensitive `matrix.spec.ts` assertions were
qualified against a contention-free serial environment — with #34/#33 open, this
is the highest-flake-risk path and ignores the contention-free lane the project
built specifically to qualify this safely.

**Complexity**: Medium. **Risk**: High. Folded into Approach B as the
evidence-gated upgrade (Decision 4), not chosen as the sole path.

## Functional Requirements

### FR1 — Hardware-scaled local workers

A local e2e run (no `CI`, no `E2E_WORKERS`) runs the suite under multiple
workers scaled to the machine via Playwright's hardware-relative percentage
form, leveraging the existing `fullyParallel: true`. The scaling adapts to the
host's core count with no hard-coded number.

### FR2 — `E2E_WORKERS` override

`E2E_WORKERS` (working name; final name is a plan decision) overrides the local
worker count and accepts a positive integer or a percentage string (e.g. `4` or
`50%`). An invalid value (non-positive, non-numeric, malformed percentage) is a
loud hard failure at config resolution — consistent with the config's existing
fail-closed `E2E_ENGINES` guard — never a silent fallback to a default. The
override is lane/local-only: it is read by the config, not required by any
committed test.

### FR3 — Absolute CI serial guard

Whenever `CI` is set, `workers` resolves to `1`, ignoring `E2E_WORKERS`. This
preserves the sharded matrix's per-job serial contract automatically. `CI`
precedence over `E2E_WORKERS` is explicit and tested.

### FR4 — CI workflow provably untouched

`.github/workflows/validation.yml` does not appear in the PR diff (the 4-shard
matrix, `E2E_ENGINES=chromium`, per-shard `workers: 1`, `retries: 2`, and the
blob-report merge are all unchanged). PR CI (quality + 4 SwiftShader e2e shards
+ gate) is green.

### FR5 — Preserved local `retries: 0`

The local run keeps `retries: 0` under parallel execution; it does not adopt
CI's `retries: 2`. Flakes surface immediately in both serial and parallel local
modes.

### FR6 — Shared web server, unchanged

All workers reuse the single `webServer` on port 3000; the `webServer` block is
functionally unchanged (one server per invocation, all workers attached). No
port parameterization.

### FR7 — Native-GPU lane runs parallel (primary qualification vehicle)

The native-GPU lane (`npm run test:e2e:gpu`) runs the full suite under the
scaled parallel workers (inheriting the parallel default and/or honoring
`E2E_WORKERS`), and its machine-greppable report / wall-clock reflect the
parallel run. This is the qualification substrate for FR9 per the #44/#52 FR8
methodology. The lane keeps its honest-reporting, verification, and fallback
semantics from #44/#52 intact.

### FR8 — Worker-resolution coverage

Automated coverage asserts the worker-resolution contract: `CI` set ⇒ `1`;
`E2E_WORKERS` integer ⇒ that integer; `E2E_WORKERS` percentage ⇒ that
percentage; invalid `E2E_WORKERS` ⇒ throws; `CI` precedence over `E2E_WORKERS`;
default (no `CI`, no `E2E_WORKERS`) ⇒ the scaled value. The existing
`tests/automation.test.mjs` source-text assertions (`/workers: 1/`, retries) are
migrated to the new contract so the suite reflects reality.

### FR9 — Repeat-run parallel qualification evidence

Before the parallel path is documented as trusted: **≥3 consecutive full
two-engine parallel runs** recorded in the review — per-run pass/fail per test,
wall-clock, worker count, and `retries: 0` — primarily on the native-GPU lane
(`E2E_GPU_REQUIRE=1` so a silent fallback cannot pollute the evidence), with a
contemporaneous serial baseline wall-clock for comparison. If the parallel
`npm run validate` default is adopted (Decision 4), SwiftShader-parallel
stability evidence is recorded the same way. Any instability beyond an already
-documented flake blocks the "trusted" designation until root-caused and
dispositioned (fixed or explicitly accepted+documented) — never masked.

### FR10 — Updated config rationale comment

The config's `workers: 1` comment block is replaced with the actual contract:
local hardware-scaled parallel via `E2E_WORKERS`/scaled default, CI hard-pinned
serial (the guard), local `retries: 0` preserved, and the qualification
rationale (why parallelism is safe — the GPU lane / recorded evidence). The
stale "Do NOT raise `workers`" guidance is removed, not merely edited around.

### FR11 — Documentation

The repo docs (README's e2e / GPU-lane sections, which already describe the
serial local run and the lane) are updated to state: local runs are parallel and
hardware-scaled by default; how to tune with `E2E_WORKERS` (integer or
percentage); the CI-unchanged guarantee (`workers: 1` whenever `CI` is set);
local `retries: 0` is preserved; and the qualification outcome (parallel
`validate` default, or opt-in with the documented serial trade-off). If the
serial fallback is taken, the trade-off is documented explicitly (Success
Criterion 2's alternative branch).

## Non-Functional Requirements

### Reproducibility
No dependency, lockfile, or toolchain movement; the change runs on the pinned
Node/npm. Worker scaling is Playwright-native.

### Behavior preservation (CI)
CI behavior — the 4-shard matrix, engine pinning, per-shard serial execution,
retries, blob merge, and the gate — is provably identical to today, guaranteed
by the `CI`→`1` guard and a zero-diff `validation.yml`.

### Performance
On multi-core hardware the parallel local run measurably reduces wall-clock
versus the serial baseline; when the parallel `validate` default is qualified,
`npm run validate` wall-clock improves measurably.

### Evidence honesty
Worker counts, per-run/per-test results, and wall-clocks are recorded verbatim;
a single host's parallel result is never generalized; flaky parallel runs are
reported as flaky.

### Maintainability
Worker-resolution logic is small, pure, and unit-tested (not scattered
conditionals); one suite invocation serves local, lane, and CI (no drift); the
touched config comment reflects the new reality.

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| SwiftShader parallel contention destabilizes timing-qualified `matrix.spec.ts` tests | Medium-High | Medium | FR9 repeat-run qualification at `retries: 0`; Decision 4 evidence-gated default with a documented serial fallback; primary qualification on the contention-free GPU lane |
| Open flakes #34 (click-to-focus) / #33 (Firefox pointer race) amplified under parallel contention | Medium | Medium | `retries: 0` keeps them visible (FR5); disposition per flake discipline, never masked (Decision 5) |
| A stray `E2E_WORKERS` in a CI-like env parallelizes a shard | Low | High | FR3 absolute `CI`→`1` guard (CI precedence over `E2E_WORKERS`), explicitly tested (FR8) |
| Config change drifts the qualified CI contract | Low | High | FR4 zero-diff `validation.yml` + CI green; the guard is a one-line, tested invariant |
| Invalid `E2E_WORKERS` silently falls back and misleads | Low | Medium | FR2 fail-closed loud error, tested (FR8) |
| Worker-resolution logic diverges from what Playwright actually runs | Low | Medium | Pure helper unit-tested (FR8) **and** qualification runs exercise the real resolved config end-to-end (FR9) |
| `automation.test.mjs` source-text assertions left stale, hiding the change | Medium | Low | FR8 migrates them as part of scope |

## Acceptance Scenarios

### Scenario 1 — Scaled parallel local run
On multi-core hardware, a local run (`npm run test:smoke` or the qualified
parallel path) executes tests concurrently across workers scaled to the cores,
and the full two-engine suite passes.

### Scenario 2 — `E2E_WORKERS` override
`E2E_WORKERS=4` runs with 4 workers; `E2E_WORKERS=50%` runs with a
hardware-relative count; an invalid value (e.g. `0`, `abc`, `12x`) fails loudly
at config resolution rather than silently running serial.

### Scenario 3 — CI untouched and serial
`git diff` on the PR shows no change to `.github/workflows/validation.yml` or the
CI e2e/gate contract; with `CI` set, `workers` resolves to `1` even if
`E2E_WORKERS` is present; PR CI (quality + 4 SwiftShader e2e shards + gate) is
green.

### Scenario 4 — Parallel qualification recorded
The review contains ≥3 consecutive full two-engine parallel runs (per-test
results, wall-clock, worker count, `retries: 0`) — primarily on the native-GPU
lane under `E2E_GPU_REQUIRE=1` — plus a contemporaneous serial baseline
wall-clock, showing a measurable multi-core speedup. If the parallel `validate`
default is adopted, SwiftShader-parallel stability evidence is included.

### Scenario 5 — Faster gate or documented trade-off
Either `npm run validate` wall-clock improves measurably on multi-core hardware
(parallel default qualified green), **or** the parallel path is clearly
separated from the qualified serial gate with the trade-off documented (Success
Criterion 2's alternative branch) — with the choice justified by the recorded
evidence.

### Scenario 6 — Documentation
A developer who has not read this spec can find, in the repo docs, that local
runs are parallel and hardware-scaled, how to tune with `E2E_WORKERS`, that CI
is unchanged, that local `retries: 0` is preserved, and what the qualification
concluded.

## Success Criteria

- [ ] Local e2e runs use multiple workers scaled to the machine's cores; CI runs
  are unchanged (`validation.yml` untouched and `workers: 1` effective under
  `CI=1`).
- [ ] The full two-engine local suite passes repeatedly (≥3 consecutive runs)
  under parallel execution, **or** the parallel path is clearly separated from
  the qualified serial gate with the trade-off documented.
- [ ] `playwright.config.ts` comments updated to reflect the new local-parallel
  rationale (replacing the stale "Do NOT raise workers" guidance with the actual
  contract).
- [ ] `npm run validate` wall-clock improves measurably on multi-core hardware
  (when the parallel local default is qualified), or the documented trade-off
  path is taken.
- [ ] `E2E_WORKERS` override works (integer + percentage); invalid values fail
  loudly; CI precedence is tested.
- [ ] No dependency/lockfile/toolchain movement; `app/**` untouched; local
  `retries: 0` preserved; flakes never masked.

## Dependencies

- **Internal**: `playwright.config.ts` (`fullyParallel: true`, `workers`,
  `E2E_ENGINES` handling); the native-GPU lane
  (`scripts/e2e-gpu-lane.mjs`, specs/reviews #44 and #52) as the primary
  qualification substrate and serial-hardware baseline; `tests/automation.test.mjs`
  (source-text config consumers) and `tests/gpu-lane.test.mjs` (pure-helper test
  pattern to mirror).
- **External services**: none.
- **Sequencing**: this issue consumes the #44/#52 lane qualification per their
  reviews' Follow-up Items ("#41 should qualify `workers > 1` on this lane using
  the FR8 methodology"); both have landed, so the substrate exists.

## References

- Issue #41 (this spec) and its cross-link to #44/#52; issues #34 (click-to-focus
  flake) and #33 (Firefox pointer-nav race) — open flake classes parallel
  execution stresses.
- Spec / plan / review #44 (`codev/{specs,plans,reviews}/44-add-an-opt-in-native-gpu-local.md`),
  #52 (`codev/{specs,plans,reviews}/52-firefox-hardware-webgl-gpu-lane.md`) — the
  native-GPU lane, its FR8 qualification methodology, and the explicit #41
  sequencing / serial-hardware baselines.
- `playwright.config.ts` (`workers: 1` comment block lines 96-113,
  `fullyParallel: true`, `retries` line 113), `.github/workflows/validation.yml`
  (4-shard matrix), `tests/automation.test.mjs` (config source-text assertions),
  `tests/e2e/matrix.spec.ts` (timing-sensitive assertions), README (e2e / GPU-lane
  docs).
- `codev/resources/arch-critical.md` — Validation Baseline (canonical gate; CI
  contract; do not raise workers / trim waits without re-qualification).
- `codev/resources/lessons-critical.md` — Validation Evidence (record evidence
  honestly, never mask flakes); Toolchain and Worktree Hygiene (clean-checkout
  proof).
