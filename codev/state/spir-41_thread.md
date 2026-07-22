# spir-41 thread — Parallelize local e2e runs scaled to hardware

Strict-mode SPIR builder. Issue #41: local Playwright e2e gets hardware-scaled
parallel workers; CI (`validation.yml` 4-shard matrix, per-shard `workers: 1`)
stays byte-for-byte unchanged, guarded by `CI`→`workers: 1`.

## Specify phase

- Spec pre-existed (architect commit `10251b1`). Read it fully; it is
  comprehensive (8 confirmed decisions, 11 FRs, 6 acceptance scenarios).
- Verified its factual claims against the codebase — all accurate:
  - `playwright.config.ts`: `fullyParallel: true` (104), `workers: 1` (105),
    `retries: process.env.CI ? 2 : 0` (113), "Do NOT raise workers" comment
    block (~96-113).
  - `tests/automation.test.mjs`: source-text asserts `/workers: 1/` (90) and
    the retries regex (93) — these are the consumers that must migrate.
  - GPU lane present: `scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`;
    scripts `test:smoke`, `test:e2e:gpu`, `validate` all present.
- No factual corrections needed. Signaling specify build complete → porch runs
  the 3-way consultation (Gemini/Codex/Claude). Then STOP at `spec-approval`
  gate for human approval.
