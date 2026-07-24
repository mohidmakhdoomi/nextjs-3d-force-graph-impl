# Plan: Root-Cause and Fix the Firefox Background-Drag Rotation Flake (matrix.spec.ts:224)

## Metadata
- **ID**: plan-2026-07-24-firefox-background-drag-flake
- **Status**: draft
- **Specification**: [codev/specs/55-firefox-background-drag-flake.md](../specs/55-firefox-background-drag-flake.md)
- **Created**: 2026-07-24
- **GitHub issue**: #55

## Executive Summary

Implements the spec's **Approach B — instrument-first root-cause, then the
minimal targeted fix**. The work is inherently sequential and evidence-gated:
we (1) build harness-side drag-path instrumentation, (2) reproduce the failure
under it and determine the mechanism with discriminating evidence (H1 stray
node capture / H2 Firefox synthetic-input loss / H3 drag-readiness race / a
demonstrated fourth — or the Decision-5 statistical fallback if it will not
reproduce), (3) apply the smallest behavior-preserving fix the evidence
selects, (4) qualify it on both engines and both rendering paths, then execute
the sequenced documentation follow-through: (5) re-run #41's GPU-lane parallel
qualification and retire-or-re-point its caveat (FR6), and (6) correct the #41
"revisit the default" follow-up (FR7) and the historical "#33" misattributions
(FR8).

The fix is **evidence-selected, not pre-decided**: Phase 3's exact shape
(verified-background start point vs `settleBackgroundDrag` frame-settling vs
both) is determined by Phase 2's outcome. The plan encodes the decision points
rather than presuming H1. Flake discipline is inviolable throughout: no
retries anywhere local, `MOTION_FLOOR > 1` and `retries: 0` never weakened, the
drag always a real synthetic `down → move → up`, and `.github/workflows/
validation.yml` byte-for-byte untouched.

### Grounding verified against the codebase (informs the phases)

- `tests/e2e/matrix.spec.ts:224` performs exactly the spec's sequence; the
  failing predicate is `cameraDelta(beforeDrag, snapshot) > MOTION_FLOOR (1)`
  with `SETTLE_TIMEOUT_MS = 5_000` locally.
- `tests/e2e/graph-handle.ts` **already exposes** the discrimination surface:
  `controlsEnabled`, `fixedNodeCount`, `noPan` on `GraphSnapshot`, plus
  `pickNodeScreenPoint` / `fixBestNode` / `nodeScreenPointById`,
  `contextLostCount`. Phase 1 is a bounded extension, not a new subsystem.
