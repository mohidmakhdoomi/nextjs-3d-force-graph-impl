# Review 41: Parallelize Local E2E Runs Scaled to Hardware (CI Byte-for-Byte Unchanged)

> Status: complete — phases 1–3 implemented and reviewed (3-way, unanimous
> APPROVE each), qualification evidence preserved verbatim (FR9), governance docs
> routed. Outcome: serial-default + opt-in-parallel (Decision 4 / Scenario 5).

## Summary of Outcome

Local e2e worker resolution is now a single tested pure helper
(`scripts/e2e-workers.mjs`) consumed by `playwright.config.ts`
(`workers: resolveWorkers(process.env)`). The resolver:

- **CI (any truthy `CI`) → `1`**, returning before it reads `E2E_WORKERS`, so the
  sharded CI matrix's per-job serial contract is structural and un-overridable.
- **`E2E_WORKERS` override** → a positive integer (`4`) or a percentage (`50%`);
  an invalid value is a loud `WorkerConfigError` at config load, never a silent
  serial fallback.
- **Local default → `1` (serial).**

**The headline "parallel by default" was NOT shipped, by design.** Phase-3
qualification (below) showed parallel workers **destabilize** the timing-sensitive
Chromium `matrix.spec.ts` assertions on the SwiftShader path that `npm run
validate` actually gates on — 4–5 of 22 tests fail on every parallel run there
(the failure is destabilization, not slowness: parallel is actually faster) — and
amplify a known open Firefox flake even on hardware. Per **spec Decision 4** (the canonical, evidence-gated
rule for the local default) and **Acceptance Scenario 5 / acceptance criterion 2**
(separated parallel path + documented trade-off), the default stays **serial** and
parallelism is **opt-in via `E2E_WORKERS`** — a strict superset of prior behavior
(default identical to before) plus a new opt-in that is ~4× faster on the
native-GPU lane. CI is byte-for-byte unchanged.

## What Was Built (by phase)

- **Phase 1** — `scripts/e2e-workers.mjs`: pure `resolveWorkers(env)`,
  `DEFAULT_LOCAL_WORKERS`, `WorkerConfigError`; `tests/e2e-workers.test.mjs` (full
  FR8 matrix, 24 tests). No I/O, no `process.env` access, no Playwright import.
- **Phase 2** — wired the helper into `playwright.config.ts`
  (`workers: resolveWorkers(process.env)`), replaced the stale "Do NOT raise
  workers" comment block with the new contract, migrated the
  `tests/automation.test.mjs` source-text assertion (`/workers: 1/` →
  `/workers: resolveWorkers\(process\.env\)/`, i.e. assert delegation).
- **Phase 3** — ran the qualification, **finalized the default to serial** in the
  helper (`DEFAULT_LOCAL_WORKERS = 1`, flipped from the originally-proposed
  `'50%'`), updated the config comment to the finalized contract, verified FR7
  (the GPU lane inherits the worker count with no lane code change), updated the
  README (FR11), and proved CI untouched (FR4).

## Qualification Evidence (FR9 — verbatim)

Host: WSL2, 20 cores (`nproc=20`), NVIDIA RTX 3080 via Mesa d3d12. `retries: 0`
throughout. Full two-engine suite = 22 tests (11 Chromium + 11 Firefox).

### A. Native-GPU lane — contention-free hardware (primary vehicle, `E2E_GPU_REQUIRE=1`)

Renderers verified every run — `renderer.chromium: ANGLE (Microsoft Corporation,
D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`, `renderer.firefox: D3D12 (NVIDIA
GeForce RTX 3080)`.

