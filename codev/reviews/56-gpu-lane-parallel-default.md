# Review 56 — Make the native-GPU e2e lane default to parallel workers

**Status**: implementation complete; FR8 re-qualification evidence recorded
below. Lessons learned and the final retrospective are added during the SPIR
Review phase before the PR opens.

## What shipped

- `scripts/e2e-gpu-lane.mjs`: on **verified-hardware** runs the lane now
  defaults the suite to `E2E_WORKERS=50%` (`LANE_DEFAULT_WORKERS`), unless the
  operator set a non-whitespace `E2E_WORKERS` (`operatorWorkersSet`), reusing
  the existing `resolveWorkers` machinery — no second worker-resolution path.
  The software-fallback branch keeps the config's serial default; the absolute
  `CI → workers: 1` guard is untouched and wins last.
- Visibility (FR6): `workerDecisionFor` provenance ("lane default" /
  "operator override" / "config serial default"), one additive trailing
  `workers:` report line (probe-only / skip-empty read `n/a (no suite run)`),
  and a lane log line before the suite stage.
- Docs (FR9): README lane section/parallelism note/env table/report snippet
  reconciled; dated correction in
  `codev/reviews/41-parallelize-local-e2e-runs.md` (lane-scoped default
  delivered; the global default stays serial).
- Frozen files untouched (FR4/FR5): `.github/workflows/validation.yml`,
  `scripts/e2e-workers.mjs`, `tests/e2e-workers.test.mjs`,
  `playwright.config.ts`, `package.json`, lockfile.

## FR8 re-qualification evidence (2026-07-24)

Host: 20-core WSL2 + NVIDIA RTX 3080, Mesa d3d12 recipe. All runs
`mode: hardware`, both engines verified
(`renderer.chromium: ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX
3080), OpenGL 4.6)`, `renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)`),
`retries: 0`, exit 0, 22/22 tests passed per run.

| Run | Command | Workers (report) | Suite | Wall clock |
| --- | --- | --- | --- | --- |
| Serial baseline | `E2E_WORKERS=1 npm run test:e2e:gpu` | `1 (operator override)` | 22 passed (3.3m) | 212s (build 10s, suite 200s) |
| Parallel 1/3 | `npm run test:e2e:gpu` (no `E2E_WORKERS`) | `50% (lane default)` — 10 workers | 22 passed (42.2s) | 54s (build 10s, suite 43s) |
| Parallel 2/3 | `npm run test:e2e:gpu` (no `E2E_WORKERS`) | `50% (lane default)` — 10 workers | 22 passed (44.1s) | 57s (build 10s, suite 45s) |
| Parallel 3/3 | `npm run test:e2e:gpu` (no `E2E_WORKERS`) | `50% (lane default)` — 10 workers | 22 passed (46.2s) | 59s (build 10s, suite 47s) |

3/3 consecutive green under the plain lane default — ~3.8× faster than the
serial baseline. Scenario 3 spot check: `E2E_WORKERS=banana` exits 1 with a
loud `WorkerConfigError` at config load; the lane log/report honestly show
`workers: banana (operator override)`.

Validation gate: proved green on a clean detached checkout
(`git worktree add --detach HEAD` + real `npm ci`): lint, typecheck, and the
serial SwiftShader `test:smoke` (22 passed, 1 worker) — the canonical gate
remains serial and untouched.

## Per-test appendix (verbatim Playwright list-reporter output)

