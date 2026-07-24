# Specify — Iteration 1 Rebuttal (Spec 55)

3-way consultation verdicts:

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Gemini | APPROVE | HIGH |
| Claude | APPROVE | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Two of three approved outright. Codex's two points are legitimate ambiguities,
not disagreements about direction — both are accepted and fixed in the spec.
Claude's single minor note is also folded in. No point is rebutted as wrong.

---

## Codex #1 — No-repro fallback is incomplete

> Decision 5 defines a statistical fallback only for H1 (node capture), but does
> not say what the builder should do if the flake never reproduces **and** the
> H1 occupancy measurement is negative/inconclusive. The spec should explicitly
> define the acceptable terminal outcome in that branch.

**Accepted. Changed.** Decision 5 previously stopped at "a preventive fix may
ship only if the occupancy measurement demonstrates the mechanism" — it left the
doubly-negative branch (no repro **and** occupancy negative/inconclusive)
undefined. Decision 5 now specifies that terminal outcome explicitly:

- **No speculative root-cause fix ships** — Decision 3's evidence bar is unmet,
  so shipping a "fix" would violate the instrument-first discipline.
- The review **records the full budget and measurements as an explicit negative
  result** (honest evidence NFR).
- The flake stays *accepted + documented*, now **consolidated under its
  dedicated tracker (#55)** with the retained probe fields (Decision 6 / FR2) so
  the next occurrence is captured cheaply.
- **Fix-independent documentation follow-through still proceeds**: FR8's "#33"
  misattribution correction and FR7's follow-up clarification are completed;
  FR6's #41 caveat is **re-pointed to #55 and updated to reflect the
  instrument-first outcome rather than retired** (reusing FR6's own non-green
  branch, since no fix was qualified).
- An **optional strictly test-strengthening, behavior-preserving change** (a
  verified-background start point and/or a frame-settled gesture) MAY still ship,
  but must be **labeled defense-in-depth — explicitly not a proven root-cause
  fix**, and neither weakens the assertion nor adds a retry.

This keeps the branch honest (no masking, no false root-cause claim) while
leaving the fix-independent record corrections in scope.

## Codex #2 — Instrumentation final-state is ambiguous

> FR2/Decision 6 require diagnostics to ride reproduction runs, but Approach B
> also says heavyweight diagnostics may stay in scratch/evidence. The spec should
> say exactly what, if anything, must remain in the committed harness after the
> fix versus what may be temporary evidence-only tooling.

**Accepted. Changed.** The tension was between "instrumentation rides every
reproduction run" (investigation-time) and "committed suite keeps only cheap
probe fields" (final state) — the spec never said the first was investigation-
scoped. Resolved by adding an **authoritative committed-vs-evidence-only rule to
FR2**:

- **Committed to the canonical suite** (permanent): only (a) whatever the
  selected fix depends on, and (b) cheap, silent-in-passing-runs probe fields
  with standalone future-triage value (e.g. a node-occupancy / verified-
  background-point helper colocated with the existing `graph-handle.ts` probe),
  each documented at the existing comment standard.
- **Evidence-only** (temporary, scratch, not in the committed suite): heavyweight
  diagnostics — verbose per-event pointer logs, `controls.enabled` sampling
  traces, dumped-on-failure counters, any diagnostic-only spec variant.
- **Decision rule**: a diagnostic is committed only if the fix depends on it or
  it is a cheap silent probe field worth keeping; otherwise it is evidence-only.

Decision 6 now states "riding along during reproduction does not mean remaining
committed" and defers to FR2's rule; Approach B's final paragraph cross-
references FR2 so the two can no longer be read as in tension.

## Claude (minor) — no explicit fourth-mechanism plan

> The spec doesn't explicitly state what happens if the instrumentation reveals a
> fourth mechanism outside H1/H2/H3 … a very low-probability gap and acceptable
> as stated.

**Accepted (folded into the Decision 5 change).** The new terminal-outcome
clause closes with: if instrumentation demonstrates a fourth mechanism outside
H1/H2/H3, it is documented and fixed under the same instrument-first, minimal,
behavior-preserving discipline (Decisions 1–4). FR2 already framed attribution
as "H1, H2, H3, or a demonstrated fourth mechanism," so this now has a matching
disposition rather than only a framing.

---

## Not changed (and why)

Nothing was rebutted-as-wrong. Both approvals (Gemini, Claude) required no
changes; Claude's verification pass independently confirmed every technical
claim (line numbers, library internals, config invariants) against the codebase,
which increases confidence that the scope and the H1-strongest hypothesis
ranking are correct. The spec's core shape — instrument-first, harness-first
minimal fix, inviolable flake discipline, documentation follow-through last — is
unchanged and endorsed by all three reviewers.

A Consultation Log summarizing this iteration and the applied changes has been
added to the spec itself (per the SPIR "Consultation Log" requirement).
