# Specification 52: Add Firefox Hardware WebGL to the Native-GPU Local E2E Lane

## Summary

Generalize the opt-in native-GPU local e2e lane (`npm run test:e2e:gpu`,
`scripts/e2e-gpu-lane.mjs`, delivered by spec #44 / PR #50) from **Chromium-only**
to a **two-engine Chromium + Firefox** lane, so that on a verified WSL2 host the
full Playwright suite runs under **genuine hardware-accelerated WebGL for both
engines the project ships**. The lane remains **additional tooling, never the
green gate**: `npm run validate`, `.github/workflows/validation.yml`,
`test:smoke`, Playwright browser defaults, `workers: 1`, `retries`, and every
committed test's timing/assertions stay **byte-for-byte / behavior-identical** to
today (arch-critical: Validation Baseline).

Spec #44 shipped the lane Chromium-only by explicit decision (spec #44
Decision 5: "The proven configurations are Chromium+ANGLE. Firefox hardware GL is
out of scope"), **not** because of a Firefox or Playwright limitation. The
feasibility investigation `firefox-native-gpu-e2e-feasibility.md` (2026-07-21)
then qualified Firefox hardware WebGL end-to-end on the same WSL2 / RTX 3080 host
and returned a **go** verdict. The capabilities needed already exist in the repo:

- `playwright.config.ts` already defines a `firefox` project and already selects
  engines via `E2E_ENGINES` (e.g. `E2E_ENGINES=chromium,firefox`).
- The Mesa D3D12 environment the Chromium lane injects
  (`GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`) is inherited by
  Firefox launched from the same suite process.
- Playwright's `firefox.launch()` supports per-launch `env` and
  `firefoxUserPrefs`, which is all the Firefox probe needs.
- A combined Chromium+Firefox hardware run passed all 22 tests in ~3.2 minutes on
  the qualification host.

The single genuinely new technical element is **Firefox renderer verification**:
Firefox privacy-sanitizes the unmasked renderer string to `Generic Renderer` /
`Microsoft Corporation`, so the raw renderer must be read through an **ephemeral,
probe-only** Firefox preference (`webgl.sanitize-unmasked-renderer: false`) that
is never applied to the application suite profile.

### Why this is worth building

1. **Both shipped engines get hardware-fidelity local evidence**, not just
   Chromium — Firefox is a first-class project in the suite today.
2. **Faster local Firefox iteration** — frames stop being CPU-bound llvmpipe
   software rasterization.
3. **Completes the #44 lane's original intent** at essentially zero marginal
   dependency cost — Playwright already bundles Firefox.

## Problem Analysis

### Current state

- `scripts/e2e-gpu-lane.mjs` is structurally Chromium-only:
  - `CANDIDATES` carry Chromium launch **flags** (ANGLE args) and the recipe
    env; `probeRenderer` launches **`chromium`** from `@playwright/test` and
    reads `UNMASKED_RENDERER_WEBGL`.
  - `suiteEnvFor()` hardcodes `E2E_ENGINES = "chromium"` and injects
    `PW_CHROMIUM_ARGS`.
  - `formatReport()` hardcodes `engine: chromium` and a single `renderer:` line.
  - `parseArgs()` exposes `--probe-only`, `--mode`, `--candidate`, `--channel`
    but no engine selector.
  - The software deny-list `SOFTWARE_RENDERER_MARKERS` is
    `["swiftshader", "llvmpipe", "software", "microsoft basic"]`.
- `playwright.config.ts` already exposes both `chromium` and `firefox` projects
  and already honors `E2E_ENGINES`. The `firefox` project sets only
  `firefoxUserPrefs: { "webgl.force-enabled": true }` (so a GPU-less CI runner
  gets software WebGL instead of a context-creation failure). CI runs
  `E2E_ENGINES=chromium` (Firefox has no SwiftShader equivalent and cannot create
  a WebGL context on GitHub runners); the Firefox arm is a **local** qualification
  gate, never a CI gate.
- Firefox hardware WebGL on this WSL2 host is proven only as the feasibility
  report's evidence; there is no command or code path that runs it.

### Desired state

- `npm run test:e2e:gpu` on a verified WSL2 host probes **and independently
  verifies** hardware renderers for **both** Chromium and Firefox, then runs the
  **full two-engine** Playwright suite (`E2E_ENGINES=chromium,firefox`, all specs,
  `workers: 1`, no test dropped, no committed wait trimmed) once, under one build.
- Firefox's **raw** renderer is read through a probe-only sanitization preference
  and asserted against an expanded software deny-list; a Firefox probe that
  returns software (llvmpipe/…) is a failed verification, never silently trusted.
- The final report is **engine-aware**: it records mode plus a per-engine
  renderer verdict (e.g. `renderer.chromium`, `renderer.firefox`).
- Exhaustion / partial-verification behavior is **honest**: Firefox has no
  portable bundled software-WebGL equivalent, so an unverified Firefox llvmpipe
  run is **never** presented as equivalent to Chromium's qualified SwiftShader
  fallback.
- The canonical gate is provably untouched; CI stays Chromium-SwiftShader only.

### Stakeholders

- **Primary**: developer(s) running local two-engine e2e iteration on WSL2.
- **Secondary**: #41 (local parallelization — now has a two-engine hardware lane
  to qualify against); flake triage for the Firefox synthetic-input class.
