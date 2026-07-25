# Research Brief: Root-Cause Analysis of E2E Instability at `E2E_WORKERS=22`

**Project:** Issue #61, “E2E instability at `E2E_WORKERS=22`”  
**Research date:** 2026-07-25  
**Evidence baseline:** repository commit `f1eebf7`; issue #61 contains the verbatim 10-run failure log and full error output for Runs 6–10  
**Decision to inform:** Define the smallest decisive EXPERIMENT program that can establish the mechanism(s) behind the closed 22-worker failure set before anyone proposes or implements a fix.

## Precise research question

What mechanism or combination of mechanisms causes the repeatable, closed set of 4–6 failures observed in every one of ten local runs of:

```bash
E2E_WORKERS=22 npm run test:smoke
```

on the issue #61 host, and which explicit follow-up experiments would distinguish among the remaining explanations with the least cost and ambiguity?

The analysis must answer five subsidiary questions:

1. Does the evidence support one cross-cutting resource-contention mechanism, several signature-specific mechanisms, or a layered model in which contention exposes distinct harness/browser/application races?
2. For each observed error signature, what is directly established by the logs and repository code, what is only a supported inference, and what remains an unvalidated hypothesis?
3. Which historical findings from issues #33, #34, #41, #55, and #56 genuinely transfer to this dataset, and which superficially similar signatures must not be conflated?
4. What instrumentation or controlled experiment would falsify each leading hypothesis rather than merely produce another pass/fail count?
5. What sequence of EXPERIMENT work should follow this research, including controls, sample sizes, captured artifacts, stop criteria, and decision branches?

This is root-cause **research**, not a request to make the suite green. Do not implement or prescribe a fix as established fact without mechanism evidence.

## Required evidence discipline

Every material claim must be classified explicitly as one of:

- **Observed fact:** directly present in issue #61’s raw logs or measured evidence.
- **Repository-verified fact:** established by checked-in code, configuration, or prior preserved evidence.
- **Externally verified fact:** supported by a cited primary source such as Playwright, Chromium, Firefox, Three.js, or browser-process documentation.
- **Inference:** the best explanation of established facts, with the reasoning and confidence stated.
- **Hypothesis needing validation:** plausible but not established; pair it with a discriminating experiment and a falsification condition.

Do not turn correlation (“22 workers” and a timeout co-occur) into mechanism (“CPU contention caused this exact failure”) without a causal discriminator. Conversely, do not discard the strong repeatability and signature clustering already present in the dataset.

## Baseline observations to verify, not overinterpret

Treat the following as starting observations and verify them against issue #61 and the checked-out repository:

- Ten consecutive runs produced no clean result: 50 total failure instances, 4–6 per run.
- No new test×browser combination appeared after Run 5. The observed failure set is closed within this 10-run sample.
- The high-frequency core is Chromium-heavy:
  - Chromium `smoke.spec.ts:78`: 10/10.
  - Chromium `matrix.spec.ts:225`: 9/10.
  - Chromium `matrix.spec.ts:572`: 9/10.
  - Firefox `matrix.spec.ts:135`: 8/10.
  - Chromium `matrix.spec.ts:195`: 6/10.
- The issue groups all captured failures into six error signatures, listed as required targets below.
- Chromium is configured to launch with SwiftShader on the canonical/default path. The effective Firefox renderer for the issue #61 runs is **not recorded in the issue body** and must remain an explicit evidence gap rather than being assumed.
- `playwright.config.ts` keeps local `retries: 0`, uses `fullyParallel: true`, and resolves the explicit `E2E_WORKERS=22` override through `resolveWorkers`.
- The same host had 24 logical CPUs and 27 GiB RAM. Twenty-two Playwright workers leave little CPU headroom, but the issue contains no CPU run-queue, memory-pressure, browser-process, renderer-crash, WebGL-context-loss, event-delivery, or server-latency telemetry.
- Full error details exist only for Runs 6–10; Runs 1–5 preserve the failing test list but not complete stack/error output. This limits frequency claims about the six low-level signatures.
- Issue #41 previously found 4–5 Chromium timing-sensitive failures per run under a different high-parallel SwiftShader qualification regime, but “consistent with #41” is historical corroboration, not proof that all #61 signatures share one cause.
- Issue #55’s Firefox background-drag failure was conclusively root-caused as stray node capture and fixed. The Firefox `matrix.spec.ts:225` failure captured in issue #61 Run 9 occurs in `waitForStableCameraDistance` **before** the wheel/drag assertion, so it must not be relabeled as the fixed #55 mechanism without new evidence.
- Issues #33 and #34 describe prior timing/input mechanisms in related tests. A recurring assertion or stack shape under 22-worker contention may be the same mechanism, a new mechanism reaching the same assertion, or a pure observation-budget failure. Establish which.

