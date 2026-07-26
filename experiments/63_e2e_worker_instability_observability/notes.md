# Experiment 63: E2E Worker Instability Observability

**Status**: Complete

**Date**: 2026-07-25

**Completed**: 2026-07-26

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

**Approximate time spent**: ~7 hours active across two days, plus ~1.6 hours of accepted automated run time

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

**Dependencies**: No experiment-only third-party packages. Post-run trace classification uses the host's `unzip` utility to read retained Playwright trace archives.

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

Experiment-only artifacts:

- [`notes.md`](notes.md) — hypothesis, design, results, and conclusions
- [`recover-issue-artifacts.mjs`](recover-issue-artifacts.mjs) — deterministic extraction of issue #61's verbatim text attachments
- [`recover-workspace-artifacts.mjs`](recover-workspace-artifacts.mjs) — byte-exact recovery and provenance comparison for surviving originals
- [`passive-sampler.mjs`](passive-sampler.mjs) — host pressure, relevant process, thermal, and GPU sampling
- [`probe-swiftshader-renderers.mjs`](probe-swiftshader-renderers.mjs) — strict per-run Chromium SwiftShader verification plus raw Firefox renderer observation
- [`run-arm.mjs`](run-arm.mjs) — per-arm command capture, blob/telemetry lifecycle, renderer evidence, and artifact archival
- [`run-series.mjs`](run-series.mjs) — fixed five-pair U-I and SwiftShader-GPU sequencing with resumable manifests
- [`analyze-runs.mjs`](analyze-runs.mjs) — post-run blob materialization, trace-backed A/B/C/D classification, observer-effect, renderer, concurrency, host-pressure, and artifact summary
- `data/input/` — recovered canonical evidence
- `data/output/` — compact manifests, summaries, and logs

No production source changes are in scope.

## Results

### Summary

The experiment recovered the surviving issue #61 text evidence, rejected an observer that altered one core recurrence, qualified a reduced observer, and completed five strict same-host SwiftShader/native-GPU pairs at 22 genuinely active tests. The renderer control was decisive: all five verified SwiftShader runs were red with 31 failures, while all five verified native-GPU runs were green with zero failures. Each predeclared Chromium core combination moved from 5/5 under SwiftShader to 0/5 under native GPU, and median end-to-end command duration fell from 211.287 s to 50.824 s.

The accepted SwiftShader runs did not collapse to one downstream failure. A, B, C, and D preserved distinct and sometimes split branches. Retained traces narrowed C substantially: in all ten accepted instrumented SwiftShader occurrences, the second `page.goto("/")` remained pending through the canonical deadline even though a second HTTP 200 document response was recorded with a 5.5–50.2 ms trace wait-to-response interval. Seven traces did not record completed document receipt; three recorded the complete document body but still did not reach `load`. Exact mechanisms inside A, B, C, and D remain unresolved, so the experiment supports a Chromium SwiftShader/load amplifier and layered downstream failures, not a production fix.

### Artifact Recovery

**Recovered**: all six original issue #61 text files survived untracked in the canonical workspace root. They were copied byte-for-byte (including CRLF and the original no-final-newline state for Runs 6–10) into `data/input/original/` with SHA-256, size, and mtime provenance. After line-ending/final-newline normalization, every original matches the issue-body reconstruction.

**Not recovered**: a workspace-wide search of the main checkout and builder worktrees (excluding `.git`, `node_modules`, and `.next`) found no issue #61 `trace.zip`, video, failure screenshot, browser crash dump, or `chrome_debug.log`. The original binary Playwright/browser evidence is therefore irrecoverable from the searched workspace.

**Unrelated survivors**: the only surviving `test-results` marker says `status: passed` with no failed tests, and the lone HTML report is a later passing report; neither is issue #61 evidence. Two 2026-07-24 GPU-lane probe logs establish historical feasibility only. Experiment 63 obtained fresh strict renderer evidence on every renderer-control run.

