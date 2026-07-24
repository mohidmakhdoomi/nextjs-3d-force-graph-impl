# Phase 4 — Fix qualification (issue #55)

Prove the H1 background-drag fix under volume on **both engines** and **both
rendering paths** at `retries: 0`. The historical flake reproduced on the
SwiftShader serial baseline **and** the native-GPU parallel lane, so both paths
are qualified. All runs verbatim in `evidence/phase4-*.log`; driver:
`evidence/phase4-qualify.sh` (step 1 gates the rest — a single below-floor drag
means the fix is incomplete, so we stop rather than mask).

## Results — green throughout, zero failed/flaky

| Run | Path | Engine(s) | Result | Log |
|---|---|---|---|---|
| Targeted `:224` ×60 | SwiftShader, serial | firefox | **60/60 passed** (16.4m) | `phase4-1-ff224-swift-x60.log` |
| Targeted `:224` ×60 | native-GPU (hardware) | firefox | **60/60 passed** | `phase4b-2-ff224-gpu-x60.log` |
| Full suite serial #1 | SwiftShader (clean-checkout `validate`) | chromium+firefox | **22/22 passed** (11.5m) | `phase4-5-clean-validate.log` |
| Full suite serial #2 | SwiftShader (`test:smoke`) | chromium+firefox | **22/22 passed** (11.5m) | `phase4-3-smoke-run2.log` |
| Full suite serial #3 | SwiftShader (`test:smoke`) | chromium+firefox | **22/22 passed** (11.7m) | `phase4-3-smoke-run3.log` |
| Full GPU lane #1 | native-GPU (hardware) | chromium+firefox | **22/22 passed** (3.3m) | `phase4-4-gpu-run1.log` |
| Full GPU lane #2 | native-GPU (hardware) | chromium+firefox | **22/22 passed** (3.3m) | `phase4-4-gpu-run2.log` |
| Full GPU lane #3 | native-GPU (hardware) | chromium+firefox | **22/22 passed** (3.3m) | `phase4-4-gpu-run3.log` |

- Targeted repetition ≥60 (Decision-5 budget) on the Firefox arm on **both**
  paths: **60/60** on the SwiftShader path (`phase4-1-…`) and **60/60** on the
  **native-GPU hardware** path (`phase4b-2-…`). The `gpu-lane` wrapper rejects
  unknown Playwright args, so the hardware targeted repeat runs the fixed test
  under the lane's own Firefox recipe read straight from `scripts/e2e-gpu-lane.mjs`
  `FIREFOX_PROBE_RECIPE` (`GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`,
  committed `firefox` pref `webgl.force-enabled=true`), **bracketed by lane
  `--probe-only` runs that verified `D3D12 (NVIDIA GeForce RTX 3080)` before and
  after** the 60 executions (`phase4b-1-…`, `phase4b-3-…`). The suite reads a
  privacy-sanitized renderer, so the probe — not the suite — is the hardware
  evidence, exactly as the lane operates internally (probe → suite). No lane code
  changed. Combined `:224` executions this phase: 60 (SwiftShader targeted) + 60
  (hardware targeted) + 3 serial-suite + 3 GPU-suite = **126 green, 0 below floor**.
- **Chromium green throughout** (no regression from the shared harness change).

## Renderer evidence (native-GPU lane — verified hardware)

Both engines reached the discrete GPU (not SwiftShader/llvmpipe) on all 3 GPU-lane
runs:

- `renderer.chromium: ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`
- `renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)`

This is the same hardware control arm on which the flake originally survived
(#44/#52); it is now green ×3.

## `npm run validate` — green on a clean checkout

`npm run validate` (`lint && typecheck && test:smoke`) is **green** —
`phase4-5-clean-validate.log`, **EXIT 0**, 22/22 — proven on a **clean detached
worktree** (`git worktree add --detach HEAD` at `c2f5a69` + real `npm ci`), per
the lessons-critical Toolchain-and-Worktree-Hygiene rule.

The in-worktree `npm run validate` (`phase4-2-validate.log`) fails `eslint .` with
21 errors **solely** on the **untracked** builder-harness file
`.claude/hooks/worktree-write-guard.cjs` (`require`/`process`/unused-var). That
file is absent from clean checkouts (`ls .claude/hooks` → "No such file" in the
clean worktree) and from the committed tree (`git ls-files` → untracked), so it is
environment noise, not a project failure. It is **not suppressed in committed
config**; the gate is proven green on the clean checkout instead. `eslint .
--ignore-pattern ".claude/**"` on the working tree is likewise exit 0.

## Disposition

FR5 satisfied: both engines × both rendering paths × volume, recorded green at
`retries: 0`; `MOTION_FLOOR`, the canonical assertion, `retries: 0`, and
`.github/workflows/validation.yml` untouched. Ready for the phase_4 review.