Correct any inaccurate baseline statement in each investigation report.

## Required targets

The required class is **every low-level error signature and every observed test×browser member of the closed issue #61 dataset**. Each signature below must receive a dedicated section. Do not silently omit a low-frequency target or substitute a better-understood historical failure.

### Target A — Chromium wheel input produces zero camera delta

Observed in Chromium `matrix.spec.ts:135` (post-enablement assertion), `:195`, and `:225`. Captured values are byte-identical to the pre-wheel camera distance, or differ only at floating-point noise scale, through a 5 s poll.

Determine what evidence would distinguish at least:

- wheel event never dispatched by Playwright;
- event dispatched but not delivered to the intended DOM/canvas target;
- event delivered but TrackballControls disabled, not ready, or prevented;
- event handled but render/control updates starved past the observation window;
- imperative-handle sampling stale or unable to observe the update;
- browser/renderer degradation or loss affecting the page more broadly.

### Target B — Chromium smoke-test click never becomes “visible, enabled and stable”

Observed in Chromium `smoke.spec.ts:78` in all ten runs; full Runs 6–10 time out after 120 s inside ordinary `locator.click()` on the rotation toggle, after the locator resolves.

Determine why a resolved button never satisfies Playwright actionability stability. Distinguish element geometry/style instability, main-thread or renderer starvation, continuous layout/reconciliation, actionability polling unable to execute, page/browser degradation, and a test-specific interaction sequence. Account for the fact that the test already uses a verified forced click only for its initial pause, while the later resume/pause clicks remain ordinary actionability checks.

### Target C — Chromium re-navigation aborts or times out

Observed in Chromium `matrix.spec.ts:572` in 9/10 runs. Runs 6–9 report the 120 s test timeout; Run 10 exposes `page.goto: net::ERR_ABORTED; maybe frame was detached?` on the second navigation.

Determine what can and cannot be inferred from this generic Playwright/Chromium error. Distinguish renderer/page crash or detach, test-timeout cancellation, overlapping lifecycle work, server response failure, navigation cancellation, memory/resource exhaustion, and WebGL/browser-process failure. A renderer crash is a hypothesis, not an established reading of `ERR_ABORTED`.

### Target D — Firefox controls are already enabled at the “early” probe

Observed in Firefox `matrix.spec.ts:135` in 8/10 runs. `waitForGraphHandle` returns a snapshot whose `controlsEnabled` is already `true`, failing the initial-state assertion.

Distinguish an application regression that enables controls too early from delayed observability: under contention, the app’s 4 s timer may fire before the harness can first reach the canvas/imperative handle. Reconcile this with issue #33’s earlier fix, which removed a camera-settle ordering race but retained the requirement that the initial handle snapshot be observed before enablement.

### Target E — Firefox camera motion is not observed or never settles

Observed as two distinct low-frequency failures:

- Firefox `matrix.spec.ts:314`: click-to-focus camera-motion count remains zero for 10 s.
- Firefox `matrix.spec.ts:225`: `waitForStableCameraDistance` times out after 15 s before the wheel/drag sequence.

Analyze these separately before considering a shared cause. Compare the `:314` signature carefully with issue #34’s historical click-registration path, and distinguish the `:225` precondition failure from issue #55’s fixed background-drag mechanism.

### Target F — Firefox UI chrome is absent at the 5 s visibility check

Observed once in Firefox `smoke.spec.ts:78`: the “Show Axes” button is not found within 5 s.

Determine whether this is ordinary delayed startup under saturation, server/navigation delay, React/client hydration delay, page/browser degradation, WebGL initialization blockage, or another mechanism. State the limited confidence warranted by one captured occurrence.

### Required test×browser coverage table

The investigation must include a row for every observed member, even when multiple rows map to one signature:

1. Chromium `smoke.spec.ts:78`
2. Firefox `smoke.spec.ts:78`
3. Chromium `matrix.spec.ts:135`
4. Firefox `matrix.spec.ts:135`
5. Chromium `matrix.spec.ts:195`
6. Chromium `matrix.spec.ts:225`
7. Firefox `matrix.spec.ts:225`
8. Firefox `matrix.spec.ts:314`
9. Chromium `matrix.spec.ts:572`

