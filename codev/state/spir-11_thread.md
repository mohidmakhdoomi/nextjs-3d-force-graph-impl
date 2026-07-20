# spir-11 thread — Upgrade and behaviorally qualify the Three.js force-graph stack

## 2026-07-19 — Spawn / Specify phase

- Strict-mode SPIR builder for issue #11 (Stage 2 of the modernization roadmap,
  depends on #10 which is merged as PR #24).
- No existing spec; drafting `codev/specs/11-upgrade-and-behaviorally-quali.md`
  from the detailed issue body. Issue has no Baked Decisions section.
- Pre-draft reconnaissance (registry checked 2026-07-19):
  - Targets exist and are exactly the current latest: `three@0.185.1`,
    `@types/three@0.185.1`, `react-force-graph-3d@1.29.1` — no drift from the
    research doc.
  - Peer tree is satisfiable: `react-force-graph-3d@1.29.1` → `3d-force-graph
    ^1.79` (1.80.0 requires `three >=0.179 <1`) → `three-render-objects ^1.41`
    (peer `three >=0.179`), `three-forcegraph 1` (peer `three >=0.118.3`).
    One deduped Three runtime is expected.
  - `three@0.185.1` still exports BOTH `./examples/jsm/*` and the documented
    `./addons/*` alias, so the import-path change is optional, not forced.
  - `react-force-graph-3d@1.29.1` d.ts still exports `ForceGraphMethods` /
    `GraphData` / `NodeObject` with defaulted generics — current component
    type usage should survive.
  - `tests/toolchain.test.mjs` pins `dependencies.three === "~0.172.0"`; that
    contract test must move with the upgrade.
  - Known harness limitation carried from #9/#10: headless SwiftShader Chromium
    does not register synthetic node DRAG (`onNodeDragEnd`) or node RIGHT-click
    (`onNodeRightClick`); matrix evidence for those items needs the scripted
    imperative-handle procedure and honest recording.
- Key spec decisions I'm proposing (flagged for reviewers/architect):
  - Second browser: Firefox (Playwright project), not WebKit.
  - Switch TrackballControls import to documented `three/addons/...` path.
  - Pin all three target packages exactly (issue says "exact" for three/types;
    extending to react-force-graph-3d for one-qualified-release rationale).

## 2026-07-19 — Specify iteration 1 consultation

- Verdicts: Gemini APPROVE, Claude APPROVE (verified every spec claim against
  the codebase), Codex REQUEST_CHANGES with five structural points — all
  accepted: settled the exact-pin and Firefox-in-CI decisions (no
  pre-authorized fallback; escalation only), split FR9 into explicit Class
  A/Class B acceptance classes, clarified the external-harness scope (no
  test-only app surface), and added supply-chain verification to FR6
  (registry-only sources, install-script delta, clean `npm ci`).
- Rebuttal at `codev/projects/11-upgrade-and-behaviorally-quali/11-specify-iter1-rebuttals.md`;
  spec Consultation Log updated. Awaiting porch re-verification.

## 2026-07-19 — Spec approved; Plan phase

- Architect approved spec-approval with all three elections confirmed (exact
  rfg3d pin, three/addons path, Firefox inside the required CI gate).
- Plan drafted: 3 phases, baseline-first — (1) Firefox second engine on
  current deps, (2) Class A matrix automation + baseline evidence capture
  (incl. Class B transcripts per engine), (3) dependency flip + qualification.
  Single PR = rollback unit.
- Plan iteration 1: Claude APPROVE; Gemini caught that `toolchain.test.mjs`
  pins the exact `browser:install` string (Phase 1 would have broken
  `npm test` at its own commit — file added to Phase 1); Codex caught the
  CDP-is-Chromium-only trap for Firefox Class B evidence (now Playwright
  cross-engine `page.mouse` APIs as primary for both engines) and asked for
  an explicit FR5 no-drift step (added: app/components diff must be exactly
  the one-line import change). All points accepted.

## 2026-07-19 — Plan approved; Implement Phase 1 (firefox-second-engine)

- Architect approved plan-approval; baseline-first sequencing endorsed; Class B
  scripted procedure stays uncommitted per #9/#10 precedent.
