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

The 3+ consecutive qualification runs (under `E2E_GPU_REQUIRE=1`, on the
final headless default) land in this section during
`qualification_evidence_and_docs`.
