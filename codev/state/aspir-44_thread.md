# Builder thread — aspir-44 (issue #44: opt-in native-GPU local e2e lane)

## Specify

- Spawned in ASPIR strict mode. Spec was pre-written and committed by the architect
  (`b3d50c3`, `codev/specs/44-add-an-opt-in-native-gpu-local.md`). Issue #44 has no
  Baked Decisions section; the spec's "Confirmed Decisions" already pin the
  architecture (wrapper-script lane over the existing `PW_CHROMIUM_ARGS` hook,
  Approach C).
- Verified the spec's factual premises against the tree: `PW_CHROMIUM_ARGS` hook is
  live in `playwright.config.ts` (default-inert, comment block explicitly reserves it
  for #44), `experiments/42_kaggle_gpu_ci/` evidence artifacts present, `scripts/`
  exists for the wrapper.
- Reviewed the spec per the specify prompt: complete against all issue acceptance
  criteria and constraints. No edits needed. Signaling `porch done 44` to trigger the
  3-way spec consultation.
- Spec CMAP iter-1: Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES (4 issues:
  nondeterministic fallback policy, no way to exercise fallback on a GPU host,
  under-specified FR5, missing operator-UX requirement). All four accepted — spec
  updated (deterministic FR3 candidate lifecycle; `E2E_GPU_FORCE_FALLBACK` /
  `E2E_GPU_REQUIRE` controls in FR2; fixed ≤4-probe FR5 matrix with stop condition;
  new FR11 diagnostics). Rebuttal recorded; porch advanced to Plan.

## Plan

- Grounded the plan in the tree: `PW_CHROMIUM_ARGS` hook (playwright.config.ts),
  `test:smoke` = build && playwright test, `npm test` glob `tests/*.test.mjs`
  (new unit file rides it — no script-chain change), bugfix-22 thread (WSL2 d3d12
  headed recipe + gl-egl alternate, vulkan→llvmpipe on WSL2), exp42 run #5
  (native-Linux ANGLE-Vulkan) and the kaggle_e2e_runner.py preflight-probe pattern.
- Plan committed (07df085): 4 phases — lane_wrapper_core (probe/candidates/policy
  + GPU-free unit tests), full_lane_and_inertness_proof (npm script, comment-only
  config sync, FR6 config-load proof), headless_investigation (FR5 matrix),
  qualification_evidence_and_docs (FR8 runs + README). Key naming decisions:
  `scripts/e2e-gpu-lane.mjs`, `test:e2e:gpu`, `E2E_GPU_FORCE_FALLBACK`,
  `E2E_GPU_REQUIRE`. Forced-fallback full run doubles as the SwiftShader baseline
  wall-clock. 3-way plan consultation running.
- Plan CMAP iter-1: Gemini APPROVE, Claude APPROVE, Codex COMMENT (2 non-blocking:
  name the probe-log destination; scrub fallback env). Both folded into the plan
  (1afb375). Porch advanced to Implement.

## Implement

### Phase 1 — lane_wrapper_core (committed 314fca9)

- Worktree had no local `node_modules` (typecheck was resolving the parent
  checkout's unpatched tree) — ran a real `npm ci` here; no lockfile delta.
- `npm run lint` shows 21 errors, ALL in untracked `.claude/hooks/worktree-write-guard.cjs`
  — the documented environment-noise class (hot lesson). Lane files lint clean;
  not suppressing in committed config; will prove the gate on a clean checkout at PR.
- **Hardware verified through the lane on this host**: `--probe-only` selects
  `wsl2-d3d12-angle-gl` and logs `ANGLE (Microsoft Corporation, D3D12 (NVIDIA
  GeForce RTX 3080), OpenGL 4.6)` in ~2 s. Force-fallback, contradictory-controls
  (exit 2), and transcript-log paths all exercised. Unit suite 58/58 (19 new),
  build green, porch checks green. Impl CMAP iter-1 running.
- Impl CMAP iter-1: Gemini/Claude APPROVE; Codex REQUEST_CHANGES — real defect:
  watchdog win before `chromium.launch()` resolved orphaned the late browser.
  Fixed (launch promise captured outside the race, bounded reap in finally,
  lost-race rejection absorbed); probeRenderer made injectable; +3 timeout/crash
  tests (61/61). Committed e9cb4d1; porch then loaded plan-phase tracking and the
  phase-scoped CMAP for lane_wrapper_core came back 3× APPROVE. Phase 1 done.

### Phase 2 — full_lane_and_inertness_proof (committed d78194b)

- Wrapper now runs the full lane: build → suite via `npx playwright test`
  (config webServer serves production build), hardware env injected via
  PW_CHROMIUM_ARGS + recipe env per spawn; fallback spawns from pristine env
  minus PW_CHROMIUM_ARGS with the loud banner at start and end. Suite exit code
  = lane exit code. `test:e2e:gpu` npm script added; playwright.config.ts hook
  comment synced (comment-only diff).
- FR6 evidence captured: env-unset config-load asserts SwiftShader args /
  2 projects / workers 1 / retries 0 / timeout 120000; hook-set sanity injects;
  `git diff main -- playwright.config.ts` comment-only; validation.yml, .nvmrc,
  lockfile absent from diff. Unit suite 66/66.
- **Hardware full-suite run #1: 11/11 PASS in 1.6 m** (build 9 s, suite 97 s),
  renderer `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080),
  OpenGL 4.6)`, headed WSLg, retries 0, zero flakes on first attempt.
- **Forced-fallback full-suite run: 11/11 PASS in 9.9 m** (suite 594 s) under
  SwiftShader with correct loud banners/report — this is the contemporaneous
  serial baseline. **Hardware suite is 6.1× faster** (97 s vs 594 s). Also
  qualifies Scenario 2 (fallback path) on this host.
- Both run logs captured (scratchpad gpu-lane-hw-run-1.log /
  gpu-lane-fallback-run-1.log) for the FR8 review evidence. Phase-2 CMAP running.
- Phase-2 CMAP: 3× APPROVE. Porch advanced to headless_investigation.

### Phase 3 — headless_investigation (committed d62dd14)

- **FR5 matrix conclusive POSITIVE, all 4 cells hardware**: {headless shell,
  new-headless via --channel=chromium (distinguishable at pin 1.61.1: Chrome for
  Testing 149 vs Chrome Headless Shell 149, both installed)} × {angle-gl,
  angle-gl-egl} all reach the RTX 3080 through Mesa d3d12 — the d3d12 path needs
  NO display. angle-gl reports OpenGL 4.6, angle-gl-egl reports OpenGL ES 3.1.
- Full-suite headless validation: **11/11 in 1.6 m (97 s suite) — identical to
  headed**. Lane default flipped to headless (headed via --mode=headed; DISPLAY
  prereq applies only there). Big ergonomic win: no WSLg windows popping up, and
  the lane now works on display-less WSL2 hosts.
- Wrapper gained --mode/--candidate/--channel probe overrides (channel is
  probe-only by construction). 68/68 unit tests. Phase-3 CMAP running.
- Phase-3 CMAP iter-1: Gemini/Claude APPROVE, Codex REQUEST_CHANGES (process:
  FR5 evidence must live in the review artifact, not just this thread). Fixed —
  created codev/reviews/44-add-an-opt-in-native-gpu-local.md with FR5 matrix,
  FR6 evidence, seeded FR8 table (bbc0f09). Iter-2 CMAP passed; porch advanced.

### Phase 4 — qualification_evidence_and_docs

- **FR8 qualification: 3/3 consecutive full-suite runs under E2E_GPU_REQUIRE=1,
  all 11/11 pass** — suite 94/95/95 s, renderer asserted identical each run,
  retries 0, zero flakes, per-test spread ≤1.0 s. Lane is 5-for-5 hardware
  passes overall. Recorded with per-test table in the review artifact.
- README: full lane section (command, report semantics, WSL2 d3d12 recipe,
  headless outcome, env controls, non-gate status, #41 sequencing) + a
  Validation-commands table row marked "Not part of the gate".
- Next: clean-worktree `npm run validate` proof (local lint is polluted by the
  untracked .claude/hooks harness file — the documented environment-noise
  class), then porch done → phase-4 CMAP.
- Clean-checkout validate: run 1 = 21/22 — single `[firefox] matrix.spec.ts:224`
  background-drag flake (azimuth 0.0038 < floor 1; pre-existing #11/#33
  software-input-race class, zero e2e/app changes on this branch; preserved
  verbatim in the review, NOT skipped — spec forbids touching the canonical
  suite). Run 2 = 22/22 exit 0. Phase-4 CMAP: 3× APPROVE.

## Review phase

- Review doc finalized (summary, spec compliance, deviations, lessons,
  consultation log, Flaky Tests, follow-ups). Doc updates routed to cold tier:
  arch.md Validation Baseline gained the GPU-lane paragraph;
  lessons-learned.md Validation Evidence gained renderer-probe+strict-switch,
  probe-before-assuming, and timeout-race-reap/DI lessons. Hot tier untouched.
- **PR #50 opened** (branch builder/aspir-44 → main, Closes #44). Test-count
  typo in PR body/review corrected (29 new tests, 68 total). Awaiting PR CMAP
  + human pr gate.