| Run | Banner | Result | Wall-clock |
|-----|--------|--------|-----------|
| Parallel 1/3 | `Running 22 tests using 10 workers` | `22 passed (44.9s)` | `57s (build 10s, suite 46s)` |
| Parallel 2/3 | `Running 22 tests using 10 workers` | `22 passed (44.0s)` | `57s (build 10s, suite 45s)` |
| Parallel 3/3 | `Running 22 tests using 10 workers` | **`1 failed`**, `21 passed (46.9s)` | `60s (build 10s, suite 48s)` |
| **Serial baseline** | `Running 22 tests using 1 worker` | `22 passed (3.2m)` | `207s (build 10s, suite 196s)` |

Parallel hardware speedup: suite 46s vs serial 196s ≈ **4.3×**. But 1 of 3
parallel runs failed. The failure (verbatim):

```
  ✘  15 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag (23.9s)

  1) [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
    Error: a background drag should rotate the camera
    expect(received).toBeGreaterThan(expected)
    Expected: > 1
    Received:   0.001966449662569139
    - Timeout 5000ms exceeded while waiting on the predicate
```

This is the **known open flake #33** (Firefox synthetic-input-delivery
nondeterminism, documented in the README as "survives on hardware"), which issue
#41 explicitly warned "parallel contention may amplify." It did — 0 recurrences
across 3 serial hardware runs (this set's baseline + review 52's set), 1 in 3
parallel hardware runs.

### B. SwiftShader — the path `npm run validate` actually gates on

