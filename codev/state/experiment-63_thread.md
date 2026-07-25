# Experiment 63 builder thread

## 2026-07-25 — Hypothesis phase

Received the Research→EXPERIMENT handoff from #61/PR #62 and issue #63. Scope is deliberately diagnostic: recover surviving artifacts first, qualify low-overhead passive observation at the canonical `E2E_WORKERS=22` condition, then attempt a strictly verified same-host renderer control. Production mitigation, canonical timeout/assertion changes, retries, and serial annotations are out of scope.

Predeclared observer-effect rule: the passive arm must remain red and preserve each high-frequency Chromium combination (`smoke:78`, `matrix:225`, `matrix:572`) within one occurrence of its five-run uninstrumented counterpart. If it does not, reduce observation before using the evidence causally.

Artifact recovery is in progress. Issue #61 preserves the ten-run tally and verbatim text for `22_worker_testing.txt` plus Runs 6–10, but does not itself expose binary traces/videos/screenshots. Original local/worktree/archive locations still need to be inventoried before new runs.
