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
- Committing as "[Spec 52] Specification with multi-agent review", then `porch next 52`.
