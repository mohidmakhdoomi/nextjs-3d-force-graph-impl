# bugfix-22 thread — Verify and fix fixed-node right-click release in native GPU Chromium

Issue #22 (BUGFIX, strict mode). Follow-up from PR #21 / issue #9 manual matrix item 11.

## Architect guidance (2026-07-21)
- Host is WSL2 → headed Chromium still uses SwiftShader; native-GPU evidence likely unobtainable.
- Acceptance criteria explicitly allow the alternative path: conclusively determine WITH EVIDENCE
  whether the right-click release failure is app/library behavior or an automation-environment
  limitation; document it; add durable regression coverage IF a real defect exists.
- Do not burn time chasing a native GPU. Reason from the library right-click release code path
  plus SwiftShader reproduction evidence.
- Preserve left-click focus, node-drag fixation, and server/client WebGL boundaries.

## Investigate phase — findings so far

### App code path (app/components/FocusGraph.tsx)
- `handleRightClick` (lines 135-144) wired to `onNodeRightClick`. On right-click of a node with
  `fx !== undefined`, it clears `fx/fy/fz`. Looks correct by construction.
- `handleClick` (left-click) calls `handleDragEnd` to fix the node + animate camera + stop rotation.
- `handleDragEnd` fixes the dragged node and releases any previously-fixed node.
- All three gated on `clickEnabled` (enabled after `enableDelay`, default 4000ms).

### Prior-project evidence (the key finding)
- Issue #9 review: item 11 (physical right-click releases fixed node) "Failed/unverifiable" in
  headless SwiftShader; reproduced identically on rollback baseline → not an upgrade regression.
- Issue #10 review: claimed node DRAG and RIGHT-click "do not register" via Playwright synthetic
  events in headless SwiftShader even when aimed at a confirmed node.
- **Issue #11 review (lines 274-279): corrected that claim.** Found the more precise truth,
  confirmed across both engines: **right-click DOES register** when aimed at the fixed node's exact
  projection after wheeling to moderate depth; drag registers intermittently (~50%); left-click
  only lands on a *stationary* target. => The item-11 "failure" was an aiming/automation timing
  limitation, NOT an app/library defect.

### patches/
- All three patch-package patches are `.d.ts` type-only (three r0.185 Renderer shim, React 19 JSX,
  generic bound). None touch runtime interaction behavior.

