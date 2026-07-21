# bugfix-34 — Flaky CI e2e: click-to-focus (matrix.spec.ts:235) on SwiftShader

Protocol: BUGFIX (strict). Issue #34.

## Investigate phase

**Symptom**: `click-to-focus fixes the node…` test (matrix.spec.ts:235) flakes ~50%
on GitHub Actions Chromium+SwiftShader. Predates sharding (#30/#32). Different
assertions fail across runs; the dominant one is "a real node click should
register and fix the node" (matrix.spec.ts:341-344).

**Root cause traced through the library** (`three-render-objects` +
`3d-force-graph`, both stock — the two repo patches are `.d.ts`-only):

- Hover is resolved in the render loop `tick()`
  (`three-render-objects.mjs:262-296`): each animation frame runs
  `controls.update()` → `renderer.render()` (EXPENSIVE under SwiftShader) → a
  raycast **throttled to `pointerRaycasterThrottleMs` = 50** that updates
  `state.hoverObj` from `state.pointerPos`.
- A click's decision is deferred: the `pointerup` handler
  (`three-render-objects.mjs:552-570`) does
  `requestAnimationFrame(() => onClick(state.hoverObj || null, …))` — it reads
  `hoverObj` one frame **after** pointerup ("to allow hoverObj to be set on
  frame").
- `page.mouse.click(x,y)` fires move→down→up in one burst. If no raycast tick
  has run at the new `pointerPos` before the click's rAF fires, `hoverObj` is
  stale/null → `onNodeClick` never fires → no node fixed → assertion fails.
  Under software WebGL, `renderer.render()` dominates the frame and the
  raycast-vs-click ordering/throttle becomes nondeterministic.

**Fix direction (test/harness-side; app is not at fault — issue says so)**:
Make the click hover-first — move to the target, wait for real animation frames
so a raycast registers the node under the pointer, THEN issue pointerdown/up so
the click's rAF reads an already-set `hoverObj`. Frame-based waiting auto-scales
to render speed and does NOT trim any qualified wait, does NOT touch `workers`
(constraints from #30).

Constraints honored: no app-code change, no trimming qualified waits, no raising
workers.

## Ground truth from the failing CI run (29782250395, shard 2)

Downloaded the Playwright trace of the failing attempt. Decisive facts:
- All **4** aimed clicks were at the **identical** coord (351.87, 296.28) — i.e.
  the camera was perfectly stable and `pickNodeScreenPoint` returned the same
  valid projection each time. (Attempts 5–6 got a null pick → `waitForTimeout`.)
- The failure page snapshot shows the node tooltip "Pablissimo" set ⇒ the hover
  raycast DID resolve a node at that point. Hover works; the click does not fix.
- ⇒ The click's deferred `onClick(hoverObj || null)` read a **null/stale** hover
  at the rAF moment even though a node was hittable there. This is the
  aim-to-raycast / deferred-click ordering race the issue predicted.

Local slow-frame emulation (busy-wait inside a wrapped rAF; JS speed untouched,
mirrors GPU-less SwiftShader far better than CDP CPU throttling which also slows
the force-sim warmup) reproduces the race: a bare `page.mouse.click` occasionally
misses; a hover-first click (move → wait real animation frames → down/up) is
robust. Locally at full render speed the real test passes 5/5 (can't repro the
CI-only flake at native speed — expected).

## Investigate → conclusion
- **Root cause**: harness-side click-delivery race vs the library's
  throttled-raycast hover + one-frame-deferred click. NOT an app logic bug
  (issue concurs).
- **Fix**: make the aimed click hover-first — `move` → wait N real animation
  frames (auto-scales to render speed) → `down`/`up` — so a committed hover
  raycast has registered the node BEFORE the deferred click resolves. New helper
  `tests/e2e/pointer.ts`; matrix.spec.ts:235 click loop uses it (keeps its
  6-attempt retry). No app change; no trimmed waits; `workers` untouched.
- **Regression test**: deterministic real-browser synthetic page modelling the
  documented mechanism (throttled-raycast hover latency + rAF-deferred click) —
  bare click misses, hover-first registers. Fast, no WebGL, CI-safe.
- **Size**: well under 300 LOC. BUGFIX-appropriate.

## Fix phase — done
- New helper `tests/e2e/pointer.ts`: `settleHoverThenClick` (move → wait N real
  animation frames → down/up) + `waitForAnimationFrames`. Default 5 frames.
- `matrix.spec.ts:235` click loop now uses `settleHoverThenClick` (keeps the
  6-attempt retry). No app change.
- Regression test `tests/click-registration.test.mjs` (node:test, deterministic,
  CI-safe): bare click misses / hover-first registers / too-few-frames misses.
  Proven to FAIL when the fix is reverted (settleFrames=0 → subtest 2 not ok).
- Committed 607ba1c. Net diff ~228 LOC excl. thread (< 300).

## Validation
- `npm test` 36/36 ✓ (was 33). typecheck ✓. build ✓.
- Real matrix `click-to-focus` e2e: 3/3 green with the fix (no regression).
- Local lint shows 21 errors — ALL from untracked
  `.claude/hooks/worktree-write-guard.cjs` (builder harness, absent from clean
  checkouts). Proven noise: clean detached worktree + real `npm ci` →
  lint EXIT 0, typecheck EXIT 0, tests 36/36. Not suppressed in committed config
  (per lessons-critical). My files lint clean in isolation.
- Scratch files deleted; not committed.

## PR phase
- PR #39 opened → main. Body: Summary / Root Cause / Fix / Test Plan, `Fixes #34`.
- CMAP (bugfix/pr): **gemini=APPROVE(HIGH), codex=APPROVE(HIGH), claude=APPROVE(HIGH)**;
  unanimous, zero KEY_ISSUES, no REQUEST_CHANGES. Codex flagged only a
  review-sandbox `/tmp` read-only failure of the unrelated `audit-report` test
  (not PR breakage; matches clean-checkout proof). Posted CMAP table as PR comment.
- Requesting `pr` gate via `porch done`; STOP and wait for human approval.
  Builder must NOT self-approve or merge until the gate is human-approved.
