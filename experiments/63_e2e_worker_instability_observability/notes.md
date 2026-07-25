# Experiment 63: E2E Worker Instability Observability

**Status**: In Progress

**Date**: 2026-07-25

## Goal

Determine whether the repeatable `E2E_WORKERS=22` failure set from issue #61 can be classified without materially changing it, and whether Chromium SwiftShader is the dominant amplifier on the same host.

### Questions

1. Can low-overhead passive telemetry preserve the canonical Chromium A/B/C and Firefox D failure families closely enough to identify lifecycle, renderer, host-pressure, and concurrency context?
2. When host, suite, revision, worker count, engine mix, and passive instrumentation are held constant, does verified native GPU materially change the classified failure set relative to SwiftShader?
3. Which hypotheses can be falsified without implementing a mitigation or changing any canonical assertion/deadline?

### Falsifiable hypotheses

- **H1 — Qualified passive observation**: Five passive-instrumented runs interleaved with five uninstrumented runs will remain red at the known 22-worker condition and preserve the three high-frequency Chromium combinations (`smoke:78`, `matrix:225`, and `matrix:572`) within one occurrence of their matched uninstrumented counts. If not, the passive observer materially changes recurrence and must be reduced before its causal evidence is trusted.
- **H2 — Layered precursor**: Passive evidence will show shared high-load context while A/B/C/D diverge at different first missing transitions or lifecycle states. A single common terminal event preceding all observed classes would falsify the multiple-downstream-transition portion of this model.
- **H3 — SwiftShader amplifier**: Across five same-host alternating renderer pairs, verified native GPU will sharply reduce the A/B/C core relative to SwiftShader. Comparable per-combination recurrence (within one run out of five) will refute SwiftShader as the decisive amplifier. Inability to verify native GPU on this host makes the branch inconclusive, not negative.

### Success and stop criteria

- Recover and inventory any surviving issue #61 artifacts before rerunning; preserve the issue's verbatim canonical text even if binary traces/videos are gone.
- Produce a run manifest recording exact toolchain, revision, arm, renderer verification, engine mix, configured and observed concurrency, timestamps, exit status, failures, host metrics, and artifact paths.
- Qualify or reject the passive observer using the predeclared H1 rule and runtime/concurrency deltas.
- Classify A/B/C/D per occurrence where evidence permits; do not collapse split branches.
- Run the same-host renderer control only if native GPU is strictly verified with no silent fallback.
- Recommend a mechanism-specific follow-up only if the same first missing transition or terminal event is seen at least three times **and** one controlled factor moves it in the predicted direction.
- Do not change production code, canonical waits/assertions, retries, serial annotations, or the canonical gate.

## Effort

**Approximate time spent**: In progress

## Approach

### Phase 0 — Artifact recovery

Search the original workspace, surviving builder worktrees, repository history, issue #61 attachments, and archived/local Playwright result locations for:

- `22_worker_testing.txt` and `run_6.txt` through `run_10.txt`
- `test-results/`, `trace.zip`, videos, screenshots, browser stderr/crash data
- prior process/host telemetry or renderer records

Record every searched location and distinguish original recovered files from text reconstructed from issue #61's verbatim attachments.

### Phase 1 — Passive observer-effect qualification

Run the canonical command in strict `U-I-U-I-U-I-U-I-U-I` order:

```bash
E2E_WORKERS=22 npm run test:smoke
```

The instrumented arm may add only low-overhead observation around the unchanged test command: a test lifecycle/concurrency reporter, one-second `/proc` host-pressure samples, two-second relevant-process snapshots, GPU utilization samples, and retained Playwright artifacts. Focused per-frame/DOM/actionability probes are excluded until passive qualification succeeds.

Both arms receive the same minimal outer bookkeeping: stdout/stderr capture, start/end host snapshots, artifact archival, and browser-renderer preflight evidence. The observer-effect comparison therefore measures the incremental continuous sampler/reporter, not the unavoidable act of recording command outcome. This limitation will be retained in the analysis.

