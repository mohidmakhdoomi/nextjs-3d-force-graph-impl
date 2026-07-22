# spir-52 thread — Firefox hardware WebGL e2e lane (issue #52)

Builder for spec #52: generalize the opt-in native-GPU local e2e lane
(`scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`) from Chromium-only to a
two-engine Chromium+Firefox lane. Strict mode (porch-driven). Follow-up to #44 / PR #50.

## Log

### Specify phase (iteration 1)
- Spawned in strict mode at `specify` phase. A comprehensive spec already exists
  (committed `f1f9424`): `codev/specs/52-firefox-hardware-webgl-gpu-lane.md`.
- Reviewed the spec against the actual code — "Current state" claims verified accurate:
  - `SOFTWARE_RENDERER_MARKERS = ["swiftshader","llvmpipe","software","microsoft basic"]`
    (spec calls for expanding to also cover softpipe/lavapipe/swrast + MS Basic Render Driver).
  - `formatReport()` hardcodes `engine: chromium` + single `renderer:` line.
  - `suiteEnvFor()` pins `E2E_ENGINES = "chromium"`.
  - `parseArgs()` has `--probe-only/--mode/--candidate/--channel`, no engine selector.
  - `playwright.config.ts` firefox project sets only `webgl.force-enabled: true`; honors E2E_ENGINES.
- Spec faithfully carries issue #52 Baked Decisions into "Confirmed Decisions" (12 items).
- Feasibility report `firefox-native-gpu-e2e-feasibility.md` is tracked (committed with spec).
- Only untracked files are builder-harness noise (`.builder-*`, `.claude/hooks/`) — env, not project.
- Assessment: spec is thorough and accurate; no rewrite needed. Signalling `porch done 52`
  to trigger the 3-way consultation (Gemini/Codex/Claude).

### Specify — consultation iter1 results + spec revision
- Verdicts: Gemini APPROVE (HIGH), Claude APPROVE (HIGH), Codex REQUEST_CHANGES (HIGH).
  All three verified codebase claims accurate; approach feasible; no architecture or
  Baked-Decision changes. All feedback = edge-behavior clarification. Incorporated:
  1. FR4: single-engine `--engine=firefox` non-strict + no hardware → empty engine set
     would crash `playwright.config.ts` (Gemini). Now: skip build/suite, report Firefox
     skipped + `suite: skipped (no verified engine)`, exit 0; REQUIRE=1 → exit non-zero.
     Added Scenario 7.
  2. FR4: vacuous `FORCE_FALLBACK=1 --engine=firefox` (Claude) → honest no-op skip, NOT
     a usage error.
  3. FR8: explicit two-branch merge gate — 3 green runs OR green-except-known-documented
     flake per Decision 10 (Codex). Any other failure blocks.
  4. FR9: named concrete doc target = README "Opt-in native-GPU e2e lane" section,
     updated in place; evidence in review 52 (Codex).
  Added Consultation Log section (SPIR requirement).
- Committed "[Spec 52] Specification with multi-agent review" (3923c2b).
- Wrote rebuttal (52-specify-iter1-rebuttals.md): all feedback accepted, no disagreements.
- `porch done 52` → **GATE: spec-approval reached**. Requested via `porch gate 52`,
  notified architect via `afx send`. STOPPED, waiting for human `porch approve 52 spec-approval`.
  (Strict mode: builder does NOT call porch approve.)

### Plan phase (iteration 1)
- Architect APPROVED spec-approval gate (verified empty-engine-set rule against
  playwright.config.ts projects.length===0 guard; no architecture concerns). Advanced to plan.
