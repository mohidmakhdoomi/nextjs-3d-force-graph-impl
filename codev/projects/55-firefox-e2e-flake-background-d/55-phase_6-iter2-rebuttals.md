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
