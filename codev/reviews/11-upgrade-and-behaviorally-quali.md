# Review: upgrade-and-behaviorally-quali

## Summary

Upgraded the application's highest-runtime-risk dependency unit — the
Three.js / force-graph chain — and behaviorally qualified it against a
captured baseline in two browser engines. The runtime moved `three`
0.172.0 → **0.185.1**, `@types/three` 0.172.0 → **0.185.1** (kept exactly
string-equal to the runtime), and `react-force-graph-3d` 1.26.0 → **1.29.1**,
all as exact pins and as a single atomic rollback unit (manifest + lockfile +
one-line code change + contract tests in one PR).

Because install/build success cannot validate imperative WebGL behavior, the
stage was delivered baseline-first across three phases:

1. **firefox-second-engine** — added Firefox as a required second engine in
   the browser smoke gate (harness only, on the current baseline).
2. **matrix-suite-baseline** — automated the FR9 Class A interaction matrix
   for both engines (`tests/e2e/graph-handle.ts` fiber-walk imperative-handle
   probe + `tests/e2e/matrix.spec.ts`), and captured the complete **baseline**
   evidence package (before-audits, resolved chain versions, Class B scripted
   transcripts) — still on the pre-upgrade stack.
3. **dependency-upgrade-qualification** — applied the upgrade and proved
   behavioral preservation against the Phase 2 baseline in both engines.

The only application-code change in the entire stage is the one-line
TrackballControls import moved to `three/addons/controls/TrackballControls.js`.

## Spec Compliance

| FR | Requirement | Status |
|----|-------------|--------|
| FR1 | Implementation-time target reverification | ✅ Reverified 2026-07-20: zero drift, all targets == registry `latest`; chain peers admit a single `three@0.185.1`; no escalation. |
| FR2 | Atomic manifest + lockfile update | ✅ `npm install` under Node 22.23.1/npm 10.9.8; lockfile v3; clean `npm ci` byte-identical (sha256), no 3D-chain peer warnings. |
| FR3 | Single Three runtime, aligned types | ✅ Exactly one `three@0.185.1` (all chain deduped); no nested three; `@types/three` string-equal. Contract tests enforce. |
| FR4 | TrackballControls import path | ✅ `three/addons/controls/TrackballControls.js`; typecheck clean, no new suppressions; call-site semantics (`noPan`, `zoomSpeed`, `update()`) unchanged. |
| FR5 | Preserved client boundary + semantics | ✅ `app/components/` diff is exactly the one import line; wrapper/resources/page/layout/graph-data byte-identical; no timer/camera/handler changes. |
| FR6 | Chain review + supply-chain verification | ✅ Before/after resolved versions recorded; all changed `resolved` URLs are registry.npmjs.org; no new install scripts (`hasInstallScript:false` throughout). |
| FR7 | Automated validation gates | ✅ lint, typecheck, `npm test` (21/21), build, prod `npm start` HTTP 200, two-engine `test:smoke`, aggregate `validate` — all exit 0 at the final commit (locally, both engines). CI runs the Chromium arm — see *CI Enforcement vs. Local Qualification*. |
| FR8 | Two-engine automated browser smoke | ✅ Both engines in the required **local** gate since Phase 1, green with 5× stability. CI enforces the Chromium (SwiftShader) arm deterministically; Firefox stays a documented local qualification gate (GPU-less runners cannot bring up Firefox WebGL) — see *CI Enforcement vs. Local Qualification*. |
| FR9 | Complete interaction matrix, both engines | ✅ Class A (items 1–6, 9–12) committed with real input, numeric verification, both engines. Class B (7, 8) replayed vs baseline (see Deviations). |
| FR10 | Resize + unmount/remount qualification | ✅ Matrix items 12/13 green; lifecycle unit suite passes; re-navigation yields fresh working canvas, clean error budget. |
| FR11 | Error budget | ✅ Zero unexpected console/page/WebGL-context errors across all runs; `contextLost=0` everywhere. |
| FR12 | Dependency-contract + docs updates | ✅ `toolchain.test.mjs`: both three pins → 0.185.1, plus new single-three-runtime, three/@types/three alignment, and rfg3d exact-pin tests. |
| FR13 | Audit comparison + lockfile review | ✅ full 13→11, production high 1→0; both 3D-chain advisories (`@babel/runtime`, `lodash-es`) resolved, none new; exit codes (1/1) preserved. |
| FR14 | Rollback unit + blocking semantics | ✅ Single PR = rollback unit; Phase 3 revert restores the qualified baseline; no behavioral divergence attributable to the upgrade. |