- **Technical**: builder implementing this spec; CI is a stakeholder only in that
  it must be provably unaffected.

## Confirmed Decisions

1. **Additive generalization, never the gate.** The two-engine lane extends the
   #44 wrapper. `npm run validate`, `.github/workflows/validation.yml`,
   `test:smoke`, Playwright browser defaults, `workers: 1`, and `retries` are
   byte-for-byte / behavior-identical to today. The lane is not wired into
   `validate`, `test:smoke`, or CI. CI stays `E2E_ENGINES=chromium`.
2. **Chromium behavior is preserved.** The existing Chromium probe flags, Mesa
   env, `PW_CHROMIUM_ARGS` injection, SwiftShader fallback, report semantics for
   Chromium, and a single-engine Chromium path all keep working. This is a
   superset change, not a Chromium rewrite. Existing `tests/gpu-lane.test.mjs`
   behavior for Chromium is preserved or consciously migrated (documented).
3. **Firefox probe recipe.** For the selected host recipe, Firefox is probed with
   the **same Mesa environment** as Chromium (`GALLIUM_DRIVER=d3d12`,
   `LD_LIBRARY_PATH=/usr/lib/wsl/lib`), **no Chromium ANGLE flags**, and
   probe-only preferences:
   ```js
   firefoxUserPrefs: {
       "webgl.force-enabled": true,
       "webgl.sanitize-unmasked-renderer": false,
   }
   ```
   `webgl.sanitize-unmasked-renderer: false` is applied **only** to the ephemeral
   renderer-probe browser. It changes renderer-string *disclosure*, not renderer
   *selection*; the application suite retains its normal Firefox profile/prefs.
4. **Verify every requested engine before trusting hardware mode.** For the
   default (`all`) two-engine lane, a host recipe is fully verified only after
   **both** Chromium and Firefox return hardware renderer verdicts (each raw
   string logged verbatim and passing the deny-list). Only then does the combined
   hardware suite run.
5. **Strict mode fails if either engine is unverified.** Under
   `E2E_GPU_REQUIRE=1`, failure to verify **either** requested engine exits
   non-zero (with the per-engine/per-candidate log) **before** the build or suite
   starts. This preserves hardware-evidence integrity for qualification runs.
6. **Honest fallback semantics (no Firefox software masquerade).** Firefox has no
   portable bundled SwiftShader equivalent. In the default (non-strict) lane, when
   the two-engine hardware verification cannot be satisfied:
   - preserve PR #50's deterministic **Chromium SwiftShader** fallback;
   - **skip Firefox** and report, loudly and in the final report, *why* it was
     skipped/unverified;
   - never label an unverified Firefox llvmpipe run as equivalent to Chromium's
     qualified SwiftShader fallback;
   - under `E2E_GPU_REQUIRE=1`, fail instead of falling back (Decision 5).
   A portable Firefox software lane would need separate dependencies and
   qualification and is **out of scope**.
7. **Expanded, fail-closed software deny-list.** The renderer deny-list rejects at
   least: SwiftShader, llvmpipe, softpipe, lavapipe, swrast, generic
   "software" rasterizers, and Microsoft Basic Render Driver. It applies to both
   engines' raw renderer strings. The Chromium deny-list must not become weaker.
8. **Engine selector control.** An optional `--engine=chromium|firefox|all`
   (working name; final name is a plan decision) selects the probe/suite engine
   set. `all` is the default and means the two-engine behavior. Single-engine
   values preserve targeted diagnostics and obey the same honesty rules (Decisions
   6–7).
