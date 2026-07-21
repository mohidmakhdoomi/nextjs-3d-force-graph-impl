# Plan: Add an Opt-In Native-GPU Local E2E Lane (Hardware WebGL with Software Fallback)

## Metadata
- **ID**: plan-2026-07-21-add-an-opt-in-native-gpu-local
- **Status**: draft
- **Specification**: [codev/specs/44-add-an-opt-in-native-gpu-local.md](../specs/44-add-an-opt-in-native-gpu-local.md)
- **Created**: 2026-07-21

## Executive Summary

Implements the spec's selected **Approach C**: a Node wrapper script
(`scripts/e2e-gpu-lane.mjs`, exposed as `npm run test:e2e:gpu`) layered over the
already-merged, already-proven-default-inert `PW_CHROMIUM_ARGS` hook in
`playwright.config.ts`. The wrapper probes the host, selects a hardware recipe
from a data-driven candidate list, verifies the effective
`UNMASKED_RENDERER_WEBGL` through the repo's own Playwright Chromium *before*
trusting anything, runs the full Chromium e2e suite (build → production server →
suite, mirroring `test:smoke` semantics), and ends with a machine-greppable
mode/renderer/wall-clock report. Exhausted or absent hardware ⇒ loud software
fallback (never a hard failure by default); `E2E_GPU_REQUIRE=1` hard-fails for
qualification integrity; `E2E_GPU_FORCE_FALLBACK=1` deterministically exercises
the fallback path on the GPU-capable host.