### serial-baseline
```
✓ Compiled successfully in 2.8s
✓ Generating static pages using 5 workers (4/4) in 296ms
Running 22 tests using 1 worker
  ✓   1 [chromium] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (2.6s)
  ✓   2 [chromium] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (7.7s)
  ✓   3 [chromium] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (6.9s)
  ✓   4 [chromium] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (8.6s)
  ✓   5 [chromium] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (15.5s)
  ✓   6 [chromium] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (17.6s)
  ✓   7 [chromium] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (4.6s)
  ✓   8 [chromium] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (4.0s)
  ✓   9 [chromium] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (2.9s)
  ✓  10 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (17.9s)
  ✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (6.9s)
  ✓  12 [firefox] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (2.9s)
  ✓  13 [firefox] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (8.0s)
  ✓  14 [firefox] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (7.4s)
  ✓  15 [firefox] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (9.1s)
  ✓  16 [firefox] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (14.5s)
  ✓  17 [firefox] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (18.1s)
  ✓  18 [firefox] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (4.8s)
  ✓  19 [firefox] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (4.3s)
  ✓  20 [firefox] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (2.9s)
  ✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (21.0s)
  ✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (8.8s)
  22 passed (3.3m)
```

### parallel-1
```
✓ Compiled successfully in 2.4s
✓ Generating static pages using 5 workers (4/4) in 305ms
Running 22 tests using 10 workers
  ✓   1 [chromium] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (3.8s)
  ✓  10 [chromium] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (5.5s)
  ✓   8 [chromium] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (5.7s)
  ✓   4 [chromium] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (6.5s)
  ✓   6 [chromium] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (9.0s)
  ✓   5 [chromium] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (9.1s)
  ✓   2 [chromium] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (12.0s)
  ✓  13 [firefox] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (5.3s)
  ✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (10.5s)
  ✓   3 [chromium] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (17.9s)
  ✓  14 [firefox] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (10.9s)
  ✓  12 [firefox] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (16.2s)
  ✓   9 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (25.1s)
  ✓  18 [firefox] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (11.2s)
  ✓   7 [chromium] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (25.4s)
  ✓  16 [firefox] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (14.8s)
  ✓  20 [firefox] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (7.2s)
  ✓  19 [firefox] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (11.8s)
  ✓  15 [firefox] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (17.7s)
  ✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (10.5s)
  ✓  17 [firefox] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (23.4s)
  ✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (21.8s)
  22 passed (42.2s)
```

### parallel-2
```
✓ Compiled successfully in 2.6s
✓ Generating static pages using 5 workers (4/4) in 350ms
Running 22 tests using 10 workers
  ✓   7 [chromium] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (4.5s)
  ✓   3 [chromium] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (5.1s)
  ✓   2 [chromium] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (6.1s)
  ✓   6 [chromium] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (7.8s)
  ✓  10 [chromium] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (8.6s)
  ✓   1 [chromium] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (9.2s)
  ✓   9 [chromium] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (12.3s)
  ✓  12 [firefox] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (6.8s)
  ✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (11.4s)
  ✓   8 [chromium] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (17.4s)
  ✓  14 [firefox] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (11.2s)
  ✓  13 [firefox] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (15.5s)
  ✓   4 [chromium] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (23.7s)
  ✓   5 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (24.1s)
  ✓  18 [firefox] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (10.5s)
  ✓  15 [firefox] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (14.7s)
  ✓  19 [firefox] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (7.8s)
  ✓  20 [firefox] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (7.5s)
  ✓  16 [firefox] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (18.5s)
  ✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (11.0s)
  ✓  17 [firefox] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (23.7s)
  ✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (21.8s)
  22 passed (44.1s)
```

