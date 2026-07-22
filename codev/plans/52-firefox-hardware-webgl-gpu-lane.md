# Plan: Add Firefox Hardware WebGL to the Native-GPU Local E2E Lane (Two-Engine)

## Metadata
- **ID**: plan-2026-07-21-firefox-hardware-webgl-gpu-lane
- **Status**: draft
- **Specification**: [codev/specs/52-firefox-hardware-webgl-gpu-lane.md](../specs/52-firefox-hardware-webgl-gpu-lane.md)
- **Created**: 2026-07-21

## Executive Summary

Implements the spec's selected **Approach C**: generalize the existing #44 lane
wrapper (`scripts/e2e-gpu-lane.mjs`, `npm run test:e2e:gpu`) from Chromium-only to
an **engine-aware** two-engine (Chromium + Firefox) lane, expressing the engine
dimension as **data** rather than scattered `if (engine === "firefox")` branches
(spec NFR Maintainability). The wrapper probes and independently verifies a
hardware renderer for each requested engine, then runs **one** combined
`E2E_ENGINES=chromium,firefox` Playwright suite (one build, one invocation,
`workers: 1`, `retries: 0`) and ends with a per-engine machine-greppable report.

The single genuinely new technical element is **Firefox renderer verification**:
Firefox privacy-sanitizes the unmasked renderer to `Generic Renderer` /
`Microsoft Corporation`, so the raw renderer is read through an **ephemeral,
probe-only** preference (`webgl.sanitize-unmasked-renderer: false`) that never
touches the application-suite Firefox profile. A sanitized string is treated as
**unverifiable** (never hardware). Firefox's probe uses the **same Mesa d3d12
environment** as Chromium with **no ANGLE flags**; in the combined suite Firefox
inherits that Mesa env from the suite process while `PW_CHROMIUM_ARGS` stays
Chromium-scoped — so Firefox needs **no new `playwright.config.ts` hook**.

The canonical SwiftShader serial gate is untouched by construction: no committed
test, no CI file, no default config behavior changes; `playwright.config.ts`'s
`firefox` project prefs (`webgl.force-enabled: true` only) are unchanged. Honest
fallback semantics are preserved: Firefox has no portable software equivalent, so
on exhaustion Chromium keeps its deterministic SwiftShader fallback while Firefox
is **skipped** (never a llvmpipe masquerade); under `E2E_GPU_REQUIRE=1` any
unverified requested engine fails before build/suite.

Three phases isolate the pure engine-aware core (unit-testable, GPU-free) from the
two-engine suite wiring + inertness proof, from the qualification-evidence +
documentation work — so each commit is small, independently testable, and
independently revertible. This lane is additional tooling, **never** the green
gate (arch-critical: Validation Baseline).

Evidence base this plan builds on (no rediscovery needed):
- The feasibility report `firefox-native-gpu-e2e-feasibility.md` (2026-07-21, go
  verdict): headless Firefox under the Mesa d3d12 recipe reaches
  `D3D12 (NVIDIA GeForce RTX 3080)`; without the recipe it is
  `llvmpipe (LLVM 21.1.8, 256 bits)`; the sanitize pref exposes the true string;
  a combined Chromium+Firefox run passed 22/22 in ~3.2 min.
- The #44 lane (`scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`) with its
  injected-probe test pattern, `PW_CHROMIUM_ARGS` hook, and `E2E_ENGINES`
  handling in `playwright.config.ts` (already accepts `chromium,firefox`).

## Success Metrics

Copied from the spec's acceptance scenarios and made implementation-checkable:

- [ ] `npm run test:e2e:gpu` on this WSL2/RTX 3080 host verifies hardware
      renderers **independently** for Chromium (ANGLE D3D12 string) and Firefox
      (raw `D3D12 (NVIDIA GeForce RTX 3080)` via the probe-only pref), both ≠ the
      expanded deny-list, then runs the full `E2E_ENGINES=chromium,firefox` suite
      (22 tests) in one invocation; report shows `mode: hardware`,
      `engines: chromium,firefox`, and both `renderer.chromium`/`renderer.firefox`
      lines with wall-clock (Scenario 1; FR1–FR5, FR10).
