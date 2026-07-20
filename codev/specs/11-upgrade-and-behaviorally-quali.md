# Specification 11: Upgrade and Behaviorally Qualify the Three.js Force-Graph Stack

## Summary

Upgrade the application's highest runtime-risk dependency unit — the
Three.js/force-graph chain — from the checked-in `three@0.172.0` /
`@types/three@0.172.0` / `react-force-graph-3d@1.26.0` baseline to the
researched Stage 2 target group, and *behaviorally qualify* the result: the
complete graph interaction matrix must pass in Chromium **and at least one
other supported browser**, with no unexpected hydration, timer, console,
WebGL-context, or GPU errors. This is
[Stage 2 — 3D/WebGL unit](../research/architecture-dependency-modernization.md)
of the architecture/dependency modernization roadmap (tracked under #6;
depends on #10, which shipped as PR #24).

The intended package actions are:

| Package | Checked-in version | Intended target | Dependency group | Action |
| --- | ---: | ---: | --- | --- |
| `three` | `~0.172.0` (resolved `0.172.0`) | exact `0.185.1` | `dependencies` | Upgrade; pin exactly |
| `@types/three` | `~0.172.0` (resolved `0.172.0`) | exact `0.185.1` | `devDependencies` | Upgrade; pin exactly; keep exactly aligned with runtime `three` |
| `react-force-graph-3d` | `~1.26.0` (resolved `1.26.0`) | `1.29.1` | `dependencies` | Upgrade; pin exactly (decided — Confirmed Decisions #6) |

All other manifest entries are unchanged. The transitive force-graph chain
moves with `react-force-graph-3d` and is reviewed, not independently pinned:
`3d-force-graph`, `three-forcegraph`, `three-render-objects`, `react-kapsule`,
`d3-force-3d`, `ngraph.forcelayout`, `float-tooltip`, `preact`, `kapsule`,
`lodash-es`, `polished`, and the Babel runtime.

Install/build success cannot validate imperative WebGL behavior, so this stage
is qualified behaviorally: every documented graph interaction must be exercised
against the production build in two browser engines, with failures replayed
against the rollback baseline before being attributed to dependency drift. The
whole manifest/lockfile/code change is one rollback unit; a failing interaction
blocks the stage, and mismatched Three runtime/types must never be used as a
partial workaround.

## Problem Analysis

### Current state

- `three@0.172.0` (r172, January 2025) and `@types/three@0.172.0` are ~13
  releases behind the current Three.js line. `react-force-graph-3d@1.26.0`
  resolves `3d-force-graph@1.76.0`, `three-forcegraph@1.42.12`, and
  `three-render-objects@1.37.0`.
- Current force-graph releases have moved their Three baseline forward:
  `3d-force-graph@1.80.0` requires `three >=0.179 <1` and
  `three-render-objects@1.42.0` declares a `three >=0.179` peer. The
  checked-in `three@0.172.0` cannot satisfy the current chain, so the unit
  must move together — exactly the coupling the research staged as one unit.
- The graph component (`app/components/FocusGraph.tsx`) consumes Three
  imperatively: `AxesHelper`, `PerspectiveCamera`, and `TrackballControls`
  imported from the legacy `three/examples/jsm/controls/TrackballControls.js`
  path, plus the react-force-graph imperative handle (`camera()`,
  `controls()`, `scene()`, `cameraPosition()`, `zoomToFit()`, `refresh()`).
  None of this surface is validated by install or build.
- Browser validation today is a single automated Chromium Playwright smoke
  (`tests/e2e/smoke.spec.ts`: canvas/WebGL readiness, control buttons,
  pause/resume rotation, axes toggle, reset, strict console/page-error
  collection). The fuller 12-item interaction matrix was exercised for #9/#10
  as a scripted, documented one-off in Chromium only. No second browser engine
  has ever qualified the graph.
- `tests/toolchain.test.mjs` asserts `dependencies.three === "~0.172.0"`; the
  dependency-contract tests must move in the same commit as the manifest.
- Post-#10 audit evidence (review 10) attributes the remaining production
  advisory paths to the force-graph chain; those paths are owned by this
  stage and must be re-explained after the upgrade.

### Desired state

- `three` and `@types/three` at exactly `0.185.1` (runtime and community
  types exactly aligned), `react-force-graph-3d` at `1.29.1`, with a clean
  supported peer tree and exactly one Three runtime resolved in the lockfile.
- The TrackballControls import uses the documented `three/addons/...` path
  (see Confirmed Decisions), with no behavioral change.
- The client-only dynamic boundary (`FocusGraphWrapper.tsx`: `dynamic(...,
  {ssr: false})`) and all existing graph interaction semantics preserved.
- The complete interaction matrix (§FR9) passes in Chromium and Firefox
  against the production build, with the known headless-harness limitations
  honestly recorded rather than papered over.
- Lint, typecheck, unit/contract tests, build, production start, full and
  production audits, and the automated browser smoke all pass; the smoke runs
  in both browser engines.
- The lockfile review documents meaningful renderer/layout/tooltip/runtime
  changes across the chain and re-explains any remaining audit paths.

### Stakeholders

- **Site visitors** — the 3D graph is the page's entire interactive surface;
  a regression in any pointer/camera behavior is a user-facing breakage.
- **Maintainers** — need the 3D unit off a dead Three baseline so future
  force-graph fixes remain reachable, without losing reproducibility.
- **Later roadmap stages** (#6) — Stage 3+ (Next 16 etc.) assume the 3D unit
  is current and behaviorally pinned by a two-browser qualification bar.

## Confirmed Decisions

Registry facts verified 2026-07-19 (must be reverified at implementation
time per FR1; this observation does not replace that verification):

1. **Targets exist and are current**: `three@0.185.1`, `@types/three@0.185.1`,
   and `react-force-graph-3d@1.29.1` are published and are exactly the latest
   versions of their packages as of the check — zero drift from the research.
2. **Peer tree is satisfiable**: `react-force-graph-3d@1.29.1` depends on
   `3d-force-graph ^1.79` / `react-kapsule ^2.5` / `prop-types 15` with peer
   `react *`. `3d-force-graph@1.80.0` depends on `three >=0.179 <1`,
   `three-forcegraph 1`, `three-render-objects ^1.41`, `kapsule ^1.16`,
   `accessor-fn 1`. `three-render-objects@1.42.0` peers `three >=0.179`;
   `three-forcegraph@1.43.4` peers `three >=0.118.3`. `three@0.185.1`
   satisfies every constraint, so npm should resolve a single deduped Three
   runtime.
3. **Both addon import paths exist in `three@0.185.1`**: the package exports
   map contains `./examples/jsm/*` and the documented `./addons/*` alias to
   the same files. The import-path change is therefore not *forced* by the
   qualified release; this spec elects the documented `three/addons/...` path
   (rationale under Solution Exploration; veto point in Open Questions).
4. **Component type surface survives**: `react-force-graph-3d@1.29.1` still
   exports `ForceGraphMethods`, `ForceGraphProps`, `GraphData`, `LinkObject`,
   and `NodeObject` with defaulted generics, so the component's existing
   non-generic usage remains valid TypeScript.
5. **Second engine is Firefox, and it is part of the required CI gate**: the
   two-browser qualification uses Playwright's `firefox` project alongside
   `chromium`, and both projects run in the required CI smoke
   (`test:smoke` → `validate`). WebKit's WebGL support on headless Linux is
   materially weaker and would qualify the harness more than the app. There
   is **no pre-authorized fallback** to a qualification-only Firefox run: if
   implementation shows Firefox headless cannot produce a WebGL context or
   is irreducibly flaky after the stability measurement in FR8, that is a
   blocking finding to escalate to the architect, and any relaxation is an
   explicit architect scope decision at that time.
6. **`react-force-graph-3d` is pinned exactly at `1.29.1`**: the issue
   mandates "exact" only for `three`/`@types/three`, and house style
   elsewhere preserves range style (`~1.26.0` today), but this spec pins the
   qualified release exactly: one qualified release is one behavioral
   surface, and the exact pin records for future maintainers that *this
   specific version* was behaviorally qualified. The lockfile pins it
   regardless, so the deviation is declarative, not resolutive.

The issue body contains no "Baked Decisions" section; the decisions above are
derived from the issue's scope/constraints text and direct registry
verification. Decisions 3, 5, and 6 are elections made by this spec (not
forced by the issue); approving the spec gate confirms them, and the
architect may override any of them at that gate.

## Scope

### In scope

- Upgrading `three`, `@types/three`, and `react-force-graph-3d` to the target
  group in one atomic manifest + lockfile + code + test change under the
  exact Node `22.23.1` / npm `10.9.8` / lockfile v3 / `npm ci` contract.
- Updating the TrackballControls import to `three/addons/controls/TrackballControls.js`.
- Inspecting and documenting resolved versions and meaningful changes across
  the transitive chain named in the Summary.
- Verifying exactly one Three runtime resolves, and adding dependency-contract
  test coverage that keeps it that way (single runtime; exact `three` /
  `@types/three` alignment; updated version pins).
- Extending automated browser validation to run in Chromium and Firefox,
  including the `browser:install` script and the CI workflow's browser
  provisioning.
- Executing and documenting the complete graph interaction matrix (§FR9) in
  both browsers against the production build, including honest recording of
  any harness-limited items.
- Before/after full and production audit comparison with path-by-path
  explanation of force-graph-chain advisisories resolved or remaining.
- Updating README/docs and contract tests that enumerate commands or pinned
  versions affected by this change.

### Out of scope (non-goals)

- No React Three Fiber rewrite.
- No Next 16, Tailwind 4, React Compiler, or unrelated visual redesign.
- No global `skipLibCheck` removal combined with this runtime upgrade.
- No changes to graph interaction semantics, visual design, data, or the
  dynamic client-only boundary beyond what the upgrade itself requires.
- No new application routes, features, or test-only application surface. The
  scripted matrix qualification (FR9/FR10) operates entirely from outside the
  app — Playwright/CDP `page.evaluate` and real input events against the
  unmodified production page — so this constraint and the qualification
  method are compatible, not in tension.
- No zero-findings audit gate: pre-existing advisories outside the 3D chain
  remain separately tracked evidence, not a blocker here.

## Constraints and Invariants

From the issue (fixed):

- Keep runtime Three and its community types exactly aligned.
- Update the TrackballControls import to the documented `three/addons/...`
  path if required by the qualified release.
- Confirm only one Three runtime is bundled/resolved.
- Preserve the client-only dynamic boundary and existing graph interaction
  semantics.
- Treat the whole 3D manifest/lockfile/code change as one rollback unit.
- A failing interaction blocks the stage; mismatched Three runtime/types are
  not used as a partial workaround.

Repository invariants (fixed):

- Exact Node `22.23.1` / npm `10.9.8`, lockfile v3, clean `npm ci`; no
  dependency regeneration under any other toolchain.
- `npm run validate` (lint → typecheck → build+smoke) is the green gate; full
  and production audits are separately validated evidence, and existing
  advisories are not a zero-findings gate.
- Never `git add -A` / `git add .`; commit messages follow
  `[Spec 11][Phase: name] type: Description`.
- `three` stays in `dependencies`; `@types/three` stays in `devDependencies`
  (classification decided in #10 and unchanged here).

## Solution Exploration

### Approach A: Manifest-only bump, keep Chromium-only validation

Update the three packages and lockfile, rely on the existing single-browser
smoke plus build success.

- **Pros**: smallest diff; fastest.
- **Cons**: fails the issue outright — no second engine, no matrix, and
  install/build success is explicitly insufficient evidence for an
  imperative WebGL surface. The r172→r185 renderer gap (13 releases of
  WebGLRenderer, color-management, and controls evolution) would ship
  unqualified.
- **Risk**: high (silent behavioral regression). **Rejected.**

### Approach B: Chase latest chain instead of the researched pin

Upgrade to whatever `three`/`react-force-graph-3d` are latest at
implementation time and re-derive compatibility on the fly.

- **Pros**: never behind on the day of merge.
- **Cons**: abandons the researched, reviewable target; any post-research
  release would land without staged analysis. As of 2026-07-19 latest *is*
  the researched target, so the approach buys nothing today and removes the
  drift tripwire for tomorrow.
- **Risk**: medium-high (unreviewed target). **Rejected** — drift discovered
  at implementation time escalates to the architect instead (FR1).

### Approach C: Atomic researched-target upgrade with two-browser behavioral qualification (selected)

Upgrade exactly to the reverified target group; move the TrackballControls
import to the documented `three/addons/...` path; extend the automated smoke
to Chromium + Firefox; execute the complete interaction matrix in both
engines against the production build with scripted imperative-handle
evidence for items the headless harness cannot drive; land manifest,
lockfile, code, tests, docs, and CI browser provisioning as one rollback
unit.

- **Pros**: satisfies every acceptance criterion; qualification bar becomes
  durable (two-engine smoke in CI); honest evidence trail continues the
  #9/#10 methodology; single revert restores the entire unit.
- **Cons**: largest test-engineering effort of the three; Firefox software
  WebGL in CI is new surface with flake risk (mitigated in FR8/Risks).
- **Risk**: medium, actively mitigated. **Selected.**

**On the import path**: `three@0.185.1` exports both paths, so staying on
`three/examples/jsm/...` would work. The spec still elects `three/addons/...`
because it is the path Three.js documents for addons, `@types/three@0.185.x`
types it, the diff is one line inside the same rollback unit that is being
behaviorally qualified anyway, and it removes a legacy alias from the
codebase's public-API surface mid-roadmap rather than during a riskier later
stage.

## Functional Requirements

### FR1 — Implementation-time target reverification

Before any manifest edit, reverify against the npm registry under the
repository toolchain: (a) the three target versions exist and remain the
intended targets; (b) the transitive chain's peer/dependency requirements
still admit `three@0.185.1` with a single resolved runtime; (c) whether any
chain package has published a newer release than the research assumed.
If reverification contradicts the researched target group (e.g., a newer
`3d-force-graph` line requiring `three > 0.185`), **stop and escalate to the
architect via `afx send`** rather than silently retargeting. Record the
verification date and findings in the review document.

### FR2 — Atomic manifest and lockfile update

Update `package.json` (`three` → exact `0.185.1` in `dependencies`;
`@types/three` → exact `0.185.1` in `devDependencies`;
`react-force-graph-3d` → `1.29.1` in `dependencies`) and regenerate
`package-lock.json` only via npm under Node `22.23.1` / npm `10.9.8`.
Lockfile stays v3; a subsequent clean `npm ci` must succeed without
mutating `package.json` or `package-lock.json` and without peer-dependency
warnings/errors for the 3D chain. Manifest, lockfile, code, and test changes
land as one unit (single PR; phase commits within it).

### FR3 — Single Three runtime, exactly aligned types

After install: `npm ls three` resolves exactly one `three@0.185.1` with no
duplicates; the lockfile contains no nested `node_modules/**/node_modules/three`
entry; `@types/three` and `three` versions are string-equal. Contract tests
(FR12) enforce all three properties so later dependency work cannot silently
split the runtime or de-align the types.

### FR4 — TrackballControls import path

`app/components/FocusGraph.tsx` imports TrackballControls from
`three/addons/controls/TrackballControls.js`. Typecheck passes against
`@types/three@0.185.1` without new suppressions, ambient declarations, or
`skipLibCheck` changes. Behavior at the call sites (`noPan`, `zoomSpeed`,
`update()`) is unchanged.

### FR5 — Preserved client boundary and interaction semantics

`FocusGraphWrapper.tsx` keeps `dynamic(() => import("./FocusGraph"), {ssr:
false})` unchanged. No graph prop, handler, timer value (4000 ms enable
delay, 20 ms rotation tick, ~1 s reset window), camera parameter (fov 40,
near 1, far 200, focus distance 80), or control semantic changes except as
strictly forced by the upgrade — and if any is forced, it must be called out
explicitly in the review, not absorbed silently.

### FR6 — Transitive chain review and supply-chain verification

Record before/after resolved versions for: `3d-force-graph`,
`three-forcegraph`, `three-render-objects`, `react-kapsule`, `d3-force-3d`,
`ngraph.forcelayout`, `float-tooltip`, `preact`, `kapsule`, `lodash-es`,
`polished`, and `@babel/runtime`. For each package that moved, summarize
meaningful renderer/layout/tooltip/runtime changes (from changelogs/release
notes) relevant to this app's usage.

Supply-chain verification for every lockfile entry changed by this upgrade:
(a) `resolved` URLs point only at the public npm registry
(`registry.npmjs.org`) — no git, tarball-URL, or alternate-registry sources;
(b) no changed entry introduces an install script (`hasInstallScript` /
`preinstall`/`install`/`postinstall`) that its previous version did not have,
and any pre-existing install script in the chain is identified and explained;
(c) `npm ci` output shows no unexpected package-manager behavior (script
execution, engine overrides, funding/deprecation anomalies aside). Findings
go in the review's lockfile section.

### FR7 — Automated validation gates

All of the following pass at the final commit: `npm run lint`,
`npm run typecheck`, `npm test` (including updated contract tests),
`npm run build`, a direct production `npm run start` serving the root page
HTTP 200, `npm run test:smoke`, aggregate `npm run validate`, and the audit
evidence pipeline (`npm run audit:full` / `audit:production` through
`scripts/validate-audit-report.mjs` semantics, preserving original exit
codes).

### FR8 — Two-engine automated browser smoke

`playwright.config.ts` gains a `firefox` project alongside `chromium`; the
Chromium-specific SwiftShader launch args are not applied to Firefox, which
gets an equivalent software-WebGL-tolerant configuration. The smoke spec
passes in both projects against the production server, and **both projects
are part of the required gate** (`test:smoke` → `validate`), locally and in
CI — this is the single acceptance bar (Confirmed Decisions #5). Two
provisioning surfaces move together: the `browser:install` package script
**and** the CI workflow step (today `npm exec -- playwright install
--with-deps chromium`) both install both engines. Before the unit lands,
measure smoke stability over repeated runs (at least five consecutive green
two-project runs locally); if Firefox headless cannot produce a WebGL
context or remains flaky after reasonable configuration effort, that is a
**blocking finding to escalate to the architect** — not a reason to quietly
drop or demote the second engine.

### FR9 — Complete interaction matrix in Chromium and Firefox

The canonical matrix for this stage, exercised against the production build
(`next start`) in both engines on the live graph data:

| # | Behavior | Expected observation |
|---|----------|----------------------|
| 1 | Canvas creation | Canvas element with WebGL/WebGL2 context; nonzero CSS, backing-store, and drawing-buffer dimensions |
| 2 | Initial layout | Force engine assigns node positions (nonzero spread) and rendering settles without errors |
| 3 | Auto-rotation | Camera position changes over time; Pause stops it (Δ≈0); Resume restarts it |
| 4 | Delayed pointer enablement | Node interactions inert before the 4 s enable delay; effective after |
| 5 | Trackball zoom | Wheel zoom in/out changes camera distance in both directions |
| 6 | Trackball rotation | Background drag rotates the camera; pan remains disabled (`noPan`) |
| 7 | Node drag → fix | Dragging a node sets `fx/fy/fz`; a previously fixed node moved away is released per handler semantics |
| 8 | Node right-click → unfix | Right-click on a fixed node clears `fx/fy/fz` |
| 9 | Click-to-focus | Node click stops rotation, fixes the node, and animates the camera to the ~80-unit focus distance over ~2 s |
| 10 | Reset | `zoomToFit` runs; rotation resumes after the ~1 s window when active; canvas remains ready |
| 11 | Axes visibility | Show/Hide Axes toggles the AxesHelper's visibility |
| 12 | Resize | Viewport resize keeps CSS/backing-store/drawing-buffer dimensions consistent and the graph interactive |
| 13 | Unmount/remount | Re-navigation/remount produces a fresh working canvas; no residual timers, listeners, or errors (see FR10) |

Verification is numeric via the react-force-graph imperative handle (camera
position, node `fx` state, `graph2ScreenCoords`, AxesHelper visibility) per
the established lessons — not screenshots. All verification operates from
outside the app (`page.evaluate`/real input events against the unmodified
production page); no test-only application surface is added.

**Acceptance classes** (which items must pass with real input, which may use
scripted evidence, and when an environment-limited result is acceptable):

- **Class A — real-input, must pass, both engines** (items 1–6, 9–12): driven
  by real Playwright pointer/wheel/click events with numeric verification.
  These land in the committed Playwright suite for both projects. A Class A
  failure in either engine is **blocking** (after the baseline-replay check
  below).
- **Class B — real input attempted; scripted fallback permitted** (items 7
  and 8): #9/#10 established that headless SwiftShader Chromium does not
  register synthetic node DRAG (`onNodeDragEnd`) or node RIGHT-click
  (`onNodeRightClick`) even with real dispatched events. For these two items,
  per engine: (a) attempt real events first — if they register, the observed
  behavior must be correct, else **blocking**; (b) if they do not register,
  replay the identical input against the rollback baseline (checked-in
  versions) — the limitation is acceptable **only if the baseline exhibits
  the identical non-registration**, proving a harness property rather than a
  regression; and (c) verify the handler wiring via scripted
  imperative-handle evidence plus the lifecycle/unit suites. Record exactly
  what was exercised and what registered, per engine.
- **Item 13** is qualified per FR10.

An "environment-limited" recording is only ever acceptable for input
*delivery* (the harness failing to register an event), never for handler
*behavior*: any case where the input registers and the resulting state is
wrong is a blocking regression. Any behavioral difference from the current
baseline must be replayed with the same physical input against the rollback
baseline before being attributed to the upgrade.

### FR10 — Resize and unmount/remount qualification

Resize: after a viewport resize in each engine, the canvas CSS size,
backing-store size, and drawing-buffer dimensions remain consistent and the
graph stays interactive (matrix item 12). Unmount/remount: the lifecycle
unit suite (`tests/focus-graph-lifecycle.test.mjs`) passes under the
upgraded stack, and in-browser re-navigation to the page yields a fresh
working canvas and a clean error budget (matrix item 13). No new application
routes or test-only application surface are added for this: qualification
uses re-navigation plus the existing unit suites, all driven from outside
the app. A deeper in-place unmount/remount harness would require test-only
application surface and is out of scope unless the architect explicitly
requests it.

### FR11 — Error budget

Across all automated smoke runs and matrix executions in both engines: zero
unexpected page errors, console errors, hydration warnings/mismatches,
timer-related errors, WebGL-context-lost events, or GPU/driver errors. The
strict console/page-error collection pattern of the existing smoke is
retained and applied to both projects. Expected-and-isolated externalities
(the Vercel insights scripts already stubbed by the smoke) remain the only
sanctioned exclusions; any new exclusion requires explicit documentation.

### FR12 — Dependency-contract and docs updates

`tests/toolchain.test.mjs` moves its `three` pin from `~0.172.0` to the new
exact target and gains assertions for: single Three runtime in the lockfile
(mirroring the existing single-React-runtime test), exact `three` /
`@types/three` version equality, and the new `react-force-graph-3d` pin.
`tests/automation.test.mjs` and README stay truthful about commands and CI
artifacts if browser provisioning changes their enumerations. All doc/test
enumerations updated in the same rollback unit.

### FR13 — Audit comparison and lockfile review

Before/after full (`npm audit`) and production (`npm audit --omit=dev`)
comparisons, path-by-path, preserving original exit codes per the
validate-audit-report methodology. Explicitly identify which pre-existing
advisory paths through the 3D chain are resolved by this upgrade and which
remain, with ownership notes. Raw JSON stays local/CI evidence; the review
document carries the comparison table.

### FR14 — Rollback unit and blocking semantics

The manifest, lockfile, component import, Playwright config, contract tests,
docs, and CI provisioning changes are one revertible unit: a single revert
restores the previous, fully-qualified baseline. If any matrix item fails in
either engine and baseline replay attributes it to the upgrade, the stage is
**blocked** (escalate with evidence); do not ship partial workarounds, and
specifically never a mismatched Three runtime/types combination.

## Non-Functional Requirements

### Reproducibility

Everything under the exact Node `22.23.1` / npm `10.9.8` / lockfile v3 /
`npm ci` contract; no toolchain drift; lockfile provenance stays the public
registry.

### Behavior preservation

The user-visible contract of the page — timing, camera semantics, pointer
semantics, control buttons — is identical before and after. This stage exists
to prove that, not merely assert it.

### Evidence honesty

Every claim in the review must state engine, renderer (hardware/SwiftShader/
software), input method (real event vs. scripted handle), and result.
Environment-limited results are recorded as such.

### Supply-chain integrity

The upgraded chain introduces no new install scripts, no non-registry
sources, and no unexpected package-manager behavior (FR6); audit evidence is
compared path-by-path with original exit codes preserved (FR13).

### Maintainability

The two-engine smoke and strengthened contract tests become the standing
qualification bar for later stages (Next 16 etc.), not one-off scaffolding.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| 13-release Three renderer gap changes visuals/behavior (color management, WebGLRenderer internals, controls evolution) | User-visible regression | Full two-engine matrix with numeric verification; baseline replay before attribution; blocking semantics (FR14) |
| `3d-force-graph` 1.76→1.80 / `three-render-objects` 1.37→1.42 change controls/tooltip/render behavior | Interaction regression | FR6 chain review against changelogs; matrix items 3–10 exercise exactly this surface |
| Firefox headless software WebGL is new, potentially flaky CI surface | CI instability or false blocks | Separate project config without Chromium-specific flags; measured stability over repeated runs before landing in the required gate; genuine inability to create a context escalates rather than silently dropping the engine (FR8) |
| Headless harness cannot drive node drag/right-click with real events (known from #9/#10) | Coverage gap misread as pass | Scripted imperative-handle evidence with honest per-engine recording (FR9); lifecycle unit suite still covers handler logic |
| npm resolves a second nested Three runtime | Bundle bloat, split-runtime bugs | FR3 verification plus permanent contract test |
| Registry drift between research and implementation | Unreviewed target ships | FR1 reverification with escalation, not silent retarget |
| Type surface changes in `@types/three` 0.185 or `react-force-graph-3d` 1.29 break the component | Typecheck failure or unsafe casts | Pre-verified export surface (Confirmed Decisions #4); FR4 forbids new suppressions; failures escalate |
| Playwright version lacks current Firefox support nuances | Smoke gaps | Playwright stays at its pinned `1.61.1` (updating it is out of scope); if its Firefox build cannot qualify WebGL, escalate per FR8 |

## Acceptance Scenarios

### Scenario 1 — Verified supported target group
`npm ci` on the updated manifest under the exact toolchain completes with a
supported peer tree, lockfile v3, no manifest mutation, and exactly one
`three@0.185.1` with `@types/three@0.185.1` string-equal.

### Scenario 2 — Static and automated gates
Lint, typecheck, `npm test`, build, direct production start, two-engine
`test:smoke`, and aggregate `validate` all exit 0 at the final commit.

### Scenario 3 — Two-engine interaction matrix
All Class A matrix items pass with real input in Chromium and Firefox
against the production build; Class B items either pass with real input or
carry the full FR9 environment-limited evidence chain (baseline replay
proving a harness property, plus scripted handler verification); item 13
passes per FR10 — all with zero unexpected errors per FR11.

### Scenario 4 — Honest lockfile and audit story
The review documents before/after resolved versions for the entire named
chain, meaningful upstream changes, and the full/production audit deltas
path-by-path, including which 3D-chain advisory paths this stage resolved.

### Scenario 5 — Atomic rollback
A single revert of the unit restores the previous baseline; no follow-up
fixes are required to return to green.

### Scenario 6 — Blocking honored
If any qualified interaction fails under the upgrade, the stage stops with
evidence and escalation — no partial pins, no mismatched runtime/types.

## Open Questions

### Critical

- None. Registry verification (2026-07-19) confirmed target existence, peer
  satisfiability, both import paths, and the type export surface.

### Important

- None open. Every previously contingent choice is now a settled decision in
  the spec body, overridable only at the spec-approval gate: exact
  `react-force-graph-3d` pin (Confirmed Decisions #6), `three/addons/...`
  import election (Confirmed Decisions #3 and Solution Exploration), Firefox
  as the second engine **inside the required CI gate with no pre-authorized
  fallback** (Confirmed Decisions #5, FR8), and unmount/remount depth =
  re-navigation + unit suites with no test-only app surface (FR10). If the
  architect wants any of these changed, that happens at the gate, and the
  spec is amended before planning.

### Nice-to-know

- Whether the upgrade shifts bundle size materially (first-load JS for the
  graph route) — worth recording in the review, not a gate.
- Whether `preact` (via `float-tooltip`) and `polished` move at all, given
  their indirect role — captured by FR6 regardless.

## References

- Issue #11; roadmap issue #6; research:
  `codev/research/architecture-dependency-modernization.md` (Stage 2).
- Prior stages: spec/plan/review 9 (Next 15/React 19), 10 (CSS/build/ESLint),
  bugfix 8 (FocusGraph lifecycle hardening).
- `codev/resources/arch.md` (Validation Baseline; Dependency Classification),
  `codev/resources/lessons-learned.md` (Validation Evidence).
- Registry verification 2026-07-19: `npm view` of `three@0.185.1`,
  `@types/three@0.185.1`, `react-force-graph-3d@1.29.1`,
  `3d-force-graph@1.80.0`, `three-render-objects@1.42.0`,
  `three-forcegraph@1.43.4`; `react-force-graph-3d@1.29.1` d.ts inspection.

## Consultation Log

### Iteration 1 — initial three-way review (2026-07-19)

- **Gemini: APPROVE (high confidence).** Endorsed the exact-pin rationale,
  the `three/addons/...` election, and the Firefox-with-honest-limits
  testing approach. No issues.
- **Claude: APPROVE (high confidence).** Independently verified every
  factual claim against the codebase (manifest versions, import paths,
  Playwright/CI config, contract-test pins, camera/timer parameters). Minor
  notes: make the package-script vs. CI-workflow provisioning distinction
  explicit; noted the exact pin is declarative since the lockfile pins
  regardless.
- **Codex: REQUEST_CHANGES (high confidence).** Five points, all accepted
  and incorporated:
  1. `react-force-graph-3d` pin was simultaneously mandated (FR2/FR12) and
     open (Open Questions #1) → settled as Confirmed Decisions #6; Open
     Questions cleared.
  2. Firefox CI bar contradicted the Open Questions fallback → single
     acceptance bar encoded in Confirmed Decisions #5 and FR8; no
     pre-authorized fallback, escalation only.
  3. FR9 acceptance semantics were fuzzy → explicit Class A (real-input,
     blocking, items 1–6/9–12) vs. Class B (items 7–8, real input attempted,
     baseline-replay-proven harness limitation + scripted handler evidence)
     classes; environment-limited is only ever acceptable for input
     delivery, never for handler behavior.
  4. "No new routes" vs. scripted qualification tension → clarified in Scope,
     FR9, and FR10 that all qualification is driven from outside the app
     (`page.evaluate`/real events against the unmodified production page).
  5. Supply-chain verification was implicit → FR6 now requires
     registry-only `resolved` URLs, install-script delta checks, and clean
     `npm ci` behavior for every changed lockfile entry; new NFR added.
- Claude's provisioning note was also applied to FR8 (both `browser:install`
  and the CI workflow step are named as surfaces that move together).
