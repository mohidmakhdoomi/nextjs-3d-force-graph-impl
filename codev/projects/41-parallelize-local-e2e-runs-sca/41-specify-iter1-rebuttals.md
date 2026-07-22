# Spec 41 — Specify iteration 1 rebuttal

## Verdict summary

| Reviewer | Verdict | Confidence |
|---|---|---|
| Gemini | APPROVE | HIGH |
| Codex | REQUEST_CHANGES | HIGH |
| Claude | APPROVE | HIGH |

Both APPROVE reviewers verified the spec's claims against the codebase and
specifically praised the evidence-gated branching strategy (Decision 4) and the
pure-helper testing approach. Codex agreed the spec is "strong, feasible" with
"solid testing/evidence discipline" but raised one material clarity defect and
two minor ones. All three Codex points are accepted; the spec is edited to
resolve them. Details below.

---

## Codex Issue 1 (material) — Contradictory default-behavior contract

> Decision 4 and several success criteria allow a documented serial local
> default fallback if SwiftShader parallelism is not stable, but FR1, FR11,
> Scenario 1, and parts of the Summary require the no-`CI`/no-`E2E_WORKERS`
> local default to be parallel. The spec needs one canonical rule.

**Accepted — this is a real contradiction and it is now fixed.** The spec's
*intent* was always Codex's option (b): default-local-parallel is the **target**,
but a serial default remains acceptable if qualification (FR9) fails, with the
trade-off documented. That intent lived clearly in Decision 4 and Scenario 5, but
FR1, Scenario 1, and the Summary were phrased as unconditional guarantees, so a
builder reading only those could believe parallel-default is mandatory. Fixed by
making Decision 4 the single canonical rule and pointing every other mention at
it:

- **Decision 4** now opens with an explicit canonical-rule statement: it governs
  the no-`CI`/no-`E2E_WORKERS` local default, and wherever the Summary, FR1,
  FR11, or Scenario 1 call the default "parallel," they mean this
  qualification-gated target and defer to Decision 4 on any apparent conflict.
- **FR1** now states the parallel count is the default *only if* FR9
  qualification is green; otherwise the default is serial (`workers: 1`) and the
  parallel path is opt-in via `E2E_WORKERS` / the GPU lane's scaled default.
- **Scenario 1** is reframed as qualification-gated ("once the parallel local
  default is qualified green (Decision 4)…"), with the serial-fallback branch
  routing to the opt-in path (Scenario 5's alternative).
- **Summary** gains a clause pinning the ship-as-default question to Decision 4.
- **FR11** already documented both branches ("…or opt-in with the documented
  serial trade-off") and is now explicitly governed by Decision 4's canonical
  sentence, so it needed no separate text change.

Chosen resolution = Codex option (b): **default-local-parallel is target
behavior; serial default remains acceptable if qualification fails.** This
matches the architect's baked framing (issue constraint 1 offered exactly these
two branches) and both APPROVE reviewers' praise of the evidence-gated design, so
it is honored rather than collapsed to an unconditional mandate.

## Codex Issue 2 (material, same root) — Acceptance criteria inherit the contradiction

> Scenario 1 says a plain local run executes concurrently; Scenario 5 says the
> outcome may instead be a separated opt-in path with a serial gate.

**Accepted — resolved by the same fix.** Scenario 1 is now explicitly
qualification-gated and cross-references Scenario 5's alternative branch, so the
two scenarios describe one branching outcome rather than two mutually exclusive
requirements. A builder can no longer satisfy one while violating the other:
Decision 4 selects the branch, and both scenarios are consistent with whichever
branch the recorded evidence dictates. Success Criteria 1/2/4 already carried the
"or documented trade-off" phrasing and remain consistent with the now-canonical
Decision 4.

## Codex Issue 3 (minor) — "default scaled" underspecified for test assertion

> FR8 requires asserting the default scaled value, but the spec should say
> whether tests should assert the configured token (e.g. `'50%'`) or the resolved
> runtime worker count, and whether the default must floor to at least 1.

**Accepted — FR8 clarified.** FR8's "default ⇒ the scaled value" now states the
spec-level requirement is that the default resolves to the hardware-relative
scaled value (**not** `1`), and explicitly leaves the *form* of the assertion
(configured token string like `'50%'` vs. a computed worker integer) as a
plan/implementation decision — keeping the spec behavior-level, not prescribing
test mechanics. It also records the ≥1 floor: Playwright floors the resolved
worker count at 1, so a low-core host degrades gracefully rather than erroring
(this also captures Claude's boundary observation about `'50%'` on a 1-core
machine).

---

## Points from the APPROVE reviews (no blocking action, noted)

- **Claude** — 1-core boundary (`'50%'` → 1 worker via Playwright's floor):
  folded into the FR8 edit above. Claude's env-var string-vs-integer note
  (`'4'` parses to int, `'50%'` stays a string) is already covered by FR2/FR8 and
  is an implementation detail for the plan.
- **Gemini** — no issues raised; endorsed the CI-invariance guard and pure-helper
  architecture.

## Net change to the spec

Five surgical edits (Summary, Decision 4, FR1, FR8, Scenario 1); no requirement
was added or removed and no baked decision was relitigated. The edits only make
Decision 4's already-present evidence-gated rule the single authoritative source
for the local-default question and remove the absolutist phrasing that
contradicted it.
