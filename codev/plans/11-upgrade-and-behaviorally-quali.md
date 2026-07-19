# Plan: Upgrade and Behaviorally Qualify the Three.js Force-Graph Stack

## Metadata
- **ID**: plan-2026-07-19-three-force-graph-upgrade
- **Status**: draft
- **Specification**: [codev/specs/11-upgrade-and-behaviorally-quali.md](../specs/11-upgrade-and-behaviorally-quali.md)
- **Created**: 2026-07-19

## Executive Summary

The spec's selected Approach C upgrades `three`/`@types/three` to exact
`0.185.1` and `react-force-graph-3d` to exact `1.29.1` as one rollback unit,
qualified behaviorally in Chromium **and Firefox** rather than by install/build
success.

The plan's core sequencing decision: **build and qualify the two-engine
harness against the current (pre-upgrade) baseline first, then flip the
dependencies**. Phases 1–2 extend the browser-validation harness (Firefox
project, automated Class A matrix suite) and prove it green and stable on the
checked-in `three@0.172.0` stack, capturing baseline evidence — including the
Class B (node-drag / right-click) registration behavior per engine and the
before-side audits. Phase 3 then changes the dependency unit itself. This
makes every behavioral delta observed in Phase 3 attributable to the
dependency change, not to new harness code, and it gives the FR9 Class B
baseline-replay rule its baseline measurements *before* the upgrade exists.
It also fails fast: if Firefox headless WebGL is unworkable in this
environment, we escalate in Phase 1 before any dependency work is invested.

All three phases are commits on one branch shipped in a single PR (per the
project PR strategy); the PR is the spec's FR14 rollback unit. Phases 1–2 are
dependency-neutral harness work, so a Phase 3-only revert also cleanly
restores the qualified baseline while keeping the improved harness.

## Success Metrics

- [ ] All spec acceptance scenarios 1–6 met (verified supported target group;
      static and automated gates; two-engine matrix; honest lockfile/audit
      story; atomic rollback; blocking honored).
- [ ] `npm ci` under Node `22.23.1` / npm `10.9.8` resolves exactly one
      `three@0.185.1`, string-equal `@types/three`, lockfile v3, no manifest
      mutation, no 3D-chain peer warnings.
- [ ] `npm run validate` green with both Playwright projects in the gate;
      ≥5 consecutive green two-project browser runs before landing.
- [ ] Class A matrix items pass with real input in both engines on the
      upgraded stack; Class B items carry the full FR9 evidence chain.
- [ ] Zero unexpected console/page/hydration/timer/WebGL-context/GPU errors
      (FR11).
- [ ] FR6 supply-chain verification clean (registry-only sources, no new
      install scripts, clean `npm ci` behavior).
