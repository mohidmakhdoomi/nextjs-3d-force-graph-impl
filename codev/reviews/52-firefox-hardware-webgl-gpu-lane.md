# Review 52: Add Firefox Hardware WebGL to the Native-GPU Local E2E Lane

## Metadata
- **Spec**: [codev/specs/52-firefox-hardware-webgl-gpu-lane.md](../specs/52-firefox-hardware-webgl-gpu-lane.md)
- **Plan**: [codev/plans/52-firefox-hardware-webgl-gpu-lane.md](../plans/52-firefox-hardware-webgl-gpu-lane.md)
- **Status**: complete (all three implement phases; FR6 proof, FR8 two-engine
  hardware evidence, flake disposition, README, and the clean-checkout gate proof
  recorded)
- **Follows**: [Review 44](./44-add-an-opt-in-native-gpu-local.md) (the Chromium-only lane this generalizes)

## Summary

Generalizes the opt-in native-GPU local e2e lane (`npm run test:e2e:gpu`,
`scripts/e2e-gpu-lane.mjs`) from Chromium-only to a two-engine Chromium+Firefox
lane. The engine dimension is expressed as **data** (the Chromium `CANDIDATES`
matrix + a single `FIREFOX_PROBE_RECIPE`) with per-engine launcher dispatch, not
scattered `if (engine === "firefox")` branches. The lane probes and independently
verifies a hardware renderer for each requested engine, then runs one combined
`E2E_ENGINES=chromium,firefox` Playwright suite (one build, one invocation,
`workers: 1`, `retries: 0`) and ends with a per-engine machine-greppable report.

The one genuinely new element is **Firefox renderer verification**: Firefox
privacy-sanitizes the unmasked renderer to `Generic Renderer`, so the raw
renderer is read through an ephemeral, probe-only preference
(`webgl.sanitize-unmasked-renderer: false`) that never touches the
application-suite Firefox profile. A sanitized string is classified
`unverifiable` (never hardware).

The lane is additional tooling, **never** the green gate: `npm run validate`,
`.github/workflows/validation.yml`, `test:smoke`, Playwright browser defaults,
`workers`, `retries`, and every committed test's timing/assertions are unchanged.
CI stays `E2E_ENGINES=chromium` SwiftShader-only.

## Firefox renderer sanitization — the load-bearing contrast

Collected 2026-07-21 on the qualification host (WSL2, NVIDIA GeForce RTX 3080,
Mesa d3d12). Same Firefox binary, same Mesa env, prefs the only difference:

| Firefox probe prefs | Raw `UNMASKED_RENDERER_WEBGL` | classifyRenderer |
|---|---|---|
| `webgl.force-enabled: true` only (sanitize left at Firefox default) | `Generic Renderer` | `unverifiable` |
| `+ webgl.sanitize-unmasked-renderer: false` (probe recipe) | `D3D12 (NVIDIA GeForce RTX 3080)` | `hardware` |

This is exactly why Chromium's deny-list alone is too weak for Firefox:
`Generic Renderer` matches no software marker, so without the explicit
`unverifiable` verdict it would **false-pass as hardware**. The probe-only pref
is what makes an honest Firefox hardware verdict possible.

## FR6 — Canonical gate provably untouched (plan phase: two_engine_suite_and_inertness)

Collected 2026-07-21 against `main`:

1. `git diff main -- playwright.config.ts` — **empty** (byte-identical to `main`;
   the Firefox arm needs no new config hook — Decision 9). The `firefox` project's
   committed prefs remain `webgl.force-enabled: true` only; the probe-only
   sanitize pref lives solely in the wrapper's `FIREFOX_PROBE_RECIPE`.
2. `.github/workflows/validation.yml`, `package.json`, `package-lock.json`,
   `.nvmrc` — absent from `git diff main --stat` entirely. No dependency,
   lockfile, or `validate`/`test:smoke`/`test:e2e:gpu` script delta. The only
   code files changed are `scripts/e2e-gpu-lane.mjs` and `tests/gpu-lane.test.mjs`.
3. Config-load with all lane env unset (`E2E_ENGINES`, `PW_CHROMIUM_ARGS`,
   `E2E_GPU_*` unset), via `npx playwright test --list`:
   - Projects resolved: `[chromium]` and `[firefox]` (both present).
   - 22 tests listed (11 per engine) — the default two-engine matrix is intact.
   - Because `playwright.config.ts` is byte-identical to `main` (item 1), every
     other default-behavior assertion (chromium SwiftShader args,
     `workers: 1`, `retries: 0` non-CI, timeout, reporter, webServer) holds by
     construction — there is no changed line to perturb them.
