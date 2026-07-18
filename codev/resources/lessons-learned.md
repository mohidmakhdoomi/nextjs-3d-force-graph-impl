# Lessons Learned

Durable engineering wisdom captured across the project's work. Update it during
the review phase of any work that surfaces a generally-applicable pattern,
gotcha, or constraint.

## Validation Evidence

- A continuously rendered software-WebGL canvas can make Playwright actionability
  waits expensive. Pause animation first; if the initial pause requires a forced
  click, prove the control's center receives pointer events and keep later
  interactions on ordinary Playwright clicks.
- When a diagnostic command intentionally returns nonzero for findings, do not
  normalize status blindly. Preserve the original exit and validate the
  machine-readable report structure so advisory evidence remains distinct from
  registry, tool, or malformed-output failures.
- When an upgrade-sensitive browser interaction fails, replay the same physical
  input against the rollback baseline before attributing it to dependency drift.
  Record the exact input and renderer that were exercised instead of broadening
  an environment-limited result into a full-pass claim.