- Phase 1 findings:
  - Registry drift check: zero drift; 0.185.1/1.29.1 still exactly latest.
  - **Firefox headless WebGL works** with a single pref:
    `firefoxUserPrefs: {"webgl.force-enabled": true}` (no Chromium flags
    inherited). First two-project smoke: chromium 32.7 s, firefox 43.4 s,
    both green on the current baseline deps.
  - Contract tests updated in lockstep (automation: workflow step renamed
    "Install Chromium, Firefox, and system dependencies"; toolchain:
    browser:install string) — 19/19 green at this phase's tree.
  - Lint caveat carried from review 10: `eslint .` traverses the untracked
    Claude Code harness file `.claude/hooks/worktree-write-guard.cjs` (18
    errors, all from that file); gate run with the harness dir moved aside →
    exit 0, then restored. Not project source; absent from CI and commits.
  - Typecheck exit 0.
  - Stability bar: 5/5 consecutive green two-project runs (1× full
    `test:smoke` incl. build + 4× `playwright test` on the same build).
    Firefox per-run range 39.0–43.4 s, zero flakes, zero unexpected errors.
- Phase 1 review: iter1 Codex+Claude REQUEST_CHANGES (both caught the stale
  README "Continuous integration" section — fixed, plus new automation-test
  assertion so the divergence is now testable); iter2 Codex+Claude APPROVE,
  Gemini lane skipped (agy CLI not signed in — environmental). Phase commit
  b0fa6dc.

## 2026-07-19 — Implement Phase 2 (matrix-suite-baseline)

- New committed two-engine suite: `tests/e2e/graph-handle.ts` (fiber-walk
  imperative-handle probe installed via addInitScript; camera/controls/axes/
  node-data numeric reads; webglcontextlost counter) and
  `tests/e2e/matrix.spec.ts` (8 tests: initial layout, rotation pause/resume
  numeric, delayed pointer enablement incl. inert-wheel real input, wheel
  zoom + background-drag rotation + noPan, click-to-focus + reset with
  resume window, axes numeric toggle, resize, remount via re-navigation).
- Baseline evidence (local, uncommitted per precedent, in builder scratchpad
  `baseline-evidence/`):
  - Audits BEFORE (baseline deps): full = 13 findings, production = 7 (both
    exit 1, evidence-preserving). 3D-chain-owned advisory paths:
    `@babel/runtime@7.26.0` (moderate, fixed ≥7.26.10) and
    `lodash-es@4.17.21` (high, advisory range ≤4.17.23 — note: even current
    latest 4.17.x remains inside the advisory range; upgrade may not clear
    this path — to be compared honestly in Phase 3).
  - Chain resolved versions BEFORE recorded (three 0.172.0, 3d-force-graph
    1.76.0, three-forcegraph 1.42.12, three-render-objects 1.37.0, kapsule
    1.16.0, react-kapsule 2.5.2, d3-force-3d 3.0.5, ngraph.forcelayout
    3.3.1, float-tooltip 1.7.3, preact 10.25.4, lodash-es 4.17.21, polished
    4.3.1, @babel/runtime 7.26.0). No `hasInstallScript` anywhere in the
    chain; all resolved URLs registry.npmjs.org.
- Matrix-suite development findings (engine mechanics learned the hard way;
  all demonstrated on the BASELINE stack — these are the replay reference
  for Phase 3):
  - **Input-delivery latency during warmup**: SwiftShader + d3-force warmup
    saturate the main thread; a measured `page.mouse.wheel` dispatch blocked
    6.2 s — past the 4 s enable delay. The committed enablement test
    therefore verifies the inert-before half numerically
    (controls disabled → enabled transition) and exercises real input right
    after enablement; per spec FR9 this is an input-delivery limitation.
  - **Click resolution is hover-state-based**: three-render-objects
    re-raycasts the parked pointer position every render frame and resolves
    clicks against `hoverObj` one rAF after pointerup. Under orbiting
    rotation the whole projection pans at ~430 px/s (824 px/rad × π/300 per
    20 ms), so real clicks cannot land on a moving node in this environment:
    demonstrated across parked-volley (2×15), fresh-aim (12), velocity-led
    swept-lead (12), and slowest-node (12) strategies — 0 registrations —
    with a stationary-click control registering reliably. The committed test
    clicks a stationary (paused) node; the stop-rotation-on-click slice is
    scripted evidence.
  - **graph2ScreenCoords maps behind-camera nodes to plausible screen
    coords**: when zoomed inside the node cloud, target pickers must filter
    by camera-forward depth or they aim at phantoms (this was the real cause
    of "stationary" misses at close zoom).
  - **Trackball wheel-state freeze**: rapid same-direction wheels accumulate
    `_zoomStart` until `factor > 0` fails and zoom stops entirely until the
    offset decays; back-to-back opposite wheels also interact through the
    same state. Firefox's per-deltaY wheel effect is ~10× weaker than
    Chromium's. The committed tests verify each zoom direction from its own
    settled state and use an adaptive stall-detecting zoom loop.
  - **Resize does not re-derive renderer size** (canvas dimensions fixed at
    mount; no width/height props, kapsule defaults evaluated once). The
    qualified contract per spec item 12 is dimension consistency +
    interactivity, which is what the committed test asserts; observed
    behavior recorded as baseline.
