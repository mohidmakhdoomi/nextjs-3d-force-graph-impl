# bugfix-27 — node-drag-during-auto-rotation

Issue #27: Node drag during auto-rotation drifts the camera center, then snaps back to origin on release.

## Investigate

**Confirmed the regression source from the lockfile:**
- `3d-force-graph@1.80.0`, `three-render-objects@1.42.0`, `react-force-graph-3d@1.29.1`, `three@0.185.1`, `next@16.2.10`.
- These match the issue exactly (three-render-objects 1.37.0 → 1.42.0 added the `state.controls.enabled &&` guard to the per-frame tick, so `TrackballControls.update()` no longer runs while controls are disabled — and `3d-force-graph` disables controls during a node drag).

**Root cause (app-side):** `FocusGraph.tsx` auto-rotation tick (`startRotation` callback, lines 47-50) orbits the camera with
`position.applyAxisAngle(up, -π/300)` + `rotateOnAxis(up, -π/300)`. That pair is only an *approximate* "orbit while fixating origin"
and accumulates orientation error whenever the camera is off the equatorial plane (its local up ≠ world up). Pre-upgrade,
`TrackballControls.update()` ran every frame and ended with `camera.lookAt(target=origin)`, silently re-centering — including mid-drag.
Post-upgrade, a node drag disables controls → the per-frame `lookAt` correction stops → the tick's error becomes visible drift,
and re-enabling on release snaps back.

**Fix direction chosen:** make the tick drift-free and self-sufficient — re-assert `camera.lookAt(controls.target)` each tick so it
never depends on `TrackballControls.update()` running. This restores the exact pre-upgrade visual behavior (camera keeps orbiting
during drag, view stays centered on origin) rather than changing behavior (pausing rotation during drag). Minimal, root-cause fix.

**Regression test plan:** extract the per-tick camera step into a pure, exported helper and unit-test it with a real three.js
`PerspectiveCamera` started OFF the equatorial plane (where the bug reproduces): after many ticks the view direction must keep
pointing at the origin. Fails on the bugged (`rotateOnAxis`-only) code, passes on the fixed (`lookAt`) code. This is deterministic
and is exercised by porch's `checks` block (`npm run build` + `npm test`), unlike an E2E which the software-rendered CI runner makes
flaky for real node-grabs (see existing matrix.spec.ts notes).

**Empirical confirmation** (real three.js `PerspectiveCamera`, 100 ticks ≈ 2s of drag at 20ms/tick, max angle between
camera forward and direction-to-origin):
- Equatorial start (0,0,300): bugged 0.00° / fixed 0.00° — bug does NOT show from a perfectly equatorial camera.
- Off-equatorial (120,90,200) [focused-node-like]: bugged **10.85°** / fixed **0.00°**.
- Steep off-equatorial (60,150,60): bugged **36.03°** / fixed **0.00°**.
Confirms drift arises only off the equatorial plane (local up ≠ world up) and the `lookAt` fix is exactly drift-free.

**Scope:** 1 new ~15-line helper (`app/components/orbitCamera.ts`) + ~3-line change in FocusGraph.tsx + a unit regression
test. Net well under 300 LOC, single area (rotation) → BUGFIX-appropriate.

→ investigate complete; transitioning to fix.

## Fix

**Change (net ~small, single area):**
- New `app/components/orbitCamera.ts` — pure `orbitCameraStep(camera, target, angle)`: `applyAxisAngle` to orbit the
  position, then `camera.lookAt(target)` to re-aim exactly each tick (drift-free, independent of `TrackballControls.update()`).
- `FocusGraph.tsx` — rotation tick now calls `orbitCameraStep(currentCamera, currentControls.target, -π/300)` instead of the
  `applyAxisAngle` + `rotateOnAxis` pair. Aims at the live controls target (origin here) rather than hardcoding.
- `tests/orbit-camera.test.mjs` — deterministic unit regression test (real three.js `PerspectiveCamera`), 3 cases.

**Regression test verified rigorously:** swapped the helper back to the pre-fix `rotateOnAxis` line → both drift tests FAIL
(10.85° / 36° drift); restored `lookAt` → all pass (float noise ~1.2e-6°, threshold 1e-3°). Third test guards that rotation is
still applied (position moves, radius preserved).

**End-to-end browser verification** (real Chromium/SwiftShader, driving the real FocusGraph via a throwaway Playwright script,
reproducing the exact node-drag mechanism: off-equatorial camera + `controls.enabled=false` while rotating):
- Fixed build: world-origin distance from screen-center = 8.1px before / during-drag / after → view stays centered, no snap.
- Pre-fix build (rebuilt): 698.9px → view thrown to the screen edge.
Scratch script deleted (not committed) — the committed guard is the deterministic unit test (gated by porch `checks`).

**Manual test instructions** sent to architect for the human-in-the-loop browser confirmation (repro needs tilting the view
first to get off-equatorial, then dragging a node while auto-rotation stays on).

Gates: porch `check` PASSED (build ✓ 5.9s, tests ✓ — 24 unit tests). Lint noise (18 errors) is entirely from the untracked
`.claude/hooks/worktree-write-guard.cjs` harness file (unknown to git); my three source files lint clean (exit 0). Per
lessons-critical, that's environment noise, not suppressed in committed config.

→ fix complete; committing, then transitioning to pr.