**Acceptance-criteria scenarios** (spec §Scenarios): 1 (verified target group),
2 (static+automated gates), 3 (two-engine matrix), 4 (honest lockfile/audit
story), 5 (atomic rollback — single-commit revert restores baseline),
6 (blocking honored) — all satisfied.

## Deviations from Plan

- **Phase 2, Class A items 4 (delayed enablement) and 9 (click-to-focus
  stop-rotation slice)** were committed with numeric / paused verification
  rather than the plan Deliverables bullet's fuller real-input phrasing. This
  is **not** a silent downgrade: it is the path the plan's own approved
  Risk/Mitigation clause pre-authorized ("a test that cannot be stabilized
  moves that item to the scripted-evidence path only with the limitation
  demonstrated and recorded … remains a Class A obligation at qualification
  time"), and FR9's rule that environment-limited recordings are acceptable
  for input *delivery* (never handler *behavior*). Both limitations are
  demonstrated on both engines (a real click cannot land on an orbiting
  projection; real input cannot be delivered inside the pre-enablement warmup
  window) and the handler behavior itself is committed with real input
  (post-enable wheel zoom; stationary click fix + camera animation). Codex
  raised this at matrix iter1; the rebuttal was accepted (matrix iter2
  unanimous APPROVE).

- **Phase 3, Class B item 7 (node-drag)** registered on one baseline draw but
  is genuinely intermittent under SwiftShader. Per FR9(b), the identical input
  was replayed on the rollback baseline: the registration rate is **identical**
  (2/4 true on both baseline and upgraded Chromium; Firefox 1/1 both), so the
  intermittent non-registration is a harness property, not an upgrade
  regression. When it registers, `onNodeDragEnd` behaves correctly on both
  stacks.

- **Porch index-sweep (process note, not a spec deviation)**: staging the
  Phase 2 deliverables for the review diff before `porch done` caused porch's
  `chore(porch)` re-iter commit to absorb them (porch commits the staged
  index, not just status.yaml). Content is correct and complete; the pattern
  for later phases was to commit deliverables under a proper
  `[Spec 11][Phase: …]` message *before* signaling porch.

## CI Enforcement vs. Local Qualification

This PR is the first to run the two-engine matrix + smoke on GitHub Actions
runners, and that environment (no GPU, software WebGL, slower CPU) was never
qualified. The initial CI runs surfaced two distinct, honestly-different
problems — recorded here so the split between **what CI enforces** and **what
remains local-only qualification evidence** is explicit.

**1. Firefox cannot bring up a WebGL context on Actions runners (environment
gap, not a regression).** Every Firefox test failed identically: `three`'s
`WebGLRenderer` threw
`A WebGL context could not be created … * tryNativeGL () * Exhausted GL driver
options (FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS)`, which crashes the client
("Application error") so the sized-canvas wait times out. Chromium survives
because it is launched with `--use-angle=swiftshader` (a bundled, deterministic
software rasterizer); Firefox has no SwiftShader equivalent. `webgl.force-enabled`
bypasses Firefox's *blocklist* but supplies no driver — GPU-less runners lack
the Mesa llvmpipe software GL that Firefox's `tryNativeGL` needs, and a robust
bring-up would additionally require `LIBGL_ALWAYS_SOFTWARE`/`GALLIUM_DRIVER`
plus **headed Firefox under Xvfb**. Both external reviewers (Gemini, Codex)
independently advised against making software-WebGL Firefox a required CI gate:
it is materially less deterministic than Chromium+SwiftShader on shared Linux
VMs and prone to breaking on runner-image updates.

**Disposition (the architect's option 3):** CI enforces **Chromium
(SwiftShader)** as the required, deterministic gate. The **Firefox** arm of the
two-engine matrix remains a **documented local qualification gate** — it was
qualified locally (developer GPU) at **5×20/20 two-engine green** plus the FR9
baseline-replay evidence recorded above, and that evidence is unchanged and not
in question. This does **not** weaken qualification (the second engine was
qualified; CI simply cannot host its WebGL stack) and does **not** hide
regressions: Chromium continuously enforces every behavioral assertion in the
matrix + smoke, so a logical interaction/WebGL regression would still fail CI.
Firefox-specific rendering divergence is covered by the local qualification and
is re-runnable on demand. Mechanism: `playwright.config.ts` selects engines
from an `E2E_ENGINES` env var — **unset ⇒ the full two-engine matrix** (the
local gate); the workflow sets `E2E_ENGINES=chromium`. `npm run validate` run
locally therefore still exercises both engines.

**2. Two Chromium matrix tests timed out on the slow runner CPU (timing
calibration, not a behavior change).** `keeps pointer navigation inert…` and
`zooms in with the wheel…` waited on a 5 s inner poll for wheel-zoom motion to
settle; under the runner's software rasterizer a frame can take far longer, so
the motion landed after 5 s. Fixed by CI-calibrating the five camera-motion
settle polls (`SETTLE_TIMEOUT_MS = process.env.CI ? 20_000 : 5_000` in
`matrix.spec.ts`). **Local qualification timing is unchanged** (still 5 s); only
CI gets headroom. The assertions, thresholds, and inputs are untouched — this
raises a wait ceiling for a slow environment, it does not relax what is proven.

**App code was not touched** for either fix (FR5 no-drift holds — the only
`app/` change in the whole stage is still the one TrackballControls import
line); all changes are confined to test/CI infrastructure and its docs:
`playwright.config.ts`, `tests/e2e/matrix.spec.ts`,
`.github/workflows/validation.yml`, the `tests/automation.test.mjs` workflow
contract test (re-pinned to the Chromium-only install + `E2E_ENGINES=chromium`
gate), and the README CI section. The `browser:install` script and the local
`validate` path still install and run **both** engines — only what CI *enforces*
narrowed, not what is locally qualified.

## Lessons Learned

### What Went Well
- **Baseline-first sequencing paid off exactly as designed.** Capturing the
  matrix + Class B evidence on the pre-upgrade stack (Phase 2) made the Phase 3
  qualification a mechanical before/after comparison, and turned the one
  node-drag divergence into a quick, evidence-backed non-issue instead of a
  guessing game.
- **The exact-pin + single-runtime contract tests** give the codebase a
  durable guard: a future dependency bump cannot silently split the Three
  runtime or de-align `@types/three` without failing `npm test`.
- **The upgrade was genuinely clean**: one app-code line, both 3D-chain
  security advisories resolved, nothing new introduced, all gates green with
  5× stability, unanimous first-round approval on Phase 3.

### Challenges Encountered
- **Software-rendered WebGL input delivery is the dominant harness
  constraint.** A click cannot land on an orbiting node (the decisive hover
  raycast resolves a frame after pointerup while the projection pans
  ~430 px/s), real input can't be delivered inside the ~6 s warmup window, and
  node drag registers only intermittently. Resolved by the spec's Class A/B
  acceptance framework: qualify the deliverable behavior with real input where
  the environment allows, and record the input-*delivery* limits honestly with
  baseline-replay proof that they are harness properties.
- **Nondeterministic interactions defeat single-draw comparison.** The Phase 3
  node-drag "divergence" was a false alarm from comparing two single draws;
  characterizing the *rate* across repeats on both stacks (2/4 == 2/4) was
  what actually settled it.
- **`graph2ScreenCoords` maps behind-camera nodes to plausible on-screen
  coordinates**, and Trackball zoom momentum overshoots coarse wheel steps by
  ~10×; both required depth-filtering and fine adaptive stepping in the probe.

### What Would Be Done Differently
- Commit each phase's deliverables under their proper `[Spec 11][Phase: …]`
  message *before* running `porch done`, now that we know porch sweeps the
  staged index into its own chore commit.
- Build the drag/right-click evidence procedure with rate-characterization
  (N repeats) from the start, rather than single-draw transcripts, since the
  Class B interactions are inherently intermittent.

### Methodology Improvements
- The SPIR rebuttal loop worked well: a REQUEST_CHANGES that is genuinely a
  false positive (matrix items 4/9) was resolved by a grounded rebuttal
  (citing the plan's own risk clause + spec FR9 + fresh evidence) without
  fabricating test coverage, and the reviewer upgraded to APPROVE. The key was
  reading the *whole* approved plan (its Risk section), not just the
  Deliverables bullet the reviewer quoted.

## Consultation Feedback

### Specify Phase (Round 1)
- **Gemini** — APPROVE, no blocking concerns.
- **Claude** — APPROVE; non-blocking browser-provisioning note **Addressed**.
- **Codex** — REQUEST_CHANGES, 5 points, **all Addressed** (spec amended, not
  argued): the `react-force-graph-3d` pin made a settled Confirmed Decision
  (removed the contradictory Open Question); one Firefox/CI acceptance bar
  (Firefox inside the required gate, no pre-authorized fallback); FR9 given
  explicit Class A/B acceptance semantics with the "environment-limited is for
  input delivery, never handler behavior" rule stated verbatim; "no new
  routes" reconciled with external-harness qualification in three places;
  point 5 accepted into the amended spec.

### Plan Phase (Round 1)
- **Claude** — APPROVE; non-blocking note **Addressed** (name both `three`
  contract-test locations in Phase 3's deliverable).
- **Gemini** — REQUEST_CHANGES **Addressed**: Phase 1 would have broken
  `npm test` at its own commit (the `browser:install` contract assertion), so
  `toolchain.test.mjs` was added to Phase 1's scope with the every-phase-green
  requirement.
- **Codex** — REQUEST_CHANGES, 2 points **Addressed**: mandate Playwright
  cross-engine trusted input as the primary Class B method for both engines
  (CDP demoted to optional Chromium diagnostic); add the explicit FR5 no-drift
  verification step (exactly one changed `app/components/` line).

### Implement — firefox-second-engine (Round 1 → Round 2)
- **R1 Gemini** — COMMENT (lane skipped: `agy` tooling unavailable in-env).
- **R1 Codex & Claude** — REQUEST_CHANGES **Addressed**: the README
  "Continuous integration" section was still Chromium-only after the workflow
  change; updated to Chromium+Firefox with the exact command, and a contract
  assertion added so README/workflow divergence of this kind fails `npm test`.
- **R2** — Codex APPROVE, Claude APPROVE, Gemini COMMENT (lane skipped).

### Implement — matrix-suite-baseline (Round 1 → Round 2)
- **R1 Gemini & Claude** — APPROVE.
- **R1 Codex** — REQUEST_CHANGES (items 4 & 9 "downgraded" to numeric/scripted)
  — **Rebutted**: the plan's approved Risk/Mitigation clause pre-authorizes the
  scripted-evidence path for unstabilizable Class A items; FR9 sanctions
  environment-limited recordings for input delivery; `controlsEnabled` is the
  same `clickEnabled` gate that governs node clicks (source-confirmed); fresh
  both-engine evidence shows the moving-click cannot land. No code change.
- **R2** — unanimous APPROVE (Codex: "honest handling of demonstrated
  input-delivery limits").

### Implement — dependency-upgrade-qualification (Round 1)
- **Gemini, Codex, Claude** — all APPROVE, **no concerns raised**. Claude's
  three "minor observations" were confirmations (bare version strings are
  npm's exact-pin format; `~` ranges correctly replaced with exact;
  commit-message convention followed).

## Architecture Updates

Routed one system-shape fact to the **cold** `arch.md` (reference detail,
subsystem-specific — not a cross-cutting always-on invariant, so it does not
belong in the capped hot tier): under **Dependency Classification and Lint
Config**, recorded that the 3D unit is now exact-pinned
(`three`/`@types/three` string-equal at 0.185.1, `react-force-graph-3d`
1.29.1) with a single resolved `three` runtime, that TrackballControls is
imported from the documented `three/addons/...` path, and that
`toolchain.test.mjs` enforces single-runtime + type-alignment + exact pins.
The hot `arch-critical.md` already carries the general reproducibility
contract (exact toolchain + `npm ci`) that governs this class of change; no
hot-tier displacement was needed.

## Lessons Learned Updates

Refined two existing entries in the **cold** `lessons-learned.md` under
**Validation Evidence** rather than appending duplicates (the baseline-replay
and imperative-handle lessons already existed; this project sharpened both):

1. Extended the "replay against the rollback baseline" lesson with the
   nondeterministic case: for a flaky interaction, a single before/after draw
   is not evidence — characterize the registration **rate** across repeated
   runs on both stacks; equal rates (2/4 == 2/4 for node drag across the
   upgrade) prove a harness property, not a regression.
2. Corrected the SwiftShader synthetic-input lesson, which previously said node
   drag and right-click simply "do not register." This project found the more
   precise truth (and confirmed it survives the upgrade in both engines):
   right-click **does** register when aimed at the fixed node's exact
   projection after wheeling to moderate depth; drag registers **intermittently**
   (~50%); and a left-click only lands on a *stationary* target.

No hot-tier change: `lessons-critical.md` already carries the always-on
"outside perspective when stuck" and "deliverables in the review diff"
lessons, and its **Validation Evidence** map topic already points at exactly
the cold section these refinements live in — so the routing target was correct
and no cap displacement was needed.

## Technical Debt
- `hasSizedCanvas` is duplicated between `tests/e2e/smoke.spec.ts` and
  `tests/e2e/graph-handle.ts` (smoke predates the Phase 2 helper). Harmless;
  a future harness cleanup could consolidate it.
- The Class B scripted procedure (drag / right-click / moving-click) remains
  an uncommitted evidence artifact (`.builder-evidence/diag.spec.ts.hold`) per
  house precedent, not part of the committed gate. Its rate-characterization
  wrapper lives only in the builder evidence directory.

## Flaky Tests
No pre-existing flaky tests were skipped. Two flakes were **found and fixed**
(not skipped) while building the Phase 2 matrix suite, and both fixes are in
the committed suite:
1. Numeric-poll timeout starvation on the resize/axes tests under software
   rendering — poll budgets raised to 15 s.
2. Stray wheel-path node registration during the click-to-focus zoom (both
   engines, ~1/12) — the test now wheels from a screen corner, guards
   `fixedNodeCount === 0` before aiming, and recovers on a fresh page (≤2) if a
   stray is detected.

Post-integration, two more environment-induced flakes were **fixed, not
skipped**, when the suite first ran on GitHub Actions runners (see *CI
Enforcement vs. Local Qualification*): the two Chromium wheel-zoom tests whose
5 s settle poll was too tight for the runner's software rasterizer — resolved
by CI-calibrating the settle ceiling to 20 s (`process.env.CI` only; local
timing unchanged).

## Follow-up Items
- The residual audit advisories are all Next.js/toolchain-owned
  (`next`, `@vercel/*`, `geist`, `postcss`, and dev-only `brace-expansion`,
  `flatted`, `glob`, `minimatch`, `picomatch`, `yaml`) — outside this stage's
  3D unit. They belong to their own modernization units (tracked under #6).
- `skipLibCheck` removal was explicitly kept out of scope (spec non-goal) and
  remains available as a separate follow-up.
- **Firefox in CI (optional, non-blocking):** if continuous Firefox coverage is
  wanted beyond the local qualification gate, add a *separate, non-blocking*
  Actions job running `E2E_ENGINES=chromium,firefox` under the full
  software-WebGL recipe (Mesa `libgl1-mesa-dri`/`libglx-mesa0` +
  `LIBGL_ALWAYS_SOFTWARE=1` + headed Firefox under `xvfb-run`), and promote it
  to required only after it stays green for a sustained streak. Both external
  reviewers flagged this stack as too flaky to own the main PR gate today, so it
  is deliberately left out of the blocking gate.