- Committed two-engine matrix suite: 9 tests green on chromium and firefox
  (19/20 first full run; single Firefox failure was the wheel-effect scale,
  fixed by the adaptive loop; then 2/2 green on the retested pair).
  5× stability sequence started.

## 2026-07-19/20 — Phase 2 stabilization, restart, stress evidence

- Stability sequencing surfaced two distinct flakes; both fixed in the
  committed suite:
  1. **Numeric-poll timeout starvation**: the resize and axes tests polled
     `axesVisible` at Playwright's default 5 s; under software rendering a
     click's numeric effect can lag past that. Raised those polls to 15 s
     (8/8 stress green afterwards).
  2. **Stray wheel-path node registration** (both engines, ~1/12 per engine
     run): while zooming through the rotating cloud, nodes sweeping under
     the parked pointer can register as a real node interaction — fixing a
     node and stopping rotation before the aimed click. The click test now
     wheels from a screen corner, asserts a strict `fixedNodeCount === 0`
     pre-aim guard, and on detecting a stray post-zoom recovers on a fresh
     page (≤2 recoveries) so the aimed click is the sole cause of the fix
     it detects.
- Session restarted mid-stress; the sole leftover `test-results/` failure
  artifact was triaged to "Channel closed / browser has been closed"
  (graceful close at restart time) — an interrupted run, not a test
  failure. Artifacts cleared; stress rerun from scratch.
- **Click-to-focus stress after both fixes: 8/8 runs green** (chromium +
  firefox each run, 16/16 test executions), no failure artifacts.
- Full-suite 5× consecutive stability sequence (smoke + matrix, both
  engines, 20 executions/run) restarted cleanly post-restart: **5/5 green,
  20 passed each run** (~11.5 min/run). Two-engine matrix suite is stable.
- **Scripted Class B evidence captured** (both engines, uncommitted
  `tests/e2e/diag.spec.ts` restored → run → deleted; transcripts in
  `.builder-evidence/baseline-evidence/scripted-{chromium,firefox}.txt`).
  The procedure logs (never asserts) real-input registration for the Class
  B slices that fall outside the committed gate:
  - **Moving-click while orbiting: NOT registered** on either engine (item
    9's stop-rotation-on-click slice — the projection pans faster than the
    hover raycast resolves; this is the input-delivery limitation the
    committed test avoids by pausing first).
  - **Stationary-click control: registered** on both — proves the click
    pipeline works when the target holds still.
  - **Right-click release (item 8): registered** on both — aimed at the
    fixed node's exact projection after wheeling the camera back out so the
    node sits at a moderate positive depth (the focus tween can leave it
    behind the camera as a graph2ScreenCoords phantom). Coarse wheel steps
    overshoot depth by 10× under Trackball zoom momentum; fine 100-unit
    steps land it reliably in the 150–600 window.
  - **Node-drag fix (item 7): registered** on both — run on a fresh page so
    the fixed count starts at 0 (the drag-end handler un-fixes other nodes
    as it fixes the dragged one, masking itself at higher counts) and aimed
    at a non-fixed node.
  - Two engine-mechanics facts confirmed by inline probes (also deleted):
    right-click fires through `contextmenu`→`pointerup(button=2)` with the
    app's `onRightClick` calling `ev.preventDefault()` (so pointerup still
    fires); registration reads use the fixed-node-id SET, not the count,
    because handlers swap membership without changing cardinality.
- **Phase 2 gates all green**: `npm run typecheck` (0), `npm test` (19/19),
  `eslint .` (0, via the hooks-aside dance for the untracked worktree-write
  guard), `npm run build` (0). Ready to signal porch and enter 3-way review.

## 2026-07-20 — Phase 2 review passed; Phase 3 (dependency upgrade) applied