- [ ] Contract tests enforce the new pins, single Three runtime, and exact
      three/@types/three alignment.

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "firefox_second_engine", "title": "Add Firefox as a Required Second Smoke Engine on the Current Baseline"},
    {"id": "matrix_suite_baseline", "title": "Automate the Class A Interaction Matrix and Capture Baseline Evidence"},
    {"id": "dependency_upgrade_qualification", "title": "Upgrade the Three.js Force-Graph Unit and Qualify Behavior"}
  ]
}
```

## Phase Status

| Phase | Status | Planned commit |
| --- | --- | --- |
| Add Firefox as a Required Second Smoke Engine on the Current Baseline | pending | `[Spec 11][Phase: firefox-second-engine] test: Require Firefox alongside Chromium in the browser smoke gate` |
| Automate the Class A Interaction Matrix and Capture Baseline Evidence | pending | `[Spec 11][Phase: matrix-suite-baseline] test: Automate the Class A graph interaction matrix` |
| Upgrade the Three.js Force-Graph Unit and Qualify Behavior | pending | `[Spec 11][Phase: dependency-upgrade-qualification] feat: Upgrade the three/react-force-graph-3d unit to 0.185.1/1.29.1` |

## Phase Breakdown

### Phase 1: Add Firefox as a Required Second Smoke Engine on the Current Baseline
**Dependencies**: None

#### Objectives
- Make the existing browser smoke run and pass in Chromium **and** Firefox
  against the production build on the current dependency baseline, inside the
  required gate (`test:smoke` → `validate`), locally and in CI (spec Confirmed
  Decisions #5, FR8).
- Fail fast on the one genuinely novel environmental risk (Firefox headless
  software WebGL) before any dependency work.

#### Deliverables
- [ ] `firefox` Playwright project running the existing smoke spec.
- [ ] Both provisioning surfaces updated together: `browser:install` script
      and the CI workflow install step.
- [ ] README and automation contract test truthful about the new enumeration.
- [ ] Stability evidence: ≥5 consecutive green two-project browser runs.
- [ ] Quick registry drift check (early-warning form of FR1).

#### Files
- `playwright.config.ts` — add the `firefox` project.
- `package.json` — `browser:install` installs `chromium firefox`.
- `.github/workflows/validation.yml` — install step provisions both engines
  (`npm exec -- playwright install --with-deps chromium firefox`); step name
  updated truthfully.
- `README.md` — browser-validation wording covers both engines.
- `tests/automation.test.mjs` — workflow-step name/regex assertions updated
  to the new truthful enumeration.
- `tests/toolchain.test.mjs` — the "exposes direct validation and audit
  commands" test asserts the exact `browser:install` script string
  (`"playwright install chromium"` today); update that assertion in the same
  commit so `npm test` stays green at the Phase 1 commit.

#### Implementation Details
- The `firefox` project mirrors the chromium project's viewport (800×600) via
  `devices["Desktop Firefox"]` but must **not** inherit the Chromium-specific
  SwiftShader launch args. Software-WebGL tolerance is configured through
  `firefoxUserPrefs` (e.g., `webgl.force-enabled`; exact prefs determined
  empirically and recorded in the review). Keep `fullyParallel: false`,
  `workers: 1`; projects run sequentially against the single `webServer`
  instance.
- Stability measurement: one full `npm run test:smoke` (build + both
  projects), then ≥4 further `npm exec -- playwright test` runs against the
  same build. All five must be green before commit.
- Run a quick `npm view` drift check on the three target packages; on any
  contradiction with the spec's researched targets, stop and escalate to the
  architect (`afx send`) before proceeding.

#### Acceptance Criteria
- [ ] `npm run test:smoke` exits 0 running **both** projects.
- [ ] `npm run validate` green; `npm test` green at the Phase 1 commit (both
      the automation contract test for the workflow change and the toolchain
      contract test for the `browser:install` string updated in this commit).
- [ ] ≥5 consecutive green two-project browser runs recorded.
- [ ] No changes to dependencies, application code, or smoke assertions in
      this phase.

#### Test Plan
- **Unit/contract**: `npm test` (automation test asserts the new provisioning
  enumeration in workflow + README).
- **Integration**: two-project `test:smoke` against the production server.
- **Manual**: none required; escalation path exercised only if Firefox WebGL
  is unworkable.

#### Rollback Strategy
Single-commit revert; touches only harness/config/docs, so reverting cannot
affect the application or dependency baseline.

#### Risks
- **Risk**: Firefox headless cannot produce a WebGL context in this
  environment (WSL2, software rendering).
  - **Mitigation**: bounded configuration effort (user prefs, headed-via-xvfb
    diagnostic to distinguish headless-only failure), then **escalate to the
    architect per FR8** — no silent demotion of the second engine.
- **Risk**: Firefox smoke is green but slow (software raster).
  - **Mitigation**: existing generous timeouts (120 s test, poll-based
    readiness) already accommodate SwiftShader; adjust per-project timeout
    only if measurements demand it, and record it.

#### Evaluation Gate
Phase commit only after: 5× stability evidence captured, gates green, and
the porch-driven 3-way phase review passes.

---

### Phase 2: Automate the Class A Interaction Matrix and Capture Baseline Evidence
**Dependencies**: Phase 1

#### Objectives
- Land the committed, two-engine automated coverage for the FR9 Class A
  matrix items that the current smoke does not cover, using numeric
  imperative-handle verification (lessons-learned fiber-walk method).
- Capture the complete **baseline** evidence package the Phase 3 comparisons
  need: Class B registration behavior per engine, before-side audits, and
  before-side resolved chain versions.

#### Deliverables
- [ ] `tests/e2e/graph-handle.ts` — page-context helper: walk the React fiber
      from the canvas to the first React-managed ancestor to reach the
      react-force-graph imperative handle; expose camera position, node
      screen coords (`graph2ScreenCoords`), node `fx` state, and AxesHelper
      visibility reads; rotation-settle utility.
- [ ] `tests/e2e/matrix.spec.ts` — Class A tests for both projects:
      initial layout (item 2, numeric node-position spread), auto-rotation
      camera Δ + pause Δ≈0 (item 3), delayed pointer enablement (item 4,
      fresh page load; early real click leaves `fx` unset, post-delay click
      fixes), wheel zoom in/out camera-distance change (item 5), background
      drag rotation with pan disabled (item 6), click-to-focus with rotation
      stop + node fix + camera approach (item 9), reset via `zoomToFit` with
      rotation-resume window (item 10), axes visibility numeric toggle
      (item 11), resize consistency (item 12), remount via re-navigation
      with clean error budget (item 13 browser part).
- [ ] Baseline evidence (local, not committed — raw JSON/transcripts):
      full/production audit JSON; resolved chain versions for the twelve
      named packages; Class B scripted procedure transcripts in **both**
      engines (real drag and right-click dispatched at a confirmed on-screen
      node; registration outcome recorded per engine).
- [ ] Baseline evidence summary appended to `codev/state/spir-11_thread.md`
      (committed) so reviewers can see it pre-review-doc.

#### Files
- `tests/e2e/graph-handle.ts` (new)
- `tests/e2e/matrix.spec.ts` (new)
- `codev/state/spir-11_thread.md` (evidence summary)

#### Implementation Details
- Every test retains the smoke's strict console/page-error collection and the
  Vercel-script stubbing; FR11's error budget applies to each test.
- Flake discipline per lessons-learned: pause rotation before pointer-precise
  work; let TrackballControls inertia settle before aiming at node
  coordinates; poll-based assertions with bounded budgets; one expensive
  WebGL readiness read per test where possible. Timing tests (item 4) use a
  fresh page load and generous windows (default 4000 ms delay; assert inert
  at ≤~1 s, enabled by ≤15 s poll) rather than tight race margins.
- The suite must pass on the **baseline** dependency stack in both engines —
  it is validating harness + current behavior, deliberately not depending on
  the upgrade.
- Class B scripted procedure (not committed, per house precedent from
  #9/#10): drive real drag/right-click at a confirmed on-screen node using
  **Playwright's cross-engine trusted input APIs** (`page.mouse.move/down/up`
  and `page.mouse.click(..., {button: "right"})`), which work identically in
  Chromium and Firefox; read `fx` state through the handle via
  `page.evaluate` (engine-neutral). A CDP-session input dispatch may be used
  **only as an optional Chromium-side supplementary diagnostic** — CDP is
  Chromium-specific and must not be the Firefox method or the primary
  procedure. These transcripts are the FR9 Class B baseline half of the
  replay comparison.
- Stability: same 5× consecutive-green bar as Phase 1, now with the matrix
  suite included.

#### Acceptance Criteria
- [ ] `matrix.spec.ts` green in both projects on the baseline stack; ≥5
      consecutive green two-project runs including it.
- [ ] `npm run validate` and `npm test` green.
- [ ] Baseline Class B transcripts exist for both engines; audits and chain
      versions captured.
- [ ] No application-code or dependency changes in this phase; no test-only
      application surface added.

#### Test Plan
- **Unit/contract**: existing `npm test` unaffected but rerun.
- **Integration**: two-project `test:smoke` (smoke + matrix specs).
- **Scripted (uncommitted)**: Class B baseline procedure, both engines.

#### Rollback Strategy
Single-commit revert; tests-only (plus thread-file notes), cannot affect the
application or dependency baseline.

#### Risks
- **Risk**: Click-precision tests flake under software rendering.
  - **Mitigation**: settle-then-aim discipline, poll assertions, 5× stability
    bar before commit; a test that cannot be stabilized moves that item to
    the scripted-evidence path **only with the limitation demonstrated and
    recorded** (never a silent deletion), and remains a Class A obligation at
    qualification time.
- **Risk**: Fiber-walk handle access breaks across React/Next internals.
  - **Mitigation**: method documented in lessons-learned and proven in
    #9/#10; helper isolates it in one file.

#### Evaluation Gate
Phase commit only after: stability evidence, baseline evidence package
complete, gates green, and the porch-driven 3-way phase review passes.

---

### Phase 3: Upgrade the Three.js Force-Graph Unit and Qualify Behavior
**Dependencies**: Phase 2

#### Objectives
- Apply the spec's dependency unit exactly (FR1–FR6) and prove behavioral
  preservation against the Phase 2 baseline in both engines (FR7–FR14).

#### Deliverables
- [ ] Manifest + lockfile: `three` exact `0.185.1` (dependencies),
      `@types/three` exact `0.185.1` (devDependencies),
      `react-force-graph-3d` exact `1.29.1` (dependencies); lockfile v3
      regenerated only via npm under the exact toolchain.
- [ ] `app/components/FocusGraph.tsx` TrackballControls import moved to
      `three/addons/controls/TrackballControls.js`.
- [ ] Contract tests updated/added in `tests/toolchain.test.mjs`: new exact
      pins in **both** locations that assert Three versions today (the
      dedicated `dependencies.three === "~0.172.0"` assertion and the
      `@types/three` entry in the `expectedDevReclassifiedBuildPackages`
      map); single-Three-runtime lockfile assertion (mirroring the
      single-React-runtime test); `three`/`@types/three` string-equality.
- [ ] FR1 formal reverification record; FR6 chain review + supply-chain
      verification; FR13 after-audits and path-by-path comparison notes.
- [ ] Upgraded-stack qualification: all gates + two-engine matrix + Class B
      replay comparison against Phase 2 baseline.
- [ ] Thread-file summary of qualification results (committed).

#### Files
- `package.json`
- `package-lock.json`
- `app/components/FocusGraph.tsx`
- `tests/toolchain.test.mjs`
- `codev/state/spir-11_thread.md` (qualification summary)

#### Implementation Details
Ordered steps:
1. **FR1 reverification** (before any manifest edit): `npm view` targets and
   chain peer requirements; confirm `0.185.1`/`1.29.1` remain the intended
   targets and the peer tree admits one Three runtime. Any contradiction →
   stop, `afx send architect`, wait.
2. Edit the three manifest entries; regenerate the lockfile with `npm
   install` under Node `22.23.1`/npm `10.9.8`; then prove a fresh clean
   `npm ci` succeeds with no manifest/lockfile mutation and no 3D-chain peer
   warnings (FR2).
3. **FR3 checks**: `npm ls three` → exactly one `three@0.185.1`; lockfile
   scan for nested `node_modules/**/node_modules/three` (none); `@types/three`
   string-equal.
4. **FR6 supply-chain**: diff changed lockfile entries — `resolved` URLs all
   `registry.npmjs.org`; install-script delta (`hasInstallScript` and script
   fields) vs. before; `npm ci` output clean of unexpected behavior. Record
   before/after resolved versions for the twelve named chain packages and
   summarize meaningful changes from release notes (FR6 review half).
5. Switch the TrackballControls import (FR4); `npm run typecheck` with no new
   suppressions.
6. **FR5 no-drift check** (explicit, mechanical): `git diff` for
   `app/components/` must show **exactly one changed line** — the
   TrackballControls import specifier in `FocusGraph.tsx`.
   `FocusGraphWrapper.tsx` (the `dynamic(..., {ssr: false})` boundary),
   `focusGraphResources.ts`, `app/page.tsx`, `app/layout.tsx`, and
   `app/graph/data.ts` are byte-identical to the pre-phase state. If the
   upgrade genuinely forces any additional application-code change, stop and
   surface it explicitly (spec FR5) rather than absorbing it — the matrix
   passing is not permission for incidental edits.
7. Update contract tests (FR12); `npm test` green.
8. **Full gates** (FR7): lint, typecheck, `npm test`, build, direct
   production `npm run start` HTTP 200 check, two-engine `test:smoke`
   (smoke + matrix), aggregate `validate`; same 5× stability bar on the
   upgraded stack.
9. **Class B replay** (FR9): rerun the scripted procedure (same
   cross-engine Playwright input method as Phase 2) in both engines on
   the upgraded stack; compare against Phase 2 baseline transcripts. Real
   input that registers must behave correctly (else blocking); identical
   non-registration to baseline is recorded as the harness property.
10. **FR13 audits**: full + production audits after; path-by-path comparison
    with before; identify 3D-chain advisory paths resolved/remaining.
11. Any behavioral difference in either engine → replay against baseline
    (Phase 2 evidence or a temporary checkout of the pre-Phase-3 commit)
    before attribution; if attributed to the upgrade → **blocked**, escalate
    with evidence (FR14). No partial pins, never mismatched runtime/types.

After this phase commits and the porch review passes, open the single PR
containing all three phase commits (per project PR strategy); the review
document follows in the Review phase on the same branch.

#### Acceptance Criteria
- [ ] Spec Scenarios 1, 2, 3, 4 fully evidenced; Scenario 5 property holds
      (single revert of the PR restores baseline; Phase 3-only revert also
      restores the qualified baseline with harness retained).
- [ ] FR5 no-drift check passes: the `app/components/` diff is exactly the
      one-line import change in `FocusGraph.tsx`; wrapper, resources, page,
      layout, and graph data files are byte-identical.
- [ ] All FR3/FR6 checks clean; contract tests enforce them going forward.
- [ ] Two-engine gates and matrix green on the upgraded stack with 5×
      stability; Class B evidence chain complete per engine.
- [ ] FR11 error budget: zero unexpected errors across all runs.

#### Test Plan
- **Unit/contract**: updated `toolchain.test.mjs`; full `npm test`.
- **Integration**: two-engine smoke + matrix on upgraded stack, 5×.
- **Scripted (uncommitted)**: Class B replay both engines + comparison.

#### Rollback Strategy
Revert the Phase 3 commit to restore the qualified baseline (harness stays);
revert the whole PR to restore the pre-stage state entirely. Both are single
`git revert` operations; no follow-up fixes permitted (Scenario 5).

#### Risks
- **Risk**: r172→r185 renderer/controls drift changes a matrix behavior.
  - **Mitigation**: Phase 2 baseline makes the comparison mechanical;
    blocking semantics + escalation with evidence (FR14).
- **Risk**: Peer/resolution surprise despite pre-verified ranges (registry
  drift since spec).
  - **Mitigation**: FR1 reverification is step 1, before any edit; escalate
    on contradiction.
- **Risk**: `@types/three` 0.185 typing changes surface new typecheck errors
  in `FocusGraph.tsx` (e.g., controls/camera casts).
  - **Mitigation**: spec pre-verified the export surface; if a genuine typing
    change appears, fix within existing semantics without new suppressions,
    or escalate if it would force a semantic change (FR5).

#### Evaluation Gate
Phase commit only after: every ordered step's evidence captured, gates green
5×, and the porch-driven 3-way phase review passes. PR opened after commit.

## Dependency Map
```
Phase 1 (harness: second engine)
   ↓