4. PR CI green under `E2E_ENGINES=chromium` SwiftShader — pending, recorded at the
   Review phase.

## Phase 2 verification — two-engine suite wiring, honest fallback, empty-set skip

Behavioral confirmation on the qualification host (2026-07-21), before the FR8
qualification set:

- **Two-engine hardware run** (`E2E_GPU_REQUIRE=1 npm run test:e2e:gpu`): both
  engines verified (`renderer.chromium: ANGLE (Microsoft Corporation, D3D12
  (NVIDIA GeForce RTX 3080), OpenGL 4.6)`, `renderer.firefox: D3D12 (NVIDIA
  GeForce RTX 3080)`); full 22-test suite in one Playwright invocation;
  `mode: hardware`, `suite: pass`, `wall-clock: 208s (build 10s, suite 196s)`,
  lane exit 0. (Recorded as HW-1 in the FR8 table below.)
- **Forced fallback** (`E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu`): loud
  SOFTWARE-FALLBACK banner at start and before the report; report shows
  `mode: software-fallback`, `renderer.chromium: (software-fallback —
  SwiftShader)`, `renderer.firefox: skipped (unverified — forced fallback,
  Firefox has no software equivalent)`. The suite ran `[chromium]` tests only
  (`E2E_ENGINES=chromium`; Firefox excluded, never an llvmpipe masquerade) —
  confirmed via the per-test `[chromium]` lines. A completed forced-fallback run
  is recorded as FB-1 below.
- **REQUIRE abort** (`E2E_GPU_REQUIRE=1`, a requested engine forced to miss via
  `--engine=chromium --candidate=native-linux-angle-gl`, skipped on WSL2): the
  lane logged `not every requested engine verified hardware (unverified:
  chromium); exiting non-zero before build/suite`, lane exit 1, no build/suite —
  Decision 5.
- **Empty-set skip / Scenario 7** (`E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu
  -- --engine=firefox`): no Playwright invoked (no empty `E2E_ENGINES` crash),
  report `renderer.firefox: skipped (unverified — forced fallback, Firefox has no
  software equivalent)` + `suite: skipped (no verified engine)`, lane exit 0.

## FR8 — Firefox-inclusive repeat-run stability evidence (plan phase: qualification_evidence_and_docs)

Host: WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2), NVIDIA GeForce RTX 3080,
Mesa d3d12 Gallium; Node 22.23.1 / npm 10.9.8; `workers: 1`, `retries: 0` (config
local defaults, untouched); full 22-test two-engine suite (11 Chromium + 11
Firefox) unless noted. Every hardware run asserted **both** raw renderer strings,
identical across all runs:
- `renderer.chromium: ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`
- `renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)`

Q-1..Q-3 are **three consecutive** full two-engine hardware runs under
`E2E_GPU_REQUIRE=1` (so an unnoticed mid-qualification fallback was impossible);
HW-1 is the Phase 2 wiring-confirmation hardware run (same config); FB-1 is the
forced-fallback baseline.

| Run | Date | Mode | Result | Suite | Total | Lane exit |
|---|---|---|---|---|---|---|
| HW-1 | 2026-07-21 | hardware (`E2E_GPU_REQUIRE=1`) | 22/22 pass | 196 s | 208 s (build 10 s) | 0 |
| Q-1 | 2026-07-21 | hardware (`E2E_GPU_REQUIRE=1`) | 22/22 pass | 196 s | 208 s (build 9 s) | 0 |
| Q-2 | 2026-07-21 | hardware (`E2E_GPU_REQUIRE=1`) | 22/22 pass | 198 s | 210 s (build 10 s) | 0 |
| Q-3 | 2026-07-21 | hardware (`E2E_GPU_REQUIRE=1`) | 22/22 pass | 196 s | 208 s (build 9 s) | 0 |
| FB-1 | 2026-07-22 | software-fallback (`E2E_GPU_FORCE_FALLBACK=1`) | 11/11 pass (Chromium only; Firefox skipped) | 582 s | 591 s (build 10 s) | 0 |

Per-test durations for the **Firefox** arm (the new engine) across the three
consecutive qualification runs (all pass; seconds):