- [ ] Firefox's raw probe renderer is collected through
      `webgl.sanitize-unmasked-renderer: false` (probe browser only) and rejects
      known software renderers; a sanitized `Generic Renderer` is treated as
      **unverifiable**, not hardware (FR3).
- [ ] Expanded deny-list rejects at least SwiftShader, llvmpipe, softpipe,
      lavapipe, swrast, generic software rasterizers, and Microsoft Basic Render
      Driver, for both engines' raw strings; the Chromium deny-list is not
      weakened (FR3, Decision 7).
- [ ] `--engine=chromium|firefox|all` selects the probe/suite engine set; `all`
      is default; unknown values are a hard usage error (FR7).
- [ ] Default (`all`) non-strict, not both verify ⇒ Chromium SwiftShader +
      Firefox **skipped** with a loud reason at start and in the report; never a
      Firefox software masquerade (Scenario 2; FR4, Decision 6).
- [ ] `E2E_GPU_REQUIRE=1` with either requested engine unverified ⇒ non-zero exit
      **before** build/suite, with the per-engine log (Scenario 3; FR4/Decision 5).
- [ ] `--engine=firefox` non-strict with no verified hardware (incl.
      `E2E_GPU_FORCE_FALLBACK=1 --engine=firefox`) ⇒ empty engine set is **never**
      passed to Playwright; skip build/suite, report
      `renderer.firefox: skipped (unverified — <reason>)` +
      `suite: skipped (no verified engine)`, exit 0 (Scenario 7; FR4).
- [ ] FR8: ≥3 consecutive full **two-engine** hardware runs under
      `E2E_GPU_REQUIRE=1` (per-test results, both renderer strings, per-run and
      combined wall-clock, `retries: 0`) + one forced-fallback run + a
      contemporaneous baseline recorded in the review; the known Firefox
      background-drag flake dispositioned per Decision 10 (never masked)
      (Scenario 5).
- [ ] FR6: `.github/workflows/validation.yml` and the `validate`/`test:smoke`
      chain absent from the PR diff; `playwright.config.ts` default behavior with
      lane env unset is unchanged (config-load proof), incl. the `firefox` project
      prefs; PR CI green under `E2E_ENGINES=chromium` SwiftShader (Scenario 4).
- [ ] FR9: the README "Opt-in native-GPU e2e lane" section is updated **in place**
      to the two-engine reality (Scenario 6).
