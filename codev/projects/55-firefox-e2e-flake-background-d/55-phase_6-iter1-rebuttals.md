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