- Read #44 plan for the established decomposition style. Wrote 3-phase plan
  (`codev/plans/52-firefox-hardware-webgl-gpu-lane.md`):
  1. `engine_aware_core` — per-engine probe recipes (Chromium CANDIDATES + single
     Firefox recipe), generalized probe w/ firefox.launch + probe-only sanitize pref,
     expanded deny-list (softpipe/lavapipe/swrast + sanitized `Generic Renderer` →
     unverifiable verdict), `--engine` selector, two-engine verification-gating pure fn,
     per-engine report (renderer.chromium/renderer.firefox), unit tests. Files:
     scripts/e2e-gpu-lane.mjs + tests/gpu-lane.test.mjs.
  2. `two_engine_suite_and_inertness` — engine-set-aware suiteEnvFor (Mesa env into
     suite process, Firefox inherits it; PW_CHROMIUM_ARGS Chromium-only; empty set →
     skip, never pass empty E2E_ENGINES), honest fallback, REQUIRE abort, empty-set
     skip, FR6 default-inert proof (config-load, firefox prefs unchanged).
  3. `qualification_evidence_and_docs` — ≥3 two-engine hardware runs, flake disposition
     (Decision 10), README section updated in place (FR9).
- Key design: engine dimension as DATA + per-engine launcher dispatch (not scattered
  if(firefox) branches). Firefox recipe = same Mesa env, no ANGLE flags. Probe-only
  sanitize pref stays in wrapper; committed firefox project keeps webgl.force-enabled only.
- porch checks pass (plan_exists, has_phases_json, min_two_phases=3).
- Committed "[Spec 52] Initial implementation plan" (e2aa5ca); ran `porch done 52` → consult.

### Plan — consultation iter1 results + revision
- Verdicts: Gemini APPROVE (HIGH), Claude APPROVE (HIGH), Codex COMMENT (HIGH). No blockers,
  no architecture concerns; all verified codebase claims + complete FR/Decision/Scenario coverage.
  Incorporated 3 non-blocking refinements into Phase 1:
  1. Explicit `failureDiagnostic` `unverifiable` branch → Firefox Generic Renderer emits the
     probe-preference hint, not the software/Mesa hint (Claude + Codex1).
  2. Required FR11 diagnostic unit coverage (sanitized hint, engine-named crash/timeout,
     engine-tagged transcripts) (Codex1).
  3. Regression guard: existing Chromium `--mode`/`--candidate`/`--channel` surface + all its
     tests stay green (only report-key assertions updated); any other red = regression (Codex2).
  Updated Expert Review + Change Log sections.
- Committed "[Spec 52] Plan with multi-agent review" (665fd9b).
- `porch done 52` (checks pass) → **GATE: plan-approval reached** (no rebuttal — no
  REQUEST_CHANGES). Requested via `porch gate 52`, notified architect. STOPPED, waiting
  for human `porch approve 52 plan-approval`. (Strict mode: builder does NOT approve.)

### Implement — Phase 1 `engine_aware_core` (iteration 1)
- plan-approval gate APPROVED by architect; `porch next` advanced to implement /
  plan phase `engine_aware_core`.
- Scope (Phase 1 only): engine-aware core in `scripts/e2e-gpu-lane.mjs` +
  `tests/gpu-lane.test.mjs`. NO two-engine suite wiring (that's Phase 2).
- Design decisions:
  - Engine dimension as DATA: keep Chromium `CANDIDATES`; add single
    `FIREFOX_PROBE_RECIPE` (Mesa env, no ANGLE flags, probe-only prefs
    webgl.force-enabled + webgl.sanitize-unmasked-renderer:false).
  - `classifyRenderer` now returns none|software|unverifiable|hardware;
    "Generic Renderer" ⇒ unverifiable (Firefox sanitized). Deny-list expanded
    with softpipe/lavapipe/swrast.
  - `probeRenderer` engine-aware (launcher dispatch chromium|firefox; firefox
    passes firefoxUserPrefs not args); transcripts gain engine prefix
    (probe-<engine>-<id>-<mode>.log).
  - `computeRunPlan` = pure two-engine gating fn (hardware / software-fallback /
    skip-empty / abort) — fully unit-tested, consumed by --probe-only now and by
    the full lane in Phase 2.
  - `formatReport` migrated to per-engine keys (engines:, renderer.<engine>:).
  - `--engine=chromium|firefox|all` added to parseArgs (default all).
  - Phase 1 transitional: full-lane suite path stays #44 Chromium-only (uses
    computeRunPlan for ["chromium"]); engine-aware probe exercised via
    --probe-only. Phase 2 generalizes suiteEnvFor + main to the requested set.

