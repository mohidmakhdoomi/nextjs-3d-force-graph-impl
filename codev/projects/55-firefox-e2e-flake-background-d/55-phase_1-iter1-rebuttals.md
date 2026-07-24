# Phase 1 (Drag-path instrumentation) — Iteration 1 Rebuttals

3-way consultation verdicts:
- **Gemini — APPROVE (HIGH)**: "Phase 1 implementation exactly matches the
  plan, cleanly separating diagnostic instrumentation from the canonical test
  suite." No issues.
- **Claude — APPROVE (HIGH)**: verified the ray-sphere math, the FR2
  committed-vs-evidence separation, and the 22/22 no-regression in depth. Two
  non-blocking observations (addressed below).
- **Codex — REQUEST_CHANGES (HIGH)**: one actionable blocking issue (accepted
  and fixed below).

All feedback accepted; changes are confined to the out-of-tree diagnostic
`tests/diagnostics/55-drag/drag-diagnostic.spec.ts`. Neither the canonical
suite nor `tests/e2e/graph-handle.ts` was touched by the fixes, so the recorded
22/22 canonical green still stands; `npm run typecheck` and `npm run lint`
remain clean on the new code.

---

## Codex #1 (BLOCKING) — "pointermoves between down and up" miscounted

> `drag-diagnostic.spec.ts` labels `pointerLog.move` as "pointermoves between
> down and up," but the log is reset **before** the pre-drag
> `mouse.move(DRAG_START…)`, so that setup move is included in the count. An H2
> case with zero delivered drag moves would still report at least one move,
> undermining the "0 moves between down and up" discriminator.

**Accepted — correct and important.** The reset ran before the positioning
move, so `pointerLog.move` was `1 (positioning) + 12 (drag steps) = 13`, and a
true H2 delivery loss (0 drag moves delivered) would still have read ≥1 because
the pre-`down` positioning move is delivered normally — exactly the masking
Codex describes.

**Fix (both remedies Codex offered, for robustness):**
1. **Reset AFTER the positioning move.** `mouse.move(DRAG_START)` now precedes
   `resetPointerLog(page)`, so the aggregate `pointerLog.move` counts only the
   drag deliveries. Applied to both the faithful and stepped variants.
2. **Derive the discriminator from the event sequence.** New
   `movesBetweenDownAndUp(log)` counts move events *strictly between* the
   recorded `down` and the following `up`, independent of reset timing. This is
   the value now reported in the dump and stored in the attached JSON
   (`movesBetweenDownUp`), so the H2 measure is authoritative regardless of any
   stray pre-/post-gesture move.

**Verified** (induced-failure run, `DIAG_MOTION_FLOOR=100000`, both engines,
both variants): `pointer counts: down=1 move=12 up=1 (canvas move=12)` and
`pointermoves between down and up: 12` — down from the previous 13. In a true
H2 case the derived count now reads 0.

---

## Claude (non-blocking) — `readRenderer` used `getContext("webgl")`

> `getContext("webgl")` returns `null` on WebGL2 canvases (three.js defaults to
> WebGL2), so the renderer silently reads "(unavailable)". Not blocking since
> renderer evidence is supplemental.

**Accepted and fixed** (it is *not* supplemental for Phase 2 — FR1/FR5 require
verbatim renderer strings for GPU-lane runs). `readRenderer` now requests
`getContext("webgl2") ?? getContext("webgl")`; since `getContext` returns an
existing context only for the matching type, this returns three.js's live
WebGL2 context and reads `UNMASKED_RENDERER_WEBGL`. GPU-lane reproduction runs
in Phase 2 will now carry the real renderer instead of "(unavailable)".

## Claude (non-blocking) — `waitForPointerEnablement` duplicated

> Duplicated from `matrix.spec.ts` into the diagnostic rather than extracted to
> a shared helper. Acceptable — the diagnostic intentionally imports only from
> `graph-handle.ts`.

**Acknowledged; kept as-is (no change).** Extracting it would either (a) move it
into `graph-handle.ts` and rewire `matrix.spec.ts`'s import — touching the
canonical suite, which the plan forbids — or (b) leave `matrix.spec.ts`'s copy
in place anyway. The small duplication is the price of keeping the canonical
suite byte-for-byte unchanged; Claude explicitly rated this acceptable and
Codex did not flag it.

---

## Net change

`tests/diagnostics/55-drag/drag-diagnostic.spec.ts` only:
- `resetPointerLog` moved after the positioning move (both variants).
- Added `movesBetweenDownAndUp()` + the `movesBetweenDownUp` diagnostics field.
- `readRenderer` prefers the WebGL2 context.

Committed as `0346ea9`. No canonical-suite, app, or `graph-handle.ts` change.