See [`data/input/artifact-recovery.json`](data/input/artifact-recovery.json) for byte hashes and inventory details.

### Passive Observer Qualification

**Original profile rejected by the predeclared rule.** All five control and five observed runs were red. Median duration was effectively unchanged (207.129 s control vs 207.448 s observed; +0.319 s / +0.15%), and the observed runs reached 22 simultaneously active tests. However, core recurrence moved as follows: Chromium `smoke:78` 5/5→4/5, `matrix:225` 5/5→3/5, and `matrix:572` 5/5→5/5. The `matrix:225` difference of -2 exceeds the allowed ±1, so the one-second host/two-second process+GPU profile is rejected for causal interpretation.

**Reduced profile qualified.** All five controls and five observed runs were red. Core recurrence was Chromium `smoke:78` 5/5→5/5, `matrix:225` 5/5→4/5, and `matrix:572` 5/5→5/5, all within the allowed ±1. Median duration changed from 209.599 s to 210.397 s (+0.798 s / +0.38%), and every observed run reached 22 simultaneously active tests.

Qualified telemetry showed the same sustained host state in every observed run: one-minute load 155.74–159.89, 226–243 runnable processes, and CPU PSI `some.avg10` 97.11–97.55%. At least ~14.9 GiB memory remained available, all 16 GiB swap remained free, and memory PSI stayed zero. This supports CPU scheduling/contention as a shared precursor and strongly weighs against memory/swap pressure as the decisive cause on this host.

### Per-Occurrence A/B/C/D Classification

The classification below uses the ten accepted instrumented SwiftShader runs: five qualified reduced-observer runs plus the five renderer-control SwiftShader runs. It preserves split branches rather than averaging them into generic “timing.” The full machine-readable records, including C trace measurements, are in `run-summary.json` under `classification.perOccurrence`.

| Run | A — Chromium matrix | B — Chromium smoke | C — Chromium re-navigation | D — Firefox early controls |
|---|---|---|---|---|
| `passive-lite-i1` | `:135/:195` camera distance unchanged after wheel; `:225` unresolved test timeout | Reset click stuck in combined actionability wait | complete 200 document response; `load` not reached | controls enabled at first successful graph read |
| `passive-lite-i2` | `:135/:225` camera distance unchanged after wheel | Resume click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | controls enabled at first successful graph read |
| `passive-lite-i3` | `:135/:195` camera distance unchanged after wheel | Resume click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | graph handle unavailable before invariant check |
| `passive-lite-i4` | `:135/:195/:225` camera distance unchanged after wheel | Resume click stuck in combined actionability wait | complete 200 document response; `load` not reached | controls enabled at first successful graph read |
| `passive-lite-i5` | `:195/:225` camera distance unchanged after wheel | Resume click stuck in combined actionability wait | complete 200 document response; `load` not reached | controls enabled at first successful graph read |
| `renderer-s1` | `:135/:195/:225` camera distance unchanged after wheel | Resume click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | controls enabled at first successful graph read |
| `renderer-s2` | `:195/:225` camera distance unchanged after wheel | Reset click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | no D occurrence |
| `renderer-s3` | `:135/:195/:225` camera distance unchanged after wheel | Resume click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | graph handle unavailable before invariant check |
| `renderer-s4` | `:135/:195` camera distance unchanged; `:225` reached drag then `mouse.move` timed out | Reset click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | controls enabled at first successful graph read |
| `renderer-s5` | `:195` camera distance unchanged; `:225` reached drag then `mouse.move` timed out | Reset click stuck in combined actionability wait | 200 headers; receipt completion unrecorded and `load` not reached | controls enabled at first successful graph read |

Aggregate branches:

