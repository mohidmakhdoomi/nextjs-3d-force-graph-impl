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

The initial instrumented arm may add only low-overhead observation around the unchanged test command: the repository's existing Playwright blob reporter, one-second `/proc` host-pressure samples, two-second relevant-process/GPU snapshots, and retained Playwright artifacts. Focused per-frame/DOM/actionability probes are excluded until passive qualification succeeds. Blob reports are converted to JSON only after each run, so analysis cannot consume the canonical deadline budget.

If that profile fails H1, repeat a fresh 5+5 qualification with a reduced profile: five-second `/proc` samples, ten-second relevant-process snapshots, no continuous `nvidia-smi`, and the same blob reporter. Renderer preflight plus before/after host/GPU snapshots remain. Do not use the original profile's causal telemetry or begin the renderer control unless one passive profile satisfies the predeclared all-red/±1 recurrence rule.

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

**Commands**:

```bash
npm ci
npm run browser:install

# Canonical command inside each matched control run:
E2E_WORKERS=22 npm run test:smoke

# Strict current native-renderer feasibility probe:
E2E_GPU_REQUIRE=1 npm run test:e2e:gpu -- --probe-only

# Fixed U-I alternation, then matched renderer alternation:
node experiments/63_e2e_worker_instability_observability/run-series.mjs passive
node experiments/63_e2e_worker_instability_observability/analyze-runs.mjs
# Only when the original profile fails H1:
node experiments/63_e2e_worker_instability_observability/run-series.mjs passive-lite
node experiments/63_e2e_worker_instability_observability/analyze-runs.mjs
node experiments/63_e2e_worker_instability_observability/run-series.mjs renderer
node experiments/63_e2e_worker_instability_observability/analyze-runs.mjs
```

**Dependencies**: No experiment-only third-party packages planned.

**Initial host qualification**:

- Node `v22.23.1`; npm `10.9.8`; `.nvmrc` `22.23.1`
- Linux `6.6.87.2-microsoft-standard-WSL2`, 24 online logical CPUs
- 27.4 GiB guest memory and 16 GiB swap
- `/proc/pressure/{cpu,memory}` available; `vmstat` available; `pidstat`/`mpstat` absent
- NVIDIA GeForce RTX 3080 visible through WSL (`nvidia-smi` driver `581.29`)
- Accelerated host GLX renderer: `D3D12 (NVIDIA GeForce RTX 3080)` via Mesa 26.0.3
- Browser-level probe at experiment start verified the default mixed path: Chromium = `ANGLE (... SwiftShader Device (Subzero) ..., SwiftShader driver)` (**software**); Firefox = `D3D12 (NVIDIA GeForce RTX 3080)` (**hardware**).
- Strict native probe (`E2E_GPU_REQUIRE=1 ... --probe-only`) verified both engines on the RTX 3080: Chromium = `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`; Firefox = `D3D12 (NVIDIA GeForce RTX 3080)`.
- Every experimental run still records fresh renderer evidence; the initial probes establish feasibility, not per-run transfer.

## Code

Planned experiment-only artifacts:

- [`notes.md`](notes.md) — hypothesis, design, results, and conclusions
- [`recover-issue-artifacts.mjs`](recover-issue-artifacts.mjs) — deterministic extraction of issue #61's verbatim text attachments
- [`recover-workspace-artifacts.mjs`](recover-workspace-artifacts.mjs) — byte-exact recovery and provenance comparison for surviving originals
- [`passive-sampler.mjs`](passive-sampler.mjs) — host pressure, relevant process, thermal, and GPU sampling
- [`probe-swiftshader-renderers.mjs`](probe-swiftshader-renderers.mjs) — strict per-run Chromium SwiftShader verification plus raw Firefox renderer observation
- [`run-arm.mjs`](run-arm.mjs) — per-arm command capture, blob/telemetry lifecycle, renderer evidence, and artifact archival
- [`run-series.mjs`](run-series.mjs) — fixed five-pair U-I and SwiftShader-GPU sequencing with resumable manifests
- [`analyze-runs.mjs`](analyze-runs.mjs) — post-run blob materialization, failure/signature, observer-effect, renderer, concurrency, host-pressure, and artifact summary
- `data/input/` — recovered canonical evidence
- `data/output/` — compact manifests, summaries, and logs

No production source changes are in scope.

## Results

### Summary

Pending execution.

### Artifact Recovery

**Recovered**: all six original issue #61 text files survived untracked in the canonical workspace root. They were copied byte-for-byte (including CRLF and the original no-final-newline state for Runs 6–10) into `data/input/original/` with SHA-256, size, and mtime provenance. After line-ending/final-newline normalization, every original matches the issue-body reconstruction.

