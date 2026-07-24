# Phase 4 — iteration 3 consultation rebuttals

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Gemini | APPROVE | HIGH |
| Claude | APPROVE | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Gemini and Claude approved. Codex raised two **driver-robustness** points — both
valid, **both accepted and fixed** (the qualification evidence itself is
unchanged and already green; these harden the checked-in driver so it faithfully
reproduces and enforces the final matrix).

## Codex #1 — driver does not fail on steps 2–5

> `phase4-qualify.sh:40-60` does not fail on steps 2–5. It only gates step 1, then
> logs later exit codes and continues, so the script can exit 0 even if
> `validate`, a smoke run, the GPU lane, or the hardware-targeted repeat fails.

**Fixed.** The driver now carries an `overall` accumulator and a `track()` helper;
every step 2–5 records its exit into `overall`, and the script ends with
`exit "$overall"` (plus an `OVERALL exit=` line). Step 1 still hard-gates (early
`exit 1`). So any failure in validate / a smoke run / a GPU run / the
hardware-targeted repeat now makes the driver exit non-zero — it is a gate, not a
logger.

## Codex #2 — driver's validate step is the failing in-worktree run

> `phase4-summary.md` says `phase4-qualify.sh` reproduces the "entire final matrix
> end to end," but the green `npm run validate` evidence is
> `phase4-5-clean-validate.log` from a separate clean-worktree run, while the
> driver's own step 2 is the failing in-worktree run (`phase4-2-validate.log`).
> Either the driver runs the clean-checkout validate path, or the summary stops
> claiming end-to-end reproduction.

**Fixed — the driver now runs the clean-checkout validate path as Step 2.** It
`git worktree add --detach HEAD`s a clean tree, runs real `npm ci`, runs
`npm run validate`, records the exit into the gate, and removes the worktree —
writing `phase4-5-clean-validate.log` (the authoritative green gate: EXIT 0,
22/22). The old failing in-worktree `phase4-2-validate.log` is **removed** (`git
rm`); it was only the untracked-`.claude/hooks` lint noise, which the driver
header and the clean-validate log now explain directly. The summary's validate
section and intro were updated to match: end-to-end reproduction is now literally
true (step 2 = clean-checkout validate, and all steps are enforced).

`bash -n` clean on the driver. No test re-execution: the committed qualification
evidence (126/126 green `:224`, hardware-bracketed, clean validate EXIT 0) is
unchanged; these changes make the driver/docs a faithful, enforcing reproduction
of that final matrix.