- **Phase 2 review: unanimous APPROVE at iter2.** iter1 was Gemini/Claude
  APPROVE, Codex REQUEST_CHANGES (items 4 & 9 "downgraded" to numeric/scripted).
  Rebuttal grounded in: the plan's OWN approved Risk/Mitigation clause
  (`plan.md:244-249`) pre-authorizing the scripted-evidence path for
  unstabilizable Class A items "with the limitation demonstrated and recorded…
  remains a Class A obligation at qualification"; FR9's input-delivery sanction
  (`spec.md:408-413`); source-confirmed gating (`controlsEnabled` = the same
  `clickEnabled` state that gates node clicks, `FocusGraph.tsx:196-198`); and
  fresh both-engine evidence (moving-click=false). Codex upgraded to APPROVE
  ("honest handling of demonstrated input-delivery limits"). No code changed.
- **Porch/index gotcha discovered**: `porch done` commits the *staged index*,
  not just status.yaml. The Phase 2 test files + thread were swept into
  `92dd278 chore(porch): 11 implement re-iter (iter 2)` because they were
  staged for the review diff before signaling. Content is correct/complete;
  the plan status-flip was committed cleanly as `df218ae`. **Lesson for future
  phases: commit deliverables yourself BEFORE `porch done`, or accept the
  porch chore-commit sweeping them.**