- **A (25 occurrences across 10/10 runs)**: 22 camera-distance-unchanged-after-wheel surfaces, two later background-drag `mouse.move` timeouts, and one unresolved test timeout. These establish no observed camera movement in-budget; they do **not** establish wheel non-delivery or identify the event→control→update→observation stage.
- **B (10/10 runs)**: six Resume and four Reset ordinary clicks remained in Playwright's combined visible/enabled/stable actionability wait until the test deadline. The failed actionability sub-check remains unknown, and the Reset/Resume split disproves treating one specific toggle state as the only branch.
- **C (10/10 runs)**: the second navigation stalled before `load` despite a retained HTTP 200 document response in every trace. Seven traces did not record completed document receipt and three recorded complete receipt without `load`. The initial server response was fast, which weighs strongly against server time-to-first-response as the mechanism, but does not distinguish browser main-thread/rendering degradation, body processing, lifecycle, or cancellation.
- **D (9/10 runs)**: seven first successful graph reads found controls already enabled; two never observed the graph handle before the invariant check. Missing mount/handle/timer timestamps prevent choosing between delayed observation and app-side ordering.

No single terminal event precedes all A/B/C/D occurrences. The branches remain layered: camera/control observation, Playwright actionability, post-response navigation/load, and Firefox mount/timer observation.

### Same-Host Renderer Control

The fixed order `S1-G1-S2-G2-S3-G3-S4-G4-S5-G5` completed without harness failure. Every run reported 22 workers and reached 22 simultaneously active tests. Fresh evidence verified Chromium SwiftShader plus hardware Firefox in every S arm, and hardware RTX 3080 rendering for both engines in every G arm. The server build, suite, engine mix, revision, host, worker value, and reduced observer were held fixed; the native lane's required renderer probe is included inside its end-to-end command duration, while the SwiftShader preflight occurred immediately before its run.

| Metric | SwiftShader | Native GPU | Result |
|---|---:|---:|---|
| Red runs | 5/5 | 0/5 | all native runs green |
| Total failures | 31 | 0 | 23 Chromium + 8 Firefox failures removed |
| Chromium `smoke:78` recurrence | 5/5 | 0/5 | core removed |
| Chromium `matrix:225` recurrence | 5/5 | 0/5 | core removed |
| Chromium `matrix:572` recurrence | 5/5 | 0/5 | core removed |
| Median end-to-end duration | 211.287 s | 50.824 s | native = 24.1% of SwiftShader duration (~4.16× faster) |
| Median max CPU PSI `some.avg10` | 97.37% | 45.18% | pressure sharply lower |
| Median max one-minute load | 152.52 | 71.44 | load sharply lower |
| Median max runnable processes | 228 | 66 | runnable queue sharply lower |
| Minimum swap free | 16 GiB | 16 GiB | no swapping in either arm |
| Maximum memory PSI `some.avg10` | 0% | 0% | no measured memory pressure |

The Firefox renderer stayed hardware in both arms, yet its eight SwiftShader-arm failure occurrences disappeared when only Chromium moved to verified native GPU. That cross-engine improvement supports a whole-host Chromium-rendering load spillover rather than a Firefox renderer change.

This satisfies the predeclared H3 strong-support criterion: every core combination recurred 5/5 under SwiftShader and 0/5 under verified native GPU. It establishes Chromium SwiftShader as a decisive amplifier for this host/revision/22-worker condition. It does not prove that SwiftShader alone is a product defect, identify the exact scheduler or browser mechanism, or generalize beyond this controlled host.

### Hypothesis Outcomes

| Hypothesis | Outcome | Evidence |
|---|---|---|
| H1 — qualified passive observation | **Original rejected; reduced supported** | original `matrix:225` recurrence shifted by -2; reduced profile kept all core differences within ±1, all runs red, and 22 active tests |
| H2 — layered precursor | **Supported at the family/terminal-transition level; exact mechanisms unresolved** | shared extreme CPU pressure accompanies distinct A/B/C/D transitions; no common terminal event was retained; split branches persist within A/B/C/D |
| H3 — SwiftShader amplifier | **Strongly supported** | five verified SwiftShader runs red with each core 5/5 versus five verified native runs green with each core 0/5; pressure and duration also dropped sharply |

