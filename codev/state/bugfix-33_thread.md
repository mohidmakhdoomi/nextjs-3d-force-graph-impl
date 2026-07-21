# bugfix-33 — firefox-local-gate-flake-point

Issue #33: Firefox local-gate flake — `matrix.spec.ts:112` "keeps pointer navigation
inert until the enable delay elapses" intermittently fails on the Firefox **local**
qualification arm (Chromium CI gate is deterministic 10/10). Surfaced during #13's
merge-integration re-qualification, plausibly nudged by bugfix-27's drift-free orbit.

## Investigate

Failure mode (from #13 review `## Flaky Tests`): `waitForStableCameraDistance` occasionally
settles *after* the 4000 ms pointer-enable timer, so `controlsEnabled` is already `true`
when the "still disabled after camera placement" assertion (matrix.spec.ts:131-135) runs.

Reading of the code so far:
- App (`FocusGraph.tsx`): `enableDelay=4000` default; `scheduleInteraction(() => setClickEnabled(true), 4000)`
  in the mount `useEffect`. Deterministic 4 s from mount → controls enable. No app bug in the timing.
- Orbit (`orbitCamera.ts`, bugfix-27): `orbitCameraStep` = `position.applyAxisAngle(up, angle)` +
  `lookAt(target)`. `applyAxisAngle` rotates position about the world origin → preserves
  distance-from-origin EXACTLY. So auto-rotation does NOT change `cameraDistance`; the
  drift-free change is orientation-only and cannot itself keep camera-distance unsettled.
- Harness (`graph-handle.ts`): `waitForStableCameraDistance` polls every 250 ms, needs two
  consecutive `cameraDistance` reads within 0.05, timeout 15 s. It is UNRELATED to the 4 s
  enable timer — the coupling of assertion-2 to this waiter is the spurious race.

Working hypothesis: this is a **harness/test defect**, not an app defect. The app keeps
controls disabled for exactly 4 s (deterministic); the E2E's second "still disabled"
assertion gates on an unrelated camera-settle event whose completion can fall on either
side of the 4 s boundary. Need to instrument on Firefox to confirm (camera-settle wall
time vs enable-timer) before choosing the fix.

### Characterization (Firefox software-WebGL, delay=4000, 10 iterations)

Instrumented a throwaway spec measuring wall-clock timelines from `page.goto`:

| metric | range (ms from goto) |
|---|---|
| first handle reachable (`waitForGraphHandle`) | 2475 – 3029 |
| camera-settle complete (`waitForStableCameraDistance`) | 3211 – 3859 |
| controls enable (real transition) | 4597 – 8325 |

- `controlsEnabled` was `false` at first-handle **and** after camera-settle in all 10 runs
  (no flake caught in this small sample — it's a tail event).
- **Margin between camera-settle-complete and enablement was as small as ~880 ms** (iter 0:
  settle 3859 vs enable 4739). Camera settle (~3.2–3.9 s) and enablement (~4.6 s) are two
  independent timelines separated by < 1 s — a scheduling spike / GC pause on the settle
  side, or an early-ish enable, flips the order.
- `settleMs` itself was tight (710–831 ms): the camera distance settles fast and stays
  settled, confirming auto-rotation does NOT keep `cameraDistance` moving.

### bugfix-27 attribution — NOT implicated

`orbitCameraStep` = `position.applyAxisAngle(up, angle)` (rotates the position vector about
the **world origin** → preserves |position| = distance-from-origin exactly) + `lookAt(target)`
(orientation only). So the drift-free orbit change is **orientation-only** and cannot affect
`cameraDistance` settle timing. The #13 reviewer's "plausibly nudged by bugfix-27" was
n=3 speculation; the race is a **pre-existing harness-design coupling** present regardless of
the orbit math (the same ~800 ms two-timeline proximity exists on the pre-bugfix-27 base).

### Root cause (CONFIRMED, deterministic repro)

`matrix.spec.ts:112`'s second assertion (lines 131–135, "navigation controls should still be
disabled after camera placement") gates on `waitForStableCameraDistance(page)` — a camera
waiter with **no ordering relationship** to the 4000 ms enable timer. When settle lands after
enablement, the snapshot reads `controlsEnabled === true` → spurious failure.

Deterministic reproduction: temporarily set the app default `enableDelay=2700` (lands
enablement between handle-reachable ~2.7 s and settle-complete ~3.5 s), rebuild, run the
**unmodified** target test on Firefox → **3/3 FAIL** at `matrix.spec.ts:135` with the exact
message *"navigation controls should still be disabled after camera placement" — Received: true*.
(App reverted to `enableDelay=4000` immediately after; working tree clean.) This is the exact
failure mode #13's review documented.

### Fix ownership & scope → HARNESS, BUGFIX-appropriate

The app is correct (deterministic 4 s inertness, no defect). Fix = decouple the test's
"inert until the delay" assertion from the camera-settle waiter and replace it with a
**race-free enable-latency floor** measured from navigation: a `setTimeout(4000)` scheduled
no earlier than navigation physically cannot fire before 4000 ms of wall-clock, so any floor
< 4000 ms never races — yet it still trips on a real premature-enablement regression.
Behavior-preserving (same semantic: controls start disabled, stay inert until the delay,
then real input works), evidenced, single test-function edit (well < 300 LOC), matrix reused
not re-authored. → investigate complete.

## Fix

Harness-only change to `tests/e2e/matrix.spec.ts` (net 45 LOC: 34 ins / 11 del), the app is
untouched:
- Added module constants `ENABLE_DELAY_MS = 4000`, `INERT_FLOOR_MS = ENABLE_DELAY_MS - 1000`.
- In the "keeps pointer navigation inert…" test: capture `navigationStart = Date.now()` before
  `openGraphPage`; keep the early "controls start disabled" assertion; **removed** the racy
  `waitForStableCameraDistance` + "still disabled after camera placement" snapshot; after
  `waitForPointerEnablement`, assert `enableLatencyMs = Date.now() - navigationStart >=
  INERT_FLOOR_MS`. A `setTimeout(4000)` scheduled no earlier than navigation cannot fire
  before 4000 ms of wall-clock, so a 3000 ms floor never races the boundary yet still fails
  on premature enablement (the invariant means controls stayed inert across `[0, 3000)`).

### Validation evidence

- `npm run typecheck`: clean. `npx eslint tests/e2e/matrix.spec.ts`: exit 0 (only lint errors
  repo-wide are the untracked `.claude/hooks/worktree-write-guard.cjs` harness file — env noise
  per lessons-critical, absent from clean checkouts).
- porch `check`: build ✓ (9.8s), unit tests ✓ (24 tests, 1.0s).
- **Fix works, non-flaky** — fixed test at real `enableDelay=4000`, `--repeat-each=5` both
  engines: **10/10 PASS** (5 Chromium + 5 Firefox).
- **Old assertion was genuinely racy** — with app `enableDelay=2700` (enablement lands between
  handle-reachable and camera-settle), the **unmodified** old test failed **3/3** at line 135
  ("should still be disabled after camera placement", Received: true).
- **New assertion is load-bearing** — with app `enableDelay=2000` (premature), the fixed test
  correctly failed **3/3** (caught via the start-disabled assertion; floor + early assertion
  together cover premature enablement).
- App reverted to `enableDelay=4000` and rebuilt; `git diff` touches only
  `tests/e2e/matrix.spec.ts`. → fix complete; committing, then transitioning to pr.

## PR

- Commit `6484fda` on `builder/bugfix-33`.
- **PR #40** opened against `main`: https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/pull/40
  (Summary / Root Cause / Fix / Test Plan, `Fixes #33`).
- 3-way CMAP review (gemini/codex/claude, `--protocol bugfix --type pr --project-id bugfix-33`):
  - **gemini: APPROVE (HIGH)** — no key issues; "correctly decouples the inertness assertion
    from the camera-settle waiter."
  - **claude: APPROVE (HIGH)** — no key issues; "race-free by construction… minimal scope,
    thorough evidence, no app code touched." Non-blocking note: `ENABLE_DELAY_MS` duplicates the
    app default (deemed a reasonable trade-off vs importing app internals into the test).
  - **codex: REQUEST_CHANGES (HIGH)** — the floor is measured from `navigationStart` (before the
    mount that schedules the timer), so the ~0.7 s mount offset is folded into the measurement and
    a *moderately* early enable (e.g. delay 4000→3100) can still read >3000 ms from nav and pass.
    Wanted the check anchored to the mount/timer-scheduling instant, or tightened toward the real
    4000 ms boundary.

### Response to codex REQUEST_CHANGES (partial-address + rebuttal)

- **Addressed**: raised `INERT_FLOOR_MS` from `ENABLE_DELAY_MS - 1000` (3000) to
  `ENABLE_DELAY_MS - 500` (**3500**) — as tight to the 4000 ms boundary as the race-free
  guarantee allows (enablement is structurally observed ≥ 4000 ms from navigation, so any floor
  < 4000 never races). Re-validated **6/6** at real `enableDelay=4000` (3× Chromium + 3× Firefox);
  still catches premature enablement (`enableDelay=2000` → 3/3 fail; `enableDelay=2500` Firefox →
  3/3 fail).
- **Rebuttal (residual gap is inherent to harness-only observation)**: the mount/timer-scheduling
  instant (~0.7 s Firefox, ~1.0 s Chromium after navigation) is **not observable** through the
  probe — the canvas, and thus every `readGraphSnapshot`, first appears ~2.7 s in, *after*
  scheduling, and any canvas-relative anchor races the timer. So `navigationStart` is the only
  race-free anchor, and the engine-dependent mount offset is folded into the floor's detection
  threshold (empirically confirmed: `enableDelay=2500` **passes** on Chromium because its ~1.0 s
  offset lifts enable-from-nav to ~3.5 s). Closing the 2500–4000 ms detection gap would require
  adding a test-only timestamp hook to production `FocusGraph.tsx` — which violates this repo's
  explicit "the app is never modified; harness-side observation only" discipline
  (`graph-handle.ts` header) and the fix's harness-vs-app ownership call. The raised floor is a
  strict improvement over both the old 3000 floor and the *flaky* original assertion, catches
  grossly-premature enablement, and the actual #33 defect (the camera-settle race) is fully
  eliminated. Flagged for the architect's judgement at the `pr` gate.
