# Specification 44: Add an Opt-In Native-GPU Local E2E Lane (Hardware WebGL with Software Fallback)

## Summary

Productize the hardware-WebGL configuration proven in PR #43 (issue #22) and
experiment 42 into an **opt-in, one-command local e2e lane** (working name
`npm run test:e2e:gpu`) that runs the existing Playwright Chromium suite under
**genuine hardware-accelerated WebGL** when a GPU adapter is available, and
**falls back to software rendering with an unmistakable notice** when it is not.

The lane is **additional tooling and evidence, never the green gate**. The
qualified SwiftShader serial gate stays canonical: `npm run validate`, the
`.github/workflows/validation.yml` required gate, and every committed test's
default behavior must be **byte-for-byte / behavior-identical** to today
(arch: Validation Baseline).

The delivery rests on capabilities that already exist in the repo:

- `playwright.config.ts` already reads an env-gated `PW_CHROMIUM_ARGS` hook
  (added by experiment 42, explicitly retained **for this issue**): unset ⇒
  byte-identical forced-SwiftShader args; set ⇒ the injected flag set.
- PR #43 (issue #22, `codev/state/bugfix-22_thread.md`) proved the WSL2 recipe
  end-to-end on this host: Mesa d3d12 Gallium driver
  (`GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`) + headed
  Chromium via WSLg (`DISPLAY=:0`) with
  `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist --disable-gpu-sandbox`
  → `UNMASKED_RENDERER_WEBGL = "ANGLE (Microsoft Corporation, D3D12 (NVIDIA
  GeForce RTX 3080), OpenGL 4.6)"`, with manual-matrix item 11 passing 3/3.
- Experiment 42 run #5 proved the **non-WSL2** counterpart (generic
  Linux + NVIDIA proprietary userspace): ANGLE-**Vulkan**
  (`--use-gl=angle --use-angle=vulkan`) → `ANGLE (NVIDIA … Tesla T4)`,
  verified with `--disable-software-rasterizer`. On WSL2 that same Vulkan
  backend falls back to llvmpipe — so the winning backend **differs by host
  environment**, and the lane must probe/select rather than hardcode one.

