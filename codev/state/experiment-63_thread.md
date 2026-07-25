# Experiment 63 builder thread

## 2026-07-25 — Hypothesis phase

Received the Research→EXPERIMENT handoff from #61/PR #62 and issue #63. Scope is deliberately diagnostic: recover surviving artifacts first, qualify low-overhead passive observation at the canonical `E2E_WORKERS=22` condition, then attempt a strictly verified same-host renderer control. Production mitigation, canonical timeout/assertion changes, retries, and serial annotations are out of scope.

Predeclared observer-effect rule: the passive arm must remain red and preserve each high-frequency Chromium combination (`smoke:78`, `matrix:225`, `matrix:572`) within one occurrence of its five-run uninstrumented counterpart. If it does not, reduce observation before using the evidence causally.

Artifact recovery is in progress. Issue #61 preserves the ten-run tally and verbatim text for `22_worker_testing.txt` plus Runs 6–10, but does not itself expose binary traces/videos/screenshots. Original local/worktree/archive locations still need to be inventoried before new runs.

## 2026-07-25 — Design phase

Recovered issue #61's six verbatim text attachments into a provenance/hash manifest. Added an experiment-only passive harness: a low-volume Playwright reporter, `/proc`/process/GPU sampler, and per-run artifact archiver. The control arm still requires minimal common outcome capture and pre/post host snapshots; the incremental observer being qualified is the continuous sampler plus reporter.

The current host matches the canonical 24-CPU/27 GiB WSL2 shape and exposes an RTX 3080 with accelerated D3D12/Mesa GLX. That makes a same-host native arm plausible, but browser-level strict renderer verification is still required before any renderer comparison is accepted.