### Phase 1 — build/verify results (on-host, WSL2 RTX 3080)
- `npm run build` ✓; `npm test` ✓ (90 tests, incl. 51 gpu-lane: 0 fail);
  `npm run typecheck` clean; `npx eslint scripts/e2e-gpu-lane.mjs
  tests/gpu-lane.test.mjs` clean (exit 0). The 21 `npm run lint` errors are ALL
  in untracked `.claude/hooks/worktree-write-guard.cjs` (builder-harness file,
  absent from clean checkouts) — environment noise per lessons-critical, not a
  project failure. Full clean-worktree `npm run validate` proof deferred to Phase 3.
- Manual `--probe-only` on this host (Phase 1 acceptance):
  - `all`: mode hardware; renderer.chromium=`ANGLE (Microsoft Corporation, D3D12
    (NVIDIA GeForce RTX 3080), OpenGL 4.6)`; renderer.firefox=`D3D12 (NVIDIA
    GeForce RTX 3080)`. Both hardware, 3s wall-clock.
  - `--engine=chromium` / `--engine=firefox`: each probes only its engine ✓.
  - `--engine=bogus` → usage error, exit 2 ✓.
  - forced-fallback probe-only (all) → mode software-fallback, chromium
    software-fallback, firefox skipped ✓; (firefox-only) → skip-empty ✓.
- Firefox sanitize-pref contrast (load-bearing evidence for the `unverifiable`
  verdict): probe WITHOUT the pref ⇒ `"Generic Renderer"` (matches no software
  marker — would false-pass without the explicit unverifiable class); WITH
  `webgl.sanitize-unmasked-renderer:false` ⇒ `"D3D12 (NVIDIA GeForce RTX 3080)"`.
- Signalling `porch done 52` (build-complete → 3-way consult).

### Implement — Phase 2 `two_engine_suite_and_inertness` (iteration 1)
- Phase 1 3-way consult: unanimous APPROVE, KEY_ISSUES None. Committed
  f3612e5 [Phase: engine_aware_core]. (Porch commits only status.yaml; builder
  commits code per-phase.)
- Phase 2 scope: engine-set-aware suiteEnvFor(plan,baseEnv); runFullLane uses the
  full requested engine set + skip-empty dispatch + honest fallback + REQUIRE
  abort; FR6 default-inert proof; playwright.config.ts UNCHANGED (Decision 9).

### Phase 2 — build/verify results (on-host)
- suiteEnvFor now plan-based (two-engine env: E2E_ENGINES=chromium,firefox +
  Chromium recipe Mesa env, Firefox inherits it; firefox-only: Firefox Mesa env,
  no PW_CHROMIUM_ARGS; fallback: SwiftShader chromium-only; skip-empty/abort
  guarded to never produce a suite env). runFullLane uses the full requested set.
- Unit tests: 54 pass. lint (my files) clean, typecheck clean.
- On-host behavioral proofs:
  - Two-engine HARDWARE full run (E2E_GPU_REQUIRE=1): 22/22 pass, mode hardware,
    renderer.chromium ANGLE D3D12 + renderer.firefox raw D3D12, 208s (build 10s,
    suite 196s), exit 0. [HW-1]
  - Forced-fallback: mode software-fallback, chromium (software-fallback —
    SwiftShader), firefox skipped; suite ran [chromium] tests only (E2E_ENGINES=
    chromium; Firefox excluded, no masquerade); two loud banners. (SwiftShader is
    slow — proven via 5/5 chromium tests before a manual timeout; full FB run =
    Phase 3.)
  - REQUIRE abort (chromium forced-miss via native-linux candidate): exit 1
    before build/suite, per-engine log.
  - skip-empty (--engine=firefox + FORCE_FALLBACK): no build/suite, "suite:
    skipped (no verified engine)", exit 0.