Why this is worth building (from issue #44):

1. **Faster local iteration** — render frames stop being CPU-bound SwiftShader
   work.
2. **Higher-fidelity behavior evidence** — real-GPU runs are what end users
   actually experience; the SwiftShader flake class (#34, #33, #22) does not
   exist there.
3. **Unblocks #41** — with rendering off the CPU, `workers > 1` becomes far
   more plausible locally; the SwiftShader-contention rationale for
   `workers: 1` largely evaporates on this lane (qualification itself belongs
   to #41).

## Problem Analysis

### Current state

- Every local e2e run (`npm run test:smoke`, `npm run validate`) renders WebGL
  through Chromium's bundled SwiftShader — a deterministic but CPU-bound
  software rasterizer. The compound interaction tests (camera settle, drags,
  hover-race-sensitive clicks) run slowly and carry a documented flake class
  (#33, #34, #22) that exists **only** under software rendering: the throttled
  hover raycast loses races against synthetic input when frames take seconds.
- Hardware WebGL on this WSL2 host was assumed impossible until PR #43 proved
  otherwise. Today the proven configuration exists **only as issue/thread
  evidence** (`codev/state/bugfix-22_thread.md`, PR #43,
  `experiments/42_kaggle_gpu_ci/`): there is no command, script, or documented
  repo recipe to run the suite on it. Reproducing it requires archaeology
  across two closed work items.
- The `PW_CHROMIUM_ARGS` hook (the only prerequisite config change) is already
  merged, default-inert, and deliberately waiting for this issue.
- The Kaggle GPU-CI counterpart (#42) was REJECTED on Kaggle-AUP grounds; its
  conclusion explicitly routes the native-GPU goal here: local hardware, no
  third party, no credential, no ToS exposure.

### Desired state

- One documented command (working name `npm run test:e2e:gpu`) builds the app
  and runs the full local Chromium e2e suite under verified hardware WebGL
  when an adapter exists — any vendor, WSL2 or native Linux — and under
  software rendering **with a clear, loud fallback notice** when none does.
- The actual renderer is **logged and asserted**: in hardware mode the
  `UNMASKED_RENDERER_WEBGL` string must not contain `SwiftShader` or
  `llvmpipe`; in fallback mode the run proceeds but is unmistakably labeled
  software.
- The lane has its **own repeat-run stability evidence** (3+ consecutive
  full-suite runs recorded) before being documented as trusted — hardware GL
  shifts every timeline the SwiftShader matrix was qualified against.
- The canonical gate is provably untouched: `npm run validate`,
  `.github/workflows/validation.yml`, and default Playwright behavior are
  unchanged; CI remains SwiftShader-only and green.
- The recipe (WSL2 Mesa d3d12 environment, multi-GPU disambiguators, fallback
  semantics, non-gate status) is documented in the repo instead of buried in
  issue history.

### Stakeholders

- **Primary**: the project developer(s) running local e2e iteration.
- **Secondary**: issue #41 (local parallelization — consumes this lane's
  qualification), future flake triage (#33/#34-class attribution now has a
  hardware control arm).
- **Technical**: builder implementing this spec; CI is a stakeholder only in
  the sense that it must be provably unaffected.

## Confirmed Decisions

1. **Additive lane, never the gate.** The SwiftShader serial gate stays
   canonical. `npm run validate` and `.github/workflows/validation.yml` are
   byte-for-byte unchanged. The lane must not be wired into `validate`,
   `test:smoke`, or CI.
2. **Injection point is the existing `PW_CHROMIUM_ARGS` hook.** Default
   (env unset) behavior of `playwright.config.ts` stays byte-identical
   (SwiftShader args, `workers: 1`, `retries: 0` locally, qualified timeouts).
   Any additional config surface the lane needs (e.g. an env-gated headed
   toggle, if the Playwright `--headed` CLI flag is insufficient) must follow
   the same pattern: env unset ⇒ byte-identical behavior, proven the same way
   experiment 42 proved the hook (load the real config with env unset and
   compare).
3. **Adapter-agnostic via probe-and-select, with graceful fallback.** The lane
   probes the host and selects from a small candidate recipe list rather than
   hardcoding a vendor or backend:
   - WSL2 path (proven, PR #43): `/dev/dxg` + `/usr/lib/wsl/lib` + Mesa d3d12
     ⇒ `GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`, ANGLE→GL
     flags, headed via WSLg unless headless is proven (FR5). Works for any
     adapter the d3d12 layer exposes (NVIDIA/AMD/Intel); the base config
     auto-selects a sole adapter, `MESA_D3D12_DEFAULT_ADAPTER_NAME=<vendor>`
     and `LIBGL_ALWAYS_SOFTWARE=false` are optional multi-GPU disambiguators.
   - Native-Linux path (proven on Kaggle T4, experiment 42 run #5): working
     GL/Vulkan userspace ⇒ ANGLE-Vulkan (or ANGLE-GL) candidates.
   - No adapter / all candidates fail verification ⇒ software fallback with a
     clear warning; the lane must not hard-depend on GPU presence.
4. **Renderer verification is mandatory, not advisory.** The lane reads the
   effective `UNMASKED_RENDERER_WEBGL` through the same Chromium build and
   flag set the suite will use, logs it, and asserts it is not
   SwiftShader/llvmpipe before trusting a hardware run. A hardware-mode run
   whose renderer probe returns software must not silently proceed as if it
   were hardware. The deterministic policy (see FR3): unusable or unverified
   candidates are skipped/failed loudly and the next candidate is tried;
   exhausting all candidates produces a loud software fallback. By default
   the lane never hard-fails because hardware is absent or unverifiable;
   an opt-in strict switch (for qualification runs) converts
   fallback-on-exhaustion into a hard failure.
5. **Chromium-only lane.** The proven configurations are Chromium+ANGLE.
   Firefox hardware GL is out of scope (its local qualification arm stays
   software, unchanged).
6. **Committed tests stay lane-independent.** Everything merged must pass
   under default software rendering on CI runners. No committed test may
   require GPU env vars, hardware presence, or the lane to be meaningful. Any
   lane-only behavior in test/harness files must be env-gated and
   default-inert.
7. **Separate timing qualification, no retuning of the canonical suite.** The
   matrix's waits/floors were qualified under SwiftShader timing. The lane
   needs its own repeat-run evidence (FR8). If a test proves
   timing-incompatible under hardware GL, that is recorded as a lane finding;
   the qualified SwiftShader waits must NOT be trimmed or retuned to
   accommodate the lane (any lane-only accommodation must be env-gated and
   default-inert, and disclosed in the review).
8. **`workers: 1` stays.** Parallel workers on the GPU lane are #41's
   qualification, sequenced after this issue. This spec must not raise
   workers anywhere, including inside the lane.
9. **No new dependencies.** The lane wrapper is Node built-ins (and the
   already-installed `@playwright/test`) only. `package.json` changes are
   limited to adding lane script(s); `engines`, `dependencies`,
   `devDependencies`, and the lockfile are untouched.
10. **Sandbox flags are opt-in-only.** `--disable-gpu-sandbox` /
    `--ignore-gpu-blocklist` (and any similar relaxation the recipe needs) are
    acceptable **only** inside the explicitly invoked local lane; they must
    never appear in default launch args, committed test expectations, or CI.

## Scope

### In scope

- A one-command opt-in lane (npm script + supporting wrapper under
  `scripts/`) that: probes the host, selects/injects the hardware recipe via
  `PW_CHROMIUM_ARGS` (+ required env), builds and serves the app the same way
  the existing suite does, verifies the renderer, runs the **full** Chromium
  e2e suite (no test dropped, no timing trimmed), and reports which mode
  (hardware/software-fallback) actually ran.
- Graceful software fallback with a clear notice when no adapter is usable.
- A bounded headless-vs-headed investigation (FR5) with the result recorded.
- Repeat-run stability evidence for the lane (FR8) recorded in the review
  artifacts, including wall-clock comparison against the serial SwiftShader
  local baseline.
- Repo documentation of the lane and the WSL2 Mesa d3d12 recipe (FR9).
- Proof that the canonical gate is untouched (FR6).

### Out of scope (non-goals)

- Raising `workers` anywhere or qualifying parallel execution (#41).
- Any CI/GPU-in-CI work (#42 REJECTED on AUP grounds; CI stays
  SwiftShader-only).
- Firefox hardware WebGL.
- Making the lane a required or default path; changing `npm run validate`,
  `test:smoke`, or `.github/workflows/validation.yml` in any way.
- Retuning committed test waits/floors for hardware timing.
- New dependencies, toolchain changes, or app (`app/**`) code changes — this
  is tooling/evidence work; the app is not modified.
- Windows-native / macOS lane variants (document as untested if mentioned).

## Constraints and Invariants

- **Reproducibility contract** (arch-critical): Node `22.23.1`, npm `10.9.8`,
  lockfile v3, `npm ci`; no dependency regeneration. This work adds no
  packages, so the lockfile must show no delta.
- **Canonical gate**: `npm run validate` is the green gate;
  `.github/workflows/validation.yml` byte-for-byte unchanged (verifiable via
  `git diff` — the file must not appear in the PR diff at all).
- **Default-inert principle**: with no lane env set and the lane script not
  invoked, every behavior in the repo — Playwright launch args, projects,
  workers, retries, timeouts, reporters, webServer — is identical to today.
- **Evidence honesty** (lessons: Validation Evidence): record the exact
  renderer string, mode, and per-run results; never broaden an
  environment-limited result into a general claim; preserve nonzero/diagnostic
  evidence rather than normalizing it.
- **Committed-tree proof discipline** (hot lesson): if a local gate check
  fails only on untracked harness files, prove the gate on a clean worktree
  (`git worktree add --detach HEAD` + real `npm ci`) instead of suppressing in
  committed config.

## Solution Exploration

### Approach A: Documentation only (recipe in README, no tooling)

**Description**: Write up the PR #43 recipe; users export env vars and run
Playwright by hand.

**Pros**: Zero code risk; canonical gate trivially untouched.

**Cons**: Fails the issue's acceptance criteria outright — no one-command
lane, no renderer assertion, no fallback behavior, no stability evidence. The
recipe stays fragile archaeology (multi-line env + flags), and silent
SwiftShader fallback (the exact failure mode Chromium defaults to) goes
undetected — a user can believe they ran hardware when they did not.

**Complexity**: Low. **Risk**: Low (but does not solve the problem).

### Approach B: First-class GPU project inside `playwright.config.ts`

**Description**: Add a `chromium-gpu` Playwright project (or config fork)
carrying the hardware flags/headed mode, selected via `E2E_ENGINES=chromium-gpu`.

**Pros**: Pure-Playwright ergonomics; no wrapper process; flags visible in one
file.

**Cons**: The config cannot probe the host (adapter detection, WSL2-vs-native
selection, env var injection like `GALLIUM_DRIVER`/`LD_LIBRARY_PATH` must
happen **before** browser launch, some before Node starts the browser
process); graceful fallback with a loud notice and a pre-suite renderer
assertion do not fit a declarative project block. It also grows the qualified
config's surface area — more risk to the byte-identical default contract for
no probing capability.

**Complexity**: Medium. **Risk**: Medium (config drift risk on the canonical
gate; silent-fallback risk remains).

### Approach C: Wrapper-script lane over the existing `PW_CHROMIUM_ARGS` hook (selected)

**Description**: A Node wrapper (under `scripts/`, exposed as
`npm run test:e2e:gpu`) that (1) probes the host and selects a candidate
recipe (WSL2 d3d12 / native GL / none), (2) exports the recipe env and sets
`PW_CHROMIUM_ARGS`, (3) verifies the effective renderer through the repo's own
Playwright Chromium before the suite (the pre-flight-probe pattern already
built in `experiments/42_kaggle_gpu_ci/kaggle_e2e_runner.py`), (4) runs the
full Chromium suite (build + test, mirroring `test:smoke` semantics), and
(5) reports hardware/fallback mode and the renderer string. Fallback = rerun
path with default SwiftShader args and a loud warning.

**Pros**: Zero change to default config behavior (the hook already exists and
is proven default-inert); probing, env setup, assertion, fallback, and
reporting are ordinary imperative code where they belong; the same wrapper is
the natural home for the stability-evidence runs; smallest possible surface on
the qualified gate.

**Cons**: One more script to maintain; headed-mode plumbing (WSLg `DISPLAY`,
Playwright `--headed`/env-gated `headless: false`) needs care; wrapper must
avoid becoming a second source of truth for suite invocation (it should
delegate to the existing scripts/config, not re-implement them).

**Complexity**: Medium. **Risk**: Low.

**Selected** — it is the only approach that satisfies adapter-agnostic
probing, mandatory renderer verification, graceful fallback, and the
untouched-gate invariant simultaneously, and it builds directly on the hook
experiment 42 left for this purpose.

## Functional Requirements

### FR1 — One-command opt-in lane

A single documented npm script (working name `test:e2e:gpu`; final name is a
plan decision) runs the entire lane end-to-end: probe → env/flag injection →
build + production server (same flow the existing suite uses) → renderer
verification → full Chromium e2e suite → mode/renderer report. Invoking
nothing ⇒ nothing changes anywhere (default-inert).

### FR2 — Adapter-agnostic probe and recipe selection

The lane detects the host capability class without vendor hard-coding:
- WSL2 d3d12 path: presence of `/dev/dxg` and the WSL lib directory ⇒ Mesa
  d3d12 recipe (any vendor adapter), with the documented optional multi-GPU
  disambiguators.
- Native-Linux path: a usable GL/Vulkan stack ⇒ ANGLE candidate flags (Vulkan
  and/or GL backends, ordered by evidence).
- Neither ⇒ software fallback (FR3).
Selection logic and its candidate list must be data-driven enough that adding
a future recipe does not restructure the lane.

Two env controls (working names; final names are a plan decision) make the
selection deterministic and testable on any host:
- **Forced fallback** (e.g. `E2E_GPU_FORCE_FALLBACK=1`): skip all hardware
  candidates and go straight to the software-fallback path. This is how
  Scenario 2 is proven on a GPU-capable host — fallback qualification must
  not require a second, GPU-less machine.
- **Strict hardware** (e.g. `E2E_GPU_REQUIRE=1`): if no candidate passes
  renderer verification, exit non-zero instead of falling back. This is the
  integrity guard for FR8 qualification runs, where a silent fallback would
  pollute hardware evidence.
Both are lane-only: they are read by the wrapper, not by any committed test
or by `playwright.config.ts` default behavior.

### FR3 — Mandatory renderer verification and graceful fallback

Before trusting a hardware run, the lane launches the repo's own Playwright
Chromium under the selected flags and reads `UNMASKED_RENDERER_WEBGL`. The
candidate lifecycle is deterministic:

1. **Prerequisite check**: a candidate whose environment prerequisites are
   missing (e.g. headed WSLg candidate with `DISPLAY` unset, WSL2 candidate
   with `/usr/lib/wsl/lib` absent) is **skipped** with a one-line actionable
   reason (FR11) — it is not attempted and cannot crash the lane.
2. **Renderer verification**: the candidate's probe launch reads the renderer
   string; it is logged verbatim. Assert it does **not** match
   SwiftShader/llvmpipe (deny-list assertion, full string recorded). A probe
   that crashes, hangs past its timeout, or returns a software string is a
   **failed candidate** — logged, then the next candidate is tried.
3. **Exhaustion**: when all candidates are skipped or failed, the lane falls
   back to software — never a hard failure by default. Under the strict
   switch (FR2), exhaustion exits non-zero with the per-candidate log instead.

- Hardware mode: verification passed; the suite runs under the verified flags.
- Fallback mode: the suite still runs (default SwiftShader args) with an
  unmistakable warning at start **and** in the final report that this was a
  software run, so fallback output can never be mistaken for hardware
  evidence. The suite's own pass/fail exit semantics are preserved in both
  modes; lane-internal errors unrelated to hardware absence (build failure,
  malformed invocation) remain hard failures in all modes.

### FR4 — Full-suite execution, nothing dropped

The lane runs the full Chromium e2e suite (`E2E_ENGINES=chromium`, all specs,
`workers: 1`, no qualified wait trimmed, no test skipped because of the lane).
Lane-mode retries policy: default expectation is `retries: 0` (the SwiftShader
flake class should not exist on hardware; flakes must surface); if evidence
during qualification forces a different policy it must be disclosed with the
evidence (FR8), never silently mirrored from CI.

### FR5 — Bounded headless investigation

The proven config is **headed** via WSLg. Investigate whether headless
Chromium + ANGLE can also reach hardware GL on this host. The investigation
is bounded to a fixed candidate matrix — for the recipe the probe selected
(d3d12 on this host), run the FR3 renderer probe once per combination of:
- headless modes: Playwright default headless and explicit `--headless=new`
  (if distinguishable in the pinned Playwright version);
- ANGLE backends already in the candidate list (GL, plus Vulkan if the
  native-Linux candidate is defined for this host class).

That is ≤4 probe runs, each with the standard probe timeout. **Stop
condition**: the matrix is exhausted. Conclusive positive = at least one
combination passes the deny-list assertion (record which); conclusive
negative = all combinations return software strings or fail (record each
string/failure verbatim). No iteration beyond the matrix — novel flag hunting
is out of scope. If headless works, it may become the lane default with
headed as documented alternative; if not, headed stays the default and the
headless result is documented as attempted evidence.

### FR6 — Canonical gate provably untouched

- `.github/workflows/validation.yml` and the `validate` script chain do not
  appear in the PR diff.
- `playwright.config.ts` default behavior (all lane env unset): byte-identical
  launch args and unchanged workers/retries/timeout/reporter/webServer
  semantics, proven by loading the real config with env unset (the experiment
  42 verification pattern) and/or zero-diff where no config change is needed.
- CI on the PR (all shards + quality + gate) green under SwiftShader.

### FR7 — Committed tests independent of the lane

No committed test/harness change may make any default-path test depend on GPU
presence, lane env vars, or the wrapper. Any lane-aware branch in shared
harness code is env-gated and default-inert.

### FR8 — Repeat-run stability evidence

Before the lane is documented as trusted: **3+ consecutive full-suite lane
runs** on hardware (renderer string asserted), each run's pass/fail per test,
wall-clock, and retries policy recorded in the review artifacts, alongside at
least one contemporaneous serial SwiftShader local baseline wall-clock for
comparison. Instability findings (if any) are recorded as lane findings with
the FR/decision-7 discipline (no canonical retuning). If the host has no
adapter at qualification time this criterion cannot be met — the work is not
done until hardware evidence exists. The fallback path is qualified by at
least one forced-fallback run of the same lane (FR2 control) on the same
host. Hardware qualification runs use the strict switch (FR2) so an
unnoticed mid-qualification fallback cannot contaminate the evidence.

### FR9 — Documentation

README (and/or a codev resource, plan's choice — discoverability from README
required) documents: the lane command and what it does, hardware vs fallback
semantics and how to read the report, the WSL2 Mesa d3d12 environment recipe
from PR #43 (including optional `MESA_D3D12_DEFAULT_ADAPTER_NAME` /
`LIBGL_ALWAYS_SOFTWARE` disambiguators), the headless/headed outcome (FR5),
the lane's explicitly **non-gate** status, and the #41 sequencing note
(workers stay 1 until #41 qualifies parallelism on this lane).

### FR10 — Honest reporting surface

The lane's terminal output ends with a machine-greppable summary: mode
(hardware/software-fallback), exact renderer string, engine, suite result,
wall-clock. This is the artifact the stability evidence (FR8) and future #41
qualification cite.

### FR11 — Actionable operator diagnostics

Every skipped or failed candidate produces a one-line diagnostic naming the
cause and a remedy hint. At minimum these common local failure modes are
covered explicitly:
- `DISPLAY` unset / WSLg socket absent while a headed candidate is selected
  ("WSLg not active — headed hardware mode unavailable");
- `/dev/dxg` present but `/usr/lib/wsl/lib` missing (WSL GPU libs not
  mounted);
- d3d12 candidate whose probe returns llvmpipe (Mesa d3d12 driver missing or
  not selected — hint at the Mesa package / env recipe);
- probe crash or timeout (report the candidate and where its output/log is).
Diagnostics go to the terminal as they happen and are summarized before the
FR10 report. They must make the difference between "no adapter on this host"
and "adapter present but recipe prerequisite missing" obvious to an operator
who has not read this spec.

## Non-Functional Requirements

### Reproducibility
No dependency, lockfile, or toolchain movement. The lane runs on the pinned
Node/npm via the normal repo environment.

### Behavior preservation
Default-path behavior everywhere (config, tests, scripts, CI) is provably
unchanged; the lane is pure addition.

### Evidence honesty
Renderer strings and per-run results recorded verbatim; software-fallback runs
are always labeled as such; no hardware claim without the deny-list assertion
passing.

### Security
GPU sandbox/blocklist relaxations are confined to the explicitly invoked local
lane (Decision 10). No secrets, no third-party services, no network egress
beyond what the existing suite already does.

### Maintainability
Wrapper delegates to the existing config/scripts (no duplicated suite
invocation logic); recipe candidates are data, not scattered conditionals;
comments in touched files updated to reflect the lane's existence (e.g. the
`PW_CHROMIUM_ARGS` comment block's "#44 will consume this" note becomes "the
lane consumes this").

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Hardware timing breaks qualified waits (camera-settle vs the 4 s enable window, hover-race guards were qualified under slow frames) | Medium | Medium | FR8 repeat-run qualification; Decision 7 (lane findings recorded, canonical waits untouched, lane-only accommodations env-gated + disclosed) |
| Silent SwiftShader fallback masquerading as a hardware run | Medium | High | FR3 mandatory deny-list renderer assertion before the suite; FR10 report |
| Headed WSLg runs prove awkward/flaky (focus, window management) | Medium | Medium | FR5 headless investigation; headed stays documented-proven fallback |
| Config drift endangers the canonical gate | Low | High | Approach C keeps config changes ≈0; FR6 byte-identical default proof + CI green |
| Host/driver variance (Mesa version, driver updates, other machines) breaks the recipe | Medium | Low | Adapter-agnostic probe with candidate list + graceful fallback (FR2/FR3); recipe documented as evidence-dated, not guaranteed |
| Wrapper diverges from real suite invocation over time | Low | Medium | Delegation over duplication (NFR Maintainability) |
| Lane accidentally influences #41 scope (workers) | Low | Medium | Decision 8: workers stay 1; explicit non-goal |

## Acceptance Scenarios

### Scenario 1 — Hardware run on the proven WSL2 host
`npm run test:e2e:gpu` on the WSL2/RTX 3080 host: probe selects the d3d12
recipe, renderer probe logs an ANGLE D3D12 string (≠ SwiftShader/llvmpipe),
full Chromium suite runs and passes, final report says hardware + renderer +
wall-clock.

### Scenario 2 — Graceful fallback
Same command on a GPU-less host (or on any host with the forced-fallback
control set, e.g. `E2E_GPU_FORCE_FALLBACK=1` — this is how the scenario is
proven on the GPU-capable qualification host): a clear warning states why no
hardware candidate ran, the suite runs under SwiftShader, the final report
unmistakably says software-fallback. Exit code reflects the suite result.

### Scenario 3 — Canonical gate untouched
`git diff` on the PR shows no change to `.github/workflows/validation.yml` or
the `validate`/`test:smoke` chain; with lane env unset the resolved Playwright
config is behavior-identical to main; PR CI (quality + 4 SwiftShader e2e
shards + gate) is green.

### Scenario 4 — Stability evidence recorded
The review artifacts contain 3+ consecutive full-suite hardware runs (per-run
results, renderer strings, wall-clocks, retries policy) plus a SwiftShader
baseline wall-clock, and the headless-vs-headed investigation outcome.

### Scenario 5 — Documentation
A developer who has never read issues #22/#42/#44 can find the lane in
README, understand its non-gate status, run it, and correctly interpret a
hardware vs fallback report.

## Dependencies

- **Internal**: `playwright.config.ts` `PW_CHROMIUM_ARGS` hook (merged, PR
  #46/#48 line of experiment 42); evidence sources
  `codev/state/bugfix-22_thread.md`, `experiments/42_kaggle_gpu_ci/notes.md`,
  `experiments/42_kaggle_gpu_ci/data/output/probe-run-5-evidence.md`.
- **External services**: none (explicitly — the #42 lesson).
- **Sequencing**: #41 consumes this lane's qualification; this spec must land
  (or conclusively record hardware evidence) before #41's parallel
  qualification can cite it.

## References

- Issue #44 (this spec), #41 (parallelization, sequenced after), #42 +
  `experiments/42_kaggle_gpu_ci/notes.md` (Kaggle REJECT; hook provenance;
  run #5 ANGLE-Vulkan evidence), #22 / PR #43 /
  `codev/state/bugfix-22_thread.md` (WSL2 recipe + 3/3 item-11 native-GPU
  evidence), #33 / #34 (SwiftShader flake class the lane sidesteps).
- `codev/resources/arch.md` — Validation Baseline (canonical gate,
  decomposition, "do not raise workers / trim waits").
- `codev/resources/lessons-learned.md` — Validation Evidence (renderer/rate
  evidence discipline), Toolchain and Worktree Hygiene (clean-checkout proof).
