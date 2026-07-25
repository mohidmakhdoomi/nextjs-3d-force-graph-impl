# Critique Rebuttals: E2E Instability at `E2E_WORKERS=22`

**Project:** Research 61

**Date:** 2026-07-25

**Inputs:** independent Gemini, Codex, and Claude critiques of `e2e-instability-at-e2e-workers.md`

## Adjudication method

Each critique was checked against the approved research brief, issue #61's verbatim Runs 6–10 output, repository code at `f1eebf7`, and preserved reviews #11/#41/#44/#52/#55/#56. A suggestion was incorporated when it corrected a factual statement, reduced unsupported confidence, exposed a useful within-test discriminator, or made an experiment more falsifiable without changing the research scope. Suggestions that introduced an unrecorded environment fact or promoted a hypothesis to mechanism were rejected.

All three critics found complete coverage of Targets A–F and all nine required test×browser rows. No target was added or removed during critique.

## Incorporated critique

### 1. Confidence calibration

**Feedback:** Codex and Gemini judged the common-precursor and Firefox Target D confidence too high; Codex also judged exact CPU-starvation confidence too high.

**Disposition:** **Accepted.**

Changes:

- high concurrency as a common precursor: `Moderate-high` → **Moderate**;
- Firefox `matrix:135` delayed-first-observability hypothesis: `Moderate-high` → **Moderate**;
- exact CPU scheduler starvation: `Low-moderate` → **Low**;
- the layered model is now explicitly a moderate-confidence working model, with a mixed model left open for low-frequency Firefox paths.

Rationale: the recurrence and #41/#56 contrast support the model, but issue #61 has no matched worker-count, renderer, or engine-mix control and no page-internal timer/probe timestamps.

### 2. Memory, swap, and OOM as a distinct candidate

**Feedback:** Gemini noted that the confidence summary omitted memory/swap pressure despite Target C and the experiment plan already naming memory/OOM evidence.

**Disposition:** **Accepted in calibrated form.**

Changes:

- added `Memory/swap pressure or OOM is the exact common precursor` at **Low** confidence;
- retained RSS, swap, pressure-stall, process-exit, and kernel-OOM capture in the passive/lifecycle instrumentation.

Rationale: memory pressure is a legitimate competing precursor, but the current logs contain no memory or kernel evidence.

### 3. Target B's successful earlier ordinary clicks

**Feedback:** Claude observed that the smoke test completes ordinary Show Axes, Hide Axes, and Reset Camera clicks before hanging on Resume/Pause Auto Rotation.

**Disposition:** **Accepted.**

Changes:

- added the within-test differential as observed plus repository-verified evidence;
- narrowed the hypothesis space to late-sequence degradation, reset/rotation sequencing, or rotation-toggle state/re-render instability, while retaining broader page degradation as a branch;
- required a timestamped actionability trace for every ordinary click, not just the final failure.

Rationale: issue #61's detailed logs fail at lines 172/174; reaching those lines proves the ordinary clicks at 157/163/166 completed. This weakens a simple “all ordinary actionability is starved” explanation.

### 4. Historical coverage of #11/#44/#52

**Feedback:** Claude identified that the brief explicitly requested these issues as rendering-validation contract context, but the synthesis omitted them from Historical transfer.

**Disposition:** **Accepted.**

Changes:

- added separate rows for #11, #44, and #52;
- distinguished gate/renderer-verification contracts from causal evidence;
- added their issues and reviews to the source list;
- clarified that the native-GPU arm is diagnostic and never replaces the canonical SwiftShader gate.

Rationale: these records define how software and hardware renderer evidence must be interpreted, even though they do not establish the 22-worker mechanism.

### 5. #41/#56 host wording

**Feedback:** Claude noted that “different host” was not established: reviews report a 20-core WSL2 environment, while #61 reports 24 logical CPUs and 27 GiB, but those may be different WSL allocations on one physical machine.

**Disposition:** **Accepted.**

Change: replaced “different host” with the exact reported topology difference and an explicit statement that physical-host identity is unknown.

### 6. Existing probe capabilities and re-navigation detail

**Feedback:** Codex noted that the harness already exposes graph state and WebGL context-loss data. Claude noted that `installGraphProbe` uses `page.addInitScript`, so it persists across successful navigation.

**Disposition:** **Accepted.**

Changes:

- Experiment 1 now extends the existing graph probe instead of implying all signals are new;
- Target C now states that Run 10 fails at the second `page.goto` before post-navigation canvas/handle checks, while the init script would reinstall after a successful navigation.

### 7. Staged instrumentation and balanced observer controls

**Feedback:** Codex judged the original all-signals Experiment 1 overloaded; Gemini and Claude noted the 3-control/5-instrumented imbalance.

**Disposition:** **Accepted.**

Changes:

- split Experiment 1 into **1A passive replay** and **1B focused probe families**;
- stated that the instrumentation table is a catalog, not an instruction to enable every probe at once;
- changed the observer-effect comparison to five uninstrumented and five passive-instrumented runs;
- specified fixed `U-I` alternation and recording of background/thermal drift;
- required each deeper probe family to be compared with the qualified passive arm before adding another.

Rationale: this preserves observability-first information gain while making the manipulated variable and observer effect interpretable.

### 8. Co-load overlap and actual concurrency

**Feedback:** All three critiques emphasized that configured workers or `repeat-each` do not prove the target was under load during its critical window.

**Disposition:** **Accepted.**

Changes:

- required a synchronization barrier;
- load workers must signal ready and remain on continuously rendering pages until the target completes;
- added worker/test start-stop and active-process timelines;
- runs that miss the predeclared overlap threshold are rejected;
- clarified that `repeat-each` supplies tasks but is not overlap evidence and produces an identical-test workload profile.

