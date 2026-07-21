# Review 44: Add an Opt-In Native-GPU Local E2E Lane

## Metadata
- **ID**: review-2026-07-21-add-an-opt-in-native-gpu-local
- **Status**: in progress (evidence accumulating; finalized in the Review phase)
- **Specification**: [codev/specs/44-add-an-opt-in-native-gpu-local.md](../specs/44-add-an-opt-in-native-gpu-local.md)
- **Plan**: [codev/plans/44-add-an-opt-in-native-gpu-local.md](../plans/44-add-an-opt-in-native-gpu-local.md)

This artifact accumulates the lane's qualification evidence phase by phase
(FR5/FR6 now; FR8 stability runs and the final lessons in later phases), per
the plan's "Phase 2–4 accumulation" note. All renderer strings are verbatim.

## FR5 — Headless-vs-headed investigation (plan phase: headless_investigation)

**Question**: can headless Chromium + ANGLE reach hardware GL on this host
(WSL2, RTX 3080, Mesa d3d12), or is the proven headed-WSLg config required?

**Method**: the spec's bounded matrix — one FR3 renderer probe per cell, via
`node scripts/e2e-gpu-lane.mjs --probe-only --mode=headless
--candidate=<id> [--channel=chromium]`. At the pinned `@playwright/test`
1.61.1 the two headless modes ARE distinguishable and both binaries are
installed by `playwright install chromium`:
- default `headless: true` → **Chrome Headless Shell 149.0.7827.55**
  (`chromium_headless_shell-1228`);
- `channel: "chromium"` → **Chrome for Testing 149.0.7827.55** full binary in
  new-headless mode (`chromium-1228`).

**Result: conclusive POSITIVE — all 4 cells reach hardware** (2026-07-21,
this host; probe transcripts in `gpu-lane-logs/probe-*.log` per cell):

| Cell | Headless binary | ANGLE backend | UNMASKED_RENDERER_WEBGL (verbatim) |
|---|---|---|---|
| A | headless shell (default) | `--use-angle=gl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` |
| B | headless shell (default) | `--use-angle=gl-egl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL ES 3.1)` |
| C | new headless (`--channel=chromium`) | `--use-angle=gl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` |
| D | new headless (`--channel=chromium`) | `--use-angle=gl-egl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL ES 3.1)` |

The Mesa d3d12 path does **not** need a display: the matrix cells run with the
same recipe env (`GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`)
and no WSLg window.

**Full-suite headless validation run** (before flipping the default):
`node scripts/e2e-gpu-lane.mjs --mode=headless` → **11/11 passed**, suite
97 s, total 108 s (build 10 s), renderer `ANGLE (Microsoft Corporation, D3D12
(NVIDIA GeForce RTX 3080), OpenGL 4.6)`, exit 0 — timing identical to the
headed run (97 s suite).

**Decision**: the lane default is **headless** (headless shell path — the
suite's own default headless, reachable with zero config surface). Headed
remains one flag away (`--mode=headed`, DISPLAY/WSLg prereq applies only
there) and is documented as the historically-proven alternative. The
`--channel=chromium` new-headless result is probe-only knowledge: the suite
cannot switch Playwright channel through `PW_CHROMIUM_ARGS`, and no config
surface was added for it (default-inert discipline; the wrapper refuses
`--channel` without `--probe-only` for exactly this honesty reason).

## FR6 — Canonical gate provably untouched (plan phase: full_lane_and_inertness_proof)

Collected 2026-07-21 on commit `d78194b` (unchanged since):

1. `git diff main -- playwright.config.ts` — **comment-only** (the
   `PW_CHROMIUM_ARGS` hook's OPT-IN paragraph now describes the shipped lane;
   every changed line is a `//` comment, no code token differs).
2. `.github/workflows/validation.yml`, `.nvmrc`, `package-lock.json` — absent
   from `git diff main --stat` entirely. `package.json`'s only delta is the
   added `"test:e2e:gpu"` script line.
3. Config-load check with all lane env unset (`node
   --experimental-strip-types`, real `playwright.config.ts`):
   - chromium `launchOptions.args` =
     `["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]` (exact)
   - projects `[chromium, firefox]`, `workers: 1`, `retries: 0` (non-CI),
     `timeout: 120000` (non-CI), reporter `[list, html]`, webServer command/
     `reuseExistingServer: false` unchanged.
   - Hook sanity: with `PW_CHROMIUM_ARGS="--use-gl=angle --use-angle=gl"` the
     resolved args are exactly the injected pair (the lane's injection point
     works; env unset ⇒ SwiftShader defaults).
4. PR CI green under SwiftShader — pending, recorded at the Review phase.

## FR8 — Repeat-run stability evidence (accumulating; completed in plan phase: qualification_evidence_and_docs)

Host: WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2), NVIDIA GeForce RTX
3080, Mesa d3d12 Gallium; Node 22.23.1 / npm 10.9.8; `workers: 1`,
`retries: 0` (config local defaults, untouched); full 11-test Chromium suite.