Additional discrimination:

- **Refuted for this condition**: “22 workers/process count alone is sufficient” — both arms reached 22 active tests, but only SwiftShader failed.
- **Strongly disfavored for this condition**: memory/swap pressure as the decisive precursor — swap remained entirely free and memory PSI remained zero across accepted runs.
- **Strongly disfavored for C**: slow initial response/time-to-first-byte — every second navigation retained HTTP 200 with a 5.5–50.2 ms trace wait-to-response interval.
- **Surviving**: Chromium SwiftShader-induced CPU/rendering pressure as a shared causal amplifier with several downstream browser/harness/app observation branches.
- **Unresolved**: A's exact event/control/update stage; B's exact false actionability check; C's post-response receive/load/lifecycle mechanism; D's mount/handle/timer/probe ordering; exact CPU scheduler causality.

### Key Findings

1. Runtime impact alone is not a valid observer-effect qualification: the original observer changed `matrix:225` recurrence despite only +0.15% median duration.
2. The reduced observer preserves the core and measures a real 22-active-test state under extreme CPU pressure without memory/swap pressure.
3. Existing retained traces classify C more narrowly than console errors: the second document receives fast HTTP 200 response evidence but does not reach `load` before the canonical deadline, with receipt-completion-recorded and completion-unrecorded branches.
4. Same-host verified native GPU removes the entire 31-failure set, including Firefox spillover failures, while preserving the suite, engine mix, and 22 active tests.
5. The controlled factor identifies a decisive amplifier, not a safe production mitigation or the exact first missing transition inside every family.

### Acceptance Criteria

- [x] Existing-artifact recovery result recorded with provenance and irrecoverable evidence identified.
- [x] Exact toolchain, revision, renderer, engine mix, configured/active concurrency, timestamps, outcomes, host metrics, and artifact paths recorded per run.
- [x] Original and reduced 5+5 observer-effect comparisons evaluated against the predeclared rule.
- [x] A/B/C/D classified per accepted occurrence with split and unresolved branches preserved.
- [x] Five strict same-host SwiftShader/native-GPU pairs completed with per-run verification and no fallback.
- [x] Falsified, surviving, and unresolved hypotheses documented.
- [x] Focused follow-up adopted; production fix and canonical-gate changes deferred/rejected.
- [x] No production source, canonical assertion/deadline, retry, or serial behavior changed.

### Output Files

- `data/input/artifact-recovery.json` — original/reconstructed artifact hashes, provenance, and searched-location inventory
- `data/output/run-summary.json` — 30-run compact manifest, arm totals, qualification decisions, renderer control, host pressure, and per-occurrence A/B/C/D trace classification
- `data/output/run-summary.csv` — one-row-per-run comparison surface
- `data/output/probes/` — initial and per-SwiftShader-run renderer evidence; native per-run evidence is compacted into `run-summary.json` from archived GPU-lane probe transcripts
- `data/output/runs/` — ignored raw manifests, logs, blob reports, traces, videos, screenshots, GPU-lane transcripts, and telemetry
- `data/output/series/raw/` — ignored fixed-order plans, driver logs, and resumable progress records

## What Worked

- All accepted fixed-order series completed without harness failure; resume logic prevented duplicate execution after the builder restart.
- Blob reports materialized after each run without consuming the canonical test deadline and preserved traces/videos/screenshots for failures.
- The reduced observer qualified with 22 active tests and captured enough host evidence to separate CPU pressure from memory/swap pressure.
- Retained Playwright traces exposed C's second-navigation call and network resource timing even though the top-level error only reported the outer timeout.
- Strict renderer checks prevented silent fallback in every renderer-control run.

## What Didn't Work