| Firefox test | Q-1 | Q-2 | Q-3 |
|---|---|---|---|
| matrix:75 settles an initial force layout | 2.9 | 2.9 | 3.2 |
| matrix:104 rotates automatically until paused, then resumes | 8.1 | 8.2 | 7.9 |
| matrix:134 pointer inert until enable delay | 7.5 | 7.5 | 7.4 |
| matrix:194 zooms out with the wheel | 9.0 | 9.1 | 9.0 |
| **matrix:224 zooms in + background-drag rotate** (the known flake) | **13.2** | **13.3** | **13.2** |
| matrix:269 click-to-focus + reset | 18.1 | 17.9 | 18.2 |
| matrix:433 AxesHelper toggle | 4.8 | 4.6 | 4.7 |
| matrix:466 canvas consistent across resize | 4.3 | 4.3 | 4.4 |
| matrix:527 remounts fresh canvas on re-navigation | 2.9 | 2.9 | 2.9 |
| right-click-release:174 releases fx/fy/fz | 20.7 | 20.5 | 20.6 |
| smoke:78 renders graph + core controls | 8.9 | 8.8 | 8.6 |

The Chromium arm ran 11/11 in every run with per-test durations consistent with
Review 44's hardware tables (2–18 s per test).

**Findings**: no instability — the per-test wall-clock spread across the three
consecutive Firefox runs is ≤ 0.3 s on every test (the widest is matrix:75 at
2.9→3.2 s); zero flakes at `retries: 0`; both engines' renderer strings asserted
and identical every run. Including HW-1, the lane is **4-for-4 full two-engine
hardware passes** (88/88 individual test executions). Combined two-engine
wall-clock is ≈ 196–198 s of suite time (≈ 208–210 s incl. build), against the
feasibility report's ~3.2 min combined figure as historical context.

**Baseline comparison (contemporaneous, same host/session)**: FB-1's Chromium-only
SwiftShader path ran **11 tests in 582 s** (≈ 53 s/test); the two-engine hardware
lane ran **22 tests in ≈ 196 s** (≈ 9 s/test) — the hardware lane runs **twice the
tests (both engines) in about a third of the wall-clock**, i.e. the per-test
software→hardware speedup is ≈ 6× (consistent with Review 44's 6.1× Chromium
figure). FB-1 also qualifies Scenario 2: loud `SOFTWARE FALLBACK` banner at start
and before the report, `E2E_ENGINES=chromium` (Firefox excluded, never an
llvmpipe masquerade), suite exit semantics preserved (exit 0).

**FR8 verdict — branch (a) satisfied**: ≥ 3 consecutive **fully-green** two-engine
hardware runs (Q-1..Q-3) recorded with asserted renderers, per-test results,
wall-clocks, and `retries: 0`, plus the contemporaneous forced-fallback baseline
(FB-1, 582 s Chromium SwiftShader). No green-except-flake exception was needed —
the runs are fully green.

## Flaky Tests

**`[firefox] tests/e2e/matrix.spec.ts:224` "zooms in with the wheel and rotates
with a background drag" — disposition (Decision 10): explicitly accepted and
documented as a pre-existing local qualification flake; NOT observed in this
qualification set.**

- **Recurrence rate in this session: 0 / 4 hardware runs** (HW-1, Q-1, Q-2, Q-3 —
  the Firefox arm of matrix:224 passed all four, at a rock-steady 13.2–13.3 s).
  Historically it recurred once in three full Firefox hardware runs in the
  feasibility investigation (`firefox-native-gpu-e2e-feasibility.md`) and once in
  PR #50's two local Firefox runs.
- **Class**: Firefox synthetic-input-delivery nondeterminism, **not** a
  software-WebGL timing problem — it survives on hardware (hence hardware
  rendering did not eliminate it), and it passes when repeated alone. This is the
  documented Firefox local-arm input-race family (issues #11/#33, and Review 44's
  Flaky Tests note for the same test).
- **Disposition**: accepted + documented (Decision 10 permits fix/qualify
  separately **or** explicit accept+document). A code fix to the canonical
  `tests/e2e/matrix.spec.ts` is **out of scope** here (spec Decision 10 makes it
  optional; the spec forbids weakening the canonical assertion as part of this
  lane work). It is **not masked**: the lane runs `retries: 0`, the canonical
  assertion (camera azimuth delta > 1) is unchanged, and no test is skipped. If it
  recurs on future local qualification runs, file a dedicated issue in the #33
  family rather than retuning inside unrelated work.

The FR8 two-branch merge gate is satisfied by branch (a) (fully green); this
disposition documents the known flake for completeness and future triage, not
because it blocked the gate.

## Spec compliance (acceptance criteria)

- **FR1–FR5, FR10** — `npm run test:e2e:gpu` verifies hardware renderers
  independently for Chromium and Firefox, then runs one combined
  `E2E_ENGINES=chromium,firefox` 22-test suite; engine-aware per-engine report
  (Scenario 1). ✓ (HW-1, Q-1..Q-3)
