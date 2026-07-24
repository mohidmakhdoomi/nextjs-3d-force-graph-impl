# Phase 5 — iteration 1 consultation rebuttals

3-way (impl, plan-phase phase_5): **Gemini APPROVE (HIGH)**, **Claude APPROVE
(HIGH)**, **Codex REQUEST_CHANGES (HIGH)**.

- **Gemini APPROVE** — no key issues.
- **Claude APPROVE** — verified every FR6 deliverable (green 3/3 parallel at
  `retries: 0`, hardware renderer bracketed, README caveat retired, dated
  review-41 addendum, serial default untouched). Confirmed the Phase-6 scope
  (`#33` corrections in review-41 body + Follow-up, FR7) is correctly left
  untouched. "No ambiguity."

## Codex REQUEST_CHANGES — 1 point, ACCEPTED

**Point:** `README.md:95-98` (the top-of-file "Local test parallelism" intro)
still described the native-GPU parallel lane as running "~4× faster on real
hardware and **stays mostly green**." That "mostly green" framing is the *old*
caveat wording (it encoded the 1/3 parallel Firefox recurrence) and contradicts
the phase_5 3/3-green re-qualification, so FR6's "retire the caveat" was not fully
satisfied — I had retired the two lower caveat blocks (the hardware GPU-lane note
+ the "Known Firefox flake" block) and the table row / status-and-sequencing note,
but missed this third passage because it phrases the flake without the `#33` token
my sweep keyed on.

**Accepted (correct).** Rewrote README:95-98 to the actual 2026-07-24 outcome: the
Firefox background-drag flake there is **fixed and re-qualified green 3/3** on this
parallel regime (issue #55), and parallel stays opt-in **only** for the separate
deterministic Chromium SwiftShader contention. Re-swept the whole README for stale
caveat framing (`mostly green|known flake|amplif|recur|survives on hardware|open
flake|#33`) — no residual stale language; every flake mention is now fixed-state
and cites #55. Still phase_5/FR6 scope (fully retiring the opt-in-parallel caveat
across the README); no phase_6 (`#33` reference-mentions elsewhere / FR7) bleed.

Re-committing and re-consulting (iter 2).