- The original passive profile failed its own observer-effect limit despite negligible runtime change: Chromium `matrix:225` recurred two fewer times in the observed arm.
- No issue #61 binary evidence survived, so the canonical ten-run baseline could not be retrospectively trace-classified.
- The qualified passive layer intentionally omitted per-frame/DOM/actionability and page-internal timer probes. It classifies terminal surfaces but cannot locate A's internal transition, B's specific actionability dimension, or D's timer ordering.
- C's traces narrow the stall to post-response navigation/load, but they do not retain enough lifecycle/server/browser-process evidence to distinguish body processing, renderer/main-thread degradation, cancellation, or crash.
- A preflight pilot was invalidated because unrelated foreground validation continued after launch; it is preserved under ignored pilot output and excluded from every metric.

## Limitations

- Results are one host, one revision, one browser/library version set, and five renderer pairs; they do not establish prevalence elsewhere.
- Alternation controls drift but is not randomized. The fixed S→G order within each pair could retain short-lived carryover despite the cooldown.
- The native GPU command includes its strict internal probe, while SwiftShader probing occurs immediately before the timed arm. End-to-end timing is therefore conservative but not a pure suite-only benchmark.
- Host pressure drops are correlated outcomes of the renderer manipulation; they do not independently identify whether the decisive stage is browser rendering, main-thread scheduling, process scheduling, or another renderer-path effect.
- A 200 network resource snapshot rules out a slow initial server response for C, not every server/body-transfer or browser navigation mechanism.

## Validation

- `node --check` and ESLint pass for every experiment `.mjs` file.
- The post-run analyzer regenerated all 30 accepted runs, and explicit invariants verified both observer decisions, all five renderer pairs, per-run renderer evidence, 22 active tests, 5/5→0/5 core movement, and all A/B/C/D aggregate counts.
- `env -u npm_config_user_agent npm test`: 138/138 unit tests passed; no skips.
- `npm run typecheck`: passed.
- Clean detached worktree with the exact pending patch plus renderer probe JSONs: real `npm ci`, then `env -u npm_config_user_agent npm run validate` passed lint, typecheck, production build, and all 22 serial Chromium/Firefox E2E tests (12.5 minutes). The clean worktree excludes the untracked builder hook that otherwise pollutes full-tree lint.
- `git diff --check`: passed.

No flaky test was skipped or modified.

## Recommendation / Next Steps

1. **Adopt a focused follow-up EXPERIMENT, not a production fix.** Center it on Chromium SwiftShader/load interaction with synchronized target-plus-co-load arms and verified native co-load controls. Preserve measured overlap rather than relying on configured workers.
2. **Prioritize C first**, because it reproduces 10/10 with a stable second-navigation terminal event and a controlled renderer factor. Add independent navigation/test deadlines, request/response/body/load milestones, page/frame/crash/disconnect events, browser stderr/process exits, server receipt/response timing, WebGL loss, and heartbeats; preserve the receipt-completion-recorded versus completion-unrecorded split.
3. Then instrument one family at a time: A's wheel→control→update→observation chain, B's exact actionability dimensions and page heartbeat, and D's mount/handle/timer/probe timestamps.
4. **Defer mechanism-specific ownership and all production changes** until a focused arm identifies the internal first missing transition. Do not add retries, longer canonical waits, forced-click replacements, serial annotations, worker caps, or a native-GPU canonical gate from this experiment alone.
5. If the focused co-load arms cannot preserve these transitions with acceptable observer effect, reject a direct fix proposal and return to the synchronized co-load/worker-onset program rather than guessing.

## References

- [Issue #63](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/63) — experiment scope and acceptance criteria
- [Issue #61](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/61) — canonical ten-run dataset and verbatim attachments
- [`codev/research/e2e-instability-at-e2e-workers.md`](../../codev/research/e2e-instability-at-e2e-workers.md) — Research→EXPERIMENT handoff
- Issues #41, #44, #52, and #56 — prior parallel and renderer-control evidence