### Phase 2 — Same-host renderer control

If hardware WebGL can be strictly verified on this host, run five alternating SwiftShader/native-GPU pairs at 22 workers while holding all other factors fixed. If renderer verification fails, stop and document the control as unavailable rather than comparing unlike or unverified hosts.

### Analysis discipline

- Preserve canonical failure markers even when diagnostic observation continues.
- Treat configured workers as a cap; report measured active concurrency separately.
- Do not infer a crash from `ERR_ABORTED`, wheel non-delivery from zero camera delta, or Firefox renderer identity from preferences.
- Report canonical combination recurrence separately from low-level signature classification.

## Environment & Reproduction

**Reproducibility contract**:

- Use the exact Node/npm versions declared by the repository and `.nvmrc`.
- Use lockfile v3 and `npm ci`; do not regenerate dependencies under another toolchain.
- Record `git rev-parse HEAD`, OS/kernel/WSL details, CPU count, memory/swap, renderer strings, and relevant environment variables in the manifest.

**Planned commands**:

```bash
# Artifact recovery and harness commands will be recorded after repository discovery.
# Canonical arm:
E2E_WORKERS=22 npm run test:smoke
```

**Dependencies**: No experiment-only third-party packages planned.

**Initial host qualification**:

- Node `v22.23.1`; npm `10.9.8`; `.nvmrc` `22.23.1`
- Linux `6.6.87.2-microsoft-standard-WSL2`, 24 online logical CPUs
- 27.4 GiB guest memory and 16 GiB swap
- `/proc/pressure/{cpu,memory}` available; `vmstat` available; `pidstat`/`mpstat` absent
- NVIDIA GeForce RTX 3080 visible through WSL (`nvidia-smi` driver `581.29`)
- Accelerated host GLX renderer: `D3D12 (NVIDIA GeForce RTX 3080)` via Mesa 26.0.3
- Browser-level renderer verification remains mandatory; host GPU visibility alone is not evidence that a Playwright page used hardware rendering.

## Code

Planned experiment-only artifacts:

- [`notes.md`](notes.md) — hypothesis, design, results, and conclusions
- [`recover-issue-artifacts.mjs`](recover-issue-artifacts.mjs) — deterministic extraction of issue #61's verbatim text attachments
- [`passive-reporter.mjs`](passive-reporter.mjs) — low-volume test lifecycle and active-test timeline
- [`passive-sampler.mjs`](passive-sampler.mjs) — host pressure, relevant process, thermal, and GPU sampling
- [`run-arm.mjs`](run-arm.mjs) — per-arm command capture, telemetry lifecycle, and Playwright artifact archival
- `data/input/` — recovered canonical evidence
- `data/output/` — compact manifests, summaries, and logs

No production source changes are in scope.

## Results

### Summary

Pending execution.

### Artifact Recovery

Pending inventory.

### Passive Observer Qualification

Pending five matched uninstrumented/instrumented pairs.

### Same-Host Renderer Control

Pending passive qualification and strict native-GPU verification.

### Key Findings

Pending.

### Metrics

| Metric | Value | Notes |
|---|---:|---|
| Canonical baseline | 10/10 red | Issue #61, 50 failures total |
| Uninstrumented runs | 0/5 | Pending |
| Passive-instrumented runs | 0/5 | Pending |
| SwiftShader/native-GPU pairs | 0/5 | Pending verification |

### Output Files

Pending.

## What Worked

Pending.

## What Didn't Work

Pending.

## Next Steps

Pending evidence. Any production fix is explicitly deferred to a mechanism-specific follow-up.

## References

- [Issue #63](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/63) — experiment scope and acceptance criteria
- [Issue #61](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/61) — canonical ten-run dataset and verbatim attachments
- [`codev/research/e2e-instability-at-e2e-workers.md`](../../codev/research/e2e-instability-at-e2e-workers.md) — Research→EXPERIMENT handoff
- Issues #41, #44, #52, and #56 — prior parallel and renderer-control evidence