For each row report frequency, captured low-level signature(s), relevant code path, strongest evidence, leading hypotheses, confidence, and the next discriminator.

## Cross-cutting questions each investigator must answer

1. **Common cause versus multiple causes:** Which failures can reasonably share a resource-contention precursor, and which require distinct downstream mechanisms? Produce a causal model rather than one broad “timing flake” label.
2. **Resource topology:** At 22 workers, what browser processes, renderers, WebGL contexts, page main threads, server work, and Playwright control loops contend on this host? Identify what the repository and official browser/Playwright behavior establish versus what needs measurement.
3. **Renderer specificity:** Which evidence is specific to Chromium SwiftShader? Which Firefox failures could arise from whole-host contention even if Firefox is not using SwiftShader? What renderer probe is required in follow-up evidence?
4. **Timeout semantics:** For each 5 s, 15 s, or 120 s failure, determine whether a longer diagnostic window would distinguish delayed success from a permanently lost event/crash. A timeout increase may be used as an experiment control but must not be proposed as a production fix.
5. **Historical transfer:** Map issue #61 signatures to issues/reviews #33, #34, #41, #55, and #56. Mark each relationship as same mechanism established, similar symptom only, contradicted, or unknown.
6. **Closed-set meaning:** Explain what “no new signatures after Run 5” does establish (repeatable concentration) and does not establish (exhaustiveness outside this host, worker count, renderer, or sample).
7. **App versus harness versus environment:** For every leading hypothesis, identify the likely ownership layer only conditionally. Do not choose a fix owner before the experiment supports the mechanism.
8. **External behavior:** Use current primary documentation or source references where helpful for Playwright actionability, mouse-wheel dispatch, page crash/frame detach events, navigation cancellation, Chromium/SwiftShader process behavior, and WebGL context loss. Cite exact URLs and access dates.

## Required experiment recommendations

The final synthesis must recommend a prioritized Research→EXPERIMENT program. Each proposed experiment must include:

- hypothesis tested;
- manipulated variable(s);
- control arm(s);
- exact target tests/signatures;
- instrumentation and artifacts to capture;
- predicted result under each competing hypothesis;
- falsification/decision criterion;
- repetition count or sampling rationale;
- estimated cost and ordering dependency;
- stop/go branch for the next experiment.

At minimum, assess and refine these experiment families:

1. **Worker-threshold and factor isolation:** repeated runs across a bounded worker ladder (for example 1, 2, 4, 8, 11, 16, 22), split by Chromium-only, Firefox-only, and both-engine execution. Separate worker count from engine mix and identify the onset curve for each signature.
2. **Renderer control:** compare Chromium SwiftShader with the already-available verified native-GPU lane while holding test set and worker count as constant as practical; record the effective renderer for every engine/run. This should discriminate SwiftShader-specific pressure from whole-host/browser-independent pressure.
3. **Targeted co-load:** compare each failing test in isolation against the same test co-scheduled with controlled WebGL/browser load. A target run that uses one selected test and therefore only one active worker is not by itself a valid 22-worker control; design a real co-load arm.
4. **Event/control/frame instrumentation:** for wheel and camera failures, capture browser-side wheel/pointer counters, event target/path, `defaultPrevented`, TrackballControls enabled state, control change events, animation-frame cadence, graph-handle sample timestamps, and long-task/event-loop delay around dispatch.
5. **Actionability instrumentation:** for the smoke click, capture Playwright trace/actionability details plus timestamped button bounding boxes, computed visibility/enabled state, React text/state transitions, hit-test target, and requestAnimationFrame cadence. A diagnostic forced-click arm may distinguish actionability starvation from click-handler failure, but must not be treated as the fix.
6. **Navigation/browser-lifecycle instrumentation:** for re-navigation and missing UI, capture `page.on("crash")`, close/disconnect/frame lifecycle events, Chromium stderr/crashpad or equivalent diagnostics where available, WebGL context lost/restored events, server request/response timing, page performance/navigation entries, process exit status, host memory/CPU pressure, and relevant kernel OOM evidence.
7. **Observation-budget control:** rerun instrumented targets with an extended diagnostic timeout while retaining the canonical assertion separately. Classify “event eventually succeeds late,” “event was delivered but state never changed,” and “page/process terminated” as different outcomes.
8. **Scheduling/load controls:** consider CPU affinity or a controlled external CPU-load arm only if it helps separate worker scheduling from WebGL-context count. Avoid changing multiple dimensions at once.

