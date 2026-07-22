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
- Committing "[Spec 52] Plan with multi-agent review", then continue porch.