| Run | Banner | Result | Wall-clock |
|-----|--------|--------|-----------|
| **Serial baseline** | `Running 22 tests using 1 worker` | **`1 failed`** (flake #33), `21 passed` | `11.7m` |
| Parallel 1/3 | `Running 22 tests using 10 workers` | **`4 failed`**, `18 passed` | `3.2m` |
| Parallel 2/3 | `Running 22 tests using 10 workers` | **`4 failed`**, `18 passed` | `3.3m` |
| Parallel 3/3 | `Running 22 tests using 10 workers` | **`5 failed`**, `17 passed` | `3.3m` |

Failing tests under **SwiftShader parallel** (all **Chromium**, all timing-sensitive
`matrix.spec.ts` / `smoke` interaction assertions — exactly the class the old "Do
NOT raise workers" comment named):

- `matrix.spec.ts:194 zooms out with the wheel` — 3/3 runs
- `matrix.spec.ts:224 zooms in with the wheel and rotates with a background drag` — 3/3 runs
- `matrix.spec.ts:527 remounts a fresh working canvas on re-navigation` — 3/3 runs
- `smoke.spec.ts:78 renders the graph and exercises its core controls` — 3/3 runs
- `matrix.spec.ts:134 keeps pointer navigation inert until the enable delay elapses` — 1/3 runs

**Wall-clock is NOT the reason parallel loses here.** Parallel SwiftShader (~3.3m)
is ~3.5× *faster* than serial SwiftShader (11.7m). The disqualifier is
**destabilization**: 10 SwiftShader software rasterizers saturate the CPU, and the
timing-sensitive camera-settle/wheel/drag assertions miss their deadlines — 4–5 of
22 Chromium tests fail on **every** parallel run (0/3 green). A gate that fails
4–5/22 every run is not a gate, however fast.

### Serial gate note — pre-existing flake floor (#33 / #34)

The serial default is the **pre-existing** local gate contract; `resolveWorkers({})
=== 1` routes the default there, and issue #41 does not change it. It is honest to
record that this pre-existing path is **not flawlessly green at `retries: 0`**: the
serial SwiftShader baseline above hit the **same known open flake #33** once
(`[firefox] matrix.spec.ts:224`, motion `0.0038` < `MOTION_FLOOR` 1). #33 and the
click-to-focus flake #34 are pre-existing, open, and surface even serially at
`retries: 0` — which is exactly why they are tracked and why CI runs `retries: 2`.
Issue #41 neither introduces nor fixes them; it preserves the serial contract and
adds opt-in parallel that **amplifies** them (hence opt-in, not default).

**Gate cleanliness (lessons-critical):** local `eslint .` reports 21 errors, all in
the **untracked** `.claude/hooks/worktree-write-guard.cjs` builder-harness file
(absent from clean checkouts) — not project code. Every **tracked** `.ts/.mjs/.js`
file lints clean (`git ls-files … | xargs eslint` → 0 errors), and `eslint .`
flags no non-hooks file, so the lint gate is clean on a pristine tree. `npm run
typecheck` is clean; #41 touches no `package.json`/lockfile, so `npm ci`
reproducibility is unaffected. The noise was **not** suppressed in committed config.

## Decision & Deviation (FR8 vs. Decision 4)

Spec **FR8** literally asserts "default (no `CI`, no `E2E_WORKERS`) ⇒ the scaled
value — i.e. … **not** `1`". The finalized default is `1`. This is a **deliberate,
authorized deviation**: the approved spec makes **Decision 4 "the single canonical
rule for the local default,"** evidence-gated, with an explicit serial-fallback
branch (Scenario 5); FR1/Scenario 1/Summary already defer to it. FR8's "not 1"
clause was written under the assumption the parallel default would qualify green;
the evidence above shows it does not, so Decision 4 governs and the default is
serial. The unit test row that asserted the `'50%'` default was updated to assert
`1` (per the plan's Phase-3 note "if the default flips, update the matrix row").
Architect endorsed this disposition (2026-07-22).

## Flaky Tests / Disposition

- **#33** (`[firefox] matrix.spec.ts:224`): pre-existing, open, amplified by
  parallel contention. **Disposition:** accepted + documented, **not masked with
  retries**, the canonical `MOTION_FLOOR` assertion **not weakened**. It is a
  primary reason parallel is opt-in, not default. `retries: 0` keeps any
  recurrence visible.
- The SwiftShader-parallel Chromium failures are **contention artifacts of a
  configuration we are not shipping as default**, not defects in shipped behavior;
  the shipped serial default does not exhibit them.

No test was skipped or weakened.

## Acceptance Criteria

- [x] Local runs can use multiple workers scaled to cores (`E2E_WORKERS=50%`);
      CI unchanged (`validation.yml` zero-diff; `CI=1 ⇒ workers 1`, tested).
- [x] The parallel path is **clearly separated from the qualified serial gate
      with the trade-off documented** (acceptance criterion 2, second branch) —
      the ≥3-run parallel qualification is recorded above.
- [x] `playwright.config.ts` comment reflects the new local-parallel rationale
      (replaces the stale "Do NOT raise workers" text).
- [~] `npm run validate` wall-clock: the documented trade-off is taken instead of
      a default speedup (Success Metric 4's permitted alternative) — SwiftShader
      parallel is faster (~3.3m vs 11.7m serial) but **breaks the gate** (4–5/22
      timing failures every run), so serial is retained; the ~4× speedup is
      available opt-in on the GPU lane, where the suite stays mostly green.

## Spec Compliance

- [x] **FR1 (local parallel capability)** — delivered as **opt-in** per Decision 4
      (evidence-gated); parallel runs via `E2E_WORKERS`, scaled to cores.
- [x] **FR2 (`E2E_WORKERS` override)** — integer or percentage; invalid ⇒ loud
      `WorkerConfigError` at config load; tested (FR8 matrix).
- [x] **FR3 (absolute CI serial guard)** — `resolveWorkers` returns `1` before
      reading `E2E_WORKERS`; tested; re-verified via `CI=1` run banner (1 worker).
- [x] **FR4 (CI byte-for-byte unchanged)** — `.github/workflows/validation.yml`
      zero-diff vs `main`.
- [x] **FR5 (`retries: 0` preserved locally)** — unchanged; kept the amplified
      flake visible.
- [x] **FR7 (GPU lane inherits workers)** — verified: lane banner `22 tests using
      10 workers`, zero `scripts/e2e-gpu-lane.mjs` change.
- [x] **FR8 (worker-resolution coverage)** — `tests/e2e-workers.test.mjs` (24
      tests); `automation.test.mjs` source-text assertion migrated to delegation.
- [x] **FR9 (repeat-run qualification evidence)** — ≥3 parallel runs on both the
      GPU lane and SwiftShader, verbatim per-test results (Appendix).
- [x] **FR10 (config comment)** — stale "Do NOT raise workers" block replaced with
      the finalized contract.
- [x] **FR11 (README)** — new "Local test parallelism" note + lane/env-table/status
      updates.
- [~] **FR6 / Success Metric 4 (`validate` speedup)** — the documented trade-off is
      taken instead (Decision 4 / Scenario 5): serial gate retained; ~4× speedup
      available opt-in on the GPU lane.

## Deviations from Plan

- **Default finalized to serial, not parallel `'50%'`** (Phase 3). The plan
  carried both branches; the evidence forced the serial-default + opt-in branch.
  This deviates from FR8's literal "default ⇒ scaled, not 1" clause, authorized by
  the canonical **Decision 4** (see "Decision & Deviation" above). Architect
  endorsed.

## Lessons Learned

### What Went Well
- **Evidence-gated defaults earn their keep.** The spec's Decision 4 anticipated
  this outcome; had the default been hard-committed to parallel, the gate would
  ship flaky. The "or serial fallback, documented" branch made the honest landing
  a one-line constant flip, not a redesign.
- The **pure helper + config-consumer** split (Phase 1 before Phase 2) meant the
  finalize-the-default step was a single constant change with the contract already
  fully unit-tested.
- **`retries: 0` did its job** — the amplified flake surfaced immediately instead
  of being silently absorbed.

### Challenges Encountered
- **A wrong-baseline speedup claim.** I first wrote "parallel gives no speedup"
  by comparing parallel-SwiftShader against serial-*hardware*. The serial-default
  confirmation run (11.7m serial SwiftShader) exposed it: parallel is *faster*
  but *destabilizes*. Fixed across review/config/helper/README; Codex caught two
  residual mentions I'd missed on the first sweep. Lesson: when correcting a claim,
  grep for the *concept* (every `speedup|faster|slower`), not one phrasing.
- **Per-test evidence granularity.** My first review summarized runs; FR9 wants
  full per-test pass/fail. Added a verbatim 8-run appendix.

### What Would Be Done Differently
- Run the serial-SwiftShader baseline **early**, before framing any speedup claim,
  so the comparison baselines are correct from the first draft.

### Methodology Improvements
- The evidence-gated-default pattern (spec writes both branches; builder picks from
  recorded evidence) worked cleanly and is worth reusing for any "optimistic
  headline that might not survive qualification" spec.

## Consultation Feedback

### Specify Phase (Round 1)
- **Codex (REQUEST_CHANGES)** — FR1/Scenario 1/Summary asserted the parallel local
  default *unconditionally*, contradicting Decision 4's evidence-gated framing.
  **Addressed**: made Decision 4 the single canonical rule; FR1/Scenario 1/Summary
  now defer to it. **Gemini / Claude**: APPROVE, no concerns.

### Plan Phase (Round 1)
- **Codex (COMMENT)** — `playwright test --list` proves the config *loads* but not
  the resolved worker count. **Addressed**: Phase 2 asserts Playwright's `using M
  worker(s)` run banner under default / `CI=1` / `E2E_WORKERS=4`. **Gemini /
  Claude**: APPROVE.

### Implement Phase 1 (Round 1)
- **All three APPROVE** — no concerns raised.

### Implement Phase 2 (Round 1 → 2)
- **Codex (REQUEST_CHANGES, R1)** — config comment overstated qualification ("is
  qualified" before Phase 3 recorded evidence). **Addressed**: reworded to "is
  being qualified … that evidence decides the default." **R2: all three APPROVE.**

### Implement Phase 3 (Rounds 1 → 2 → 3)
- **Codex (REQUEST_CHANGES, R1)** — (a) review said parallel "gives no SwiftShader
  speedup", contradicting the 3.3m-vs-11.7m data; (b) helper inline comment still
  said "Scaled default". **Both addressed.**
- **Codex (REQUEST_CHANGES, R2)** — (a) review lacked full per-test results (FR9);
  (b) `automation.test.mjs` comment "local runs scale to hardware" stale. **Both
  addressed** (verbatim per-test appendix; comment corrected).
- **R3: all three APPROVE.** Gemini and Claude APPROVE'd every Phase-3 round.

## Architecture Updates

Routed to the **COLD** `codev/resources/arch.md` (§ Validation Baseline) — reference
detail, not a hot always-inject fact:
- Updated the (now-stale) "keeps `workers: 1`" / "Do not raise `workers`" text: the
  config resolves `workers` via `resolveWorkers` (CI-guarded to `1`); the **local
  default is serial** because #41 qualified parallel and found SwiftShader
  destabilization; local parallelism is **opt-in** via `E2E_WORKERS`.
- Updated the GPU-lane paragraph: the "sequenced after" future-reference is now
  delivered; the lane inherits the serial default and honors `E2E_WORKERS`.

No **HOT** `arch-critical.md` change: the hot fact "`npm run validate` is the green
gate" still holds, and its map already routes worker/e2e changes to "Validation
Baseline". No cap pressure, no displacement.

## Lessons Learned Updates

Routed to the **COLD** `codev/resources/lessons-learned.md` (§ Validation Evidence):
- "Qualify a parallelism/performance change on the path that **gates** (SwiftShader
  for local e2e), not just the fastest substrate — hardware-parallel looked green
  while the gate path failed 4–5/22 every run; and write the safe fallback into the
  spec up front as an evidence-gated default."

No **HOT** `lessons-critical.md` change: the hot lesson "'tests pass' is not 'it
works' — verify the real user path" already carries the spirit; this is a
harness-qualification refinement (reference detail), so it belongs cold. No cap
pressure.

## Technical Debt

- **Open flakes #33 (Firefox drag-rotate) and #34 (click-to-focus)** remain open —
  pre-existing, not in #41's scope. #41 documents that parallelism amplifies them
  and keeps them unmasked. Fixing them is follow-up work that would make opt-in
  parallel more reliable.

## Follow-up Items

- If #33/#34 are fixed, re-run the parallel qualification — a green parallel path
  could justify revisiting the default (the machinery is already in place; only the
  `DEFAULT_LOCAL_WORKERS` constant would change).
- Consider a convenience script (e.g. `test:smoke:parallel`) if opt-in parallel on
  the GPU lane becomes a common local workflow.

## Appendix — Per-test results (verbatim, FR9)

Full per-test pass/fail (`✓`/`✘`) for every qualification run, captured
verbatim from Playwright's `list` reporter (worker index prefixes the test).

### GPU lane · PARALLEL run 1/3 (hardware, 10 workers)
```
Running 22 tests using 10 workers
✓   8 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   4 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓   5 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  10 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   3 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   9 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓   6 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓   7 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  14 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  17 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   2 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  15 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓   1 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  19 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  20 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  16 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓  18 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
22 passed (44.9s)
```

### GPU lane · PARALLEL run 2/3 (hardware, 10 workers)
```
Running 22 tests using 10 workers
✓   6 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  10 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓   5 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓   3 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   2 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   4 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓   8 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓   1 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  14 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  17 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   9 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  15 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓   7 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  19 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  20 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  16 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓  18 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
22 passed (44.0s)
```

### GPU lane · PARALLEL run 3/3 (hardware, 10 workers)
```
Running 22 tests using 10 workers
✓   7 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   1 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓   8 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   5 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓   2 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓   4 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   6 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   3 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  14 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  17 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   9 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  10 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  20 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  16 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  19 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✘  15 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  18 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
1 failed
21 passed (46.9s)
```

### GPU lane · SERIAL baseline (hardware, 1 worker)
```
Running 22 tests using 1 worker
✓   1 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   2 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   3 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓   4 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓   5 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓   6 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓   7 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   8 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓   9 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  10 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  14 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  15 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  16 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  17 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  18 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓  19 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  20 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
22 passed (3.2m)
```

### SwiftShader · PARALLEL run 1/3 (10 workers)
```
Running 22 tests using 10 workers
✓   9 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   4 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes (1.1m)
✓   3 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses (1.1m)
✓   6 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize (1.2m)
✘   7 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag (1.2m)
✘   8 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel (1.2m)
✓  10 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control (1.9m)
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  14 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  15 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  17 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓  16 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  18 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  19 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  21 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓   5 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (2.8m)
✘   2 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation (2.4m)
✘  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (2.2m)
✓  22 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓   1 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (3.1m)
✓  20 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
4 failed
18 passed (3.2m)
```

### SwiftShader · PARALLEL run 2/3 (10 workers)
```
Running 22 tests using 10 workers
✓   3 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   8 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓   5 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   2 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize (1.1m)
✓   9 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control (1.3m)
✘   1 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag (1.0m)
✘   6 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel (1.1m)
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  15 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  14 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  17 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓  20 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  19 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  18 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓  16 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓   4 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (2.6m)
✘  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (2.1m)
✘   7 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation (2.4m)
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  10 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (3.2m)
4 failed
18 passed (3.3m)
```

### SwiftShader · PARALLEL run 3/3 (10 workers)
```
Running 22 tests using 10 workers
✓   8 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  10 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   4 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize (1.1m)
✘   2 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓   3 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control (1.6m)
✘   9 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses (1.2m)
✓  12 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  13 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✘   5 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel (1.3m)
✓  14 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  17 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓  18 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  15 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  19 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  16 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  20 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓   6 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (2.8m)
✘  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls (2.2m)
✘   7 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation (2.6m)
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓   1 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (3.1m)
5 failed
17 passed (3.3m)
```

### SwiftShader · SERIAL baseline / finalized default (1 worker)
```
Running 22 tests using 1 worker
✓   1 [chromium] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓   2 [chromium] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓   3 [chromium] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓   4 [chromium] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✓   5 [chromium] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag (1.5m)
✓   6 [chromium] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view (1.2m)
✓   7 [chromium] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓   8 [chromium] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓   9 [chromium] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  10 [chromium] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz (1.3m)
✓  11 [chromium] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
✓  12 [firefox] › tests/e2e/matrix.spec.ts:75:5 › settles an initial force layout with positioned nodes
✓  13 [firefox] › tests/e2e/matrix.spec.ts:104:5 › rotates the camera automatically until paused, then resumes
✓  14 [firefox] › tests/e2e/matrix.spec.ts:134:5 › keeps pointer navigation inert until the enable delay elapses
✓  15 [firefox] › tests/e2e/matrix.spec.ts:194:5 › zooms out with the wheel
✘  16 [firefox] › tests/e2e/matrix.spec.ts:224:5 › zooms in with the wheel and rotates with a background drag
✓  17 [firefox] › tests/e2e/matrix.spec.ts:269:5 › click-to-focus fixes the node, animates the camera, and reset restores the view
✓  18 [firefox] › tests/e2e/matrix.spec.ts:433:5 › toggles AxesHelper visibility through the axes control
✓  19 [firefox] › tests/e2e/matrix.spec.ts:466:5 › keeps the canvas consistent and interactive across a resize
✓  20 [firefox] › tests/e2e/matrix.spec.ts:527:5 › remounts a fresh working canvas on re-navigation
✓  21 [firefox] › tests/e2e/right-click-release.spec.ts:174:5 › right-clicking a fixed node releases its fx/fy/fz
✓  22 [firefox] › tests/e2e/smoke.spec.ts:78:5 › renders the graph and exercises its core controls
1 failed
21 passed (11.7m)
```