- `tests/e2e/pointer.ts` provides `waitForAnimationFrames` and the
  `settleHoverThenClick` precedent (#34) — the template for any
  `settleBackgroundDrag` helper.
- `playwright.config.ts` confirms `retries: 0` local / `2` CI, the
  `E2E_ENGINES` engine filter, `resolveWorkers(process.env)` (the `E2E_WORKERS`
  opt-in, pinned to 1 under `CI`), and the `firefox` project.
- **Firefox is not installed in the Playwright browser cache** (Chromium only)
  → installing the repo-pinned Firefox is a Phase-1 prerequisite (no
  `package.json`/lockfile change; browser binaries are outside the lockfile).
- The native-GPU lane (`scripts/e2e-gpu-lane.mjs`, `npm run test:e2e:gpu`) is
  runnable on this WSL2 Mesa-d3d12 host class (Firefox hardware WebGL proven
  here per #52), supports `--engine`/`--probe-only`/`E2E_GPU_FORCE_FALLBACK`/
  `E2E_GPU_REQUIRE`, and inherits `E2E_WORKERS`.

## Success Metrics

Mapped from the spec's Success Criteria (not time-based):

- [ ] Failure reproduced under instrumentation, **or** the Decision-5 fallback
      engaged and recorded (FR1/FR2).
- [ ] Mechanism documented with discriminating verbatim evidence (FR3).
- [ ] Minimal behavior-preserving fix landed; no retries, no weakened
      assertion, CI untouched; drag remains a real `down → move → up` (FR4).
- [ ] Both-engine, both-path qualification recorded green (FR5).
- [ ] #41 GPU-lane parallel re-run executed + dispositioned; caveat retired or
      re-targeted (FR6).
- [ ] #41 "revisit the default" follow-up corrected (FR7).
- [ ] "#33" misattributions corrected to cite #55 (FR8).
- [ ] `npm run validate` green on the final tree.
- [ ] Committed final tree honors FR2's committed-vs-evidence-only rule
      (heavyweight diagnostics not left in the canonical suite).

## Phases (Machine Readable)

<!-- REQUIRED: porch uses this JSON to track phase progress. Keep in sync with the breakdown below. -->

```json
{
  "phases": [
    {"id": "phase_1", "title": "Drag-path instrumentation (harness-side)"},
    {"id": "phase_2", "title": "Amplified reproduction & root-cause determination"},
    {"id": "phase_3", "title": "Minimal behavior-preserving fix"},
    {"id": "phase_4", "title": "Fix qualification (both engines, both rendering paths)"},
    {"id": "phase_5", "title": "#41 GPU-lane parallel re-qualification & caveat"},
    {"id": "phase_6", "title": "Record corrections (FR7 + FR8)"}
  ]
}
```

## Phase Breakdown

### Phase 1: Drag-path instrumentation (harness-side)
**Dependencies**: None
**Requirements**: FR2; Decisions 3, 4, 6

#### Objectives
- Build harness-side diagnostics sufficient to attribute **one** failing
  background-drag occurrence to H1, H2, H3, or a demonstrated fourth mechanism,
  cheap enough to ride every reproduction run (Decision 6).
- Change no app code and no canonical-suite behavior; passing runs stay green
  with negligible overhead.

#### Deliverables
- [ ] Probe extension in `tests/e2e/graph-handle.ts`: a **node-occupancy-at-
      point** query (the inverse of `pickNodeScreenPoint` — raycast an arbitrary
      screen `(x, y)` against node meshes and report hit/miss, nearest node id,
      and pixel distance to the nearest node projection), and a
      `controls.enabled` sampler usable across the drag window. Reuse existing
      `fixedNodeCount` / `controlsEnabled` snapshot fields.
- [ ] Pointer-event counters installed via `addInitScript` (or a probe field):
      canvas + document `pointerdown` / `pointermove` / `pointerup` counts with
      coordinates + timestamps, plus Trackball `_state` / DragControls
      `dragstart` observation where reachable from page context.
- [ ] An **out-of-tree diagnostic harness** — a spec that runs the `:224`
      gesture and samples the counters / `controls.enabled` / `fixedNodeCount` /
      start-point occupancy before/during/after the drag and dumps them on
      failure. **It must NOT live under `tests/e2e/`**: the canonical config's
      `testDir: "./tests/e2e"` (default `testMatch` for `*.spec.ts`) would
      otherwise collect it into `playwright test` / `npm run test:smoke` and CI
      shards, changing the canonical suite. Instead it lives out-of-tree (e.g.
      `tests/diagnostics/55-drag/drag-diagnostic.spec.ts`) with a **dedicated
      minimal Playwright config** (`tests/diagnostics/55-drag/playwright.diag.config.ts`)
      whose own `testDir` points at that folder and reuses the same `webServer` /
      engine / viewport setup; it is run explicitly via
      `playwright test --config tests/diagnostics/55-drag/playwright.diag.config.ts`
      in Phase 2. Alternative if kept in-tree: strict env-gating that registers
      **zero** tests unless `E2E_DRAG_DIAG` is set (so the default run collects
      nothing) — but out-of-tree is preferred because it makes "canonical suite
      unchanged" literally true, not merely a no-op skip. Evidence-scoped: it is
      never part of the committed canonical suite (FR2).
- [ ] Prereq resolved: repo-pinned **Firefox browser installed**
      (`npx playwright install firefox`), recorded in the thread/review.
- [ ] Comment documentation at the existing `graph-handle.ts` standard.

#### Implementation Details
- Keep the diagnostic surface additive: extend `installGraphProbe` /
  `Window.__graph*` rather than modifying app modules. The occupancy query
  mirrors `__graphNodeScreen`’s raycaster setup but takes an input `(x, y)`.
- Pointer counters must observe the **same** events the app sees (capture-phase
  document listeners + canvas listeners), so H2 (delivery loss) is directly
  measurable as "0 pointermoves between down and up."
- Separate *keepable* cheap probe fields (node-occupancy helper, counters as
  silent fields in the `tests/e2e/graph-handle.ts` probe) from *heavyweight*
  capture (verbose per-event logs, the out-of-tree diagnostic harness + its
  config) — the latter is evidence-only per FR2 and never enters `tests/e2e/`.
- The out-of-tree diagnostic imports the shared helpers by relative path
  (`../../e2e/graph-handle`, `../../e2e/pointer`); no code is duplicated.

#### Acceptance Criteria
- [ ] The out-of-tree diagnostic harness captures counters + `controls.enabled`
      trace + `fixedNodeCount` (before/after) + start-point occupancy on a real
      two-engine run and dumps them on an induced failure.
- [ ] The canonical suite is **provably unchanged**: `npx playwright test --list`
      (default config) shows the same test set as before Phase 1 — the diagnostic
      harness is not collected — and the full two-engine suite is green; no app
      file modified.
- [ ] `npm run lint` / `npm run typecheck` clean on the new harness code.

#### Test Plan
- **Integration**: run the diagnostic variant on chromium + firefox; confirm
  it records non-trivial counters on a passing drag and dumps on a forced fail
  (e.g. temporarily assert an impossible floor in a scratch copy).
- **Manual**: eyeball one dump to confirm the fields discriminate the hypotheses.

#### Rollback Strategy
Revert the Phase-1 commit; the diagnostic variant and probe additions are
self-contained and touch no app or canonical-suite behavior.

#### Risks
- **Risk**: page-context access to Trackball/DragControls internal state is
  limited. **Mitigation**: the DOM-level pointer counters + `controls.enabled`
  + `fixedNodeCount` + start-point occupancy already discriminate H1/H2/H3
  without reaching library privates; internal `_state` is a bonus, not required.

---

### Phase 2: Amplified reproduction & root-cause determination
**Dependencies**: Phase 1
**Requirements**: FR1, FR3; Decisions 5, 6

#### Objectives
- Reproduce the failure under instrumentation and identify the mechanism with
  recorded discriminating evidence — or engage and record the Decision-5
  statistical fallback if it will not reproduce within budget.

#### Deliverables
- [ ] Reproduction campaign, all runs recorded verbatim (environment, renderer
      evidence for GPU-lane runs, seed conditions, result) whether or not they
      fail, in increasing cost order:
      - targeted `--repeat-each` of the single Firefox `:224` test on the
        SwiftShader path **and** the GPU lane;
      - ≥ 3 instrumented full two-engine suite runs;
      - ≥ 3 `E2E_WORKERS`-parallel GPU-lane runs (historical highest-rate regime).
- [ ] On a captured failure: the discriminating evidence, attributing it to
      H1 (`fixedNodeCount` 0→1 + `controls.enabled === false` during the drag +
      DragControls `dragstart` + node-hit at the start point), H2 (0 pointermoves
      between down and up with controls enabled + `fixedNodeCount` stays 0), H3
      (drag issued before listeners attach / control not drag-ready), or a
      demonstrated fourth mechanism.
- [ ] If no repro within the Decision-5 budget (≥ ~60 targeted reps + ≥ 3 full
      two-engine + ≥ 3 parallel GPU-lane): the **statistical H1 fallback** —
      node-occupancy of `(150, 450)` measured across N fresh post-zoom layouts
      per engine, recorded. If that is negative/inconclusive too: the
      **doubly-negative terminal outcome** (Decision 5) is recorded honestly.
- [ ] A mechanism write-up (evidence artifacts under the project/evidence dir;
      consolidated into the review in the Review phase).

#### Implementation Details
- Instrumentation from Phase 1 rides every run (Decision 6) so no failing
  occurrence is wasted.
- The recorded evidence must explain the **full historical signature**: ~zero
  deltas, Firefox dominance, hardware survival, repeat-alone greens, and
  amplification under parallel contention (FR3).

#### Acceptance Criteria
- [ ] The mechanism is stated with verbatim discriminating evidence, **or** the
      fallback/terminal-outcome branch is explicitly engaged and recorded.
- [ ] The evidence (or fallback measurement) is committed to the project/
      evidence dir and referenced for the review.

#### Test Plan
- The "test" is the reproduction campaign itself; success = an unambiguous
  hypothesis selection or a recorded fallback per Decision 5.

#### Rollback Strategy
Evidence-only; nothing to roll back in the canonical suite. Re-run if a capture
is inconclusive (within budget).

#### Risks
- **Risk (top)**: the flake does not reproduce within budget on this host.
  **Mitigation**: Decision-5 statistical fallback (failure-independent) +
  honest budget recording; the fix branch (Phase 3) adapts.
- **Risk**: GPU-lane hardware unavailable on the host. **Mitigation**: the
  SwiftShader arm is host-independent; GPU-lane runs record renderer evidence
  or a documented skip.
- **Risk**: Firefox install unavailable/blocked. **Mitigation**: surface
  immediately to the architect (blocker); SwiftShader Firefox still needs the
  browser binary, so this gates Phase 2 and must be resolved in Phase 1.

---

### Phase 3: Minimal behavior-preserving fix
**Dependencies**: Phase 2
**Requirements**: FR4; Decisions 1, 2, 3, 4; FR2 (trim)

#### Objectives
- Land the smallest behavior-preserving fix the Phase-2 evidence selects, and
  reduce the committed tree to FR2's committed-vs-evidence-only final state.

#### Deliverables (evidence-selected — exactly one primary path)
- [ ] **If H1 (stray node capture)**: a probe-verified **background** start
      point — an inverse of `pickNodeScreenPoint` returning a screen point
      verified node-free (with a pixel margin) in the current layout — so the
      "background drag" premise is true every run. Applied at `matrix.spec.ts:224`.
- [ ] **If H2 (synthetic-input delivery loss)** or **H3 (drag-readiness)**: a
      `settleBackgroundDrag` helper in `tests/e2e/pointer.ts` mirroring
      `settleHoverThenClick` — real animation frames between `down` / each
      `move` segment / `up`, step count/geometry chosen from the recorded
      delivery evidence — so every segment is delivered and consumed by an
      `update()` frame.
- [ ] **Combined** only if the evidence shows both a probabilistic-background
      and a delivery component.
- [ ] FR2 final state: the out-of-tree diagnostic harness + its dedicated config
      stay evidence-only (they were never in `tests/e2e/`, so there is nothing to
      remove from the canonical suite — either leave them under
      `tests/diagnostics/` as committed evidence or relocate to the project
      evidence dir per the review's preference). The committed `tests/e2e/` delta
      is only the fix dependencies + cheap silent probe fields worth retaining
      for future triage, documented at the existing standard.

#### Implementation Details
- The drag remains a **real** synthetic `down → move → up`; no programmatic
  camera rotation, no `page.evaluate` camera manipulation, no retry loop.
- `MOTION_FLOOR`, the canonical assertion, and `retries: 0` are untouched.
- The diff stays confined to `tests/e2e/` unless Phase 2 demonstrates an app
  defect; any app change would be behavior-preserving for real users and
  separately argued in the review (not anticipated).
- Doubly-negative branch (Decision 5): no root-cause fix ships; an optional
  strictly-strengthening change (verified-background start point and/or
  frame-settled gesture) MAY ship **labeled defense-in-depth, not a proven
  root-cause fix**.

#### Acceptance Criteria
- [ ] The fixed test issues a real background drag and asserts the **unchanged**
      `MOTION_FLOOR`; passes on chromium + firefox locally.
- [ ] Diff is minimal and confined to `tests/e2e/` (barring a separately-argued
      app change); heavyweight diagnostics no longer in the canonical suite.
- [ ] `npm run lint` / `npm run typecheck` clean.

#### Test Plan
- **Integration**: run the fixed `:224` test on both engines; confirm real
  motion clears `MOTION_FLOOR` by orders of magnitude (historical ~440 units).
- **Regression**: full two-engine suite green (the helper/start-point runs on
  both engines).

#### Rollback Strategy
Revert the Phase-3 commit; the test returns to its accepted+documented state.

#### Risks
- **Risk**: the fix reduces what the test proves. **Mitigation**: FR4 semantics
  — a verified-background start point *strengthens* the premise; frame-settling
  only adds self-scaling waits (the `settleHoverThenClick` precedent trimmed
  nothing).

---

### Phase 4: Fix qualification (both engines, both rendering paths)
**Dependencies**: Phase 3
**Requirements**: FR5

#### Objectives
- Prove the fix under volume on both engines and both rendering paths at
  `retries: 0`, recorded verbatim.

#### Deliverables
- [ ] Targeted repetition of the fixed test on the Firefox arm at ≥ the
      Decision-5 targeted budget (e.g. `--repeat-each` ≥ 60), on the SwiftShader
      path **and** the native-GPU lane — green throughout.
- [ ] ≥ 3 consecutive green full two-engine **serial SwiftShader** runs
      (`npm run test:smoke` semantics — the gate environment).
- [ ] ≥ 3 consecutive green full two-engine **native-GPU lane** runs with
      renderer evidence asserted (the #44/#52 lane pattern).
- [ ] `npm run validate` green on the final tree.
- [ ] Chromium green throughout (no regression from the shared harness change).
- [ ] All banners/per-test lines recorded verbatim for the review.

#### Implementation Details
- Use the existing scripts: `npm run test:smoke` (SwiftShader serial),
  `npm run test:e2e:gpu` (GPU lane), targeted single-test `--repeat-each` runs
  scoped to `:224` per engine.

#### Acceptance Criteria
- [ ] Every FR5 run recorded green; renderer strings captured for GPU-lane runs.
- [ ] `npm run validate` green.

#### Test Plan
- The qualification runs are the test; success = all green at `retries: 0`.

#### Rollback Strategy
If a qualification run fails, return to Phase 2/3 (the mechanism or fix is
incomplete) — do not mask; re-open the evidence loop.

#### Risks
- **Risk**: Chromium regression from the shared harness change. **Mitigation**:
  FR5 qualifies both engines; the helper/start-point executes on both.
- **Risk**: GPU-lane host flakiness unrelated to this test. **Mitigation**:
  record renderer evidence; distinguish infra skips from test failures honestly.

---

### Phase 5: #41 GPU-lane parallel re-qualification & caveat
**Dependencies**: Phase 4
**Requirements**: FR6

#### Objectives
- Re-run issue #41's GPU-lane **parallel** qualification and retire-or-re-point
  its "Known Firefox flake" caveat per the outcome.

#### Deliverables
- [ ] `E2E_WORKERS=50%` on the hardware lane, **3 runs**, `retries: 0`, recorded
      verbatim with renderer evidence.
- [ ] **On green 3/3**: retire the `README.md` opt-in-parallel "Known Firefox
      flake" caveat, and append a dated addendum to
      `codev/reviews/41-parallelize-local-e2e-runs.md` ("Qualification
      Evidence") recording the now-green opt-in re-run.
- [ ] **If not 3/3 green**: record the outcome honestly, disposition any new
      failure per flake discipline (dedicated tracker, no masking), and update
      the caveat to cite the new tracker instead of retiring it.
- [ ] Explicitly does **not** change the serial default (that is FR7).

#### Implementation Details
- `E2E_WORKERS=50% npm run test:e2e:gpu` (the lane inherits `E2E_WORKERS`).
- Scope the caveat edits to the opt-in-parallel note; do not touch the serial
  gate contract or `DEFAULT_LOCAL_WORKERS`.

#### Acceptance Criteria
- [ ] 3 runs recorded; README caveat + review-41 addendum updated to match the
      actual outcome (retired on 3/3, re-pointed otherwise).

#### Test Plan
- The 3 parallel runs are the test; success = recorded disposition (green
  retire, or honest non-green branch).

#### Rollback Strategy
Doc-only edits; revert the commit to restore the prior caveat wording.

#### Risks
- **Risk**: the parallel re-run surfaces a *different* failure (e.g. Chromium
  SwiftShader contention on the software path — but this lane is hardware).
  **Mitigation**: FR6's explicit non-green branch — honest disposition,
  dedicated tracker, caveat re-pointed not retired.

---

### Phase 6: Record corrections (FR7 + FR8)
**Dependencies**: Phase 5
**Requirements**: FR7, FR8; Decision 7

#### Objectives
- Correct the #41 "revisit the default" follow-up and the historical "#33"
  misattributions, with wording that reflects the actual Phase-2..5 outcome.

#### Deliverables
- [ ] **FR7** — amend `codev/reviews/41-parallelize-local-e2e-runs.md`'s
      "revisit the default" Follow-up so it cannot be misread as "this flake
      fixed ⇒ parallel default": fixing #55 is **necessary-but-not-sufficient**;
      flipping `DEFAULT_LOCAL_WORKERS` additionally requires solving the
      deterministic Chromium **SwiftShader parallel-contention** failures
      (4–5/22 every parallel run), e.g. fewer workers on the SwiftShader path or
      the gate moving off SwiftShader — neither attempted here.
- [ ] **FR8** — via clearly marked correction notes citing #55 (not silent
      rewrites), correct the "#33" misattributions in:
      - `codev/reviews/41-parallelize-local-e2e-runs.md` ("Qualification
        Evidence" + "Flaky Tests / Disposition", lines ~80/90/112/117–119/147/
        300/307);
      - `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md` and
        `codev/specs/52-firefox-hardware-webgl-gpu-lane.md` ("#33 family" /
        "Known Stability Caveat"; leave the genuine #11 reference intact);
      - `README.md` (the "Known Firefox flake" note + the `E2E_WORKERS` table
        row + the parallel-default caution — updated or removed per FR6).
- [ ] **Discovered extra (in scope, comment-only)**: `playwright.config.ts:114`
      also says "amplify the known Firefox flake #33 even on hardware." This is
      **included** in FR8's scope as a comment-only, behavior-preserving
      correction to cite #55 — the diff touches only comment lines, zero
      executable change. Decision 2's "CI and the serial gate are untouched"
      names `.github/workflows/validation.yml` and the *executable* gate
      contract (`workers: 1` under `CI`, `retries`, engines); a comment
      correction preserves the gate byte-for-executable-byte, so FR8's "all
      remaining flake/caveat references cite #55" governs and the edit is
      included. (Trivially droppable if the architect prefers to exclude it —
      surfaced in the rebuttal; not blocking.)
- [ ] All remaining flake/caveat references cite **#55** with wording matching
      the actual outcome; no document attributes this flake to #33.

#### Implementation Details
- Correction notes are additive and marked (e.g. "Correction (#55, 2026-…): the
  flake previously called '#33' is tracked by #55; #33 was a distinct
  enable-delay inertness race"). Qualification history is not silently rewritten.

#### Acceptance Criteria
- [ ] `grep -rn '#33' README.md playwright.config.ts codev/reviews/41-*.md
      codev/reviews/52-*.md codev/specs/52-*.md` shows no remaining *this-flake*
      attribution to #33 (genuine distinct-#33 mentions may remain only as
      corrected "was #33, is #55" notes).
- [ ] The #41 follow-up states the necessary-but-not-sufficient relationship.
- [ ] `npm run validate` still green (doc/comment-only changes).

#### Test Plan
- **Manual**: grep audit for residual "#33" this-flake attributions; read the
  corrected passages for accuracy against the Phase-2 mechanism + FR6 outcome.

#### Rollback Strategy
Doc/comment-only; revert the commit.

#### Risks
- **Risk**: over-editing qualification history. **Mitigation**: marked
  correction notes, not rewrites (Decision 7).
- **Risk**: the `playwright.config.ts` comment edit is read as touching the
  gate. **Mitigation**: comment-only diff (zero executable change; verify with
  `git diff` showing only comment lines) + surfaced to the architect in the
  plan rebuttal; trivially droppable.

## Dependency Map
```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
(instrument) (root-cause) (fix)    (qualify)  (#41 re-qual) (record)
```
Strictly sequential: each phase's deliverable gates the next. Phase 3's fix
shape is selected by Phase 2's evidence; Phase 6's wording reflects Phases 2–5.

## Risk Analysis

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Flake does not reproduce within budget | M | M | Decision-5 statistical H1 fallback (failure-independent) + honest budget record; terminal outcome defined |
| Firefox browser not installable on host | L | H | Resolve in Phase 1 (`npx playwright install firefox`); blocker → architect immediately |
| GPU-lane hardware unavailable | M | M | SwiftShader arm host-independent; GPU-lane records renderer or documented skip |
| Chromium regression from shared harness change | L | M | FR5 qualifies both engines; helper runs on both |
| #41 parallel re-run surfaces a different failure | M | L | FR6 non-green branch: honest disposition, dedicated tracker, caveat re-pointed |
| `playwright.config.ts` #33 comment edit read as gate change | L | L | Comment-only diff (zero executable change); included per FR8, surfaced in rebuttal, trivially droppable |

### Process Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Evidence loop mistaken for masking | L | M | Decision 1/3: no retries, no assertion change; evidence-only diagnostics trimmed per FR2 |
| Doc corrections rewrite history | L | M | Decision 7: marked correction notes citing #55, not silent rewrites |

## Validation Checkpoints
1. **After Phase 1**: diagnostic variant captures discriminating fields on both
   engines; canonical suite unchanged + green; Firefox installed.
2. **After Phase 2**: mechanism documented with verbatim evidence, or fallback
   engaged + recorded.
3. **After Phase 3**: fixed `:224` green on both engines; `MOTION_FLOOR`/
   `retries: 0` unchanged; minimal `tests/e2e/` diff; diagnostics trimmed.
4. **After Phase 4**: FR5 matrix green (both engines × both paths ×
   repetition); `npm run validate` green.
5. **After Phase 5**: 3 parallel GPU-lane runs recorded; caveat retired or
   re-pointed per outcome.
6. **After Phase 6**: no residual "#33" this-flake attribution; #41 follow-up
   corrected; `npm run validate` green.

## Documentation Updates Required
- [ ] `README.md` — "Known Firefox flake" note, `E2E_WORKERS` row, parallel-
      default caution (Phases 5–6).
- [ ] `codev/reviews/41-parallelize-local-e2e-runs.md` — Qualification Evidence
      addendum (Phase 5) + FR7 follow-up correction + FR8 "#33" corrections.
- [ ] `codev/reviews/52-...md`, `codev/specs/52-...md` — "#33 family" / "Known
      Stability Caveat" corrections (Phase 6).
- [ ] `playwright.config.ts` — comment-only "#33" → "#55" correction at line
      ~114 (Phase 6; zero executable change).
- [ ] `codev/reviews/55-firefox-background-drag-flake.md` — the SPIR Review doc
      (produced in the Review phase; consolidates the recorded evidence).
- [ ] Governance docs (`arch-critical.md` / `lessons-critical.md` and cold
      archives) via the `update-arch-docs` skill in the Review phase if a
      durable lesson emerges (e.g. synthetic-input reliability pattern).

## Notes / Assumptions
- The **Review document** (`codev/reviews/55-...md`) and any governance-doc
  updates are produced in the SPIR **Review** phase, not as an implement phase;
  evidence recorded across Phases 2/4/5 feeds it.
- All phases ship as **git commits within a single PR** (per the issue's PR
  Strategy); the PR opens during/after Phase 6 unless the architect requests
  an earlier PR.
- No new packages, no dependency version changes, no `.github/workflows/
  validation.yml` change (Decision 2 / arch-critical Validation Baseline).

## Change Log
| Date | Change | Reason |
|------|--------|--------|
| 2026-07-24 | Initial plan draft | Transform approved Spec 55 into 6 phases |
| 2026-07-24 | Plan with multi-agent review | Address Codex REQUEST_CHANGES (2 pts) |

## Consultation Log

### Plan — iteration 1 (3-way: Gemini, Codex, Claude)

- **Gemini — APPROVE (HIGH).** Verified codebase claims (`matrix.spec.ts`,
  `graph-handle.ts`, `pointer.ts`, `playwright.config.ts`) — accurate;
  "flawlessly translates the spec into an evidence-gated, strictly sequenced
  pipeline." Endorsed the `playwright.config.ts:114` catch. No issues.
- **Claude — APPROVE (HIGH).** Full FR1–FR8 + all 8 Decisions coverage;
  correct sequencing; verified every file reference. Non-blocking notes on
  Trackball-internals reachability (already hedged) and the review-doc/evidence
  distinction (already stated). Notably assumed the separate diagnostic file was
  enough to keep it out of the suite — which Codex correctly refuted.
- **Codex — REQUEST_CHANGES (HIGH).** Two actionable points:
  1. A `tests/e2e/matrix.drag-diagnostic.spec.ts` **would still be collected**
     by `testDir: "./tests/e2e"` and run in `playwright test` / `test:smoke`,
     contradicting "canonical suite unchanged." Must specify out-of-tree
     location, a distinct non-collected pattern, or explicit env-gating.
  2. The `playwright.config.ts:114` "#33" comment was left an "open question,"
     but FR8/Decision 7 require correcting remaining misattributions to #55;
     as a comment-only, behavior-preserving edit it should be included directly
     or excluded with a spec-backed reason.

**Changes applied (both Codex points accepted; Claude/Gemini needed none):**
- Phase 1's diagnostic is now an explicit **out-of-tree harness**
  (`tests/diagnostics/55-drag/…` + a dedicated minimal `--config`) that the
  canonical `testDir` never collects; env-gating documented as the alternative.
  Acceptance now *proves* non-collection via `npx playwright test --list`.
  Phase 3's FR2 "trim" becomes "was never in the canonical suite."
- The `playwright.config.ts:114` comment correction is **included in FR8 scope**
  as comment-only (zero executable change), with the Decision-2 rationale
  (Decision 2 governs the workflow file + executable gate contract, not
  comments); surfaced to the architect as trivially droppable.

Rebuttal: `codev/projects/55-firefox-e2e-flake-background-d/55-plan-iter1-rebuttals.md`.