### 9. Rare-target sample size

**Feedback:** Claude calculated that 10 clean trials still have a 10.7% chance of missing a true 2/10 failure rate.

**Disposition:** **Accepted.**

Changes:

- rare-target stop boundary is now three classified failures or **15 clean verified-overlap trials**;
- three-run ladder points are explicitly screening only;
- the report distinguishes screening, promotion, and confirmation.

### 10. Same-host GPU unavailable and global stopping branches

**Feedback:** Codex requested an explicit branch when same-host verified GPU is unavailable; Claude requested a global stop criterion so every experiment is not run mechanically.

**Disposition:** **Accepted.**

Changes:

- an unavailable same-host GPU ends the renderer-causality branch; cross-host evidence remains corroborative only;
- added program-wide stop criteria requiring a reproducible first missing transition/terminal event plus a controlled factor moving it as predicted;
- added examples for stopping after crash/OOM, workers-1 reproduction, or renderer-arm equivalence;
- low-frequency tails may split into separate follow-ups rather than blocking the core diagnosis.

### 11. Version and source precision

**Feedback:** Codex requested clearer handling of version-sensitive Playwright behavior.

**Disposition:** **Accepted.**

Change: added the Playwright `v1.61.1` source tag to the primary references while retaining the limitation that generic documentation may drift.

## Partially incorporated critique

### 12. Strength of the layered model

**Feedback:** Codex argued that the layered common-precursor conclusion itself was too strong; Claude could not refute it and considered it the strongest interpretation.

**Disposition:** **Partially accepted.**

The report retains the layered model because the repeatable Chromium cluster and six distinct failure layers make it the best unifying explanation. It no longer describes the precursor as established, lowers confidence to Moderate, and explicitly preserves a mixed/partly independent Firefox model. Removing the model entirely would underweight the strong concentration and #41/#56 history; presenting it as fact would overweight them.

### 13. Early factor isolation before instrumentation

**Feedback:** Codex proposed moving worker/engine factor isolation ahead of broad instrumentation.

**Disposition:** **Partially accepted.**

The broad instrumentation step was narrowed to low-overhead passive telemetry, and renderer/engine-source controls remain immediately next. The exhaustive worker ladder remains later and adaptive.

Rationale: an uninstrumented pass/fail screen cannot distinguish wheel delivery, actionability, lifecycle loss, delayed observation, or server delay. Engine-only suites also contain only 11 distinct tests, so “22 workers” does not imply 22 active workers without the synchronized co-load machinery. Qualifying low-overhead observer effect first gives factor controls a classified outcome rather than another aggregate red/green count.

### 14. Thermal control

**Feedback:** Claude suggested cooldown intervals as a possible control for long alternating experiments.

**Disposition:** **Partially accepted.**

Thermal/background state is now recorded and strict alternation is specified. Mandatory cooldown intervals were not prescribed because they would change scheduling and elapsed-time conditions without evidence that temperature is currently a material factor. Experiment operators may add a predeclared cooldown if telemetry shows throttling.

## Rejected critique

### 15. Default WSL2 memory-cap assertion

**Feedback:** Gemini proposed stating that WSL2 typically receives only part of host RAM, citing an often-default 50% allocation.

**Disposition:** **Rejected.**

Issue #61 records a 27 GiB environment but does not record `.wslconfig`, the Windows host total, guest limit, dynamic-memory state, or whether 27 GiB is host or guest-visible capacity. WSL defaults have also varied across versions. Adding a default-cap claim would replace one evidence gap with an unverified environment assumption. The experiment instead records actual guest memory, swap, pressure, and configuration.

### 16. Directly connecting Run 10 `ERR_ABORTED` to an OOM kill

**Feedback:** Gemini suggested connecting the second-navigation abort directly to a silent Linux OOM renderer kill.

**Disposition:** **Rejected as a causal statement.**

OOM remains a competing hypothesis, but `ERR_ABORTED` is generic and issue #61 captured no `page.crash`, process exit, browser stderr, kernel log, or OOM record. The report therefore keeps crash/OOM in the discriminator without implying that it produced Run 10.

### 17. Downgrading Chromium SwiftShader below Moderate

**Feedback:** Codex questioned whether `Moderate` was too high.

**Disposition:** **Rejected after calibration review.**

The claim is explicitly “major amplifier,” not “exact root cause.” Chromium is forced to CPU-only SwiftShader, dominates #61, #41 reproduced the core combination family under SwiftShader parallelism, and #56 was green on verified native GPU at 10 workers. The missing same-host 22-worker control prevents High confidence but does not reduce this historical inference to Low.

### 18. Expanding low-frequency target narratives beyond available evidence

**Feedback:** Codex described Firefox smoke, Firefox `matrix:225`, Firefox `matrix:314`, and Chromium `matrix:135` as minimally analyzed.

**Disposition:** **Rejected as a request for stronger causal prose; accepted as a limitation.**

Each target already has dedicated coverage and a discriminator. Runs 1–5 lack low-level detail and only one detailed occurrence exists for several tails. Adding more mechanism narrative would be speculation. The final report instead strengthens sampling and explicitly preserves the evidence limitation.

## Final verdict

The critiques changed confidence calibration, historical completeness, Target B interpretation, and experiment rigor without changing the core conclusion: current evidence supports a moderate-confidence layered/mixed working model, but no exact root cause or fix owner is established. The next work should recover artifacts, qualify low-overhead telemetry at the reproducible 22-worker condition, and then apply matched renderer/co-load controls until the first missing transition and its causal load factor are both reproduced.
