# Experiment 63 builder thread

## 2026-07-25 — Hypothesis phase

Received the Research→EXPERIMENT handoff from #61/PR #62 and issue #63. Scope is deliberately diagnostic: recover surviving artifacts first, qualify low-overhead passive observation at the canonical `E2E_WORKERS=22` condition, then attempt a strictly verified same-host renderer control. Production mitigation, canonical timeout/assertion changes, retries, and serial annotations are out of scope.

Predeclared observer-effect rule: the passive arm must remain red and preserve each high-frequency Chromium combination (`smoke:78`, `matrix:225`, `matrix:572`) within one occurrence of its five-run uninstrumented counterpart. If it does not, reduce observation before using the evidence causally.

Artifact recovery is in progress. Issue #61 preserves the ten-run tally and verbatim text for `22_worker_testing.txt` plus Runs 6–10, but does not itself expose binary traces/videos/screenshots. Original local/worktree/archive locations still need to be inventoried before new runs.

## 2026-07-25 — Design phase

Recovered issue #61's six verbatim text attachments into a provenance/hash manifest. Added an experiment-only passive harness using the repository's existing blob reporter, a `/proc`/process/GPU sampler, and per-run artifact archiver. The control arm still requires minimal common outcome capture and pre/post host snapshots; the incremental observer being qualified is the continuous sampler plus blob reporting.

The current host matches the canonical 24-CPU/27 GiB WSL2 shape and exposes an RTX 3080 with accelerated D3D12/Mesa GLX. That makes a same-host native arm plausible, but browser-level strict renderer verification is still required before any renderer comparison is accepted.

## 2026-07-25 — Artifact recovery complete

Found the six original #61 text files untracked in the canonical workspace root and recovered them byte-for-byte. Their CRLF bytes and hashes are now preserved; normalized content matches the issue reconstruction. No retained traces, videos, failure screenshots, browser stderr/crash dumps, or issue-61 `test-results` survived across the main checkout/builders. A later passing HTML/result marker is explicitly excluded. Prior RTX 3080 Chromium/Firefox probe logs survive as feasibility evidence only, not current control evidence.

## 2026-07-25 — Design finalized

Reused the repository's existing blob reporter rather than keeping a custom reporter. Instrumented runs set `PLAYWRIGHT_BLOB_REPORT=1`; JSON materialization happens after the run. The default-path probe established the actual mixed baseline on this host: Chromium SwiftShader software plus Firefox RTX 3080 hardware. A current strict GPU-lane probe verified RTX 3080 hardware for both engines, so the same-host renderer branch is executable. Fixed series are encoded as five U-I pairs followed by five SwiftShader-GPU pairs, all at 22 workers, with fresh renderer evidence and a small fixed cooldown.

## 2026-07-25 — Execute preflight

The fixed sequences, renderer transfer paths, script syntax, experiment-local lint, typecheck, and all 138 unit tests are verified. The unit command initially inherited a stale `npm_config_user_agent=pnpm/...` from the builder launcher despite executing the pinned npm 10.9.8 binary; removing that environment-only contamination restored the repository's exact toolchain assertion. Full-tree lint is otherwise clean for Experiment 63 and is blocked locally only by the untracked builder write-guard hook, which will be handled by proving the canonical gate in a clean checkout rather than changing committed lint policy. No subagents will be used, per architect instruction.

The first attempted `passive-u1` was stopped before completion and excluded because foreground lint/read work continued after launch, violating the fixed-host-load discipline. Its incomplete directory and driver logs are preserved under ignored `data/output/pilots/preflight-load-contaminated/`; no result from that pilot will enter the 5+5 dataset. The accepted sequence will run with the builder otherwise idle.
