# Phase 3 — iteration 1 consultation rebuttals

3-way review of the phase_3 H1 fix (probe-verified background drag start).

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Claude | APPROVE | HIGH |
| Gemini | REQUEST_CHANGES | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Claude approved with no issues ("minimal, behavior-preserving, correctly scoped").
Gemini and Codex raised the **same** blocking concern — an FR2 committed-vs-
evidence-only violation — at different scopes. **Both accepted and addressed** by
relocating the heavyweight diagnostics out of the canonical suite. The fix itself
(the H1 probe-verified background start point) drew praise from all three and is
unchanged.

## Gemini — heavyweight per-event pointer log in the canonical suite

> `tests/e2e/graph-handle.ts` retains the verbose per-event pointer log
> (`PointerEventRecord` and the `log.events.push(...)` array allocation) … "verbose
> per-event logs" [are] heavyweight evidence-only capture that "never enters
> tests/e2e/". … remove the `events` array and `dropped` tracking.

**Accepted.** The per-event ring is removed from `tests/e2e/` entirely.

## Codex — pointer counters + controls sampler still committed in tests/e2e

> `tests/e2e/graph-handle.ts` still retains the verbose pointer-log ring, pointer
> event counters, and `controls.enabled` sampling APIs (`PointerLog`,
> `ControlsSample`, `__readPointerLog`, `__resetPointerLog`, `sampleControls`,
> etc.). Spec/plan Phase 3 explicitly says these are evidence-only … The keepable
> H1 dependency is the occupancy/background-point helper; the rest should be
> trimmed from `tests/e2e/`.

**Accepted — Codex's fuller scope is the spec-authoritative one and subsumes
Gemini's.** Spec FR2 (`55-firefox-background-drag-flake.md`, "Committed final
state vs evidence-only tooling") explicitly enumerates as heavyweight-evidence-
only: *"verbose per-event pointer logs, `controls.enabled` sampling traces,
dumped-on-failure counters, and any diagnostic-only spec variant,"* and lists the
committed keepers as only *(a) whatever the fix depends on* and *(b) a
node-occupancy / verified-background-point helper*. So the counters and the
controls sampler leave `tests/e2e/` too — not just the events ring.

## Changes applied

**Relocated (not deleted)** the heavyweight diagnostics so the diagnostic stays
re-runnable, per the plan's FR2 final state ("leave them under
`tests/diagnostics/` as committed evidence") and the spec's intent that
heavyweight tooling "live in scratch/evidence artifacts referenced by the review":

- **New `tests/diagnostics/55-drag/drag-probe.ts`** (out-of-tree, colocated with
  the diagnostic that consumes it): the `PointerLog` / `PointerEventRecord` /
  `ControlsSample` types, `installDragProbe()` (a self-contained `addInitScript`
  installing the capture-phase pointer counters + the fast controls sampler, with
  a minimal duplicated `findHandle` so the canonical probe carries no heavyweight
  surface), and the `sampleControls` / `readPointerLog` / `resetPointerLog`
  wrappers.
- **`tests/e2e/graph-handle.ts` trimmed** to only the H1 fix dependency: kept
  `NodeOccupancy` + `__graphNodeOccupancyAtPoint` + `nodeOccupancyAtPoint` and the
  new `pickBackgroundDragPoint` / `BackgroundDragPoint`; removed the 3 heavyweight
  types, the 4 heavyweight `Window` declarations, the pointer-counter install
  block, `__graphControlsSample`, and the 3 heavyweight wrappers.
- **`tests/diagnostics/55-drag/drag-diagnostic.spec.ts`**: split imports (keepable
  from `../../e2e/graph-handle`, heavyweight from `./drag-probe`) and calls
  `installDragProbe(page)` before `openGraphPage` (its `addInitScript` must run
  before navigation).

### Why relocate rather than delete

The plan's Phase-3 FR2 state explicitly permits the diagnostic to "stay under
`tests/diagnostics/` as committed evidence," and the spec wants heavyweight
diagnostics to "live in … evidence artifacts referenced by the review" — i.e.
retained and re-runnable, not merely recoverable from git history. `tsconfig`
includes `**/*.ts`, so a dangling-import diagnostic would also break `typecheck`.
Relocation satisfies both reviewers (no heavyweight code in `tests/e2e/`) while
keeping the H1/H2/H3 discrimination tooling intact for future triage.

## Verification (post-trim)

- `npm run typecheck` clean; `eslint .` clean on the tracked tree (only the
  untracked `.claude/hooks/*` builder-harness file remains, environment noise per
  lessons-critical).
- **Canonical `:224` fix still green 4/4** both engines (chromium 47–52s, firefox
  15s) — the trim did not touch the fix path.
- **Canonical suite provably unchanged**: `npx playwright test --list` (default
  config) collects **0** diagnostic tests and the same 18 `matrix.spec.ts` tests;
  the diagnostic collects 4 tests only under its own `--config`.
- **Diagnostic still functions** after the move: on firefox it produced valid
  discriminators and freshly reproduced H1 live —
  `occupancy@start(150,450): hit=true, withinDisk=true, nearestPx=5.24 <
  projRadiusPx=5.47`, `controls.enabled before/after` sampled, `pointermoves
  between down and up: 12` — confirming `installDragProbe` + the relocated helpers
  are correctly wired. (Its assert-on-reproduce "failure" at the fixed `(150,450)`
  is the diagnostic's Phase-1 design; it never gates `npm run validate`.)