- [ ] No dependency/lockfile/toolchain movement; `tests/gpu-lane.test.mjs` green
      with no GPU, no browser, no lane env (arch-critical: reproducibility).

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "engine_aware_core", "title": "Engine-aware core: per-engine probe recipes, Firefox probe + sanitize pref, expanded deny-list, --engine selector, per-engine report, unit tests"},
    {"id": "two_engine_suite_and_inertness", "title": "Two-engine suite wiring, honest fallback + empty-engine-set skip, FR6 default-inert proof"},
    {"id": "qualification_evidence_and_docs", "title": "Firefox-inclusive repeat-run evidence (FR8), flake disposition (Decision 10), README docs (FR9)"}
  ]
}
```

## Phase Breakdown

### Phase 1: `engine_aware_core` — per-engine probe recipes, Firefox probe, expanded deny-list, `--engine` selector, per-engine report, unit tests
**Dependencies**: None

#### Objectives
- Make the lane's pure logic and probe **engine-aware** without changing suite
  wiring yet: introduce a per-engine probe-recipe model, generalize the probe to
  launch Firefox (with the probe-only sanitize pref) as well as Chromium, expand
  the software deny-list, add the `--engine` selector, add the two-engine
  verification-gating decision function, and migrate the report to per-engine
  keys — all runnable standalone via `--probe-only` before the suite wiring
  changes, and fully unit-testable with no GPU/browser/lane env.

#### Deliverables
- [ ] `scripts/e2e-gpu-lane.mjs` — engine-aware core (details below); no new
      dependency, Node built-ins + `@playwright/test` only; no side effects on
      import.
- [ ] `--engine=chromium|firefox|all` parsed by `parseArgs` (default `all`);
      unknown value ⇒ `LaneUsageError`.
- [ ] `--probe-only` probes the **requested engine set** and emits the per-engine
      report.
- [ ] `tests/gpu-lane.test.mjs` migrated to the new report contract and extended
      for the new logic (rides the existing `npm test` glob).

#### Implementation Details

**Per-engine probe-recipe model (engine dimension as data).** Keep the existing
Chromium `CANDIDATES` list (ANGLE flags + Mesa env, iterated by evidence strength)
as the Chromium recipe set. Add a **single Firefox probe recipe** describing:
the same Mesa env (`GALLIUM_DRIVER=d3d12`,
`LD_LIBRARY_PATH=/usr/lib/wsl/lib` prepended), **no ANGLE flags**, WSL2 host
prereqs (reuse `partitionCandidates`' `/dev/dxg` + `/usr/lib/wsl/lib` gating), and
probe-only `firefoxUserPrefs: { "webgl.force-enabled": true,
"webgl.sanitize-unmasked-renderer": false }`. Firefox is not forced into the
Chromium candidate shape (it has prefs, not launch `flags`); instead the
verification layer dispatches per engine to the right recipe/launcher. Chromium's
data and iteration are unchanged (Decision 2).

**Generalized probe.** Extend `probeRenderer` (or add a thin per-engine wrapper
around the shared timeout/transcript/reap machinery) so the launcher is chosen by
engine: Chromium via `chromium.launch({ args, env, ... })` (unchanged); Firefox
via `firefox.launch({ firefoxUserPrefs, env, ... })` from `@playwright/test`. Both
read the raw `UNMASKED_RENDERER_WEBGL` / `UNMASKED_VENDOR_WEBGL` via the existing
`PROBE_PAGE_SCRIPT`. The injected-launcher pattern and the watchdog/late-reap/
bounded-close logic are preserved (they are engine-independent). Transcript
filenames gain the engine so Chromium and Firefox probes don't overwrite each
other (`probe-<engine>-<candidate|firefox>-<mode>.log`).

**Renderer classification (expanded, plus sanitized detection).** Expand
`SOFTWARE_RENDERER_MARKERS` to at least: `swiftshader`, `llvmpipe`, `softpipe`,
`lavapipe`, `swrast`, `software`, `microsoft basic` (Decision 7). Add a distinct
**sanitized/unverifiable** verdict for Firefox: a raw renderer of
`Generic Renderer` (case-insensitive; the sanitized string that appears when the
probe pref did **not** take) classifies as `unverifiable`, **not** `hardware`
(FR3). `classifyRenderer` returns one of `none | software | unverifiable |
hardware`; only `hardware` is trusted. The full raw string is always recorded
verbatim. (Note: the existing `software` marker does not match `softpipe`/
`lavapipe`/`swrast`, so these are genuinely new; and `Generic Renderer` matches
no software marker, which is exactly why the explicit sanitized verdict is
required to avoid a false-hardware pass.)

**Two-engine verification gating (pure decision function).** Given the requested
engine set (`all` ⇒ {chromium, firefox}) and each engine's verdict, decide the run
shape — a pure function, unit-tested:
- All requested engines `hardware` ⇒ `{mode: "hardware", engines: <requested>,
  chromiumCandidate, chromiumRenderer, firefoxRenderer}`.
- Not all verify, **non-strict**, and Chromium is in the requested set ⇒
  `{mode: "software-fallback", engines: ["chromium"], firefox: "skipped:<reason>"}`
  (Chromium SwiftShader; Firefox skipped — Decision 6).
- Not all verify, **non-strict**, Chromium **not** requested (i.e.
  `--engine=firefox`) ⇒ `{mode: "skip-empty", firefox: "skipped:<reason>"}` — the
  empty-engine-set rule (FR4/Scenario 7): no suite is run.
- `E2E_GPU_REQUIRE=1` and any requested engine unverified ⇒ `{mode: "abort"}`
  (exit non-zero before build/suite — Decision 5).
- `E2E_GPU_FORCE_FALLBACK=1`: skip probing. For a set containing Chromium ⇒
  Chromium SwiftShader + Firefox skipped. For `--engine=firefox` alone ⇒
  `skip-empty` (vacuous no-op, exit 0 — FR4), **not** a usage error. The existing
  `FORCE_FALLBACK=1 + REQUIRE=1` contradiction stays a `LaneUsageError`.

**Per-engine report (FR10 migration).** Replace the single `engine: chromium` /
`renderer:` lines with a per-engine contract; keys stable and documented:

```text
=== E2E GPU LANE REPORT ===
mode: hardware | software-fallback | skipped
engines: chromium,firefox
renderer.chromium: <verbatim string | skipped (unverified — <reason>) | (software-fallback — SwiftShader)>
renderer.firefox: <verbatim string | skipped (unverified — <reason>)>
suite: pass | fail (exit n) | skipped (no verified engine)
wall-clock: <total>s (build <n>s, suite <n>s)
```

Only engines in the run's engine set get a `renderer.<engine>` line; a skipped
engine is represented explicitly (never omitted silently). `tests/gpu-lane.test.mjs`
and any report-key consumer are updated to the new contract (the only in-repo
consumer today is the unit test and the README example, updated in Phase 3).

**Unit test targets** (all pure, no browser/GPU/lane env — arch-critical
reproducibility): expanded `classifyRenderer` (softpipe/lavapipe/swrast/swiftshader/
llvmpipe/software/microsoft-basic ⇒ software; `Generic Renderer` ⇒ unverifiable;
proven ANGLE D3D12 and raw `D3D12 (NVIDIA GeForce RTX 3080)` ⇒ hardware;
empty/null ⇒ none); `parseArgs` `--engine` validation (all/chromium/firefox valid,
unknown throws, default `all`); the verification-gating decision function across
all branches above (both-verify, non-strict fallback with/without Chromium in the
set, REQUIRE abort, force-fallback with/without Chromium, empty-set skip); the
per-engine `formatReport` contract (hardware two-engine, fallback, skip-empty);
Firefox recipe host-prereq gating reusing the fake host view. Existing Chromium
tests are preserved or consciously migrated to the new report keys (documented in
the Change Log).

#### Acceptance Criteria
- [ ] `npm test` green (migrated + new cases) with no GPU/browser/lane env.
- [ ] `node scripts/e2e-gpu-lane.mjs --probe-only` on this host reports **both**
      `renderer.chromium` (ANGLE D3D12) and `renderer.firefox`
      (`D3D12 (NVIDIA GeForce RTX 3080)`), both classified hardware.
- [ ] `--probe-only --engine=chromium` and `--engine=firefox` each probe only that
      engine and report it.
- [ ] `--engine=bogus` exits with a usage error (exit 2).
- [ ] `npm run lint` and `npm run typecheck` clean.

#### Test Plan
- **Unit**: as above (this phase's main deliverable).
- **Manual (this host)**: `--probe-only` runs — `all`, `--engine=chromium`,
  `--engine=firefox`; record both raw renderer strings and the Firefox
  sanitized-vs-unsanitized contrast (with the pref off vs on) as evidence.

#### Rollback Strategy
Two files (`scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`); revert the
commit. Suite wiring is unchanged in this phase, so a revert leaves the
Chromium-only lane exactly as #44 shipped.

#### Risks
- **Risk**: Firefox probe pref does not take and the probe reports the sanitized
  `Generic Renderer`.
  - **Mitigation**: FR3 sanitized verdict ⇒ `unverifiable` (a failed verdict with
    the FR11 "hint the probe-only preference" diagnostic), never a false hardware
    pass.
- **Risk**: report-key change breaks the unit test / README consumer.
  - **Mitigation**: contained migration — update `tests/gpu-lane.test.mjs` this
    phase, README in Phase 3; keys documented and stable thereafter.

---

### Phase 2: `two_engine_suite_and_inertness` — two-engine suite wiring, honest fallback + empty-set skip, FR6 default-inert proof
**Dependencies**: Phase 1

#### Objectives
- Turn the engine-aware core into a working end-to-end two-engine lane run and
  prove the canonical gate is untouched (FR1, FR4, FR5, FR6, FR10).

#### Deliverables
- [ ] `scripts/e2e-gpu-lane.mjs` extended: engine-set-aware `suiteEnvFor`, the
      `main()`/`resolveMode` orchestration for two-engine gating, honest fallback,
      REQUIRE abort, and the empty-engine-set skip; per-engine final report.
- [ ] FR6 default-inert evidence recorded in the review draft.
- [ ] `playwright.config.ts`: **no code change expected** (Firefox needs no new
      hook — Decision 9). If any change proves truly necessary it must be
      comment-only and default-inert, proven so; the `firefox` project prefs stay
      `webgl.force-enabled: true` (the probe-only sanitize pref lives only in the
      wrapper).

#### Implementation Details

**Engine-set-aware suite env.** Generalize `suiteEnvFor` to take the run's engine
set and (for hardware) the verified Chromium candidate:
- **Hardware, engine set includes Chromium**: `E2E_ENGINES = <requested set>`
  (e.g. `chromium,firefox`); `PW_CHROMIUM_ARGS = chromiumCandidate.flags.join(" ")`
  (Chromium-scoped, unchanged); inject the Mesa recipe env
  (`composeEnv(baseEnv, chromiumCandidate, extraEnv)`) into the suite process so
  **Firefox inherits the same Mesa env** with no extra wiring (Decision 9).
- **Hardware, `--engine=firefox` only**: `E2E_ENGINES = "firefox"`; **no**
  `PW_CHROMIUM_ARGS`; inject the Firefox recipe's Mesa env directly (same
  GALLIUM_DRIVER + LD_LIBRARY_PATH values) so Firefox reaches the adapter.
- **Software-fallback**: `fallbackEnv(baseEnv)` (strip `PW_CHROMIUM_ARGS`) with
  `E2E_ENGINES = "chromium"` (Firefox is skipped, not run — Decision 6), exactly
  the #44 fallback.
- **skip-empty** (`--engine=firefox`, unverified, non-strict): **no suite is
  spawned at all** — the lane must never invoke `playwright test` with an empty or
  invalid `E2E_ENGINES` (an empty set trips `playwright.config.ts`'s
  `projects.length === 0` guard and throws). Emit the report with
  `suite: skipped (no verified engine)` and exit 0.

`workers`/`retries`/timeouts are never touched (config defaults: `workers: 1`,
local `retries: 0`); the lane runs one build then one `npx playwright test`,
mirroring `test:smoke`. Suite exit code is the lane exit code in every run-mode
except `abort` (exit 1) and `skip-empty` (exit 0).

**Orchestration.** `resolveMode` produces the gating decision (Phase 1 function)
from the requested engine set, controls, and per-engine probe verdicts; `main()`
dispatches: `abort` ⇒ return 1 before build; `skip-empty` ⇒ report + return 0
before build; otherwise build then suite, with the loud fallback banner (start
**and** before the report) whenever an engine is on software/skipped, so a
non-hardware run can never read as two-engine hardware evidence.

**FR6 proof procedure** (recorded verbatim in the review artifact):
1. `git diff main -- playwright.config.ts` — empty, or comment-only (no code
   tokens; the `firefox` project prefs unchanged).
2. `.github/workflows/validation.yml` and the `validate`/`test:smoke` script
   entries absent from `git diff main --stat`.
3. Config-load check with **all lane env unset**: load the resolved config and
   assert the `firefox` project prefs are exactly `{ "webgl.force-enabled": true }`
   (no sanitize pref), Chromium `launchOptions.args` are exactly
   `["--use-angle=swiftshader","--enable-unsafe-swiftshader"]`, `E2E_ENGINES`
   handling / `workers === 1` / `retries === 0` (non-CI) / timeout / reporter /
   webServer shapes are value-equal to `main`. Record output verbatim.
4. PR CI (quality + SwiftShader Chromium shards + gate) green under
   `E2E_ENGINES=chromium` — collected at Review.

#### Acceptance Criteria
- [ ] `npm run test:e2e:gpu` on this host: two-engine hardware mode, full 22-test
      suite in one invocation, per-engine report, exit code = suite result.
- [ ] `E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu`: Chromium SwiftShader +
      Firefox skipped, loud warnings, per-engine software-fallback report.
- [ ] `E2E_GPU_REQUIRE=1` with a forced Firefox miss ⇒ non-zero exit before
      build/suite with the per-engine log.
- [ ] `--engine=firefox` on a non-verifying setup (or with
      `E2E_GPU_FORCE_FALLBACK=1`) ⇒ no `playwright test` spawned, report shows
      `suite: skipped (no verified engine)`, exit 0.
- [ ] FR6 items 1–3 recorded clean; `npm test`/`lint`/`typecheck` green; no
      lockfile diff.

#### Test Plan
- **Unit**: extend `tests/gpu-lane.test.mjs` for the engine-set `suiteEnvFor`
  branches (two-engine env, firefox-only env, fallback env, and that skip-empty
  produces no suite invocation).
- **Integration (manual, this host)**: one two-engine hardware full run; one
  forced-fallback full run; one `--engine=firefox` skip-empty run (feeds Phase 3
  evidence).
- **Gate**: FR6 procedure.

#### Rollback Strategy
Revert the phase commit; suite wiring returns to the Chromium-only Phase 1 state.
Default behavior was never altered (no config code change).

#### Risks
- **Risk**: the Mesa env injected into the suite process perturbs the webServer or
  Chromium arm.
  - **Mitigation**: the #44 lane already injects this exact Mesa env into the
    suite process for the Chromium hardware run with no server interference
    (`/usr/lib/wsl/lib` is GPU libs only); this phase adds Firefox as a consumer of
    the *same* env, not a new env. Any interference is recorded as a lane finding;
    canonical config untouched.
- **Risk**: the combined two-engine suite surfaces the known Firefox background-drag
  flake.
  - **Mitigation**: Decision 10 — recorded as a lane finding and dispositioned in
    Phase 3; never masked with retries, assertion never weakened.

---

### Phase 3: `qualification_evidence_and_docs` — FR8 two-engine evidence, flake disposition, FR9 documentation
**Dependencies**: Phase 2

#### Objectives
- Produce the Firefox-inclusive repeat-run stability evidence that makes the
  two-engine lane trustworthy, disposition the known Firefox flake honestly, and
  update the documentation so the lane is discoverable and interpretable
  (FR8, FR9, Decision 10, Scenarios 5–6).

#### Deliverables
- [ ] **≥3 consecutive full two-engine hardware runs** under `E2E_GPU_REQUIRE=1`
      (each: per-test pass/fail for both projects, both engines' verbatim raw
      renderer strings, per-run and combined wall-clock, `retries: 0`) recorded in
      `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md`, alongside a
      contemporaneous baseline for comparison.
- [ ] One **forced-fallback** full run recorded (Chromium SwiftShader + Firefox
      skipped) — qualifies the fallback path.
- [ ] **Flake disposition (Decision 10)**: the known Firefox background-drag
      synthetic-input flake (`tests/e2e/matrix.spec.ts:224`) is either fixed +
      requalified, **or** explicitly accepted and documented as a local
      qualification flake with its recurrence rate from these runs. Either way it
      is **never** masked with retries and the canonical assertion is never
      weakened. The FR8 two-branch merge gate governs: green, or
      green-except-this-one-documented-flake; any other failure blocks and is
      root-caused first.
- [ ] **README** "Opt-in native-GPU e2e lane" section updated **in place**: the
      two-engine command; the Firefox probe recipe (Mesa env + probe-only prefs)
      and the `webgl.sanitize-unmasked-renderer` rationale (why Chromium's
      deny-list alone is too weak for Firefox); the per-engine report block
      (`renderer.chromium`/`renderer.firefox`); the `--engine=chromium|firefox|all`
      selector in the env/flags table; honest-fallback semantics (Firefox skipped,
      never a software masquerade); the known flake and its disposition; the
      unchanged non-gate status and #41 sequencing note; a link to review 52 for
      the run evidence (as the section currently links #44's review).

#### Implementation Details
Runs use the lane exactly as shipped (no special harness), with
`E2E_GPU_REQUIRE=1` so an unnoticed mid-qualification fallback cannot contaminate
the evidence (FR8). Record a wall-clock comparison: the combined two-engine
hardware runs vs the baseline, and note the feasibility report's ~3.2 min combined
figure as historical context. If the background-drag flake recurs, capture the
verbatim failure (expected vs observed camera delta) and its rate across the runs;
choose and document the Decision-10 disposition explicitly in the review. Do not
edit `tests/e2e/matrix.spec.ts` unless the chosen disposition is a genuine fix
(and if so, requalify with a fresh ≥3-run set).

#### Acceptance Criteria
- [ ] FR8 evidence complete and honest (per-run detail, both renderer strings,
      failures preserved verbatim, no aggregation-only claims); the merge gate is
      satisfied per FR8's two branches.
- [ ] The Firefox flake has an explicit, documented disposition; no retries added,
      no assertion weakened.
- [ ] A developer who never read this spec can find, run, and correctly interpret
      the two-engine lane (hardware vs Chromium-fallback+Firefox-skipped) from the
      README alone (Scenario 6).
- [ ] `npm run validate` green locally on the final tree; clean-worktree proof
      (`git worktree add --detach HEAD` + real `npm ci`) if any gate check is
      polluted only by untracked builder-harness files (lessons-critical).

#### Test Plan
- **Manual/evidence**: the qualification runs themselves.
- **Regression**: full `npm run validate` (SwiftShader, both engines) on the final
  tree before PR.

#### Rollback Strategy
Docs + evidence only (plus any genuine flake fix, which reverts with its commit);
revert restores the pre-doc tree. Lane behavior unchanged by this phase unless a
disclosed fix was made.

#### Risks
- **Risk**: a two-engine hardware run flakes on something other than the known
  background-drag test, breaking "≥3 consecutive".
  - **Mitigation**: FR8 gate — any failure beyond the one known documented flake
    blocks; root-cause it (fix, or qualify as a genuinely new flake), then restart
    the consecutive count. Never trim canonical waits, never hide runs.

## Dependency Map

```
Phase 1 (engine-aware core + probe + deny-list + selector + report + unit tests)
   ↓