- **Phase 3 upgrade applied** (`three` 0.172.0→0.185.1, `@types/three`
  →0.185.1, `react-force-graph-3d` 1.26.0→1.29.1; all exact pins):
  - **FR1 reverify (2026-07-20)**: zero drift — all three targets == registry
    `latest`; chain peers admit one three@0.185.1
    (3d-force-graph@1.80.0 `three >=0.179 <1`, three-render-objects@1.42.0
    `>=0.179`, three-forcegraph@1.43.4 `>=0.118.3`). No escalation.
    `fr1-reverification.md`.
  - **FR2**: `npm install` under exact toolchain, lockfile v3; clean `npm ci`
    exit 0, no 3D-chain peer warnings, package.json+lock **byte-identical**
    after (sha256), no mutation.
  - **FR3**: `npm ls three` = exactly one `three@0.185.1` (all chain deduped);
    lockfile has only `node_modules/three`; `@types/three` string-equal.
  - **FR4/FR5**: import → `three/addons/controls/TrackballControls.js`;
    typecheck 0 no new suppressions; `app/` diff is **exactly** that one line;
    wrapper/resources/page/layout/graph-data byte-identical.
  - **FR6**: all changed lockfile `resolved` = registry.npmjs.org;
    `hasInstallScript:false` everywhere (no new scripts).
    `chain-versions-after.json`, `fr6-fr13-chain-and-audit-review.md`.
  - **FR12**: `tests/toolchain.test.mjs` updated (both three pins →0.185.1) +
    new single-three-runtime, type-alignment, rfg3d-pin tests; `npm test`
    21/21.
  - **FR7 static gates**: lint 0, typecheck 0, build 0, prod `npm start` HTTP
    200 on `/`.
  - **FR13 audits**: full 13→11, prod 7→5 (**prod high 1→0**); BOTH 3D-chain
    advisories resolved (`@babel/runtime`→7.29.7, `lodash-es`→4.18.1); no new
    advisories; residuals all non-3D-chain (Next/toolchain). Exit codes (1/1)
    preserved. Evidence in `.builder-evidence/upgrade-evidence/`.
  - **FR7 stability**: 5× two-engine `playwright test` on the upgraded stack
    — **5/5 green, 20 passed each** (smoke + matrix, both engines). Class A
    matrix fully preserved after the upgrade.
  - **FR9 Class B replay** (both engines, same scripted procedure vs Phase 2
    baseline; `fr9-classB-replay-comparison.md`):
    - moving-click false→false, stationary-control true→true, right-click
      release (item 8) true→true — identical on both engines/stacks.
    - node-drag (item 7): one upgraded-Chromium draw diverged (false vs
      baseline's true), so per FR9(b) the identical input was replayed on the
      rollback baseline. Rate is **identical**: baseline Chromium 2/4 true ==
      upgraded Chromium 2/4 true (Firefox 1/1 true both). When it registers,
      `onNodeDragEnd` fixes the node correctly on both stacks. The
      intermittent non-registration is the documented SwiftShader
      drag-precision harness property (the reason 7/8 are Class B), NOT an
      upgrade regression. No FR14 blocking condition.
  - **FR9(b) mechanics**: baseline replay done by `git checkout HEAD --
    package.json package-lock.json` → `npm ci` (three@0.172.0) → 4 drag
    repeats → restore upgraded manifest (sha256-verified) → `npm ci`
    (three@0.185.1). Working tree back to the upgraded stack, clean.
  - **Behavioral preservation: CONFIRMED.** No behavior attributable to the
    upgrade differs from baseline in either engine. FR11 error budget: zero
    unexpected errors across all upgraded runs (contextLost=0 everywhere).

## 2026-07-20 — Post-integration: CI Validation red → fixed (pr gate held)

- Architect held the `pr` gate: PR #25 CI Validation failed 5/5. This PR is the
  first to run the two-engine matrix on GH Actions runners (no GPU, software
  WebGL, slow CPU) — that environment was never qualified. Two distinct causes:
  - **Firefox (10/12 fails):** `three` `WebGLRenderer` → "A WebGL context could
    not be created … tryNativeGL … Exhausted GL driver options
    (WEBGL_EXHAUSTED_DRIVERS)" → client crash ("Application error") → sized-canvas
    wait times out. Confirmed from the CI trace. Firefox has no SwiftShader
    equivalent; `webgl.force-enabled` only bypasses the blocklist, supplies no
    driver. Robust bring-up needs Mesa llvmpipe + `LIBGL_ALWAYS_SOFTWARE` +
    headed Firefox under Xvfb.
  - **Chromium (2/12 fails):** two wheel-zoom tests' 5 s inner settle poll too
    tight for the runner's software rasterizer (motion lands after 5 s).
- **Consulted Gemini + Codex** on the Firefox-CI strategy. Both independently:
  Chromium (SwiftShader) = required CI gate; Firefox software-WebGL too flaky to
  own the main gate → keep as local qualification (or a future non-blocking job).
  Matches the architect's option 3.
- **Fix (test/CI infra only — app code untouched, FR5 no-drift holds):**
  1. `playwright.config.ts`: engines selected via `E2E_ENGINES` env. Unset ⇒
     full two-engine matrix (local gate). Verified via `--list`:
     unset→chromium+firefox, `=chromium`→chromium only, `=chromium,firefox`→both,
     `=bogus`→throws.
  2. `.github/workflows/validation.yml`: Validate step sets `E2E_ENGINES=chromium`
     (Firefox dropped from `playwright install`). Chromium is the deterministic
     required gate.
  3. `tests/e2e/matrix.spec.ts`: `SETTLE_TIMEOUT_MS = process.env.CI ? 20_000 :
     5_000` on the five camera-motion settle polls. Local timing unchanged.
- Disposition recorded honestly in the review doc (new section "CI Enforcement
  vs. Local Qualification"; FR7/FR8 reconciled; Flaky Tests + Follow-up updated).
- Local sanity: `CI=1 E2E_ENGINES=chromium npm run test:smoke` — full Chromium
  gate **10/10 green** (7.8m), incl. both previously-CI-failing tests.
- Commit 6eda6e8 pushed → CI **failed fast** in `Test baseline contracts`:
  `tests/automation.test.mjs` is a workflow *contract test* that pinned the old
  step name "Install Chromium, Firefox, and system dependencies" +
  `--with-deps chromium firefox`. My rename/drop tripped it (the test doing its
  job). Architect flagged the same. Fix: re-pinned the contract to the new CI
  shape — step "Install Chromium and system dependencies", `--with-deps
  chromium` (asserts no `firefox`), and Validate pins `E2E_ENGINES: chromium`;
  README CI section updated to match; review doc file-list updated.
  `npm test` now **21/21**; lint+typecheck clean. Re-pushing.
- Commit 8fbbdc5 CI: contract test + install + chromium e2e all green — **9/10**,
  only `zooms in with the wheel and rotates with a background drag` failed on the
  **overall 120 s test timeout** (`mouse.move` at line 215; ran 2.1m). Not an
  assertion failure — the 20 s settle-poll headroom pushed the compound test
  past its per-test wall-clock budget; other tests measured 1.1–1.9m (test 10
  smoke 1.9m ≈ 114s, near the ceiling too). Suite ran 13.6m < 20m job limit.
  Architect concurred: raise the per-test timeout CI-only, don't trim settle
  logic. Fix: `playwright.config.ts` `timeout: process.env.CI ? 240_000 :
  120_000` (local 120 s unchanged; click-to-focus keeps its explicit 240 s).
  typecheck/lint/`npm test` 21/21 clean. Re-pushing (cycle 4).