Phase 2 (harness: matrix suite + baseline evidence)
   ↓
Phase 3 (dependency unit + qualification)  →  single PR (rollback unit)
```

## Resource Requirements

### Development Environment
- Node `22.23.1` / npm `10.9.8` exactly (`.nvmrc`, `package.json` engines);
  lockfile v3; all installs via `npm ci`/`npm install` under this toolchain
  only.
- Playwright `1.61.1` (pinned; not upgraded by this work) with Chromium and
  Firefox browsers installed locally and in CI.
- Software WebGL: Chromium via SwiftShader flags (existing), Firefox via
  prefs (Phase 1).

### Infrastructure
- No new services. CI change limited to browser provisioning in
  `.github/workflows/validation.yml`.

## Integration Points

### External Systems
- **npm registry** — FR1/FR6 verification and installs; Phase 1/3. Fallback:
  none needed (read-only checks); registry unavailability simply pauses the
  phase.
- **GitHub Actions** — runs the same locked gates; Phase 1 changes
  provisioning; validated by `tests/automation.test.mjs`.

### Internal Systems
- **react-force-graph imperative handle** — sole numeric verification
  surface for matrix tests (via `tests/e2e/graph-handle.ts`).
- **Vercel insights scripts** — remain stubbed in tests (sanctioned FR11
  exclusion).

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Firefox headless WebGL unworkable | M | H (blocks stage) | Phase 1 fails fast; bounded config effort; escalate per FR8 |
| Matrix-test flake under software rendering | M | M | Lessons-learned discipline; 5× bar; demonstrated-and-recorded fallback path only |
| Behavioral regression from 13-release Three gap | L–M | H | Baseline-first sequencing; mechanical comparison; FR14 blocking |
| Supply-chain anomaly in refreshed chain | L | H | FR6 checks (registry-only, install-script delta) before qualification effort |
| Registry drift since research | L | M | FR1 at Phase 3 step 1 + Phase 1 early-warning check; escalation not retarget |

## Validation Checkpoints
1. **After Phase 1**: two-engine smoke green 5×; CI provisioning contract
   test green; drift check clean.
2. **After Phase 2**: matrix suite green 5× both engines on baseline;
   baseline evidence package complete (audits, chain versions, Class B
   transcripts × 2 engines).
3. **After Phase 3 / before PR**: all FR checks evidenced; upgraded-stack
   5× green; Class B replay comparison complete; audits compared; contract
   tests enforcing the end state.

## Monitoring and Observability
- CI `validate` job remains the standing gate; `playwright-report` /
  `playwright-test-results` artifacts now include both projects.
- Audit JSON artifacts (`audit-full`, `audit-production`) continue as
  evidence snapshots with original exit codes preserved.

## Documentation Updates Required
- [ ] `README.md` — two-engine browser validation wording (Phase 1).
- [ ] `codev/state/spir-11_thread.md` — baseline and qualification summaries
      (Phases 2–3).
- [ ] Review document (Review phase): matrix evidence tables per engine,
      chain review, audit comparison, FR1/FR6 records.
- [ ] `codev/resources/arch.md` / `lessons-learned.md` — Review phase, via
      the update-arch-docs skill, if durable facts/lessons emerge.

## Post-Implementation Tasks
- [ ] Verify phase after PR merge (pull integration branch, `porch done 11`).
- [ ] Confirm Vercel production deploy renders the graph (visual check) —
      deployment environment installs the same locked unit.

## Consultation Log

### Iteration 1 — initial three-way review (2026-07-19)

- **Claude: APPROVE (high confidence).** Verified file references and
  sequencing; noted the second `@types/three` assertion location in
  `toolchain.test.mjs` (now explicit in Phase 3 deliverables) and confirmed
  the helper-file naming keeps Playwright from executing it as a test.
- **Gemini: REQUEST_CHANGES (high confidence).** Caught that
  `toolchain.test.mjs` asserts the exact `browser:install` string, so Phase 1
  as drafted would fail `npm test` at its own commit → `tests/toolchain.test.mjs`
  added to Phase 1's file list and acceptance criteria. Praised the
  baseline-first sequencing.
- **Codex: REQUEST_CHANGES (high confidence).** Two points, both accepted:
  (1) CDP is Chromium-specific — the Class B procedure now mandates
  Playwright's cross-engine trusted input APIs (`page.mouse.*`) for both
  engines, CDP demoted to an optional Chromium-only supplementary
  diagnostic (Phases 2 and 3); (2) FR5 needed an explicit no-drift check —
  Phase 3 gains a mechanical step 6 (the `app/components/` diff must be
  exactly the one-line import change; wrapper/resources/page/layout/data
  byte-identical) plus a matching acceptance criterion.

## Approval
- [ ] Architect approval at `plan-approval` gate.
- [ ] Expert 3-way consultation complete.

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-19 | Initial plan draft | — | Builder spir-11 |

## Notes
- No time estimates by protocol.
- Phases 1–2 intentionally precede the dependency flip so the harness is
  qualified against the known-good baseline; this is the plan-level
  embodiment of the spec's baseline-replay evidence rules.
- The Class B scripted procedure stays uncommitted per #9/#10 precedent; its
  transcripts are quoted in the review document. If the architect prefers a
  committed script, that is a small additive change at implementation time.
