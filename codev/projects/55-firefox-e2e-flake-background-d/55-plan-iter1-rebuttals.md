# Plan — Iteration 1 Rebuttal (Spec 55)

3-way plan consultation verdicts:

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Gemini | APPROVE | HIGH |
| Claude | APPROVE | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Two of three approved outright (both verifying the plan's file references
against the codebase). Codex's two points are legitimate implementation-scope
issues — both accepted and fixed. Nothing is rebutted as wrong.

---

## Codex #1 — The diagnostic spec variant would be collected by the canonical suite

> The Phase 1 "diagnostic spec variant" conflicts with the requirement that the
> canonical suite remain unchanged unless the plan explicitly says how it will be
> kept out of `playwright test` / `npm run test:smoke` (different filename
> pattern, out-of-tree location, or explicit env-gating). As written,
> `tests/e2e/matrix.drag-diagnostic.spec.ts` would be collected by the current
> Playwright config.

**Accepted. Correct and important.** `playwright.config.ts` sets
`testDir: "./tests/e2e"` with the default `testMatch` (`**/*.spec.ts`), so a
`matrix.drag-diagnostic.spec.ts` under `tests/e2e/` **would** be collected into
`playwright test`, `npm run test:smoke`, and every CI shard — silently changing
the canonical suite the spec requires to stay unchanged. (Claude's review
assumed the separate file was sufficient; Codex is right that it is not.)

**Changed.** Phase 1 now specifies the diagnostic as an **out-of-tree harness**:

- Location `tests/diagnostics/55-drag/drag-diagnostic.spec.ts` (outside
  `./tests/e2e`, so the canonical `testDir` never collects it).
- A dedicated minimal `tests/diagnostics/55-drag/playwright.diag.config.ts`
  whose own `testDir` points at that folder and reuses the same `webServer` /
  engines / viewport; run explicitly via
  `playwright test --config tests/diagnostics/55-drag/playwright.diag.config.ts`
  in Phase 2.
- Shared helpers imported by relative path (`../../e2e/graph-handle`,
  `../../e2e/pointer`) — no duplication.
- **Alternative** documented: keep it in-tree but strict-env-gated so it
  registers **zero** tests unless `E2E_DRAG_DIAG` is set. Out-of-tree is
  preferred because it makes "canonical suite unchanged" literally true rather
  than a no-op skip.
- Phase 1 acceptance now **proves** non-collection: `npx playwright test --list`
  (default config) shows the same test set as before Phase 1.
- Phase 3's FR2 "trim" is reworded: the harness was never in the canonical
  suite, so there is nothing to remove — the committed `tests/e2e/` delta is
  only the fix + cheap probe fields.

## Codex #2 — The `playwright.config.ts:114` comment should be included, not deferred

> Phase 6 treats the `playwright.config.ts:114` `#33` comment correction as an
> "open question," but the spec's FR8/Decision 7 require correcting remaining
> misattributions to `#55`. Since this is a comment-only, behavior-preserving
> edit in an already-referenced file, the plan should either include it directly
> or explain a spec-backed reason to exclude it.

**Accepted.** I originally flagged it as an open question out of caution around
Decision 2 ("CI and the serial gate are untouched"). But Decision 2 specifically
names `.github/workflows/validation.yml` and the **executable** gate contract
(`workers: 1` under `CI`, `retries`, engine selection). A comment-only edit
changes zero executable bytes, so it does not touch the gate contract — while
FR8's "all remaining flake/caveat references cite #55" *does* cover it.

**Changed.** Phase 6 now **includes** the `playwright.config.ts:114` correction
in FR8 scope as a comment-only edit (diff shows only comment lines; verified via
`git diff`), with the Decision-2 rationale stated inline. The Phase 6 acceptance
grep, the risk row, and the Documentation-Updates list are updated to match. It
is surfaced to the architect as **trivially droppable** if they prefer to
exclude it — but the default, per FR8, is to include it.

---

## Not changed (and why)

- **Gemini** and **Claude** required no changes; both independently verified the
  plan's codebase claims (test body, probe API, helper precedent, config
  invariants) as accurate.
- Claude's non-blocking notes were already handled by the draft: Trackball/
  DragControls internal-state reachability is hedged as "a bonus, not required"
  (DOM counters + probe fields discriminate H1/H2/H3 without library privates),
  and the review-doc-vs-evidence-artifact distinction is stated in Notes.
- The 6-phase strict sequence, evidence-selected fix branching, Decision-5
  fallback/terminal-outcome encoding, and FR2 committed-vs-evidence rule are
  unchanged and endorsed by all three reviewers.

A Consultation Log capturing this iteration and the applied changes has been
added to the plan itself.