### parallel-3
```
✓ Compiled successfully in 2.5s
✓ Generating static pages using 5 workers (4/4) in 302ms
Running 22 tests using 10 workers
  ✓   9 [chromium] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (4.5s)
  ✓   3 [chromium] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (4.9s)
  ✓   5 [chromium] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (5.2s)
  ✓   1 [chromium] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (7.0s)
  ✓   8 [chromium] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (9.6s)
  ✓   2 [chromium] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (9.9s)
  ✓  12 [firefox] › tests/e2e/matrix.spec.ts:76:5 › settles an initial force layout with positioned nodes (6.4s)
  ✓   7 [chromium] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (13.0s)
  ✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (11.9s)
  ✓   4 [chromium] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (19.0s)
  ✓  14 [firefox] › tests/e2e/matrix.spec.ts:135:5 › keeps pointer navigation inert until the enable delay elapses (11.4s)
  ✓  13 [firefox] › tests/e2e/matrix.spec.ts:105:5 › rotates the camera automatically until paused, then resumes (17.7s)
  ✓  10 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (27.2s)
  ✓   6 [chromium] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (28.2s)
  ✓  15 [firefox] › tests/e2e/matrix.spec.ts:195:5 › zooms out with the wheel (16.9s)
  ✓  18 [firefox] › tests/e2e/matrix.spec.ts:478:5 › toggles AxesHelper visibility through the axes control (14.8s)
  ✓  20 [firefox] › tests/e2e/matrix.spec.ts:572:5 › remounts a fresh working canvas on re-navigation (9.8s)
  ✓  19 [firefox] › tests/e2e/matrix.spec.ts:511:5 › keeps the canvas consistent and interactive across a resize (12.5s)
  ✓  16 [firefox] › tests/e2e/matrix.spec.ts:225:5 › zooms in with the wheel and rotates with a background drag (20.2s)
  ✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (11.8s)
  ✓  17 [firefox] › tests/e2e/matrix.spec.ts:314:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (24.2s)
  ✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (24.7s)
  22 passed (46.2s)
```

## Spec compliance

All spec FRs delivered: FR1–FR3 (hardware-arm-only injection, operator
pass-through incl. forcing serial, whitespace-as-unset), FR4/FR5 (frozen files
untouched — `validation.yml`, `e2e-workers.mjs`, `playwright.config.ts`,
lockfile; `CI ⇒ 1` guard structurally unreachable by the lane default), FR6
(provenance log + additive report line), FR7 (unit matrix), FR8 (evidence
above), FR9 (docs reconciled). No new dependencies; no lockfile movement.

## Architecture documentation updates

- `codev/resources/arch.md` (Validation Baseline): the "local parallelism is
  opt-in" paragraph now records the lane-scoped exception — the native-GPU
  lane defaults verified-hardware runs to `E2E_WORKERS=50%` via env injection,
  reusing `resolveWorkers` (CI pin and fail-loud validation intact).
- Hot tier (`arch-critical.md` / `lessons-critical.md`): no changes — the
  facts are lane-scoped reference detail, not behavior-changing cross-cutting
  contracts; the existing hot entries (validate gate, environment-noise
  lesson) already cover what matters at decision time.

## Lessons learned updates

- `codev/resources/lessons-learned.md` (Toolchain and Worktree Hygiene): new
  entry — a pnpm-launched harness leaks `npm_config_*` env vars (notably
  `npm_config_user_agent`) into builder shells, falsely failing the toolchain
  user-agent test under a bare `npm test`; prove the gate with the pollution
  stripped, never by weakening the test.

## Lessons learned (narrative)

- **What went well**: the #41 `resolveWorkers` contract made the change tiny —
  the lane only decides *whether to set* `E2E_WORKERS`; validation, CI
  pinning, and scaling all stayed in one place. The pure `suiteEnvFor` /
  `formatReport` layers made every behavior unit-testable without spawning
  browsers. Qualification was clean: 3/3 green first attempt (the #55 fix
  held), ~3.8× speedup confirmed.
- **What was challenging**: environment noise, twice — pnpm env-var leakage
  failing the toolchain test, and the known untracked-hooks lint failure —
  both resolved by proving gates on clean/stripped environments per the
  established lesson rather than touching committed config. Reviewer iteration
  (codex, twice) centered on a dangling evidence pointer; resolved by creating
  the evidence artifact in-tree instead of forward-referencing it.
- **Do differently**: create the review/evidence document at the moment the
  evidence is produced (Phase 3), not in the Review phase — reviewers rightly
  reject references to files that don't exist yet.

## Flaky Tests

None encountered; no tests skipped. All qualification runs were green with
`retries: 0`.