The synthesis should collapse redundant experiments and order the smallest, highest-information probes first.

## Evidence and method

- Treat issue #61’s body as the canonical raw dataset. Read the verbatim attachments, not only the summary table.
- Inspect the repository at `f1eebf7`, especially:
  - `playwright.config.ts`
  - `scripts/e2e-workers.mjs`
  - `tests/e2e/smoke.spec.ts`
  - `tests/e2e/matrix.spec.ts`
  - `tests/e2e/graph-handle.ts`
  - `tests/e2e/pointer.ts`
  - `app/components/FocusGraph.tsx` and related graph/control lifecycle code
- Inspect relevant preserved history and evidence in issues/reviews #33, #34, #41, #55, and #56. Also consult #11/#44/#52 where they establish the software-rendering and native-GPU validation contracts.
- Prefer primary external sources. Cite URLs and access date (`2026-07-25`). If source code behavior is version-sensitive, tie it to Playwright `1.61.1` and the browser revisions bundled by that release rather than assuming current-tip behavior.
- Be candid where the existing dataset cannot decide causality. “Unknown pending experiment X” is preferable to relabeling a symptom as a root cause.
- Record surprises and evidence that contradicts the issue’s suggested explanation.
- Investigate independently. Do not infer or anchor on what the other models may conclude.

## Scope boundaries

### In scope

- Static analysis of issue #61’s raw logs, repository code/configuration, relevant git history, prior issues, and preserved qualification evidence.
- Primary-source research into Playwright/browser/WebGL behavior needed to interpret the signatures.
- Per-signature causal analysis, confidence grading, cross-signature synthesis, and explicit evidence gaps.
- A prioritized, falsifiable EXPERIMENT design that can establish root cause and later inform app/harness/environment ownership.

### Out of scope

- Editing application code, tests, Playwright configuration, worker resolution, CI, documentation, or dependencies.
- Implementing retries, longer canonical waits, serial annotations, forced clicks, skips, assertion weakening, or any other mitigation.
- Running a new expensive 22-worker reproduction campaign as part of RESEARCH. Recommend it precisely for EXPERIMENT instead.
- Declaring a permanent fix, changing the serial/default gate, or moving the canonical gate to hardware.
- Re-litigating #55’s established stray-node-capture root cause unless new evidence directly contradicts it.
- Treating all failures as one “SwiftShader flake” merely because Chromium dominates the sample.

## Required investigation output

Each investigator must produce a standalone report containing:

1. Baseline corrections and an evidence-quality assessment.
2. A causal/topology model of the 22-worker run.
3. A dedicated section for Targets A–F.
4. The complete nine-row test×browser coverage table.
5. A mapping to historical issues #33/#34/#41/#55/#56 without mechanism conflation.
6. Ranked cross-cutting and signature-specific hypotheses, with evidence for, evidence against, confidence, and falsifiers.
7. A prioritized experiment plan meeting the requirements above.
8. Primary sources with access dates, explicit gaps, and surprising or contradictory findings.

Aim for approximately 2,500–4,000 words plus tables. Precision and falsifiability matter more than length.

## Acceptance criteria for the final synthesis

The final report must stand alone and include:

- A scope summary and concise executive assessment.
- A clear separation of observed facts, verified facts, inferences, and unvalidated hypotheses.
- Dedicated findings for all six signatures and all nine test×browser combinations.
- An explicit answer to “one root cause, layered common precursor, or multiple independent causes?” with calibrated confidence.
- A causal diagram or equivalent structured model showing where host contention, browser/renderer behavior, Playwright control, test harness, and application state may interact.
- No unsupported statement that `ERR_ABORTED` proves a renderer crash, that zero camera delta proves wheel non-delivery, or that Firefox used a particular renderer.
- Correct handling of historical evidence: #55’s fixed drag mechanism is not reused for the Run-9 pre-settle failure; #33/#34 similarities are labeled by mechanism evidence, not test name alone.
- A prioritized EXPERIMENT backlog with controls, instrumentation, predictions, falsification criteria, repetitions, stop/go branches, and expected information gain.
- Conditional next-step ownership (app, harness, browser/environment) rather than an implemented or preselected fix.
- Direct source links with access dates and confidence annotations.
- Explicit gaps/limitations, disagreements and their resolution, and changes made after three-way critique.