- **FR3** — Firefox raw renderer read through the probe-only sanitize pref; the
  sanitized `Generic Renderer` is `unverifiable`, never hardware; deny-list rejects
  swiftshader/llvmpipe/softpipe/lavapipe/swrast/software/microsoft-basic. ✓
- **FR4 / Decisions 5–6** — non-strict, not-both-verify ⇒ Chromium SwiftShader +
  Firefox skipped (Scenario 2); `E2E_GPU_REQUIRE=1` ⇒ abort before build/suite if
  either engine unverified (Scenario 3); `--engine=firefox` non-strict/no-hardware
  ⇒ empty-set skip, exit 0 (Scenario 7). ✓
- **FR6 / Scenario 4** — canonical gate untouched (config byte-identical; no
  validation.yml/package.json/lockfile delta; both projects load by default). ✓
- **FR7** — `--engine=chromium|firefox|all` (default all); unknown ⇒ usage error
  (exit 2). ✓
- **FR8 / Scenario 5** — ≥3 consecutive fully-green two-engine hardware runs +
  forced-fallback baseline recorded; flake dispositioned (Decision 10). ✓
- **FR9 / Scenario 6** — README "Opt-in native-GPU e2e lane" section updated in
  place (two-engine command, Firefox recipe + sanitize-pref rationale, per-engine
  report, `--engine` selector, honest fallback, known flake). ✓
- **Reproducibility** — no dependency/lockfile/toolchain movement; unit tests
  GPU-free/browser-free/lane-env-free. ✓

## Lessons Learned

- **The four-verdict classifier is the crux of honest Firefox verification.**
  Firefox's sanitized `Generic Renderer` matches no software marker, so a
  three-way (`none`/`software`/`hardware`) classifier would have *false-passed* it
  as hardware. The explicit `unverifiable` verdict tied to the probe-only pref is
  what makes an honest verdict possible — and the load-bearing contrast (pref off
  ⇒ `Generic Renderer`, pref on ⇒ `D3D12 (…)`) proves the pref is doing real work,
  not cargo-culted.
- **Engine dimension as data paid off.** Keeping Chromium's `CANDIDATES` matrix and
  adding one `FIREFOX_PROBE_RECIPE` with per-engine launcher dispatch (Firefox gets
  `firefoxUserPrefs`, Chromium gets `args`) kept the diff a superset of #44 with no
  scattered `if (engine === "firefox")` branches, and let `partitionCandidates` /
  the watchdog/reap machinery be reused verbatim.
- **A run-level field beats an engine-specific one for cross-engine decisions.** The
  iteration-1 Codex catch — `headed` derived from a Chromium-only field silently
  ran a Firefox-only `--mode=headed` suite headless — is the general lesson: when a
  decision spans the engine set, carry it at the run level (`plan.effectiveMode` +
  `isHeadedRun`), not on one engine's slice.
- **Firefox hardware did not fix the synthetic-input flake, and that's fine.** The
  background-drag flake is input-delivery nondeterminism, not a rendering-speed
  problem; the honest move was to qualify it (0/4 here) and document it, not to
  paper over it with retries.

## Architecture Updates

Routed to the **cold** `codev/resources/arch.md` (reference detail; the hot
`arch-critical.md` cap and map are untouched — the "`npm run validate` is the
green gate" invariant already governs this lane, and no new top-level arch.md
section was added):

- The **Validation Baseline** native-GPU-lane paragraph (added by spec 44) was
  updated **in place** to the two-engine reality: per-engine probe + the expanded
  software deny-list, `E2E_ENGINES=chromium,firefox` in one invocation, Firefox's
  Mesa-env inheritance with no `playwright.config.ts` hook, the probe-only
  `webgl.sanitize-unmasked-renderer:false` read + the `unverifiable` verdict, the
  `--engine=chromium|firefox|all` selector, the honest Firefox-skip fallback,
  CI-stays-Chromium, and a pointer to this review.

## Lessons Learned Updates

Routed to the **cold** `codev/resources/lessons-learned.md` under the existing
**Validation Evidence** section (no new top-level section, so the hot
`lessons-critical.md` map stays accurate; hot tier untouched):

- A privacy-sanitized capability string defeats a known-bad deny-list (it passes
  and false-reads as good) — read the raw value through the un-sanitizing path (a
  probe-only preference confined to the ephemeral probe browser) and classify the
  sanitized string as explicitly *unverifiable*, distinct from hardware and
  known-software.