- FR6 default-inert proof: playwright.config.ts EMPTY diff vs main (byte-
  identical — Firefox needs no config hook, Decision 9); no validation.yml/
  package.json/lockfile delta; config-load with lane env unset lists both
  [chromium] and [firefox] (22 tests). Recorded in review draft
  (codev/reviews/52-...md, new file — staged for consult visibility).
- Env hygiene note: a `timeout`-killed experiment orphaned a next-server on port
  3000; killed by PID, port free. No worktree pollution.

### Phase 2 — consult result + commit
- iter1: Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES (real bug: headed
  suite dispatch derived from Chromium-only field ⇒ a firefox-only --mode=headed
  hardware run would wrongly run headless). Fixed: run-level plan.effectiveMode +
  exported isHeadedRun(plan); removed redundant chromiumEffectiveMode; added
  firefox-only headed decision test. Rebuttal written (ACCEPTED+FIXED both points).
- iter2: unanimous APPROVE, KEY_ISSUES None. Committing [Phase:
  two_engine_suite_and_inertness].

### Implement — Phase 3 `qualification_evidence_and_docs` (iteration 1)
- Phase 2 committed 8d79964. Phase 3: FR8 ≥3 consecutive two-engine hardware runs
  (E2E_GPU_REQUIRE=1) + forced-fallback baseline + flake disposition (Decision 10)
  + README (FR9) + complete review + clean-worktree validate proof.

### Phase 3 — evidence + docs results
- FR8: 3 consecutive fully-green two-engine hardware runs Q-1/Q-2/Q-3 (22/22 each,
  196-198s suite, E2E_GPU_REQUIRE=1, retries:0) + HW-1 = 4-for-4 (88/88 test
  execs). Firefox per-test spread ≤0.3s. Both renderers asserted identical every
  run. Branch (a) satisfied — fully green, no known-flake exception needed.
- Flake disposition (Decision 10): background-drag matrix:224 = 0/4 recurrence
  this session (13.2-13.3s stable). Accepted+documented as pre-existing Firefox
  synthetic-input flake; NOT fixed (out of scope), NOT masked (retries:0,
  assertion unchanged).
- FB-1 baseline (FORCE_FALLBACK): 11/11 chromium SwiftShader (firefox skipped),
  582s suite / 591s total, exit 0. Two-engine hardware 22 tests/196s vs chromium
  SwiftShader 11 tests/582s ⇒ ~6× per-test, matching #44.
- README (FR9) updated in place: two-engine command, Firefox recipe + sanitize-
  pref rationale, per-engine report block, --engine selector, honest fallback,
  known flake. Review completed (spec-compliance checklist, lessons, consult log).
- Committing Phase 3; launching clean-worktree `npm run validate` proof (worktree
  lint polluted by untracked .claude/hooks).

### Phase 3 — clean-checkout validate proof (lessons-critical)
- Clean detached worktree at 54d836d + real `npm ci` (no .claude/hooks present):
  - Run 1: lint ✓, typecheck ✓, build ✓; test:smoke runs both engines in SOFTWARE
    (chromium SwiftShader + firefox llvmpipe) → e2e 21/22, VALIDATE EXIT 1. Sole
    failure = known firefox matrix:224 background-drag flake (software input-race;
    this is where it lives). Lint-pollution proof SATISFIED (lint 0 errors).
  - Run 2 (no changes): e2e 22/22, VALIDATE EXIT 0 (firefox:224 passed 12.9s).
    Intermittent flake passes on re-run — exact #44 pattern.
- Branch touches only scripts/e2e-gpu-lane.mjs + tests/gpu-lane.test.mjs (+docs);
  zero tests/e2e / app / playwright.config.ts changes ⇒ flake is pre-existing.
- Review 52 status → complete. Folding clean-checkout proof into Phase 3 commit.

### Phase 3 — consult result
- Unanimous APPROVE (Gemini/Codex/Claude), KEY_ISSUES None. All 3 implement phases
  complete + approved. Advancing porch (→ review/PR).