9. **One build, one suite invocation.** The lane still builds once and runs the
   suite once (`playwright test`), mirroring `test:smoke`. Firefox needs **no new
   `playwright.config.ts` hook** — it inherits the Mesa env from the suite process
   and its normal project prefs. `workers: 1` and `retries: 0` for the lane run
   are unchanged.
10. **Do not mask the known Firefox flake.** The known Firefox background-drag
    synthetic-input flake (see Known Stability Caveat) is either fixed/qualified
    separately or **explicitly accepted and documented** as a local qualification
    flake. It must NOT be hidden with retries, nor may the canonical assertion be
    weakened as part of this change.
11. **No new dependencies.** Playwright already bundles Firefox and exposes
    `firefox.launch()`. The wrapper stays Node built-ins + `@playwright/test`
    only. `engines`, `dependencies`, `devDependencies`, and the lockfile are
    untouched (arch-critical: reproducibility contract).
12. **Sandbox/relaxation flags stay opt-in-only and Chromium-scoped.** No Firefox
    equivalent of `--disable-gpu-sandbox` is introduced into any default launch
    path; any relaxation stays confined to the explicitly invoked local lane.

## Scope

### In scope

- Generalizing `scripts/e2e-gpu-lane.mjs` to be **engine-aware**: an engine-aware
  probe (Chromium via ANGLE flags + Mesa env; Firefox via Mesa env +
  probe-only prefs, no ANGLE flags), two-engine verification, a two-engine suite
  run, and an engine-aware report.
- Expanding the software deny-list (Decision 7) applied to both engines.
- Adding the `--engine=chromium|firefox|all` control (Decision 8).
- Updating `tests/gpu-lane.test.mjs` (and any consumer that greps the report keys)
  for the engine-aware report and the two-engine verification/selection logic.
- Firefox-inclusive repeat-run stability evidence (see FR8) recorded in the review
  artifacts, including the combined two-engine wall-clock.
- Repo documentation update (see FR9) covering the two-engine lane, the Firefox
  probe recipe and sanitization-preference rationale, and the honest-fallback and
  known-flake semantics.
- Proof the canonical gate is untouched (see FR6).

### Out of scope (non-goals)