## Consultation Feedback

- **Plan phase `engine_aware_core`** (impl consult, iteration 1): Gemini APPROVE,
  Codex APPROVE, Claude APPROVE — unanimous, KEY_ISSUES: None. Reviewers confirmed
  the four-verdict `classifyRenderer`, the expanded deny-list, the `unverifiable`
  safety catch, the FR11 sanitized-renderer diagnostic (probe-pref hint, not the
  Mesa hint), the engine-as-data model, probe isolation (the sanitize pref never
  in the committed config), and correct phase scoping (no Phase 2/3 work pulled
  forward).
- **Plan phase `two_engine_suite_and_inertness`**: iteration 1 — Gemini APPROVE,
  Claude APPROVE, Codex REQUEST_CHANGES (the Firefox-only headed suite-dispatch
  bug above). Fixed with a run-level `plan.effectiveMode` + exported
  `isHeadedRun(plan)` and a dedicated Firefox-only-headed test. Iteration 2 —
  unanimous APPROVE, KEY_ISSUES: None.
- **Review phase (PR consult)**: iteration 1 — Gemini APPROVE, Claude APPROVE,
  Codex REQUEST_CHANGES. Codex caught a per-engine reporting-honesty bug: when
  Chromium fails verification but **Firefox verifies hardware**, the non-strict
  fallback reported `renderer.firefox: skipped (unverified — unverified)` — Firefox
  was verified, so labeling it "unverified" is wrong. Fixed with a distinct
  `not-run` verdict state (`renderer.firefox: not run (Chromium unverified — a
  two-engine hardware run needs both engines…)`), with a unit test; all other skip
  outputs (genuinely-unverified, forced-fallback) are unchanged. Also: plan Status
  `draft → completed`. Codex's third point (`tests/audit-report.test.mjs` failing)
  is a Codex-sandbox environment artifact — that test shells out to `npm audit`
  (with a `registry unavailable` case), is untouched by this branch, and passes
  95/95 on the qualification host and on porch's own `tests` gate.

## Canonical gate proof on a clean checkout

The worktree's `npm run lint` is polluted by an untracked builder-harness file
(`.claude/hooks/worktree-write-guard.cjs` — 21 errors, absent from clean
checkouts), so per the hot lesson the full `npm run validate` gate is proven on a
detached clean worktree (`git worktree add --detach <dir> HEAD` at commit
`54d836d` + real `npm ci`, npm 10.9.8 / Node 22.23.1). The clean worktree contains
**no** `.claude/hooks/` (confirmed), so the lint pollution is gone.

- **Run 1**: `npm ci` exit 0; **lint ✓, typecheck ✓, build ✓**; local `test:smoke`
  runs BOTH engines in **software** (Chromium SwiftShader + Firefox llvmpipe — no
  GPU env in `validate`) → e2e **21/22**, the single failure being
  `[firefox] tests/e2e/matrix.spec.ts:224` (the known background-drag flake, here
  under software llvmpipe where the input-race is most likely). `VALIDATE EXIT: 1`.
- **Run 2** (same clean worktree, no changes): **lint ✓, typecheck ✓, build ✓,
  e2e 22/22** (both engines green; `[firefox] tests/e2e/matrix.spec.ts:224` passed
  at 12.9 s). `VALIDATE EXIT: 0`. The flake is intermittent — it passes on re-run,
  exactly as Review 44 recorded for the same test on its clean-checkout Run 2.

The lint-pollution proof (the reason this clean-checkout run exists) is
**satisfied by Run 1**: lint is clean (0 errors) once the untracked harness file
is absent, and typecheck/build pass. The lone e2e failure is the pre-existing,
documented Firefox software-input flake (see Flaky Tests) — **not** introduced by
this branch, which contains zero `tests/e2e/**`, `app/**`, or
`playwright.config.ts` changes (`git diff main..HEAD -- tests/e2e app
playwright.config.ts` is empty) and never invokes the lane script from `validate`.

## Follow-up Items

- **#41 (local e2e parallelization)**: may consume this two-engine lane and its
  FR8 evidence to qualify `workers > 1`; out of scope here (`workers: 1`
  everywhere).
- Recipe drift watch: the evidence is dated 2026-07 (Mesa d3d12, NVIDIA RTX 3080,
  WSL2); the recipe is documented as evidence-dated, not guaranteed across
  host/driver changes.

_This review is completed in plan phase `qualification_evidence_and_docs` (FR8
qualification set, flake disposition, lessons learned, and the clean-checkout
`npm run validate` proof)._