Phase 2 (two-engine suite wiring + honest fallback + empty-set skip + FR6 proof)
   ↓
Phase 3 (FR8 two-engine evidence + flake disposition + FR9 README docs)
```

## Resource Requirements

- **Environment**: the pinned toolchain (Node 22.23.1 / npm 10.9.8, `npm ci`);
  this WSL2 host with RTX 3080 for the two-engine hardware evidence; Playwright's
  already-bundled Firefox (no new dependency, service, or infrastructure).
- **Files touched (whole project)**: `scripts/e2e-gpu-lane.mjs`,
  `tests/gpu-lane.test.mjs`, `README.md`,
  `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md`,
  `codev/state/spir-52_thread.md`. `playwright.config.ts` only if a comment-only,
  proven-inert change proves necessary (not expected). `package.json` unchanged
  (the `test:e2e:gpu` script already exists).

## Integration Points

- **Internal**: the `PW_CHROMIUM_ARGS` hook (Chromium-scoped, unchanged); the
  `firefox` Playwright project and `E2E_ENGINES` handling in `playwright.config.ts`
  (already accepts `chromium,firefox`); the `webServer` production-server flow via
  `playwright test`; the #44 wrapper's injected-probe test pattern.
- **External systems**: none (explicitly — the #42 lesson).

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Firefox sanitized `Generic Renderer` mistaken for hardware | M | H | FR3 `unverifiable` verdict tied to the probe-only sanitize pref; sanitized ⇒ failed verdict, never hardware |
| Firefox background-drag synthetic-input flake recurs on hardware | M | M | Decision 10 + FR8 two-branch gate: fix/qualify or accept+document; never masked with retries or by weakening the assertion |
| Report-key change breaks a consumer/unit test | M | M | FR10 contained migration in Phase 1 (test) + Phase 3 (README); stable documented keys |
| Probe-only Firefox pref leaks into the suite profile | L | H | Pref confined to the ephemeral probe launch; suite `firefox` project prefs unchanged (FR6 config-load proof) |
| Config drift endangers the canonical gate | L | H | Firefox needs no new config hook (Decision 9); FR6 default-inert proof + CI green |
| Two-engine wrapper duplicates suite-invocation logic | L | M | Delegate over duplicate; engine set is data; one build + one `playwright test` |
| Mesa env in the suite process perturbs Firefox/server | L | M | Same env #44 already injects for Chromium; Firefox is a new consumer of the same env; findings recorded, config untouched |

## Validation Checkpoints

1. **After Phase 1**: `npm test` green with zero lane env/GPU; `--probe-only`
   reports both engines' hardware renderers on this host; `--engine` selector and
   sanitized-verdict behavior verified.
2. **After Phase 2**: one two-engine hardware full run + one forced-fallback run +
   one `--engine=firefox` skip-empty run behave per spec with correct reports/exit
   codes; FR6 items 1–3 evidence recorded.
3. **Before PR**: FR8 two-engine evidence complete and gate satisfied; flake
   dispositioned; README updated; `npm run validate` green (clean worktree if
   needed); no lockfile diff; `.github/workflows/validation.yml` absent from the
   diff.

## Monitoring and Observability

Terminal-only tooling: per-engine/per-candidate FR11 diagnostics as they happen, a
pre-report diagnostics summary, and the FR10 per-engine greppable report (the
artifact future #41 qualification cites). No persistent telemetry.

## Documentation Updates Required

- [ ] README "Opt-in native-GPU e2e lane" section — updated in place (FR9, Phase 3).
- [ ] Review artifact with FR6/FR8 evidence and the flake disposition (Phase 2–3).
- [ ] `playwright.config.ts` hook comment — only if a comment touch proves needed
      (not expected).

## Post-Implementation Tasks

- [ ] #41 may consume the two-engine FR8 evidence and lane for its parallel-workers
      qualification (out of scope here; `workers: 1` everywhere).
- [ ] Possible future arch.md/lessons update at MAINTAIN time (not this PR unless
      the Review phase directs it).

## Expert Review

**Date**: (pending — porch runs 3-way consultation on this plan draft)
**Model**: Gemini, Codex, Claude
**Key Feedback**: (to be recorded after consultation)

**Plan Adjustments**: (to be recorded after consultation)

## Approval

SPIR: `plan-approval` is a human gate (after 3-way consultation). PR gate remains
human-approved.

## Change Log

| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-21 | Initial implementation plan | Draft from approved spec 52 | Builder spir-52 |

## Notes

- Names fixed by this plan: engine selector `--engine=chromium|firefox|all`
  (default `all`); the existing env controls (`E2E_GPU_FORCE_FALLBACK=1`,
  `E2E_GPU_REQUIRE=1`), script name `scripts/e2e-gpu-lane.mjs`, and npm script
  `test:e2e:gpu` are unchanged.
- The engine dimension is expressed as **data** (Chromium candidate list + a single
  Firefox probe recipe) with per-engine launcher dispatch — not scattered
  `if (engine === "firefox")` branches (spec NFR Maintainability).
- The probe-only Firefox pref `webgl.sanitize-unmasked-renderer: false` lives
  **only** in the ephemeral probe launch inside the wrapper; the committed
  `firefox` project keeps `webgl.force-enabled: true` only (Decision 3, FR6).
- No committed file may read the lane env/`--engine` selector except the wrapper;
  `playwright.config.ts` continues to read only `PW_CHROMIUM_ARGS` and
  `E2E_ENGINES` (already-merged behavior).