**Not recovered**: a workspace-wide search of the main checkout and builder worktrees (excluding `.git`, `node_modules`, and `.next`) found no `trace.zip`, video, failure screenshot, browser crash dump, or `chrome_debug.log`. Thus the issue #61 binary Playwright/browser evidence is irrecoverable from the searched workspace.

**Unrelated survivors**: the only `test-results` marker says `status: passed` with no failed tests, and the lone HTML report is a later passing report; neither is issue #61 evidence. Two 2026-07-24 GPU-lane probe logs verify that the RTX 3080 hardware path previously worked for Chromium and Firefox on this host, but current strict probes remain required for Experiment 2.

See [`data/input/artifact-recovery.json`](data/input/artifact-recovery.json) for byte hashes and inventory details.

### Passive Observer Qualification

**Original profile rejected by the predeclared rule.** All five control and five observed runs were red. Median duration was effectively unchanged (207.129 s control vs 207.448 s observed; +0.319 s / +0.15%), and the observed runs reached 22 simultaneously active tests. However, core recurrence moved as follows: Chromium `smoke:78` 5/5→4/5, `matrix:225` 5/5→3/5, and `matrix:572` 5/5→5/5. The `matrix:225` difference of -2 exceeds the allowed ±1, so the one-second host/two-second process+GPU profile is not qualified for causal interpretation.

**Reduced profile qualified.** All five controls and five observed runs were red. Core recurrence was Chromium `smoke:78` 5/5→5/5, `matrix:225` 5/5→4/5, and `matrix:572` 5/5→5/5, all within the allowed ±1. Median duration changed from 209.599 s to 210.397 s (+0.798 s / +0.38%), and every observed run reached 22 simultaneously active tests.

Qualified telemetry showed the same sustained host state in every observed run: one-minute load 155.74–159.89, 226–243 runnable processes, and CPU PSI `some.avg10` 97.11–97.55%. At least ~14.9 GiB memory remained available, all 16 GiB swap remained free, and memory PSI stayed zero. This supports CPU scheduling/contention as a shared precursor and strongly weighs against memory/swap pressure on this host, while not yet locating each downstream first missing transition.

### Same-Host Renderer Control

Authorized by the qualified reduced profile and initial strict native-GPU feasibility. Five reduced-profile SwiftShader/native-GPU pairs are pending, with fresh strict renderer evidence on every run.

### Key Findings

1. The original observer materially changed one core recurrence despite negligible runtime impact; runtime alone was not a sufficient observer-effect check.
2. The reduced observer preserves the canonical core and measures 22 genuinely simultaneous tests under extreme sustained CPU scheduling pressure without memory or swap pressure.
3. A/B/C/D remain distinct downstream signatures under the same qualified high-load context; the passive layer does not yet establish their individual first missing transitions.

### Metrics

| Metric | Value | Notes |
|---|---:|---|
| Canonical baseline | 10/10 red | Issue #61, 50 failures total |
| Original-profile controls | 5/5 red | 31 failures; median 207.129 s |
| Original-profile observed | 5/5 red | 23 failures; median 207.448 s; H1 rejected (`matrix:225` 5→3) |
| Reduced-profile controls | 5/5 red | 32 failures; median 209.599 s |
| Reduced-profile observed | 5/5 red | 32 failures; median 210.397 s; H1 qualified |
| SwiftShader/native-GPU pairs | 0/5 | Ready to execute with reduced profile |

### Output Files

- `data/output/run-summary.json` — compact per-run manifest, arm totals, and qualification decisions
- `data/output/run-summary.csv` — one-row-per-run comparison surface
- `data/output/probes/` — strict renderer evidence
- `data/output/runs/` — ignored raw manifests, logs, blob reports, traces, videos, screenshots, and telemetry

## What Worked

- The fixed U-I order completed without harness failure, and every run preserved the canonical red condition.
- Blob reports materialized after each run and classified each failure without consuming the test deadline.
- The reduced profile qualified with 22 active tests, preserved traces/videos/screenshots, and captured sustained CPU pressure without memory/swap pressure.

## What Didn't Work

- The original passive profile failed its own observer-effect limit despite negligible runtime change: Chromium `matrix:225` recurred two fewer times in the observed arm.
- A preflight pilot was invalidated because unrelated foreground validation continued after launch; it is preserved separately and excluded from all metrics.

## Next Steps

Run the five strict SwiftShader/native-GPU pairs with the qualified reduced observer. Then classify per-occurrence evidence, evaluate H2/H3, and decide whether a mechanism-specific focused follow-up is justified. Any production fix remains explicitly deferred.

## References

- [Issue #63](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/63) — experiment scope and acceptance criteria
- [Issue #61](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/61) — canonical ten-run dataset and verbatim attachments
- [`codev/research/e2e-instability-at-e2e-workers.md`](../../codev/research/e2e-instability-at-e2e-workers.md) — Research→EXPERIMENT handoff
- Issues #41, #44, #52, and #56 — prior parallel and renderer-control evidence