| Run | Date | Mode | Renderer (verbatim) | Result | Suite | Total |
|---|---|---|---|---|---|---|
| HW-1 (headed) | 2026-07-21 | hardware, headed WSLg | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` | 11/11 pass | 97 s | 108 s |
| HW-2 (headless validation) | 2026-07-21 | hardware, headless | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` | 11/11 pass | 97 s | 108 s |
| FB-1 (forced fallback / baseline) | 2026-07-21 | software-fallback (`E2E_GPU_FORCE_FALLBACK=1`) | not probed — default SwiftShader args | 11/11 pass | 594 s | 604 s |

Baseline comparison: hardware suite 97 s vs contemporaneous SwiftShader
serial baseline 594 s ⇒ **6.1× faster** (historical context: bugfix-22's
chromium suite measured 9.7 m under SwiftShader). Zero flakes at
`retries: 0` in all hardware runs so far. The FB-1 run also qualifies the
fallback path (Scenario 2) on this host: loud banner at start and before the
report, `mode: software-fallback`, suite exit semantics preserved.

### Qualification runs (plan phase: qualification_evidence_and_docs)

Three **consecutive** full-suite lane runs, 2026-07-21, on the final shipped
configuration (headless default, `wsl2-d3d12-angle-gl` candidate), each under
`E2E_GPU_REQUIRE=1` so an unnoticed fallback was impossible. Retries policy:
`retries: 0` (config local default, untouched). Renderer, asserted and logged
identically in all three runs:
`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`.

| Run | Result | Suite | Total | Lane exit |
|---|---|---|---|---|
| Q-1 | 11/11 pass | 94 s | 104 s (build 10 s) | 0 |
| Q-2 | 11/11 pass | 95 s | 105 s (build 9 s) | 0 |
| Q-3 | 11/11 pass | 95 s | 105 s (build 9 s) | 0 |

Per-test durations across Q-1/Q-2/Q-3 (all pass; seconds):

| Test | Q-1 | Q-2 | Q-3 |
|---|---|---|---|
| matrix: settles an initial force layout | 2.3 | 2.2 | 2.2 |
| matrix: rotates automatically until paused, then resumes | 7.7 | 7.6 | 7.7 |
| matrix: pointer inert until enable delay | 7.0 | 6.9 | 6.9 |
| matrix: zooms out with the wheel | 8.6 | 8.5 | 8.6 |
| matrix: zooms in + background-drag rotate | 13.3 | 13.7 | 13.9 |
| matrix: click-to-focus + reset | 17.6 | 17.7 | 17.4 |
| matrix: AxesHelper toggle | 3.6 | 4.6 | 4.5 |
| matrix: canvas consistent across resize | 4.3 | 4.0 | 4.0 |
| matrix: remounts fresh canvas on re-navigation | 2.9 | 2.9 | 2.9 |
| right-click-release: releases fx/fy/fz | 17.9 | 17.8 | 17.8 |
| smoke: renders graph + core controls | 7.0 | 6.9 | 6.9 |

**Findings**: no instability observed — per-test wall-clock spread across the
three runs is ≤ 1.0 s on every test; zero flakes at `retries: 0`; no
timing-incompatible test; no lane-only accommodation was needed and none was
added; canonical waits untouched (spec Decision 7 discipline had nothing to
absorb). Including the phase-2/3 runs, the lane is 5-for-5 full-suite
hardware passes (HW-1 headed, HW-2 headless, Q-1..Q-3 headless).

**FR8 verdict**: satisfied — 3+ consecutive hardware runs with asserted
renderer, per-test results, wall-clocks, and retries policy recorded, plus
the contemporaneous SwiftShader serial baseline (FB-1, 594 s suite) for the
6.1× comparison and the forced-fallback qualification of Scenario 2.
