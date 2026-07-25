# Root-Cause Research: E2E Instability at `E2E_WORKERS=22`

**Project:** Research 61

**Date:** 2026-07-25

**Evidence baseline:** repository commit `f1eebf7`; GitHub issue [#61](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/61)

**Decision informed:** the smallest decisive EXPERIMENT program needed to establish the mechanism behind the closed 22-worker failure set before proposing a fix

## Scope summary

This report asks why ten consecutive local runs of:

```bash
E2E_WORKERS=22 npm run test:smoke
```

on a 24-logical-CPU, 27 GiB WSL2 host produced 4–6 failures every time: 50 failure instances across nine test×browser combinations. It covers all six low-level signatures preserved for Runs 6–10, all nine combinations observed across Runs 1–10, the relationship to issues #33, #34, #41, #55, and #56, the rendering-validation contracts from #11/#44/#52, and a falsifiable Research→EXPERIMENT program.

The report does **not** select or implement a fix. Longer waits, forced clicks, retries, serial annotations, and renderer changes appear only as diagnostic controls. Ownership remains conditional until experiments distinguish app, harness, browser/renderer, and host mechanisms.

## Executive assessment

The best-supported explanation is a **layered model**:

1. **A high-parallel rendering/load condition is the leading common-precursor hypothesis.** The association is strong: the issue #61 set is repeatable and Chromium-heavy; issue [#41](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/41) previously reproduced the same core Chromium **test-combination family** on every 10-worker SwiftShader-parallel run; and issue [#56](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/56) recorded the same suite green 3/3 at 10 workers on verified native GPU after the unrelated #55 flake was fixed. The historical match does not prove identical low-level mechanisms.
2. **The exact precursor mechanism is not established.** Chromium is configured to use SwiftShader, which runs purely on the CPU, but issue #61 captured no run-queue, per-process CPU, memory-pressure, browser-process, renderer-crash, WebGL-context-loss, or server-latency telemetry. “SwiftShader-amplified host contention” is a **moderate-confidence inference**, not yet a measured root cause.
3. **The six signatures are not one downstream bug.** They occur at different layers: wheel/control propagation, Playwright actionability, navigation lifecycle, timer/observation ordering, camera/tween observation, and startup visibility. A shared pressure source can expose several distinct races or degraded states.
4. **Three tempting conclusions are specifically unsupported:**
   - `net::ERR_ABORTED` does not prove a renderer crash;
   - zero observed camera delta does not prove the wheel event was never delivered;
   - Firefox’s effective renderer cannot be inferred from the Chromium SwiftShader configuration.
5. **The smallest high-information next move is observability at the already-reliable failure point, not another uninstrumented pass/fail campaign.** Instrument the 22-worker condition, preserve canonical deadlines while continuing diagnostic observation, then run a same-host SwiftShader/native-GPU control. Use targeted co-load and an adaptive worker ladder only after the signatures can be classified.

### Confidence summary

| Claim | Confidence | Basis |
|---|---|---|
| The issue #61 failure concentration is real and repeatable on the recorded host/configuration | **High** | 10/10 red runs; 50 failures; exact nine-member set |
| One broad “timing flake” is an inadequate explanation | **High** | Six materially different low-level failure points |
| High concurrency is a common precursor | **Moderate** | #61 recurrence plus #41 history; no same-host worker-count or engine-mix control |
| Chromium SwiftShader is a major amplifier | **Moderate** | Chromium bias, CPU-only renderer, #41/#56 contrast; no same-host 22-worker renderer control |
| CPU scheduler starvation is the exact root cause | **Low** | Plausible, but no run-queue or per-process telemetry |
| Memory/swap pressure or OOM is the exact common precursor | **Low** | Plausible lifecycle branch, but no RSS, pressure-stall, swap, or kernel-OOM evidence |
| Firefox `matrix:135` is delayed first observability relative to the 4 s timer | **Moderate** | Symptom and code fit; required page/harness timestamps absent |
| Targets A, B, C, E, and F have a specific proven downstream mechanism | **Low to moderate** | Existing logs identify failure points, not causal paths |

## Evidence discipline and dataset limits

This report uses five labels:

- **Observed fact** — present in issue #61’s preserved run data.
- **Repository-verified fact** — established by code/configuration at `f1eebf7` or preserved project evidence.
- **Externally verified fact** — supported by a cited primary source, accessed 2026-07-25.
- **Inference** — best explanation of established facts, with confidence stated.
- **Hypothesis needing validation** — plausible but paired with a discriminator and falsification condition.

### What the dataset establishes

- **Observed fact:** ten runs produced 50 failures, 4–6 per run, with no clean run.
- **Observed fact:** no new **test×browser combination** appeared after Run 5.
- **Observed fact:** the nine-member frequency table is exact:
  - Chromium `smoke.spec.ts:78`: 10/10
  - Chromium `matrix.spec.ts:225`: 9/10
  - Chromium `matrix.spec.ts:572`: 9/10
  - Firefox `matrix.spec.ts:135`: 8/10
  - Chromium `matrix.spec.ts:195`: 6/10
  - Firefox `smoke.spec.ts:78`: 2/10
  - Chromium `matrix.spec.ts:135`: 2/10
  - Firefox `matrix.spec.ts:225`: 2/10
  - Firefox `matrix.spec.ts:314`: 2/10
- **Repository-verified fact:** local retries are zero, tests are fully parallel, and `E2E_WORKERS=22` resolves to 22 workers (`playwright.config.ts`; `scripts/e2e-workers.mjs`).
- **Repository-verified fact:** the default Chromium launch path uses `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`; Firefox sets `webgl.force-enabled`, but that preference does not identify the renderer actually used.
- **Repository-verified fact plus externally supported inference:** the config permits 22 workers; Playwright documents that workers are independent OS processes, each starting a browser, and that each test gets an isolated browser context. The runner may therefore have up to 22 worker/browser workloads active, plus browser subprocesses/threads and the shared Next.js server. Actual peak concurrency and process topology were not measured, and the documentation does not justify a fixed browser-process count.
- **Externally verified fact:** SwiftShader is a software Vulkan/OpenGL ES implementation that runs purely on CPU.

### What the dataset does not establish

- Full low-level errors exist only for Runs 6–10. Runs 1–5 preserve the failing combinations but not the detailed failure point. Therefore the **nine-member combination set is closed within the sample; the six low-level signatures are not proven exhaustive for Runs 1–5**.
- The issue does not preserve or analyze Playwright trace/video artifacts, despite the config’s retain-on-failure settings. They may have existed transiently, but they are not part of the canonical evidence.
- Logical CPU count does not by itself prove CPU saturation. Browser/rendering workloads use varying numbers of runnable threads and may also hit memory, IPC, GPU-process, renderer, server, or lifecycle limits.
- The 10-worker native-GPU evidence from #56 is a strong historical control but is not a same-host, same-worker-count control for issue #61.

## Causal model

```text
E2E_WORKERS=22 + fullyParallel two-engine suite
        |
        |  up to 22 Playwright worker/browser workloads
        |  + Chromium CPU-only SwiftShader work
        |  + Firefox renderer path (unknown)
        |  + shared Next.js server and host resources
        v
Candidate common precursor (not yet measured)
  scheduler / renderer / memory / browser-process / server pressure
        |
        +-----------------------+----------------------+-------------------+
        |                       |                      |                   |
        v                       v                      v                   v
 page event/control       Playwright actionability  page/navigation    startup and first-
 and render progress      polling cannot finish    lifecycle degrades observation ordering
        |                       |                      |                   |
        v                       v                      v                   v
 Target A                 Target B                 Target C            Targets D/F
 wheel has no             ordinary click remains  second navigation   timer already observed
 observed camera effect   non-actionable 120 s     aborts/times out    enabled / UI absent
        |
        +------------------------------+
                                       v
                              camera/tween/settle path
                                      Target E
```

The model separates a **precursor** from **downstream mechanisms**. Even if a same-host renderer control proves that SwiftShader is the dominant amplifier, it would not by itself show whether a particular wheel failed at dispatch, DOM delivery, control handling, graph tick, or observation.

## Findings by required target

### Target A — Chromium wheel input produces zero observed camera delta

**Affected combinations:** Chromium `matrix.spec.ts:135`, `:195`, and `:225`.

**Established evidence**

- **Observed fact:** in preserved Runs 6–10, the camera distance remains exactly equal to the starting value, or differs only at floating-point-noise scale, through a 5 s poll.
- **Repository-verified fact:** each path moves the mouse to `(400, 300)`, calls `page.mouse.wheel(...)`, and polls the imperative graph snapshot for camera-distance movement.
- **Externally verified fact:** Playwright documents that `mouse.wheel` dispatches a `wheel` event and does not wait for scrolling to finish; it does not promise that downstream application state has updated before return.
- **Version-pinned source fact:** Three.js r185 `TrackballControls.onMouseWheel` returns when controls are disabled or zoom is disabled. Otherwise it changes internal zoom state; it does not immediately move the camera. A later `update()` applies that state. `three-render-objects@1.42.0` gates `controls.update(...)` on controls being enabled.

**Interpretation**

The logs establish **no camera change was observable inside the budget**. They do not distinguish:

1. the wheel command never reached a DOM listener;
2. it reached the wrong element/path;
3. it arrived while controls were disabled or not ready;
4. it changed control state but no subsequent graph/control update applied it;
5. the camera changed in page state but the imperative-handle sampling did not observe it;
6. the page/renderer entered a broader degraded state.

The exact-zero values are evidence against a *partially observed* zoom in those samples, but they do not eliminate a delayed update after 5 s or repeated reads of a stale frame.

**Leading hypothesis:** contention delays or prevents one of the event→control→update→observation stages. **Confidence: moderate for the family, low for the exact stage.**

**Decisive discriminator:** capture, on one timeline, the wheel event count/target/path/default-prevention, `elementFromPoint(400,300)`, controls-enabled state, Trackball start/change/end events, graph-tick or camera samples per animation frame, Playwright poll timestamps, and page/lifecycle heartbeat. Each missing transition identifies a different owner. The hypothesis “wheel was not delivered” is falsified if the capture listener records the expected event on the intended path.

### Target B — Chromium smoke click never completes ordinary actionability

**Affected combination:** Chromium `smoke.spec.ts:78`, 10/10.

**Established evidence**

- **Observed fact:** in all detailed Runs 6–10, the locator resolves to the correct rotation button, the click attempt begins, and the 120 s test timeout expires while Playwright is waiting for the element to be “visible, enabled and stable.” Four runs stop on Resume; one reaches the following Pause click.
- **Observed plus repository-verified fact:** reaching lines 172/174 means the earlier ordinary Show Axes, Hide Axes, and Reset Camera clicks at lines 157/163/166 completed. The failure is therefore late in the interaction sequence and concentrated on the stateful rotation toggle, not on the first ordinary click.
- **Repository-verified fact:** the initial Pause uses a verified forced click because software-rendered WebGL can starve the initial actionability wait. The later interactions use ordinary actionability.
- **Repository-verified fact:** the button is in an absolute-positioned overlay with fixed height and width, but React text/state changes between Pause and Resume.
- **Externally verified fact:** `locator.click()` checks visible, stable, receives-events, and enabled conditions. Stable means the bounding box is unchanged for at least two consecutive animation frames.

**Interpretation**

The call log shows that **ordinary actionability did not complete**; it does not identify which check remained false. “Two stable frames never arrived” is plausible, but 120 s is long enough that ordinary low frame rate alone is an incomplete explanation. The successful earlier ordinary clicks weaken a simple “all actionability is starved” account and make elapsed degradation, the reset/rotation sequence, or the toggle’s state-driven re-render/text transition important discriminators. Continuous geometry mutation, hit-target obstruction, an unresponsive renderer/main thread, or a degraded page can still produce the same surface.

**Leading hypotheses:**

- page/actionability progress degrades late in the sequence as rendering work accumulates;
- the rotation toggle’s state transition, geometry, or hit target remains unstable after reset/resume;
- the page remains queryable enough to resolve a locator but is otherwise degraded;
- less likely, the element repeatedly detaches/reconciles during the check.

**Confidence:** high about the failure layer (pre-click actionability), low-moderate about the mechanism.

**Decisive discriminator:** pair a Playwright trace with a timestamped timeline for **every** ordinary click in the sequence, `locator.click({trial:true})`, bounding boxes/computed state/hit-test target, React text/state changes, DOM mutations, `requestAnimationFrame` and timer heartbeats, and lifecycle events. At the canonical deadline, a diagnostic forced-click and direct DOM-click arm may test whether bypassing actionability reaches the React handler; neither is a production fix. “Generic actionability starvation” is weakened if the same telemetry remains healthy for axes/reset and fails only after the rotation-toggle transition; “actionability starvation” is falsified if telemetry instead shows a concrete moving/obscured/disabled condition.

### Target C — Chromium re-navigation aborts or times out

**Affected combination:** Chromium `matrix.spec.ts:572`, 9/10.

**Established evidence**

- **Observed fact:** Runs 6–9 preserve only the 120 s test timeout. Run 10 exposes `page.goto: net::ERR_ABORTED; maybe frame was detached?` on the second navigation.
- **Repository-verified fact:** the test completes the first navigation and graph-handle checks, then calls `page.goto("/")` again. Its graph probe was installed with `page.addInitScript()`, so it would reinstall after a successful navigation; Run 10 fails at `page.goto` itself, before the post-navigation canvas/handle checks.
- **Externally verified fact:** Chromium defines `ERR_ABORTED` as “An operation was aborted (due to user action).” Playwright exposes separate `crash`, `close`, `framedetached`, and `requestfailed` events. `page.goto` can fail because the main resource failed, the server was unreachable/unresponsive, a timeout occurred, or another navigation/lifecycle event intervened.

**Interpretation**

Run 10 proves the second navigation was aborted. It does **not** prove a renderer crash, and it does not prove that Runs 6–9 shared Run 10’s underlying condition. Conversely, the absence of a recorded crash event proves nothing because no crash listener was captured.

**Competing hypotheses:** renderer/page crash or detach; timeout-triggered teardown/cancellation; overlapping lifecycle or navigation cancellation; main-resource/server failure; WebGL/browser-process degradation; memory pressure/OOM.

**Confidence:** low for every specific mechanism.

**Decisive discriminator:** separate the navigation timeout from the outer test timeout and timestamp `crash`, close, browser-disconnected, frame attach/detach, request/response/requestfailed, server receipt/response, WebGL context loss, browser stderr/crashpad, process exits, and kernel OOM evidence. A crash hypothesis is falsified by repeated aborts with live page/browser heartbeats, no crash/disconnect, and a clearly identified cancellation or request failure.

### Target D — Firefox controls are already enabled at the “early” probe

**Affected combination:** Firefox `matrix.spec.ts:135`, 8/10.

**Established evidence**

- **Observed fact:** the first returned graph snapshot has `controlsEnabled === true` in the detailed failures.
- **Repository-verified fact:** `FocusGraph` initializes `clickEnabled` false and schedules it true after the default `enableDelay=4000`; that state drives `enableNavigationControls`, node drag, and pointer interaction.
- **Repository-verified fact:** the test records `navigationStart` before navigation and asks for the graph handle immediately after `openGraphPage` returns.
- **Historical fact:** #33 fixed a different ordering error: the harness previously gated on camera settle before evaluating the enable-delay invariant.

**Interpretation**

The strongest explanation is **delayed first observability**: under load, component mount, handle readiness, Playwright evaluation, and the 4 s timer race, so the first successful harness read occurs after enablement. That is not yet proven. Both the app-side `setTimeout` callback and Playwright's page-context probe ultimately execute on the page event loop, so contention can delay both and alter their queue ordering; wall-clock delay alone does not identify which ran first. The current evidence lacks page-internal timestamps for mount, handle readiness, timer scheduling/firing, and first harness observation.

**Confidence:** moderate for delayed-observation/timer ordering; low for whether the delay belongs primarily to app startup, page execution, or Playwright scheduling.

**Decisive discriminator:** capture page-internal timestamps for component mount, graph-handle availability, interaction timer scheduled/fired, controls state transitions, load/DOMContentLoaded, and each harness probe. A 4/8/16 s enable-delay control can then test whether extending only the observation window moves the failure boundary. “Delayed observability” is falsified if the handle is observed well before the scheduled callback yet controls are already true.

### Target E — Firefox camera motion is not observed or never settles

These are two separate low-frequency paths and should not be merged before instrumentation.

#### E1 — Firefox `matrix.spec.ts:314`: click-to-focus motion remains zero

- **Observed fact:** Run 6 passes the earlier “real node click should register and fix the node” assertion, then observes camera-motion delta `0` for 10 s.
- **Repository-verified fact:** after a registered click, `FocusGraph.handleClick` fixes the node and calls `cameraPosition(..., 2000)` when coordinates exist.
- **Historical fact:** #34 established a hover/raycast timing failure for bare click registration and also recorded camera-motion symptoms. The current test already uses the hover-first helper added for that mechanism.

Because the fixed-node assertion has already passed, #34’s original **uncommitted-hover causes no click registration** mechanism is not sufficient to explain Run 6. The unresolved branches are: the camera transition was not invoked, was invoked but never advanced, advanced but was not sampled, or the page degraded after registration.

**Confidence:** low-moderate. Relationship to #34 is **similar symptom/history, not same mechanism established**.

**Discriminator:** one timeline for pointer/hover commit, `onNodeClick`, fixed-node transition, `cameraPosition` invocation, camera coordinates per animation frame, and graph-probe reads. The “click never registered” branch is already contradicted for the preserved Run 6 failure.

#### E2 — Firefox `matrix.spec.ts:225`: precondition never settles

- **Observed fact:** Run 9 times out in `waitForStableCameraDistance` after 15 s, before the wheel or drag sequence.
- **Repository-verified fact:** that waiter samples every 250 ms and requires two consecutive distances within 0.05.
- **Historical fact:** #55 proved a stray-node-capture mechanism during the later background drag. That mechanism cannot cause a failure that occurs before the wheel/drag path begins.

Possible causes are continued camera movement, delayed rotation pause/effect application, null/stale graph samples, sparse frame progress, or broader page degradation. Capture every sample with page and harness timestamps, rotation state, camera state, and animation-frame cadence.

**Confidence:** low. Run 1 is the second Firefox `:225` combination failure, but its low-level error is not preserved; it must not automatically be labeled E2.

### Target F — Firefox UI chrome is absent at the 5 s visibility check

**Affected combination:** Firefox `smoke.spec.ts:78`, 2/10; only Run 7’s low-level detail is preserved.

- **Observed fact:** Run 7 does not find the “Show Axes” button within 5 s, before graph interaction.
- **Repository-verified fact:** the button is rendered by the client component alongside the graph.
- **Interpretation:** server/navigation delay, client bundle execution or hydration delay, browser startup/page degradation, and graph/WebGL initialization interaction all remain viable. One captured occurrence supports only low confidence.

**Discriminator:** correlate server request/response, navigation milestones, client script/hydration/component-mount markers, DOM insertion of the controls, page heartbeat, renderer/WebGL status, and lifecycle events. Continue diagnostic observation after the canonical 5 s mark to classify late mount versus terminal failure.

## Complete test×browser coverage

Low-level signatures below are limited to Runs 6–10. “Unknown earlier detail” is intentional rather than an inferred signature.

| Test×browser member | Frequency | Preserved low-level signature(s) | Strongest evidence / relevant path | Leading explanation | Confidence | Next discriminator |
|---|---:|---|---|---|---|---|
| Chromium `smoke.spec.ts:78` | **10/10** | B in Runs 6–10; Runs 1–5 detail absent | earlier ordinary axes/reset clicks complete; late Resume/Pause click never completes actionability | late-sequence degradation or rotation-toggle/state-specific instability | Low-moderate mechanism | per-click trace/timeline + trial click + rect/hit-test + heartbeats + forced diagnostic arm |
| Firefox `smoke.spec.ts:78` | **2/10** | F in Run 7; Run 4 detail absent | controls absent at initial 5 s visibility check | delayed startup/hydration or degraded page | Low | server/nav/hydration/mount timeline; extended observation |
| Chromium `matrix.spec.ts:135` | **2/10** | A in Run 10; Run 2 detail absent | post-enable wheel delta ≈ 0 | event/control/update/observation chain interrupted | Low | wheel path + controls + camera-per-frame telemetry |
| Firefox `matrix.spec.ts:135` | **8/10** | D in Runs 6, 7, 8, 10; Runs 1–4 detail absent | first graph snapshot already has controls enabled | delayed first observation relative to 4 s timer | Moderate | mount/handle/timer/probe timestamps; delay control |
| Chromium `matrix.spec.ts:195` | **6/10** | A in Runs 6, 7, 9, 10; Runs 2, 5 detail absent | wheel-out distance unchanged through 5 s | event/control/update/observation interruption | Low-moderate | same Target A classifier |
| Chromium `matrix.spec.ts:225` | **9/10** | A in Runs 7–10; Runs 1–5 detail absent | wheel-in fails before background drag in detailed runs | same Target A family; #55 drag mechanism irrelevant to these detailed failures | Low-moderate | same Target A classifier |
| Firefox `matrix.spec.ts:225` | **2/10** | E2 in Run 9; Run 1 detail absent | 15 s settle precondition fails before wheel/drag | camera/rotation/sample progress does not settle | Low | distance, rotation, rAF, sample timeline |
| Firefox `matrix.spec.ts:314` | **2/10** | E1 in Run 6; Run 4 detail absent | node click/fix registers, then camera motion remains zero | transition invocation/progress/observation failure | Low-moderate | click→fix→cameraPosition→frame timeline |
| Chromium `matrix.spec.ts:572` | **9/10** | C in Runs 6–10: four bare timeouts, one `ERR_ABORTED`; Runs 1–3, 5 detail absent | second navigation fails after first page/handle succeeds | crash, cancellation, request, or broader lifecycle degradation | Low | independent timeouts + crash/frame/network/server/process telemetry |

## Historical transfer

| Prior evidence | Correct relationship to #61 | What transfers | What does not transfer |
|---|---|---|---|
| **#11 — two-engine/software-rendering qualification contract** | **Environment and gate-contract context** | Establishes Chromium SwiftShader as the deterministic software-rendered enforcement path, Firefox as a separately qualified local engine, and software-rendering timing as a known harness constraint | It predates #61 and does not establish any 22-worker mechanism or renderer for the #61 Firefox runs |
| **#44 — verified Chromium native-GPU lane** | **Renderer-control method and serial performance context** | Establishes probe-before-suite renderer verification, a strict no-silent-fallback contract, and a same-host historical ~6× serial SwiftShader→hardware speed difference | It was Chromium-only and serial; it is not a 22-worker causal control and the lane is never the canonical green gate |
| **#52 — verified two-engine native-GPU lane** | **Two-engine renderer-verification contract** | Establishes how to verify both Chromium and Firefox hardware renderers and recorded four green serial two-engine hardware runs | It was serial, not 22 workers; its then-known Firefox drag flake was later separately root-caused/fixed by #55 |
| **#41 — SwiftShader parallel qualification** | **Strong corroboration of the same high-parallel combination family** | At 10 workers, all three SwiftShader-parallel runs failed 4–5 Chromium tests; the recurring set included current A/B/C combinations | It did not instrument the exact downstream mechanisms and does not prove CPU starvation for every #61 signature |
| **#56 — native-GPU parallel default** | **Renderer-path counterevidence at 10 workers** | After #55, verified native-GPU two-engine runs were green 3/3 at 10 workers, supporting renderer/load sensitivity | It is not a same-topology 22-worker control; whether the 20-core and 24-logical-CPU records are the same physical host is not established |
| **#33 — enable-delay race** | **Related timing invariant, different proven failure** | It established the 4 s timer and the danger of waiting on unrelated camera settle before evaluating it | #61 D occurs at the earliest returned handle; delayed observability is plausible but still unmeasured |
| **#34 — click-to-focus** | **Similar test family/symptoms only for E1** | Hover/raycast and deferred-click timing are known sensitive points | Preserved Run 6 already passed click registration, so the original no-registration mechanism is not sufficient |
| **#55 — Firefox background drag** | **Contradicted as an explanation for preserved E2** | It proves fixed screen coordinates can capture a node during the drag and disable Trackball controls | Run 9 fails before wheel/drag; reusing #55’s mechanism here would be a category error |

## Cross-cutting conclusions

### One root cause, layered precursor, or independent causes?

**Answer:** a **layered common precursor with several downstream mechanisms** is the best current working model, at **moderate confidence**, not an established root cause.

- A common precursor is favored by the recurrence, the tight Chromium cluster, and the #41/#56 renderer-history contrast.
- Multiple downstream mechanisms are required because a lost/late wheel transition, a 120 s actionability wait, an aborted navigation, an already-fired timer, and absent UI are not the same state transition.
- A mixed model remains open: Chromium A/B/C may be load-amplified while one or more low-frequency Firefox D/E/F paths are independent startup/observability races that merely co-occur at 22 workers.
- Only matched worker-count, engine-mix, renderer, and targeted co-load controls can distinguish that mixed model from a truly shared precursor.

### Renderer specificity

- Chromium A/B/C are the most plausible SwiftShader-amplified branch because Chromium is explicitly forced to CPU-only SwiftShader and dominates the failure count.
- Firefox D/E/F can arise from whole-host pressure imposed by co-running Chromium even if Firefox uses hardware rendering. They can also arise from Firefox’s own unknown renderer path.
- Every follow-up run must record the effective WebGL renderer for every engine. A config preference is not renderer evidence.

### Timeout semantics

A longer diagnostic window should **classify**, not silently redefine success:

- At 5/10/15 s, record the canonical failure outcome.
- Continue telemetry to 30 s for A/E/F and beyond the 120 s boundary for B/C in a diagnostic copy with an independent outer timeout.
- Distinguish: event/state succeeds late; event arrives but state never changes; sampling stalls; page/browser terminates; request/navigation is canceled.

For Target B, 120 s is already so long that “just add time” has low information unless paired with heartbeat and actionability-state evidence.

### Meaning of the closed set

“No new members after Run 5” establishes repeatable concentration on this host, suite, worker count, and date. It does not establish:

- that the six low-level signatures were the only signatures in Runs 1–5;
- that another host/renderer/worker count cannot expose other failures;
- that each recurring combination always fails for the same low-level reason;
- or that all nine members share one mechanism.

## Prioritized Research→EXPERIMENT program

### Priority 0 — Recover existing retained artifacts before rerunning

Check whether the issue #61 work directory or archived results still contain `trace.zip`, video, screenshots, browser stderr, or `test-results` for Runs 6–10. The config was set to retain these on failure, but the issue does not reference them. If present, analyze them first; if absent, record that explicitly. This is near-zero cost and may answer actionability or lifecycle questions without perturbing the system.

### Experiment 1 — Instrument the known 22-worker failure condition

**Hypothesis tested:** one high-parallel precursor exposes several classifiable downstream failures; instrumentation can identify the first missing transition for A–F.

**Manipulated variable:** diagnostic instrumentation off versus on. Do not change worker count, renderer, test selection, canonical assertions, or canonical deadline markers.

**Staged design:**

1. **1A — passive replay:** enable only low-overhead renderer, lifecycle, heartbeat, process/host-pressure, server-timing, and active-worker-count telemetry. Do not enable per-frame camera/DOM sampling yet.
2. **1B — focused probes:** after 1A confirms recurrence and bounds observer effect, enable one signature-specific probe family at a time on the affected page(s). The table below is a probe catalog, **not** a requirement to activate every signal in every full-suite run. Extend the existing `installGraphProbe` signals (`controlsEnabled`, graph state, and WebGL-context loss) rather than duplicating them.

**Controls:**

- five matched uninstrumented `E2E_WORKERS=22` runs and five passive-instrumented runs on the same host;
- strict `U-I-U-I-U-I-U-I-U-I` interleaving, with background load and thermal state recorded, to make observer-effect and drift comparison reproducible;
- each focused 1B probe is compared against the qualified passive arm before another probe family is added;
- verified renderer record for every page in every arm.

**Targets:** all nine combinations, with emphasis on the 10/10 and 9/10 Chromium core and 8/10 Firefox D.

**Instrumentation/artifacts:**

| Signature | Required signals |
|---|---|
| A | capture-phase wheel event count, target/composed path, deltas, `defaultPrevented`; `elementFromPoint`; controls enabled; control start/change/end; camera per animation frame; graph-probe and Playwright-poll timestamps |
| B | Playwright trace; `trial:true` actionability probe; per-frame and timer-sampled bounding boxes/computed state; hit-test target; DOM mutations; rAF/timer heartbeat; diagnostic force/direct-click result after canonical marker |
| C | page crash/close, browser disconnect, frame attach/detach, request/response/requestfailed, server timing, WebGL lost/restored, browser stderr/crashpad, process exit, kernel OOM evidence; independent navigation/test deadlines |
| D | navigation/load, component mount, graph-handle-ready, timer scheduled/fired, controls transition, every harness probe timestamp |
| E1 | hover commit, pointerup, click callback, fixed-node transition, camera-transition invocation, per-frame camera coordinates, probe reads |
| E2 | every settle sample with page/harness timestamps, rotation state, camera distance, rAF cadence, null-read count |
| F | server response, DOMContentLoaded/load, client script/hydration/component mount, control insertion, page heartbeat, WebGL/lifecycle state |
| Cross-cutting | timestamped active-test/worker-count timeline, process tree, `pidstat`/`vmstat` or equivalent, `/proc/pressure` where available, memory/swap, kernel OOM evidence, server CPU/latency, renderer strings, traces/videos/screenshots |

**Predictions:**

- Layered model: failures share host pressure but diverge at different first-missing transitions.
- Single page-death model: A/B/C failures correlate with lost heartbeats or lifecycle events.
- Pure observation-budget model: events/state transitions occur, but only after canonical markers.

**Falsification/decision criteria:**

- If instrumentation suppresses the core failures, reduce to progressively smaller probes until recurrence returns; do not infer mechanism from a non-reproducing instrumented run.
- If at least three occurrences of a signature show the same first missing transition, promote that transition to the leading mechanism and proceed to the relevant control.
- If occurrences split, retain multiple mechanism branches rather than averaging them into “timing.”

**Repetitions:** 5 uninstrumented + 5 passive-instrumented for the high-frequency core. Low-frequency Firefox targets continue in later targeted co-load arms until three classified recurrences or **15 clean repetitions**, whichever occurs first; 10 clean trials would still miss a true 2/10 recurrence rate about 10.7% of the time and is only a screen, not exclusion evidence.

**Cost/order:** medium; **first**, because the current condition is already 10/10 red and maximizes information per new run.

**Stop/go:** go to Experiment 2 once the core remains reproducible with acceptable observer effect. If existing artifacts already classify a signature, skip redundant instrumentation for that signature.

### Experiment 2 — Same-host SwiftShader versus verified native GPU at 22 workers

**Hypothesis tested:** Chromium SwiftShader is the dominant amplifier rather than worker/process count alone.

**Manipulated variable:** Chromium renderer path only: default SwiftShader versus the existing verified native-GPU lane. This is a diagnostic arm under the #44/#52 contract; it does not replace or redefine the canonical SwiftShader gate.

**Controls:** same host, suite, 22-worker value, engine mix, passive instrumentation, server build, and test revision. Run strict `SwiftShader-GPU` alternation for five pairs, recording thermal/background-load drift. Verify renderer strings on every run. If native GPU cannot be verified on the same host, stop this branch and label any cross-host comparison corroborative only; do not use it to decide renderer causality.

**Targets:** A/B/C and all Firefox signatures as whole-host spillover indicators.

**Artifacts:** Experiment 1 signals plus host pressure metrics.

**Predictions:**

- SwiftShader-amplifier model: A/B/C rates and host CPU pressure drop sharply on native GPU; Firefox D/E/F may also improve because Chromium no longer consumes equivalent CPU rendering capacity.
- Process-count or non-renderer model: failure rates remain similar despite renderer change.
- Memory/browser-limit model: renderer change may not help, or lifecycle/memory signals dominate both arms.

**Falsification/decision criterion:** five GPU runs that reproduce the same core at rates comparable to five SwiftShader runs would refute “SwiftShader is the decisive amplifier.” Five clean GPU runs against ≥4/5 recurrence per core signature would strongly support renderer-path causality, but exact CPU-scheduler causality would still require the telemetry correlation.

**Repetitions:** 5 per arm, alternating; more only if outcomes are mixed.

**Cost/order:** medium and hardware-dependent; **second**.

**Stop/go:** if the GPU arm is clean and host pressure drops, focus subsequent mechanism work on SwiftShader/load interaction. If both arms fail, prioritize process/memory/server and test-local branches.

### Experiment 3 — Targeted co-load and engine-source isolation

**Hypothesis tested:** a target fails because of concurrent WebGL/browser load, and the source/amount of that load matters.

**Important design constraint:** selecting one test while setting `E2E_WORKERS=22` still runs only one active test worker. Likewise, each engine project has only 11 tests, so an engine-only run cannot create 22 simultaneously active test tasks without repeats or a diagnostic load manifest. Record actual concurrency rather than the configured maximum.

**Manipulated variables:**

- target alone;
- target plus controlled Chromium-SwiftShader WebGL co-load;
- target plus equivalent verified-native Chromium co-load;
- target plus Firefox WebGL co-load;
- optionally, target plus calibrated non-WebGL CPU load if renderer versus scheduler pressure remains ambiguous;
- co-load count staged at 0, 5, 10, and 21.

Use dedicated diagnostic co-load tests with an explicit synchronization barrier: load workers signal ready, remain on continuously rendering WebGL pages until the target signals completion, and outlive the target's full canonical/diagnostic observation window by a fixed margin. Record worker/test start-stop timestamps and active-process counts; reject any run whose predeclared overlap threshold is not met. `repeat-each` may generate enough tasks, but it is not overlap evidence by itself because copies can finish asynchronously and identical-test load differs from a diverse suite.

**Controls:** target browser/renderer, target code, viewport, server, passive instrumentation, critical-window duration, and verified active-overlap profile fixed across arms; vary only co-load source/count in a comparison.

**Targets:** Chromium `smoke:78`, Chromium `matrix:195` or `:225`, Chromium `matrix:572`, and Firefox `matrix:135`; add E1/E2/F once a low-frequency reproduction arm is found.

**Predictions:**

- SwiftShader spillover: Firefox D rises primarily with Chromium-SwiftShader co-load, not Firefox/native co-load at the same count.
- Generic worker/process pressure: all high-count co-loads behave similarly.
- Test-local race: target fails alone at comparable rate.
- WebGL-context-count effect: WebGL co-load matters more than CPU-only load with similar measured CPU pressure.

**Falsification/decision criterion:** reproducing with the same classified mechanism **alone** refutes “co-load is necessary” and favors a test-local branch. Remaining clean under one proposed load while reproducing under a different verified-overlap load refutes only the first load-source hypothesis and favors generic or alternate-source pressure. A ≥3/5 screening differential promotes an arm for confirmation; mixed results require more samples, not a binary claim.

**Repetitions:** screen 5 per arm; extend informative high-frequency boundary arms to 10. For rare targets, stop after three classified failures or **15 clean verified-overlap repetitions**.

**Cost/order:** medium-high; **third**, after reusable instrumentation exists.

**Stop/go:** the cheapest arm that reliably reproduces a signature becomes its targeted mechanism harness and replaces expensive full-suite reruns.

### Experiment 4 — Adaptive worker-threshold ladder

**Hypothesis tested:** signatures have load-dependent onset curves rather than a single all-at-once threshold.

**Manipulated variable:** worker/concurrency level.

**Design:**

- Full two-engine suite screening at workers `1, 4, 8, 11, 16, 22`.
- Three repetitions per point initially, explicitly as a **screen** for the high-frequency core; absence of a 2/10 tail in three runs is not exclusion evidence.
- When a signature changes from absent to present, add the nearest useful midpoint and run five repetitions at each bracketing point; low-frequency signatures use the 15-clean/three-classified rule from Experiment 3 before an absence claim.
- Record actual peak active workers and engine roster; do not assume configured workers equals concurrent active tests.
- Engine-only ladders stop naturally at 11 distinct project tests. Use Experiment 3’s repeated/co-load manifest for higher same-engine concurrency.

**Controls:** renderer and instrumentation fixed; one serial anchor per engine.

**Targets:** all signatures, analyzed separately rather than only total failures.

**Predictions:**

- Layered model: different signatures have different onset bands; Chromium A/B/C appear at lower measured pressure than rare Firefox tails.
- Single hard resource limit: several signatures rise together at the same pressure threshold and share lifecycle/host signals.
- Baseline test-local race: a signature occurs at workers 1 with the same low-level mechanism.

**Falsification/decision criterion:** any signature that reproduces at workers 1 with the same classified mechanism cannot be attributed solely to parallel contention. Identical onset and telemetry for all signatures would weaken the multiple-downstream-mechanism model.

**Cost/order:** high if run exhaustively, so **fourth and adaptive**, not a fixed 63-run grid.

**Stop/go:** stop descending once two consecutive lower points are clean for the signature and a serial control is clean; stop ascending once a stable reproduction harness has been found.

### Experiment 5 — Observation-budget and timer controls

**Hypothesis tested:** selected failures are late successes rather than permanently lost state, and Target D is an observation/timer-ordering failure.

**Manipulated variables:** diagnostic observation window; for D only, enable delay `4 s / 8 s / 16 s` in an experiment-specific arm.

**Controls:** retain and report the canonical 5/10/15/120 s outcome even while the diagnostic copy continues observing. Do not replace the canonical result with the extended result.

**Targets:** A, D, E1, E2, F; B/C only with an independent outer timeout and lifecycle heartbeat.

**Predictions:**

- Late-success branch: expected event/state is present after the canonical marker with a live page and continuous timeline.
- Lost-event/state branch: event or transition is absent through the extended window while the page remains live.
- Lifecycle-loss branch: heartbeats/evaluations terminate and lifecycle evidence identifies why.
- D observation-order branch: handle-ready and timer timestamps show the harness first observes after enablement; increasing enable delay moves the failure boundary predictably.

**Falsification/decision criterion:** a 16 s enable delay that still yields controls enabled before the recorded timer callback refutes delayed observation. An event present with no state change through the extended window refutes “only a short timeout.”

**Repetitions:** 5 per high-frequency target/arm; up to 15 for low-frequency targets, using three classified failures or 15 clean trials as the decision boundary.

**Cost/order:** low-medium once Experiment 1 telemetry exists; run in parallel with Experiments 2–3 where practical.

### Experiment 6 — Scheduling, CPU, and memory controls only if ambiguity remains

**Hypothesis tested:** scheduler pressure, rather than renderer/WebGL context count or memory pressure, is the remaining common precursor.

**Manipulated variable:** one at a time—CPU affinity/cgroup quota, calibrated external CPU load, or controlled memory pressure. Never change worker count, renderer, and affinity in the same comparison.

**Controls:** matched no-affinity/no-external-load arm with the same target/co-load manifest.

**Predictions:** scheduler hypothesis predicts signature rate follows measured runnable pressure even when WebGL context count is held constant. Memory hypothesis predicts failures correlate with RSS/pressure/OOM/lifecycle signals instead.

**Falsification/decision criterion:** no signature or timing response to a large measured scheduler-pressure change weakens the scheduler hypothesis. Do not run destructive stress or induce host instability; keep loads bounded and reversible.

**Cost/order:** optional and last. Experiments 1–5 should usually make this unnecessary.

### Program-wide stop criteria

Do **not** run every experiment mechanically. Stop the broad program and hand off to a mechanism-specific fix/qualification effort when both conditions hold for the high-frequency core (A/B/C and Firefox D):

1. the first missing transition or terminal lifecycle event is reproduced at least three times with acceptable observer effect; and
2. one controlled factor (renderer, measured concurrency/load source, server path, or test-local reproduction) changes that classified mechanism in the predicted direction.

Examples: if passive telemetry shows the same crash/OOM event precedes A/B/C, skip redundant event-specific deep probes and confirm the lifecycle factor; if a signature reproduces at workers 1 with the same transition, stop attributing it solely to parallel contention; if GPU and SwiftShader arms are equivalent, stop the renderer branch. Low-frequency tails may be split into separate follow-up experiments rather than holding the core diagnosis open indefinitely.

## Conditional ownership after experiments

| Evidence outcome | Likely primary ownership | Why |
|---|---|---|
| SwiftShader arm fails, same-host GPU arm is clean, host CPU pressure tracks failures | environment/configuration plus renderer-path test design | renderer-specific load is causal precursor |
| Wheel reaches intended target, controls enabled, but no update/change occurs | browser/library/render-loop or app integration | event delivery succeeded; downstream update path failed |
| Wheel never reaches capture listener only under co-load | Playwright/browser input pipeline or harness targeting | input transition is first missing stage |
| Button rect/hit target is stable and page live, but ordinary actionability alone cannot finish | Playwright/harness contract | app element is usable outside ordinary actionability |
| Button genuinely moves, detaches, or is obscured | app/layout/test sequencing | actionability correctly blocks |
| `crash`/disconnect/OOM precedes navigation abort | browser/environment | lifecycle loss is established |
| Server request is absent/slow/failing with live browser | server/load path | navigation failure is upstream of renderer |
| Handle was ready before 4 s but harness first read occurs after timer | harness/observation design | app state existed; controller could not observe it in budget |
| Controls become true before the scheduled callback | app state/lifecycle | application invariant is violated |
| E1 click and transition invoke correctly but camera never advances | render/tween/browser integration | click registration is not the failing stage |

No owner should be selected from the current logs alone.

## Disagreements and resolution

The three independent investigations agreed on the layered model but differed materially in confidence and mechanism. The synthesis resolves them as follows:

1. **“CPU starvation is established” versus “contention is unmeasured.”** Gemini and Claude often described scheduler starvation as the cause; Codex kept it as an inference. **Resolution:** historical evidence makes high-parallel/renderer pressure a strong precursor, but exact CPU starvation remains **low confidence** until host/process telemetry exists.
2. **Exact process counts.** One report estimated a fixed total near 67 processes; another implied exactly 22 browser/renderer pipelines. **Resolution:** reject fixed counts. Playwright documents up to 22 independent worker/browser workloads; browser subprocess/thread topology must be measured.
3. **Target A exact-zero meaning.** One report treated exact zero as eliminating gradual starvation and proving a binary gate. **Resolution:** exact zero proves no observed movement in-budget, but a delayed update, controls gate, or stale frame remains possible.
4. **Target B’s specific failed actionability check.** Reports emphasized stability/rAF. **Resolution:** Playwright’s combined log does not identify the one false check. Stability is plausible, not proven; capture all actionability dimensions.
5. **Target C crash versus teardown.** Claude favored renderer/resource crash; Gemini favored timeout teardown; Codex left both open. **Resolution:** neither is supported by the generic abort alone. Independent deadlines and lifecycle/network evidence are mandatory.
6. **Target D certainty.** Two reports called delayed observability effectively confirmed. **Resolution:** it is the strongest hypothesis, but page-internal mount/handle/timer/probe timestamps are absent, so confidence is **moderate**, not established.
7. **Target E1 and #34.** One report called it the same #34 mechanism amplified; another called it similar only. **Resolution:** preserved Run 6 already passed click registration, so the original hover-not-committed/no-registration mechanism is insufficient. Treat it as related history, not established identity.
8. **Experiment ordering.** Suggested first steps ranged from a full worker ladder to renderer control. **Resolution:** instrument the existing 10/10-red condition first, then perform a same-host renderer control, then use targeted co-load and an adaptive—not exhaustive—ladder.
9. **Frequency discrepancies.** Some reports could not access the issue and left low-frequency counts unknown; one report supplied the exact table. **Resolution:** use issue #61’s canonical tally and explicitly separate combination frequency from low-level signature frequency.

## Gaps and limitations

- No direct CPU run-queue, per-process CPU, pressure-stall, memory, OOM, renderer, browser stderr, or server latency data from issue #61.
- Firefox renderer is unknown.
- Runs 1–5 lack full error detail, preventing exact ten-run signature frequencies.
- Existing #41 and #56 controls use 10 workers on a WSL2 environment reported as 20-core, whereas #61 reports 24 logical CPUs and 27 GiB. Whether these records describe the same physical machine under different WSL resource settings is not established; either way, they are not a matched 22-worker factor test.
- Instrumentation can perturb timing. Every experiment needs matched controls and explicit observer-effect handling.
- Playwright/browser/library behavior is version-sensitive. This report ties repository claims to Playwright `1.61.1`, Three.js `0.185.1`, `react-force-graph-3d` `1.29.1`, and `three-render-objects` `1.42.0`.
- A finite closed set on one host does not establish generality across hardware, OS, browser revisions, renderer paths, or worker schedules.

## Recommendation

Do not implement retries, longer canonical waits, forced-click replacements, serial annotations, or app changes from the current evidence. Execute Experiments 1 and 2 first. They should determine whether the dominant branch is:

- live-but-late event/control progress under SwiftShader load;
- Playwright actionability specifically;
- page/browser lifecycle loss;
- server/navigation failure;
- or a mixture.

Then use Experiment 3 to obtain cheap targeted reproductions and Experiment 4 only to locate the relevant onset bands. A fix proposal is justified only after the first missing transition and its causal load factor are both reproduced.

## Sources

All external sources accessed 2026-07-25.

### Project evidence

- [Issue #61 — 22-worker raw dataset](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/61)
- [Issue #11 — dependency/two-engine qualification](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/11)
- [Issue #44 — verified Chromium native-GPU lane](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/44)
- [Issue #52 — verified two-engine native-GPU lane](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/52)
- [Issue #33 — enable-delay race](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/33)
- [Issue #34 — click-to-focus timing](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/34)
- [Issue #41 — local parallel qualification](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/41)
- [Issue #55 — background-drag root cause](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/55)
- [Issue #56 — native-GPU parallel lane](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/56)
- `playwright.config.ts`
- `scripts/e2e-workers.mjs`
- `tests/e2e/smoke.spec.ts`
- `tests/e2e/matrix.spec.ts`
- `tests/e2e/graph-handle.ts`
- `tests/e2e/pointer.ts`
- `app/components/FocusGraph.tsx`
- `app/components/focusGraphResources.ts`
- `codev/reviews/11-upgrade-and-behaviorally-quali.md`
- `codev/reviews/44-add-an-opt-in-native-gpu-local.md`
- `codev/reviews/52-firefox-hardware-webgl-gpu-lane.md`
- `codev/reviews/41-parallelize-local-e2e-runs.md`
- `codev/reviews/55-firefox-background-drag-flake.md`
- `codev/reviews/56-gpu-lane-parallel-default.md`

### Primary external references

- [Playwright actionability](https://playwright.dev/docs/actionability)
- [Playwright `locator.click`](https://playwright.dev/docs/api/class-locator#locator-click)
- [Playwright Mouse API](https://playwright.dev/docs/api/class-mouse)
- [Playwright Page API](https://playwright.dev/docs/api/class-page)
- [Playwright parallelism and worker processes](https://playwright.dev/docs/test-parallel)
- [Playwright v1.61.1 source tag](https://github.com/microsoft/playwright/tree/v1.61.1)
- [Chromium SwiftShader documentation](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)
- [Chromium network error definitions (`ERR_ABORTED`)](https://chromium.googlesource.com/chromium/src/+/main/net/base/net_error_list.h)
- [Three.js r185 `TrackballControls` source](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/controls/TrackballControls.js)
- [`three-render-objects@1.42.0` distribution source](https://unpkg.com/three-render-objects@1.42.0/dist/three-render-objects.mjs)
- [MDN `webglcontextlost`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)

## Changes from critique

Three independent critiques found complete A–F and nine-row coverage, then pressure-tested confidence, history, and experiment design. The final report changed as follows:

- downgraded the common-precursor and Target D claims from moderate-high to **moderate**, and exact CPU starvation to **low**;
- added memory/swap/OOM as an explicit low-confidence candidate while preserving the absence of direct memory or kernel evidence;
- added the Target B within-test differential: three earlier ordinary clicks complete before the late rotation-toggle actionability hang;
- added #11, #44, and #52 to historical transfer, and corrected the unsupported claim that #41/#56 necessarily ran on a different physical host;
- split Experiment 1 into passive and focused instrumentation tiers, balanced it at five uninstrumented/five instrumented runs with fixed interleaving, and reused existing graph-probe signals;
- required synchronized, measured co-load overlap; raised rare-target clean evidence from 10 to 15 repetitions; clarified screening versus confirmation; added same-host-GPU failure and program-wide stop branches;
- added explicit active-worker/process timelines and a version-pinned Playwright source reference.

Rejected critique is documented in `e2e-instability-at-e2e-workers-critique-rebuttals.md`. Most importantly, the report does **not** assert a default WSL2 memory cap or connect Run 10's `ERR_ABORTED` directly to an OOM kill, because issue #61 captured neither `.wslconfig`/guest-limit evidence nor kernel OOM evidence. It also retains low-overhead observability before an exhaustive worker ladder: raw pass/fail factor screens cannot classify the first missing transition, while the ladder remains adaptive after observer effect is bounded.