- Raising `workers` anywhere or qualifying parallel execution (#41).
- Any CI/GPU-in-CI work; CI stays `E2E_ENGINES=chromium` SwiftShader-only.
- A portable Firefox **software** lane (no bundled SwiftShader equivalent;
  separate dependencies + qualification would be required).
- Changing `npm run validate`, `test:smoke`, `.github/workflows/validation.yml`,
  Playwright browser defaults, `workers`, or `retries`.
- Retuning committed test waits/floors for hardware timing.
- New dependencies, toolchain changes, or app (`app/**`) code changes.
- Fixing the Firefox synthetic-input flake is **optional** here (Decision 10):
  either fix/qualify it separately or explicitly accept+document it. This spec
  does not mandate a code fix for it.
- Non-WSL2 Firefox hardware paths (native-Linux Firefox) — may be noted as
  untested; the qualified path is WSL2 Mesa d3d12.

## Constraints and Invariants

- **Reproducibility contract** (arch-critical): Node `22.23.1`, npm `10.9.8`,
  lockfile v3, `npm ci`; no dependency regeneration. This work adds no packages,
  so the lockfile must show **no delta**.
- **Canonical gate** (arch-critical): `npm run validate` is the green gate;
  `.github/workflows/validation.yml` must **not appear in the PR diff at all**.
- **Default-inert principle**: with no lane env set and the lane not invoked,
  every behavior in the repo — Playwright projects, launch args/prefs, workers,
  retries, timeouts, reporters, webServer, `E2E_ENGINES` handling — is identical
  to today. The Firefox project's committed prefs are unchanged.
- **Probe/suite isolation**: the probe-only Firefox preference
  (`webgl.sanitize-unmasked-renderer: false`) is confined to the ephemeral probe
  browser; it must never leak into the suite's Firefox profile.
- **Evidence honesty** (lessons: Validation Evidence): record each engine's exact
  raw renderer string, mode, and per-run results verbatim; software-fallback /
  Firefox-skipped runs are always labeled as such; no hardware claim for an
  engine without its deny-list assertion passing.
- **Committed-tree proof discipline** (lessons-critical): if a local gate check
  fails only on untracked harness files, prove the gate on a clean worktree
  (`git worktree add --detach HEAD` + real `npm ci`) rather than suppressing it in
  committed config.

## Solution Exploration

### Approach A: Second Firefox-only lane / separate script

**Description**: Ship a parallel `test:e2e:gpu:firefox` wrapper.

**Pros**: Zero risk to the Chromium lane.

**Cons**: Duplicates probe/build/report/fallback logic; diverges over time;
defeats the feasibility report's "one combined 22-test run" evidence; two
commands to teach and maintain. Fails the "one command runs the full two-engine
suite" intent.

**Complexity**: Medium. **Risk**: Medium (drift).

### Approach B: Verify Firefox but always run it software in the suite

**Description**: Probe Firefox for information only; keep the suite Firefox arm on
llvmpipe.

**Pros**: Simplest suite wiring.

**Cons**: Defeats the purpose — no hardware Firefox evidence; and it invites
exactly the dishonest "software presented as hardware" outcome Decision 6 forbids.

**Complexity**: Low. **Risk**: High (evidence dishonesty).

### Approach C: Generalize the existing wrapper to be engine-aware (selected)

**Description**: Extend `scripts/e2e-gpu-lane.mjs` so the probe, verification,
suite-env composition, and report are keyed by engine. For the selected host
recipe, probe Chromium (ANGLE flags + Mesa env) and Firefox (Mesa env +
probe-only prefs). Require both to verify for hardware mode; run one combined
`E2E_ENGINES=chromium,firefox` suite. Report per-engine renderers. Fall back /
strict-fail per Decisions 5–6.

**Pros**: One command, one build, one suite invocation (matches the feasibility
report's proven shape); no duplicated logic; the existing default-inert
`PW_CHROMIUM_ARGS` contract is untouched; Firefox needs no new config hook.

**Cons**: The wrapper's internal candidate/probe model must grow an engine
dimension; the report-key change ripples into unit tests and any report consumer
(a deliberate, contained migration).

**Complexity**: Medium. **Risk**: Low.

**Selected** — it is the only approach that delivers a single combined
two-engine hardware run with honest per-engine verification while preserving the
Chromium lane and the untouched-gate invariant.

## Functional Requirements

### FR1 — Two-engine one-command lane

`npm run test:e2e:gpu` (no extra args) runs the entire two-engine lane
end-to-end: host probe → per-engine renderer verification (Chromium **and**
Firefox) → build + production server (same flow as today) → one full
`E2E_ENGINES=chromium,firefox` Playwright suite → engine-aware mode/renderer
report. Invoking nothing ⇒ nothing changes anywhere (default-inert).

### FR2 — Engine-aware probe

For the host recipe the lane selects (WSL2 Mesa d3d12 on the qualification host):
- **Chromium** probe: the existing ANGLE candidate flags + Mesa env
  (`GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`), reading
  `UNMASKED_RENDERER_WEBGL` through the repo's own Playwright Chromium.
- **Firefox** probe: the **same Mesa env**, **no ANGLE flags**, launched via
  Playwright's `firefox` with the probe-only prefs from Decision 3, reading the
  raw `UNMASKED_RENDERER_WEBGL`.
Each probe records a **renderer and vendor** verbatim, per engine, in the probe
transcript(s) and drives the FR3 verdict. The engine set to probe is the requested
set (FR7): `all` ⇒ {chromium, firefox}.

### FR3 — Per-engine renderer verification (expanded deny-list)

Before trusting hardware mode, each requested engine's raw renderer string is
asserted **not** to match the expanded software deny-list (Decision 7:
SwiftShader, llvmpipe, softpipe, lavapipe, swrast, "software" rasterizers,
Microsoft Basic Render Driver). A probe that crashes, times out, or returns a
software/empty string is a **failed** engine verdict (logged with an actionable
FR11 diagnostic). Firefox's verdict specifically depends on the probe-only
sanitization preference being applied — a probe that reports the sanitized
`Generic Renderer` string must be treated as **unverifiable**, not as hardware.

### FR4 — Two-engine verification gating and honest fallback

- **Default (`all`), both engines verify hardware** ⇒ run the combined
  `E2E_ENGINES=chromium,firefox` hardware suite.
- **Default (`all`), not both verify** ⇒ honest fallback (Decision 6):
  Chromium runs under its deterministic SwiftShader fallback; **Firefox is
  skipped** with a loud reason at start **and** in the final report; the run is
  unmistakably labeled as not a two-engine hardware result.
- **`E2E_GPU_REQUIRE=1` and any requested engine fails verification** ⇒ exit
  non-zero **before** build/suite, with the per-engine log (Decision 5).
- **`E2E_GPU_FORCE_FALLBACK=1`** ⇒ skip all hardware probing and take the honest
  fallback path (Chromium SwiftShader; Firefox skipped) — how the fallback is
  proven on a GPU-capable host.
- Single-engine `--engine=chromium` preserves the exact #44 behavior. Single-engine
  `--engine=firefox` applies the same honesty rules: verify or (strict) fail;
  non-strict with no hardware reports Firefox unverified/skipped rather than
  presenting llvmpipe as a qualified fallback.
- **Single-engine `--engine=firefox`, non-strict, Firefox fails verification
  (explicit empty-engine-set rule).** Firefox is skipped (Decision 6, no software
  masquerade) and — because Chromium was not requested — the resolved suite engine
  set is **empty**. The lane MUST NOT invoke Playwright with an empty
  `E2E_ENGINES` value: `playwright.config.ts` throws on an engine list that matches
  no known engine (the "matched no known engines" guard), so an empty set would
  crash the suite rather than run nothing. Instead the lane **skips the build and
  suite entirely**, emits the engine-aware report with
  `renderer.firefox: skipped (unverified — <reason>)` and
  `suite: skipped (no verified engine)`, and exits **0** — consistent with the
  #44 lane's "hardware absence is never a hard failure by default." An operator who
  needs this to fail uses `E2E_GPU_REQUIRE=1` (next bullet).
- **`E2E_GPU_REQUIRE=1 --engine=firefox` with no hardware** ⇒ exit non-zero
  **before** build/suite (Decision 5), same as any strict unverified engine.
- **`E2E_GPU_FORCE_FALLBACK=1 --engine=firefox` (vacuous combination).**
  Force-fallback means "skip probing and take the software path"; Firefox has no
  software path (Decision 6). This is treated as the same non-strict no-op as the
  empty-engine-set rule above: **Firefox skipped, no build/suite, report
  `renderer.firefox: skipped (unverified — forced fallback, Firefox has no software
  equivalent)`, exit 0.** It is deliberately **not** a `LaneUsageError` (unlike
  `E2E_GPU_FORCE_FALLBACK=1 E2E_GPU_REQUIRE=1`, which stays a usage error): a
  benign env+flag combination should degrade to an honest skip, not a hard failure.
Lane-internal errors unrelated to hardware absence (build failure, malformed
invocation, contradictory controls) remain hard failures in every mode.

### FR5 — Full two-engine suite, nothing dropped

For a verified hardware run the lane runs the **full** suite once with
`E2E_ENGINES=chromium,firefox` (all specs for both projects), `workers: 1`, no
committed wait trimmed, no test skipped because of the lane. `PW_CHROMIUM_ARGS`
continues to carry only Chromium's verified flags; Firefox inherits the Mesa env
from the suite process and uses its normal project prefs. Lane retries policy
stays `retries: 0` (Decision 10 forbids masking the Firefox flake with retries).

### FR6 — Canonical gate provably untouched

- `.github/workflows/validation.yml` and the `validate`/`test:smoke` chain do not
  appear in the PR diff.
- `playwright.config.ts` default behavior with all lane env unset is unchanged:
  the `firefox` project's committed prefs, `E2E_ENGINES` handling, launch args,
  workers/retries/timeouts/reporter/webServer are identical to main (prove by
  loading the resolved config with env unset and/or zero-diff where no config
  change is needed). Any config change (if truly required) must be default-inert
  and proven so.
- PR CI (all shards + quality + gate) green under `E2E_ENGINES=chromium`
  SwiftShader.

### FR7 — Engine selector

`--engine=chromium|firefox|all` (working name) selects the engine set for both the
probe/verification stage and the suite run. `all` is the default and equals the
two-engine behavior. Unknown values are a hard usage error (like the existing
`parseArgs` validation). The selector is lane-only (read by the wrapper, not by
any committed test or by `playwright.config.ts` default behavior).

### FR8 — Firefox-inclusive repeat-run stability evidence

Before the two-engine lane is documented as trusted: **at least three consecutive
full two-engine hardware runs** (both engines' raw renderer strings asserted) with
`retries: 0`, each run's per-test pass/fail, wall-clock, and the combined
two-engine wall-clock recorded in the review artifacts, alongside a contemporaneous
baseline for comparison.

**Merge/qualification gate (explicit).** The stability evidence satisfies the gate
when **either**:
- (a) **≥3 consecutive fully-green** two-engine hardware runs are recorded (no test
  fails, `retries: 0`), **or**
- (b) the runs are green **except** for the single known Firefox background-drag
  synthetic-input flake (`tests/e2e/matrix.spec.ts:224`), and that flake is
  dispositioned per Decision 10 — **either** fixed and requalified, **or** explicitly
  accepted and documented as a local qualification flake (with its recurrence rate
  from these runs recorded). Under (b) the flake is **never** masked with retries and
  the canonical assertion is **never** weakened.

Any failure **other** than that one known, documented flake blocks the gate: it must
be root-caused (and either fixed or, if a genuinely new flake, itself explicitly
qualified) before the lane is documented as trusted — a green-except-known-flake
record is acceptable, an unexplained failure is not. The forced-fallback path is
qualified by at least one `E2E_GPU_FORCE_FALLBACK=1` run showing Chromium
SwiftShader + Firefox-skipped. Hardware qualification runs use `E2E_GPU_REQUIRE=1`
so an unnoticed mid-qualification fallback cannot contaminate the evidence.

### FR9 — Documentation

The concrete documentation target is **`README.md`'s existing "Opt-in native-GPU
e2e lane" section** (the doc surface #44 established, currently around README
lines 138–232), updated **in place** to the two-engine reality — including its
`=== E2E GPU LANE REPORT ===` example block (the per-engine `renderer.chromium` /
`renderer.firefox` keys of FR10) and its "Env controls and flags" table (the new
`--engine=chromium|firefox|all` selector of FR7). The contemporaneous run evidence
(FR8) lives in this feature's review, `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md`,
which the README section links the way it currently links #44's review. No new
top-level doc file is created. The updated section covers: the two-engine command
and what it does; the Firefox probe recipe (Mesa env + probe-only prefs) and the
`webgl.sanitize-unmasked-renderer` rationale (why Chromium's deny-list alone is
too weak for Firefox); how to read the engine-aware report; the honest-fallback
semantics (Firefox skipped, never a software masquerade); the known Firefox
background-drag flake and its disposition (Decision 10); and the unchanged
non-gate status and #41 sequencing.

### FR10 — Engine-aware honest reporting surface

The lane's terminal output ends with a machine-greppable summary that replaces the
single hardcoded `engine: chromium` / `renderer:` lines with an explicit
per-engine contract, e.g.:

```text
=== E2E GPU LANE REPORT ===
mode: hardware
engines: chromium,firefox
renderer.chromium: ANGLE (... D3D12 (NVIDIA GeForce RTX 3080) ...)
renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)
suite: pass
wall-clock: ...
```

Fallback / skipped states are represented explicitly per engine (e.g.
`renderer.firefox: skipped (unverified — <reason>)`). Report keys must be stable
and documented; `tests/gpu-lane.test.mjs` and any report-key consumer are updated
to the new contract.

### FR11 — Actionable per-engine operator diagnostics

Every skipped or failed engine/candidate produces a one-line diagnostic naming the
cause and a remedy hint, covering at minimum: Mesa d3d12 not selected (probe
returned llvmpipe — hint the Mesa package / env recipe); Firefox probe returned the
sanitized `Generic Renderer` (hint the probe-only preference); probe crash/timeout
(name the engine and where its transcript lives); WSL GPU libs missing. Diagnostics
must make "no adapter on this host" versus "adapter present but a per-engine recipe
prerequisite is missing" obvious to an operator who has not read this spec.

## Non-Functional Requirements

### Reproducibility
No dependency, lockfile, or toolchain movement. The lane runs on the pinned
Node/npm via the normal repo environment; Firefox is the already-installed
Playwright bundle.

### Behavior preservation
Default-path behavior everywhere (config, tests, scripts, CI) is provably
unchanged; the two-engine lane is pure addition over the #44 lane.

### Evidence honesty
Per-engine raw renderer strings and per-run results recorded verbatim; Firefox
runs that are software or sanitized-unverifiable are labeled as such and never
counted as hardware; the combined run's mode is unambiguous.

### Security
No new sandbox/blocklist relaxation in default paths; probe-only Firefox prefs are
confined to the ephemeral probe. No secrets, no third-party services, no network
egress beyond what the existing suite already does.

### Maintainability
The engine dimension is expressed as data/config, not scattered `if
(engine === "firefox")` conditionals duplicated across the file; the wrapper still
delegates the suite run to the existing config/scripts rather than re-implementing
it; touched comments updated to reflect the two-engine reality.

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Firefox sanitized renderer (`Generic Renderer`) mistaken for hardware | Medium | High | FR3: verdict depends on the probe-only sanitization pref; a sanitized string is unverifiable, not hardware |
| Firefox background-drag synthetic-input flake recurs on hardware | Medium | Medium | Decision 10 + FR8: fix/qualify separately or explicitly accept+document; never mask with retries or weaken the assertion |
| Report-key change breaks a consumer/unit test | Medium | Medium | FR10 contained migration: update `tests/gpu-lane.test.mjs` + documented consumers; stable documented keys |
| Probe-only Firefox pref leaks into the suite profile | Low | High | Constraint: pref confined to ephemeral probe; suite Firefox prefs unchanged (FR6) |
| Config drift endangers the canonical gate | Low | High | Firefox needs no new config hook (Decision 9); FR6 byte-identical default proof + CI green |
| Two-engine wrapper duplicates suite-invocation logic | Low | Medium | NFR Maintainability: delegate over duplicate; engine set is data |
| Host/driver variance breaks the Firefox recipe | Medium | Low | Adapter-agnostic Mesa recipe + honest fallback (FR4); recipe documented as evidence-dated, not guaranteed |

## Acceptance Scenarios

### Scenario 1 — Two-engine hardware run on the proven WSL2 host
`npm run test:e2e:gpu` on the WSL2/RTX 3080 host: the lane verifies Chromium
(ANGLE D3D12 string) and Firefox (raw `D3D12 (NVIDIA GeForce RTX 3080)` via the
probe-only pref), both ≠ any deny-listed software renderer; the full
`E2E_ENGINES=chromium,firefox` suite (22 tests) runs in one Playwright invocation;
the final report says `mode: hardware`, `engines: chromium,firefox`, and both
`renderer.chromium` / `renderer.firefox` lines with wall-clock.

### Scenario 2 — Honest fallback (Firefox not masqueraded)
Same command with `E2E_GPU_FORCE_FALLBACK=1` (or on a host where Firefox does not
verify): a clear warning states why; Chromium runs under SwiftShader; Firefox is
**skipped** with a stated reason; the final report unmistakably shows Chromium
software-fallback and Firefox skipped/unverified — never Firefox llvmpipe labeled
as a qualified fallback. Exit code reflects the suite result.

### Scenario 3 — Strict mode fails on either unverified engine
`E2E_GPU_REQUIRE=1` with either Chromium or Firefox failing verification exits
non-zero before the build/suite, printing the per-engine log.

### Scenario 4 — Canonical gate untouched
`git diff` on the PR shows no change to `.github/workflows/validation.yml` or the
`validate`/`test:smoke` chain; with lane env unset the resolved Playwright config
(including the `firefox` project prefs and `E2E_ENGINES` handling) is
behavior-identical to main; PR CI (quality + SwiftShader Chromium e2e shards +
gate) is green.

### Scenario 5 — Stability evidence recorded
The review artifacts contain ≥3 consecutive full two-engine hardware runs (per-run
results, both engines' renderer strings, wall-clocks, `retries: 0`), a
forced-fallback run, and the disposition of the Firefox synthetic-input flake
(fixed/qualified or explicitly accepted).

### Scenario 6 — Documentation
A developer who has not read this spec can find the two-engine lane in README,
understand the Firefox probe recipe and sanitization-pref rationale, run it, and
correctly interpret a two-engine hardware vs. Chromium-fallback+Firefox-skipped
report.

### Scenario 7 — Single-engine Firefox, non-strict, no hardware (empty engine set)
`npm run test:e2e:gpu -- --engine=firefox` (or with `E2E_GPU_FORCE_FALLBACK=1`) on a
host where Firefox does not verify hardware: the resolved suite engine set is empty,
so the lane **does not** invoke Playwright (no `E2E_ENGINES=""` crash), skips
build/suite, prints `renderer.firefox: skipped (unverified — <reason>)` and
`suite: skipped (no verified engine)`, and exits 0. The same invocation with
`E2E_GPU_REQUIRE=1` instead exits non-zero before build/suite with the per-engine
diagnostic.

## Known Stability Caveat

Hardware rendering did **not** eliminate Firefox's existing synthetic
background-drag flake:

```text
[firefox] tests/e2e/matrix.spec.ts:224
zooms in with the wheel and rotates with a background drag
Expected camera delta: > 1
Observed camera delta: 0.0006443659645876926
```

PR #50's review recorded the same test failing once in two local Firefox runs;
the feasibility investigation reproduced it once in three full hardware Firefox
runs, though it then passed 5/5 repeated alone and in the combined 22-test run.
This is best described as **Firefox synthetic-input delivery nondeterminism**, not
a software-WebGL timing problem. Per Decision 10 it must be fixed/qualified
separately or explicitly accepted and documented — not hidden with retries and not
used to weaken the canonical assertion.

## Dependencies

- **Internal**: the #44 lane (`scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`,
  the `PW_CHROMIUM_ARGS` hook), the existing `firefox` Playwright project and
  `E2E_ENGINES` handling in `playwright.config.ts`.
- **External services**: none.
- **Evidence source**: `firefox-native-gpu-e2e-feasibility.md` (go verdict, runtime
  evidence, required-change breakdown, upstream Firefox sanitization references).
- **Sequencing**: #41 (parallelization) may consume this two-engine lane's
  qualification; this spec should land (or record two-engine hardware evidence)
  first.

## Consultation Log

### Specify — iteration 1 (Gemini, Codex, Claude)

Verdicts: **Gemini APPROVE** (HIGH), **Claude APPROVE** (HIGH), **Codex
REQUEST_CHANGES** (HIGH). All three independently verified the spec's codebase
claims (Chromium-only lane structure, current `SOFTWARE_RENDERER_MARKERS`,
hardcoded `engine: chromium` report, `E2E_ENGINES` handling, feasibility-report
figures) and found them accurate; the approach was judged fully feasible with no
architecture or Baked-Decision changes needed. All feedback was clarification of
under-specified edge behavior. Changes made:

1. **Single-engine `--engine=firefox` non-strict fallback outcome** (raised by all
   three; Gemini supplied the concrete failure mode). Firefox-only + non-strict +
   failed verification yields an **empty** suite engine set, and an empty
   `E2E_ENGINES` throws in `playwright.config.ts`. FR4 now states explicitly: the
   lane does not invoke Playwright with an empty engine set, skips build/suite,
   reports Firefox skipped + `suite: skipped (no verified engine)`, and exits 0
   (non-strict never hard-fails on hardware absence); `E2E_GPU_REQUIRE=1` makes it
   exit non-zero before build/suite. Added **Scenario 7** to make it testable.
2. **Vacuous `E2E_GPU_FORCE_FALLBACK=1 --engine=firefox`** (Claude). FR4 now
   specifies it as the same honest no-op skip (exit 0), deliberately **not** a
   `LaneUsageError`, distinguishing it from the genuinely contradictory
   `FORCE_FALLBACK=1 + REQUIRE=1` usage error.
3. **FR8 merge-gate ambiguity on a recurring known flake** (Codex). FR8 now gives an
   explicit two-branch gate: (a) ≥3 consecutive fully-green two-engine hardware
   runs, **or** (b) green-except-the-known-documented Firefox background-drag flake
   dispositioned per Decision 10 (never masked). Any failure beyond that one known
   flake blocks the gate.
4. **FR9 vague doc target** (Codex). FR9 now names the concrete target:
   `README.md`'s existing "Opt-in native-GPU e2e lane" section, updated in place
   (report block + env/flags table), with run evidence in
   `codev/reviews/52-…`. No new top-level doc file.

## References

- Issue #52 (this spec); `firefox-native-gpu-e2e-feasibility.md`.
- Spec / plan / review #44
  (`codev/{specs,plans,reviews}/44-add-an-opt-in-native-gpu-local.md`), PR #50.
- `scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`, `playwright.config.ts`.
- Upstream (from the feasibility report): Playwright `BrowserType.launch`
  (`firefoxUserPrefs`, launch `env`); Firefox `SanitizeRenderer.cpp`,
  `ClientWebGLContext.cpp`, and `StaticPrefList.yaml`
  (`webgl.sanitize-unmasked-renderer`).
- `codev/resources/arch-critical.md` — Validation Baseline (canonical gate; do not
  raise workers / trim waits).
- `codev/resources/lessons-critical.md` — Validation Evidence (renderer-string
  discipline); Toolchain and Worktree Hygiene (clean-checkout proof).