The canonical SwiftShader serial gate is untouched by construction: no committed
test, no CI file, and no default config behavior changes. The only touched
shared file is `playwright.config.ts`, and only its **comment block** (the spec's
NFR requires the "#44 will consume this" note to become "the lane consumes
this"); default-inertness is proven by a config-load check with lane env unset.

Four phases isolate the pure-logic core (unit-testable everywhere, GPU-free)
from suite execution, from the bounded FR5 headless investigation, and from the
FR8/FR9 qualification-and-documentation work — so each commit is small,
independently testable, and independently revertible.

Evidence base this plan builds on (no rediscovery needed):
- WSL2 d3d12 headed recipe proven end-to-end on this host (bugfix-22 thread):
  `GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`, `DISPLAY=:0`,
  args `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist
  --disable-gpu-sandbox`, headed ⇒ `ANGLE (… D3D12 (NVIDIA GeForce RTX 3080),
  OpenGL 4.6)`. `--use-angle=gl-egl` also reached hardware (OpenGL ES 3.1);
  `--use-angle=vulkan` fell back to llvmpipe **on WSL2**.
- Native-Linux ANGLE-Vulkan recipe proven on a Tesla T4 (experiment 42 run #5).
- The pre-flight renderer-probe pattern already designed in
  `experiments/42_kaggle_gpu_ci/kaggle_e2e_runner.py` (launch repo Chromium,
  read `UNMASKED_RENDERER_WEBGL`, deny-list classify).

## Success Metrics

Copied from the spec's acceptance scenarios and made implementation-checkable:

- [ ] `npm run test:e2e:gpu` on this WSL2/RTX 3080 host: probe selects the d3d12
      recipe, renderer logged and deny-list-asserted (≠ SwiftShader/llvmpipe),
      full Chromium suite runs, final greppable report says hardware + renderer
      + wall-clock (Scenario 1, FR1–FR4, FR10).
- [ ] `E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu`: loud fallback notice,
      suite runs under default SwiftShader args, report unmistakably says
      software-fallback, exit code = suite result (Scenario 2, FR2/FR3).
- [ ] `E2E_GPU_REQUIRE=1` with no verifiable hardware ⇒ non-zero exit with
      per-candidate log (FR2/FR3 strict switch).
- [ ] Skipped/failed candidates each produce a one-line cause + remedy
      diagnostic covering the FR11 enumerated cases.
- [ ] FR5 headless matrix (≤4 probes) executed and conclusively recorded;
      lane default set accordingly.
- [ ] FR8: 3+ consecutive full-suite hardware runs under `E2E_GPU_REQUIRE=1`
      (per-test results, renderer strings, wall-clocks, retries policy) + one
      forced-fallback full run (doubles as the contemporaneous SwiftShader
      serial baseline wall-clock) recorded in review artifacts.
- [ ] FR6: `.github/workflows/validation.yml` and the `validate`/`test:smoke`
      script chain absent from the PR diff; `playwright.config.ts` diff is
      comment-only; config-load check with lane env unset shows chromium launch
      args exactly `["--use-angle=swiftshader","--enable-unsafe-swiftshader"]`
      and unchanged workers/retries/timeout/reporter/webServer; PR CI fully
      green under SwiftShader.
- [ ] FR7: new unit tests (`tests/gpu-lane.test.mjs`) pass with no GPU, no
      browser, no lane env — green on CI runners via the existing `npm test`
      glob.
- [ ] FR9: README documents the lane (command, hardware/fallback semantics,
      WSL2 Mesa d3d12 recipe incl. optional `MESA_D3D12_DEFAULT_ADAPTER_NAME`/
      `LIBGL_ALWAYS_SOFTWARE` disambiguators, FR5 outcome, non-gate status, #41
      sequencing note).
- [ ] No dependency/lockfile/toolchain movement; `package.json` delta is the
      lane script entry only.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "lane_wrapper_core", "title": "Lane wrapper core: probe engine, candidate data, deterministic policy, unit tests"},
    {"id": "full_lane_and_inertness_proof", "title": "Full-suite lane command, npm script, comment sync, default-inert proof"},
    {"id": "headless_investigation", "title": "Bounded headless-vs-headed investigation (FR5) and lane default"},
    {"id": "qualification_evidence_and_docs", "title": "Repeat-run qualification evidence (FR8) and documentation (FR9)"}
  ]
}
```

## Phase Breakdown

### Phase 1: `lane_wrapper_core` — probe engine, candidate data, deterministic policy, unit tests
**Dependencies**: None

#### Objectives
- Build the lane's brain as pure, unit-testable logic plus a thin probe
  executable: host probing, data-driven candidate selection, the FR3
  deterministic candidate lifecycle (prereq-skip → verify-fail → exhaustion →
  fallback), env controls, FR11 diagnostics, and renderer classification —
  all runnable standalone via a probe-only mode before the suite wiring exists.

#### Deliverables
- [ ] `scripts/e2e-gpu-lane.mjs` — ESM, Node built-ins + `@playwright/test`
      only; no side effects on import (CLI entry guarded), pure functions
      exported for tests.
- [ ] Probe-only mode: `node scripts/e2e-gpu-lane.mjs --probe-only` runs
      probe → candidate selection → renderer verification → greppable
      mode/renderer report, without building or running the suite.
- [ ] `tests/gpu-lane.test.mjs` — unit tests of the pure logic (picked up
      automatically by the existing `npm test` glob `tests/*.test.mjs`).

#### Implementation Details

**Candidate list (data, ordered by evidence strength)** — each entry:
`{id, prereqs, env, flags, mode, diagnostics}`:

1. `wsl2-d3d12-angle-gl` (proven, bugfix-22): prereqs `/dev/dxg` exists,
   `/usr/lib/wsl/lib` exists, and for headed mode a usable display (`DISPLAY`
   set or `/mnt/wslg/.X11-unix` present). Env: `GALLIUM_DRIVER=d3d12`,
   `LD_LIBRARY_PATH=/usr/lib/wsl/lib` (prepended to any existing value);
   pass through operator-set `MESA_D3D12_DEFAULT_ADAPTER_NAME` /
   `LIBGL_ALWAYS_SOFTWARE` untouched. Flags: `--use-gl=angle --use-angle=gl
   --ignore-gpu-blocklist --disable-gpu-sandbox`. Mode: headed (Phase 3 may
   flip to headless per FR5).
2. `wsl2-d3d12-angle-gl-egl` (proven alternate, OpenGL ES 3.1): same prereqs/
   env, `--use-angle=gl-egl` variant.
3. `native-linux-angle-vulkan` (proven on T4, exp42 run #5): prereq: no
   `/dev/dxg` (on WSL2 Vulkan is a known llvmpipe dead end — skip, don't
   waste a probe). Flags: `--use-gl=angle --use-angle=vulkan
   --enable-features=Vulkan --ignore-gpu-blocklist`.
4. `native-linux-angle-gl`: same prereq, `--use-angle=gl` variant.

Adding a future recipe = appending one data entry (spec FR2's extensibility
requirement).

**Renderer probe** (the exp42 preflight pattern, in JS): import `chromium`
from `@playwright/test`; `launch({headless, args: candidate.flags, env})`;
open a blank page; evaluate a canvas `webgl` context +
`WEBGL_debug_renderer_info` → `UNMASKED_RENDERER_WEBGL` (fall back to
`gl.RENDERER` if the extension is missing); bounded per-candidate timeout
(30 s launch-to-verdict); crash/timeout/no-context ⇒ failed candidate.
Classification deny-list (case-insensitive): `swiftshader`, `llvmpipe`,
`software`, `microsoft basic` ⇒ software; anything else with a non-empty
string ⇒ hardware. Full string always recorded verbatim.

**Deterministic lifecycle** (FR3, exactly as specced): prereq check skips with
a one-line FR11 diagnostic (cause + remedy: `DISPLAY`/WSLg absent,
`/usr/lib/wsl/lib` missing, etc.); verification failure logs the string and
moves on (d3d12→llvmpipe gets the "Mesa d3d12 driver missing/not selected"
hint); exhaustion ⇒ fallback marker returned to the caller. Env controls read
once at entry: `E2E_GPU_FORCE_FALLBACK=1` short-circuits to fallback before
any probe; `E2E_GPU_REQUIRE=1` converts exhaustion into exit 1 with the
per-candidate summary. Lane-internal errors (malformed invocation, probe
harness bugs) throw and exit non-zero in all modes.

**Unit test targets** (all pure, no browser, no GPU, no lane env — FR7):
renderer classification (hardware/software/empty cases incl. the proven ANGLE
D3D12, ANGLE NVIDIA, SwiftShader, llvmpipe strings); candidate prereq
filtering against an injected fake fs/env view (WSL2 host shape, native-Linux
shape, GPU-less shape, headed-prereq-missing shape); lifecycle policy
(skip vs fail vs exhaustion; force-fallback short-circuit; require-mode exit
signaling); FR11 diagnostic line selection; greppable report formatting
(exact `mode:`/`renderer:` line contract). Probe/launch functions are
injected so tests never touch Playwright.

#### Acceptance Criteria
- [ ] `npm test` green (new file included by the glob) with no GPU/lane env.
- [ ] `node scripts/e2e-gpu-lane.mjs --probe-only` on this host reports
      hardware + an ANGLE D3D12 renderer string.
- [ ] `E2E_GPU_FORCE_FALLBACK=1 … --probe-only` reports software-fallback
      without launching any probe.
- [ ] `E2E_GPU_REQUIRE=1` + an impossible candidate set exits non-zero with
      the per-candidate log.
- [ ] `npm run lint` and `npm run typecheck` clean.

#### Test Plan
- **Unit**: as above (this phase's main deliverable).
- **Manual**: probe-only runs on this host — normal, force-fallback, and
  require-mode variants; record renderer strings.

#### Rollback Strategy
Pure addition (2 new files); revert the commit.

#### Risks
- **Risk**: probe launch hangs under a broken driver combo.
  - **Mitigation**: hard per-candidate timeout; timeout = failed candidate
    with FR11 diagnostic (never wedges the lane).

---

### Phase 2: `full_lane_and_inertness_proof` — full-suite lane command, npm script, comment sync, default-inert proof
**Dependencies**: Phase 1

#### Objectives
- Wire the verified recipe into a full end-to-end lane run and prove the
  canonical gate untouched (FR1, FR4, FR6, FR10).

#### Deliverables
- [ ] `scripts/e2e-gpu-lane.mjs` extended: build + suite execution + final
      report.
- [ ] `package.json`: add `"test:e2e:gpu": "node scripts/e2e-gpu-lane.mjs"`
      (the only manifest delta; no dependency/engines/lockfile movement).
- [ ] `playwright.config.ts`: comment-only update — the hook's "retained to
      serve issue #44" paragraph now describes the shipped lane (spec NFR
      Maintainability). No code tokens change.
- [ ] FR6 default-inert evidence recorded (procedure below).

#### Implementation Details

**Suite execution** (delegation over duplication): after a candidate passes
verification, the wrapper runs `npm run build`, then spawns
`npx playwright test` with env `{E2E_ENGINES: "chromium",
PW_CHROMIUM_ARGS: candidate.flags.join(" "), ...candidate.env}` plus
`--headed` when the recipe mode is headed (Playwright CLI flag — no config
change needed for headed mode). The production server comes from the
config's own `webServer` block, exactly as `test:smoke`. Fallback mode runs
the identical build+test flow with **no** lane env (`PW_CHROMIUM_ARGS`
unset ⇒ default SwiftShader args) after printing the loud warning. Suite
exit code is preserved as the lane exit code in both modes; wall-clock
captured per stage (build, suite) and total. `workers`/`retries` are not
touched anywhere (config defaults: `workers: 1`, local `retries: 0`).

Note: recipe env (`GALLIUM_DRIVER`, `LD_LIBRARY_PATH`) is applied to the
spawned `playwright test` process (the exp42 runner approach), so the
browser inherits it. The webServer child inherits it too — accepted:
`/usr/lib/wsl/lib` contains only D3D12/DXCore GPU libraries, no libc-class
overrides; the bugfix-22 runs already exercised Chromium+server under this
env on this host. If Phase 2 testing surfaces any server-side interference,
fall back to scoping env injection to the browser (documented decision).

**FR10 report contract** (final lines, machine-greppable, stable keys):

```
=== E2E GPU LANE REPORT ===
mode: hardware | software-fallback
renderer: <verbatim UNMASKED_RENDERER_WEBGL>
engine: chromium
suite: pass | fail (exit <n>)
wall-clock: <seconds>s (build <s>s, suite <s>s)
```

**FR6 proof procedure** (evidence recorded in the review artifact):
1. `git diff main -- playwright.config.ts` — comment-only (no code tokens).
2. `.github/workflows/validation.yml`, `validate`/`test:smoke` entries: absent
   from `git diff main --stat` entirely.
3. Config-load check with lane env unset (scratchpad script, output recorded
   verbatim): load the config via `node --experimental-strip-types` (the file
   is type-annotation-free TS) and assert chromium `launchOptions.args`
   equals exactly `["--use-angle=swiftshader","--enable-unsafe-swiftshader"]`,
   `workers === 1`, `retries === 0` (non-CI), `timeout === 120000` (non-CI),
   reporter/webServer shapes unchanged; repeat with `PW_CHROMIUM_ARGS` set to
   confirm the hook path still substitutes (sanity). Same check run against
   `main`'s config for value-equality.
4. PR CI (quality + 4 SwiftShader shards + gate) green — final proof point,
   collected at Review.

#### Acceptance Criteria
- [ ] `npm run test:e2e:gpu` on this host: hardware mode, full suite executes,
      report emitted, exit code = suite result.
- [ ] `E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu`: full suite under
      SwiftShader with loud warnings + software-fallback report.
- [ ] FR6 items 1–3 recorded clean.
- [ ] `npm test`, `npm run lint`, `npm run typecheck` green; no lockfile diff.

#### Test Plan
- **Unit**: extend `tests/gpu-lane.test.mjs` for report formatting/exit-code
  mapping logic.
- **Integration (manual, this host)**: one hardware full-suite run; one
  forced-fallback full-suite run (both also feed Phase 4 evidence).
- **Gate**: FR6 procedure.

#### Rollback Strategy
Revert the phase commit; `package.json` script entry and comment block go
with it. Default behavior was never altered.

#### Risks
- **Risk**: headed WSLg suite proves flaky (focus/window management) across a
  full run.
  - **Mitigation**: recorded as lane findings (spec Decision 7); Phase 3 may
    make headless the default; canonical waits are never retuned.
- **Risk**: hardware timing breaks a qualified wait (e.g. camera-settle vs
  the 4 s enable window).
  - **Mitigation**: same — lane finding, disclosed; no canonical retuning;
    any lane-only accommodation would be env-gated, default-inert, disclosed.

---

### Phase 3: `headless_investigation` — bounded FR5 matrix and lane default
**Dependencies**: Phase 2

#### Objectives
- Answer headless-vs-headed conclusively within the spec's fixed matrix and
  set the lane's default mode accordingly.

#### Deliverables
- [ ] Matrix results (≤4 probe runs, verbatim renderer strings or failures)
      recorded in the review artifact.
- [ ] `scripts/e2e-gpu-lane.mjs` candidate data updated **only if** headless
      reaches hardware (default flips headless; headed stays available and
      documented); no change otherwise.

#### Implementation Details
Matrix on the selected d3d12 recipe (this host class), via `--probe-only`
with a mode override: {Playwright default headless (the bundled
headless-shell path), explicit new-headless via the full Chromium binary if
the pinned Playwright 1.61.1 distinguishes them — record which binary/mode
each probe actually used} × {`--use-angle=gl`, `--use-angle=gl-egl`} — the
two ANGLE backends already in the WSL2 candidate list. Stop condition: matrix
exhausted. Conclusive positive = ≥1 combination passes the deny-list
assertion (record which); conclusive negative = all combinations software/
failed, recorded verbatim. No flag hunting beyond the matrix. If positive,
one full-suite headless hardware run validates the flip before it becomes the
default.

#### Acceptance Criteria
- [ ] Every matrix cell has a recorded outcome (string or failure), none
      skipped silently.
- [ ] Lane default matches the evidence; headed path remains reachable and
      documented either way.
- [ ] Unit suite updated if candidate data changed; all green.

#### Test Plan
- **Manual**: the matrix probes; one full headless suite run iff flipping.
- **Unit**: candidate-data invariants still hold.

#### Rollback Strategy
Candidate-data-only change; revert restores headed default (which is the
proven configuration).

#### Risks
- **Risk**: new-headless mode is not cleanly selectable under the pinned
  Playwright.
  - **Mitigation**: record exactly what 1.61.1 offers; an unreachable mode is
    a recorded "not distinguishable at this pin" outcome, not an open end.

---

### Phase 4: `qualification_evidence_and_docs` — FR8 evidence and FR9 documentation
**Dependencies**: Phase 3

#### Objectives
- Produce the repeat-run stability evidence that makes the lane trustworthy,
  and the documentation that makes it discoverable (FR8, FR9, Scenarios 4–5).

#### Deliverables
- [ ] 3+ **consecutive** full-suite hardware lane runs under
      `E2E_GPU_REQUIRE=1` (per-test pass/fail, verbatim renderer string,
      wall-clock, retries policy per run) recorded in the review artifact
      draft (`codev/reviews/44-add-an-opt-in-native-gpu-local.md`).
- [ ] One forced-fallback full-suite run recorded — this is simultaneously
      the fallback-path qualification and the contemporaneous serial
      SwiftShader baseline wall-clock for comparison.
- [ ] README section: lane command + what it does; hardware vs fallback
      semantics and how to read the FR10 report; the WSL2 Mesa d3d12 recipe
      (env, flags, optional `MESA_D3D12_DEFAULT_ADAPTER_NAME` /
      `LIBGL_ALWAYS_SOFTWARE` disambiguators); FR5 outcome
      (headless/headed); env controls (`E2E_GPU_FORCE_FALLBACK`,
      `E2E_GPU_REQUIRE`); explicit **non-gate** status; #41 sequencing note
      (`workers` stay 1 until #41 qualifies parallelism on this lane).
- [ ] Instability findings (if any) recorded as lane findings — canonical
      waits untouched (Decision 7).

#### Implementation Details
Runs use the lane exactly as shipped (no special harness). Retries policy:
local default `retries: 0`; if evidence forces reconsideration it is
disclosed with the runs, never silently changed. Wall-clock comparison table:
3+ hardware runs vs the SwiftShader baseline (and vs bugfix-22's recorded
9.7 m chromium suite as historical context). If a test proves
timing-incompatible under hardware GL: record verbatim, leave canonical suite
untouched, disclose any env-gated lane-only accommodation in the review.

#### Acceptance Criteria
- [ ] FR8 evidence complete and honest (per-run detail, no aggregation-only
      claims, failures preserved verbatim).
- [ ] A developer who never read #22/#42/#44 can find, run, and interpret the
      lane from README alone (Scenario 5).
- [ ] `npm run validate` green locally on the final tree; clean-worktree
      proof (`git worktree add --detach HEAD` + `npm ci`) if any gate check
      is polluted by untracked builder-harness files (hot lesson).

#### Test Plan
- **Manual/evidence**: the qualification runs themselves.
- **Regression**: full `npm run validate` (SwiftShader, both engines) on the
  final tree before PR.

#### Rollback Strategy
Docs + evidence only; revert the commit. Lane behavior unchanged by this
phase (unless a disclosed finding forced an env-gated accommodation, which
reverts with it).

#### Risks
- **Risk**: a hardware run flakes (new timing class), breaking "3+
  consecutive".
  - **Mitigation**: record verbatim, diagnose as a lane finding, restart the
    consecutive count only after any (disclosed, lane-only) adjustment —
    never by trimming canonical waits or hiding runs.

## Dependency Map

```
Phase 1 (wrapper core + unit tests)
   ↓
Phase 2 (full lane + npm script + FR6 proof)
   ↓
Phase 3 (FR5 headless matrix → lane default)
   ↓
Phase 4 (FR8 evidence + FR9 docs)
```

## Resource Requirements

- **Environment**: the pinned toolchain (Node 22.23.1 / npm 10.9.8, `npm ci`);
  this WSL2 host with RTX 3080 + WSLg for hardware evidence; no new
  dependencies, services, or infrastructure.
- **Files touched (whole project)**: `scripts/e2e-gpu-lane.mjs` (new),
  `tests/gpu-lane.test.mjs` (new), `package.json` (one script line),
  `playwright.config.ts` (comments only), `README.md`,
  `codev/reviews/44-add-an-opt-in-native-gpu-local.md`,
  `codev/state/aspir-44_thread.md`.

## Integration Points

- **Internal**: `PW_CHROMIUM_ARGS` hook (merged, proven default-inert) — the
  lane's only injection point into the qualified config; `E2E_ENGINES=chromium`
  engine selection; `webServer` production-server flow via `playwright test`.
- **External systems**: none (explicitly — the #42 lesson).

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Silent SwiftShader fallback mistaken for hardware | M | H | FR3 mandatory deny-list probe before suite; `E2E_GPU_REQUIRE=1` during qualification; FR10 report |
| Hardware timing breaks qualified waits | M | M | Decision 7 discipline: lane findings recorded; canonical waits untouched; accommodations env-gated + disclosed |
| Headed WSLg full-suite flake (focus/windowing) | M | M | FR5 may flip default to headless; findings recorded; headed remains proven-documented |
| Config drift endangers canonical gate | L | H | Comment-only config diff; FR6 config-load equality proof; CI green |
| Recipe env leaks into webServer child with side effects | L | M | GPU-only libs in `/usr/lib/wsl/lib`; bugfix-22 precedent; fallback = scope env to browser if evidence appears |
| Driver/Mesa updates break the recipe later | M | L | Adapter-agnostic candidates + graceful fallback; README dates the evidence |
| Wrapper drifts from real suite invocation | L | M | Delegation (`npm run build` + `npx playwright test` + config webServer); no duplicated invocation logic |

## Validation Checkpoints

1. **After Phase 1**: `npm test` green with zero lane env/GPU; probe-only
   hardware verdict on this host; force-fallback and require-mode behave per
   spec.
2. **After Phase 2**: one full hardware run + one full forced-fallback run
   complete with correct reports/exit codes; FR6 items 1–3 evidence recorded.
3. **After Phase 3**: matrix fully recorded; lane default matches evidence.
4. **Before PR**: FR8 evidence complete; `npm run validate` green (clean
   worktree if needed); README complete; no lockfile diff;
   `.github/workflows/validation.yml` absent from the diff.

## Monitoring and Observability

Terminal-only tooling: per-candidate FR11 diagnostics as they happen, a
pre-report diagnostics summary, and the FR10 greppable report (the artifact
future #41 qualification cites). No persistent telemetry.

## Documentation Updates Required

- [ ] README lane section (FR9 — the deliverable).
- [ ] `playwright.config.ts` hook comment paragraph (Phase 2).
- [ ] Review artifact with FR5/FR6/FR8 evidence (Phase 2–4 accumulation).

## Post-Implementation Tasks

- [ ] #41 consumes the FR8 evidence and the lane for its parallel-workers
      qualification (explicitly out of scope here; `workers: 1` everywhere).
- [ ] Possible future arch.md/lessons update at MAINTAIN time (not this PR
      unless the review phase directs it).

## Consultation Log

(To be filled by porch-driven 3-way plan review.)

## Approval

ASPIR: no human plan gate; 3-way consultation + porch checks govern
advancement. PR gate remains human-approved.

## Change Log

| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-21 | Initial plan | Draft from approved spec | Builder aspir-44 |

## Notes

- Working env-control names fixed by this plan: `E2E_GPU_FORCE_FALLBACK=1`,
  `E2E_GPU_REQUIRE=1`; script name `scripts/e2e-gpu-lane.mjs`; npm script
  `test:e2e:gpu`. (Spec left names as plan decisions.)
- The unit-test file rides the existing `npm test` glob — no `package.json`
  `test` script change, keeping the quality-lane script chain untouched.
- No committed file may read the lane env vars except the wrapper itself;
  `playwright.config.ts` continues to read only `PW_CHROMIUM_ARGS` (already
  merged behavior).