## Hypothesis
The app right-click release path is correct. The item-11 failure is an automation-environment
(SwiftShader synthetic-input aiming/timing) limitation, not an app/library defect. Plan: prove
right-click release registers in headless SwiftShader using the same hover-first settle technique
the click test uses (issue #34), and add durable e2e regression coverage: fix a node, right-click
it, assert fixedNodeCount 1 → 0. Verify against the actual library right-click mechanism first.

## Investigate conclusion (root cause — CONFIRMED)

Read the installed library source (react-force-graph-3d 1.29.1 → three-render-objects, the exact
version issue #11 qualified). The pointer dispatch (three-render-objects.mjs L552-578):

    container.addEventListener('pointerup', ev => {
      if (!isPointerPressed) return;
      ...
      requestAnimationFrame(() => {                     // deferred one frame
        if (ev.button === 0) onClick(hoverObj || null, ...);       // left
        if (ev.button === 2 && onRightClick) onRightClick(hoverObj || null, ...); // right
      });
    });
    container.addEventListener('contextmenu', ev => { if (onRightClick) ev.preventDefault(); });

=> Right-click (button 2) and left-click (button 0) dispatch through the SAME pointerup handler,
the SAME requestAnimationFrame defer, reading the SAME throttled-raycast `hoverObj`. The only
difference is the button number and which app handler runs. `hoverObj` is set by a raycast
throttled to `pointerRaycasterThrottleMs` (~50ms) in the render loop (L272-291).

**Root cause: there is NO app/library defect.**
- App `handleRightClick` (FocusGraph.tsx L135-144) correctly clears fx/fy/fz on a fixed node.
- Library dispatches right-click identically to left-click.
- The item-11 "failure" is the SAME SwiftShader synthetic-input hover-race that affected
  left-click (issue #34): a bare move+down+up resolves its deferred click before the throttled
  raycast has committed `hoverObj`, so the handler fires with a null hover and releases nothing.
  Issue #11 already found (and this code confirms) right-click DOES register with proper aiming
  (hover-first settle). It is an automation-environment limitation, not app/library behavior.

**Scope: BUGFIX-appropriate, test-only, no app code change.**
- No fix to app code (nothing is broken). Deliverable = durable regression coverage that locks in
  the correct right-click-release contract + conclusive documentation of the item-11 root cause.
- Files to change (Fix phase): tests only.
  1. Deterministic unit test (mirror tests/click-registration.test.mjs — the #34 harness): model
     button-2 dispatch + app release-on-right-click semantics; prove a hovered FIXED node is
     released, and that too-few settle frames still lose the race (guard stays load-bearing).
  2. e2e right-click release in matrix.spec.ts (SwiftShader): fix a node then right-click it with
     hover-first settle + button:'right'; assert fixedNodeCount 1→0. Gather real SwiftShader
     evidence; keep it robust (retries) so the smoke gate stays green (acceptance criterion 3).
- Native-GPU headed Chromium: unobtainable on WSL2 (SwiftShader only) per architect; will record
  that + the SwiftShader+code-path evidence as the conclusive determination.

Baseline: unit tests 36/36 green. Signaling investigate PHASE_COMPLETE.

## FIX phase — NATIVE GPU BREAKTHROUGH (architect updated guidance 04:24Z)

Architect superseded "don't chase native GPU": actively probe WSL2 GPU paravirtualization first.
Ran the probes — hardware WebGL IS achievable here:

- `/dev/dxg` present; `nvidia-smi` → NVIDIA GeForce RTX 3080, driver 581.29, CUDA 13.0.
- WSLg active: DISPLAY=:0, WAYLAND_DISPLAY=wayland-0, /mnt/wslg/.X11-unix present.
- `/usr/lib/wsl/lib` has libd3d12.so, libd3d12core.so, libdxcore.so; Mesa 26.0.3 with d3d12_dri.so.
- Default `glxinfo -B` → llvmpipe (software, "Accelerated: no"); `/dev/dri` absent (DRI3 error).
- **Forcing `GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib glxinfo -B` → Device: D3D12
  (NVIDIA GeForce RTX 3080), Accelerated: YES.**
- **Headed Chromium probe** (env GALLIUM_DRIVER=d3d12, LD_LIBRARY_PATH=/usr/lib/wsl/lib, DISPLAY=:0;
  args `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist --disable-gpu-sandbox`, headless:false):
  **UNMASKED_RENDERER_WEBGL = "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080),
  OpenGL 4.6)"** — genuine hardware WebGL, NOT SwiftShader/llvmpipe.
  - `--use-angle=gl-egl` also works (OpenGL ES 3.1). `--use-gl=egl` → SwiftShader. `--use-angle=vulkan`
    → llvmpipe (Mesa dozen/Vulkan-d3d12 not selected). So the winning backend is ANGLE→native-GL.

=> Native-GPU headed Chromium IS available. Next: reproduce manual matrix item 11 (right-click
release of a fixed node) on this RTX 3080 hardware WebGL and record the result as the native-GPU
evidence acceptance criterion 1 asks for. Winning launch config recorded above.

## NATIVE-GPU ITEM-11 RESULT — CONCLUSIVE (3/3 runs PASS)

Ran a headed-Chromium reproduction against the production app (`npm run start`) on RTX 3080 HW WebGL.
Launch env: MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA, GALLIUM_DRIVER=d3d12, LIBGL_ALWAYS_SOFTWARE=false,
LD_LIBRARY_PATH=/usr/lib/wsl/lib, DISPLAY=:0. Args: --use-gl=angle --use-angle=gl
--ignore-gpu-blocklist --disable-gpu-sandbox, headless:false.

App page's own WebGL renderer confirmed: "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce
RTX 3080), OpenGL 4.6)" — genuine hardware, not SwiftShader.

Reproduction steps + result (item 11 = "right-click a fixed node releases fx/fy/fz"):
1. Load app, wait for pointer enablement, pause auto-rotation.
2. Wheel-zoom into click range.
3. REAL USER PATH: physically left-click a node → fixedNodeCount 0→1 (node fixed); wait for the
   focus camera tween; physically RIGHT-CLICK the fixed node → fixedNodeCount 1→0 (RELEASED).
   => PASS on all 3 runs (nodes fixed then released: Pablissimo, Graphileon, Graphileon).
4. ISOLATED right-click: deterministically fix the best on-screen node, then physically
   right-click it → fixedNodeCount 1→0 (RELEASED). => PASS on all 3 runs.

**CONCLUSION (conclusive determination the issue asks for):**
Right-click release of a fixed node WORKS on native-GPU headed Chromium. The manual matrix item-11
"failure" observed under headless SwiftShader was an **automation-environment limitation** — the
software-render hover-timing race (same class as issue #34, where a bare synthetic click/right-click
resolves its rAF-deferred dispatch before the throttled hover raycast commits `hoverObj`), NOT an
application or library defect. App `handleRightClick` and the library's `onNodeRightClick` dispatch
are correct. This resolves the PR #21/#9 item-11 follow-up.

## Remaining FIX work (durable regression coverage)
No app code change (nothing is broken). Add committed, NON-FLAKY regression coverage that locks in
the right-click-release contract so a future regression of handleRightClick is caught:
- Deterministic unit test (mirror tests/click-registration.test.mjs #34 harness) for right-click
  release — drives the real shared settleHoverThenClick helper (add `button` param).
- SwiftShader e2e test that exercises the real app handler (fix a node, real right-click releases
  it) — only commit to the CI gate if it proves robust under SwiftShader (measure repeatedly);
  else keep unit-only + this documented native-GPU evidence.
Native-GPU is a local-only capability (CI has no GPU) so it stays documented evidence, not a CI lane.

## FIX phase — regression coverage added (all SwiftShader-green)

Architect constraint honored: committed tests do NOT depend on GPU env vars or hardware; they stay
green under software rendering (CI is SwiftShader-only). Native-GPU is issue-record evidence only.

Committed deliverables (test-only; NO app code change — nothing is broken):
1. `tests/right-click-release.test.mjs` — deterministic unit harness (mirrors the #34
   click-registration harness) modelling three-render-objects' button-2 dispatch + the app's
   release-on-right-click semantics in plain JS. Proves: bare right-click loses the hover race and
   releases nothing (the item-11 report); hover-first right-click releases; too-few settle frames
   still miss (keeps the settle count load-bearing). Node-only, no browser/WebGL → always green.
2. `tests/e2e/right-click-release.spec.ts` — real-app-handler guard under headless SwiftShader:
   deterministically pin fx/fy/fz on the best on-screen node (harness probe), then a REAL
   hover-first right-click (button:right) must clear it → fixedNodeCount 1→0. Fix-setup is
   deterministic (the flaky part is the click FIX, which item 11 is not about); the release is a
   genuine right-click through onNodeRightClick→handleRightClick.
3. `tests/e2e/pointer.ts` — `settleHoverThenClick` gains a `button` param (default "left"), shared
   by the unit + e2e right-click paths; backward compatible with all existing callers.
4. `tests/e2e/graph-handle.ts` — additive probes `__graphFixBestNode` / `__graphNodeScreenById`
   (+ `fixBestNode`/`nodeScreenPointById` helpers); `__graphNodeScreen` refactored to share a
   `bestOnScreenNode` picker (same public return shape → existing tests unaffected).

Robustness measured before committing the e2e test: isolated right-click release under headless
SwiftShader passed 7/7 (1 foreground + 6/6 background probe). unit 39/39 green; typecheck + lint
clean. Running full chromium (SwiftShader) e2e suite to confirm the new test + no regression in the
existing matrix (graph-handle refactor preserves pickNodeScreenPoint's contract).

LOC note: ~480 added lines, ALL test/harness (zero app change). Over the 300 BUGFIX guideline, but
well-contained to tests/ and exactly the "durable regression coverage" the issue requests; will
flag to architect for transparency. Escalation not warranted (no architectural/app change).

## Full chromium (SwiftShader) e2e gate — GREEN
`E2E_ENGINES=chromium npx playwright test` → **11/11 passed (9.7m)**, local retries:0. All 8 matrix
tests (incl. flaky-prone click-to-focus #6), smoke #11, and the new right-click-release #10.
graph-handle refactor confirmed non-breaking. Acceptance criterion 3 satisfied. Next: porch check
(build + unit), commit, porch done → PR phase.

## PR phase — PR #43 opened; CMAP done
PR #43 (base main). porch check green (build + unit). CMAP (bugfix pr):
- Gemini APPROVE (HIGH, no issues); Claude APPROVE (HIGH, no issues).
- Codex REQUEST_CHANGES (HIGH): (1) `npm run lint` fails on `.claude/hooks/worktree-write-guard.cjs`;
  (2) `npm test` fails on `tests/audit-report.test.mjs`.
- Both rebutted as untracked-harness / reviewer-sandbox environment noise, PROVEN on a clean
  checkout (`git worktree add --detach HEAD` @ d5cc8a1 + real `npm ci`): lint exit 0, typecheck
  exit 0, npm test 39/39. `.claude/hooks/` is untracked (git ls-files shows only .claude/skills/*),
  absent from clean checkouts; audit-report.test.mjs is self-contained (mkdtemp+spawnSync, no net)
  and passes — codex's sandbox likely blocks subprocess/tmpdir. No committed-config suppression
  (per hot lesson). Rebuttal recorded as PR comment #issuecomment-5030356962.
Requesting the `pr` gate (porch done); STOP and wait for human approval before merge.

## CI failure on head ae74af7 — root-caused from shard-4 traces (gate on hold)

Architect put the `pr` gate approval on hold: the new `tests/e2e/right-click-release.spec.ts`
failed 3/3 on E2E shard 4/4 of run 29803086403 (all 6 in-test aim attempts missed each run).
Downloaded playwright-test-results-4 (error-context.md + trace.zip x3) and root-caused with #34 rigor.

**Definitive root cause = INVALID AIM POINT from a zoom over-shoot (architect hypothesis b):**
- `zoomIntoClickRange` wheels `-2400` repeatedly. The 2-core runner's SwiftShader crawls
  (**5 animation frames took 18.3s ≈ 3.6s/frame** in the trace), so the Trackball accumulates a
  large pending zoom offset while `cameraDistance` reads a stable-looking **1.68** across several
  250ms polls (no new frame rendered between reads) — this fools `waitForStableCameraDistance`.
- `fixBestNode` pins a node at that moment → **valid on-screen point (407,256)**, fixedNodeCount 0→1.
- One more frame then applies the whole accumulated offset, slamming the camera to the Trackball
  **min distance 0.1** (graph center). The pinned node now projects to **(3414,2338)** — far outside
  the **800×600** viewport. All 6 retries re-aim at that same off-screen point (camera frozen at the
  floor) → `mouse.move` lands off-canvas → hover never commits → release never fires. retry1 identical
  (off-screen (3678,2500)). Settle-frame count is irrelevant: the pointer was never over the node.
- Secondary artifact: `nodeScreenPointById` reports `fixed:false` for the pinned id → duplicate node
  `__data` instances share an id (harness reporting only; release still works locally 7/7 + native 3/3,
  so the raycast-resolved node IS the pinned one). Hardening it to prefer the fx-defined instance.

**Fix (waits + validation only; zoom dynamics unchanged; workers untouched; assertion unchanged):**
1. New `waitForCameraRest` (graph-handle.ts): frame-based settle — resolves only after cameraDistance
   holds across N consecutive real animation frames, so it is NOT fooled by slow-frame plateaus or a
   mid-drain freeze (unlike the wall-clock 2-sample `waitForStableCameraDistance`). Drains the pending
   zoom offset BEFORE the node is fixed, so the pinned node cannot drift off-screen afterward.
2. Wrap zoom→rest→fix→on-screen-verify in a bounded reload-retry: a fresh page gives an offset-free
   camera; only accept a fixed node whose projection is on-screen (rare degenerate-floor viewpoint → reload).
3. Right-click loop: per-attempt `waitForCameraRest` + on-screen re-validation of the target before
   dispatching; more settle frames + longer release poll. Off-screen drift self-heals instead of 6
   identical misses.
Next: implement, re-prove on CI green shards (local SwiftShader is not representative).

## CI PROVEN GREEN on the slow runner — head 0f2c7ac (run 29804841084)
All 4 E2E shards + Quality + Validation gate = success. The previously-failing **shard 4/4 passed
in 292s** (was 3/3 fail on ae74af7). Quality (lint/typecheck/unit/audit) green. The zoom-overshoot
hardening (waitForCameraRest drains the offset before the fix; on-screen-validated aim) holds on the
2-core CI SwiftShader, not just local. Acceptance criteria intact; assertion never weakened; workers
untouched. Gate remains on hold — awaiting human approval (NOT self-approving). Notifying architect.
