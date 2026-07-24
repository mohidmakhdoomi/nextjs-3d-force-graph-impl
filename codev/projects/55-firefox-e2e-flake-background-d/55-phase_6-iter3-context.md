### Iteration 1 Reviews
- gemini: APPROVE — All record corrections (FR7 and FR8) for #33/#55 misattributions and #41 follow-ups have been accurately applied to README.md, playwright.config.ts, and all specified review/spec documents.
- codex: REQUEST_CHANGES — Phase 6 mostly matches FR7/FR8, but the README corrections were applied as silent rewrites instead of the marked #55 correction note style the spec/plan require.
- claude: APPROVE — Phase 6 record corrections (FR7 + FR8) are thorough, Decision-7-compliant marked corrections with zero residual #33 misattributions and a clear necessary-but-not-sufficient follow-up — doc/comment-only changes, no executable delta.

### Builder Response to Iteration 1
# Phase 6 — iteration 1 consultation rebuttals

3-way (impl, plan-phase phase_6): **Gemini APPROVE (HIGH)**, **Claude APPROVE
(HIGH)**, **Codex REQUEST_CHANGES (HIGH)**.

- **Gemini APPROVE** — all FR7/FR8 corrections accurately applied across README,
  playwright.config.ts, and the review/spec docs. No issues.
- **Claude APPROVE** — "thorough, Decision-7-compliant marked corrections with zero
  residual #33 misattributions and a clear necessary-but-not-sufficient follow-up;
  doc/comment-only, no executable delta." No issues.

## Codex REQUEST_CHANGES — 1 point, ACCEPTED (with a scoping note)

**Point:** the README Firefox-flake narrative (the phase_5 caveat retirement) was a
direct rewrite to the FIXED state, whereas review-41 / review-52 / spec-52 use a
*clearly marked* `#55` correction note. Decision 7 / FR8 want additive marked
corrections rather than silent rewrites, so the README should carry the same
correction-note pattern.

**Accepted.** Added a marked `> **Correction (#55):**` note to the README's
"Firefox background-drag flake — FIXED (#55)" block that explicitly flags the
historical "#33 family" misattribution (and that #33 was a distinct, closed
enable-delay race), mirroring the review/spec pattern.

**Scoping note (not a rebuttal, for the record):** the README rewrite itself was
**FR6 (phase_5)** — "retire the caveat" — on a *current-state, user-facing* doc,
which is a different category from the *historical qualification records* (reviews
41/52, spec 52) that Decision 7's "do not silently rewrite qualification history"
targets. Retiring a user-facing caveat legitimately means stating the current
(fixed) reality, not preserving the stale warning. That said, Codex's
consistency ask is reasonable and the marked note is genuinely useful for a reader
who encounters the old "#33" mentions elsewhere and needs the cross-reference — so
it is added rather than disputed. The one resulting `#33` token in the README is in
the FR8-permitted "was #33, is #55" correction-note form; the acceptance grep still
shows no *bare this-flake* attribution to #33.

Re-committing and re-consulting (iter 2).


### Iteration 2 Reviews
- gemini: APPROVE — All FR7/FR8 record corrections are accurately applied with marked correction notes, and the previous Codex feedback has been fully resolved.
- codex: REQUEST_CHANGES — FR7 and the #33→#55 correction-note work are mostly solid, but phase_6 still leaves residual record text that states the wrong mechanism for #55.
- claude: APPROVE — Phase 6 record corrections (FR7 + FR8) are thorough and correctly implemented — all five target files carry Decision-7-compliant marked correction notes, zero residual bare #33 misattributions remain, and the iteration-1 Codex README correction-note feedback is cleanly addressed.

### Builder Response to Iteration 2
# Phase 6 — iteration 2 consultation rebuttals

3-way (impl, plan-phase phase_6): **Gemini APPROVE (HIGH)**, **Claude APPROVE
(HIGH)**, **Codex REQUEST_CHANGES (HIGH)**.

- **Gemini APPROVE** — verified the README marked `#55` correction note (resolving
  iter1) and all `#33`→`#55` corrections across reviews 41/52, spec 52,
  `playwright.config.ts`; FR7 necessary-but-not-sufficient wording correct.
- **Claude APPROVE** — Decision-7-compliant marked corrections, zero residual bare
  `#33`, iter1 README feedback cleanly addressed.

## Codex REQUEST_CHANGES — 1 point, ACCEPTED (substantive and correct)

**Point:** phase_6 still left present-tense prose asserting the flake's mechanism
is "**synthetic-input-delivery nondeterminism**" — at `review-41:90-93`,
`review-52:179-186`, and `review-52:247-249`. That conflicts with #55's documented
root cause (**stray node capture**) and phase_6's objective ("wording reflects the
actual Phase 2–5 outcome").

**Accepted — this is exactly right, and important.** "Synthetic-input-delivery
nondeterminism" was the *original hypothesis* (it is even issue #55's title); the
#55 investigation **refuted** it (H2 delivery-loss ruled out — all pointermoves
delivered — and H1 stray node capture confirmed with 26 reproductions). Leaving
that as a present-tense mechanism claim is materially misleading.

**Fix (Decision 7 — marked corrections, not silent rewrites of the historical
hypothesis):**
- `review-41` §A prose (my own phase-5 text): corrected `#55 (synthetic-input-
  delivery nondeterminism …)` → `#55 … root-caused as stray node capture, not the
  synthetic-input-delivery loss hypothesized at #41 time`.
- `review-52` "Class" correction note: **extended** to correct the mechanism, not
  just the `#33` label — the Class line records the then-current hypothesis; #55
  root-caused it as stray node capture (a CPU-side three.js DragControls raycast,
  which is why it survives on hardware / passes when repeated alone).
- `review-52` lessons bullet ("hardware did not fix the synthetic-input flake"):
  retitled to "background-drag flake" + a marked `(Correction, #55: …)` note; the
  "hardware isn't the fix; don't paper over with retries" lesson stands.
- `review-52` validate-run annotation (":224 … where the input-race is most
  likely"): corrected to `#55 … stray node capture, not an input-race, and fixed`
  (the #55 evidence showed a ~regime-independent rate — software ≈ hardware —
  driven by layout geometry, so "most likely under software" was also inaccurate).
- `spec-52` Known Stability Caveat note: added a clause so the scattered
  "synthetic-input flake" **shorthand** throughout that spec reads as the
  background-drag / stray-node-capture flake.

Re-audited: zero bare this-flake→`#33`; every remaining old-mechanism mention is
either immediately adjacent to a marked correction or covered by the shorthand
clause. Genuine `#11` / `#34` references intact. Re-committing and re-consulting
(iter 3).


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
