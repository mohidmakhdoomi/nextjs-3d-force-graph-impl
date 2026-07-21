import {expect, test} from "@playwright/test";
import process from "node:process";
import {
    cameraDelta,
    expectCleanErrorBudget,
    openGraphPage,
    ensureRotationPaused,
    pickNodeScreenPoint,
    readGraphSnapshot,
    sampleCameraMotion,
    waitForGraphHandle,
    waitForSizedCanvas,
    waitForStableCameraDistance,
    type GraphSnapshot,
} from "./graph-handle";
import {settleHoverThenClick} from "./pointer";

// Camera-position deltas: rotation moved the camera ~440 units per 0.8 s in
// prior qualifications, while a paused camera measured exactly 0. The floor
// and epsilon sit orders of magnitude inside both observations.
const MOTION_FLOOR = 1;
const STILL_EPSILON = 0.05;
const ZOOM_EPSILON = 0.5;

// Ceiling for "the input moved the camera" settle polls. Local hardware
// registers wheel/drag/reset motion within ~5 s, but GitHub Actions runners
// render this scene through a software rasterizer (SwiftShader/llvmpipe) with
// no GPU, so a single frame can take far longer and the motion lands later.
// Give CI generous headroom without changing the local qualification timing.
const SETTLE_TIMEOUT_MS = process.env.CI ? 20_000 : 5_000;

// The app enables pointer navigation ENABLE_DELAY_MS after component mount
// (FocusGraph's `enableDelay` default). Inertness is proven against a floor just
// below that boundary: a setTimeout(ENABLE_DELAY_MS) scheduled no earlier than
// `navigationStart` cannot fire before ENABLE_DELAY_MS of wall-clock elapse, so
// enablement is always observed >= ENABLE_DELAY_MS after navigation and any
// floor < ENABLE_DELAY_MS is race-free — unlike gating the check on a
// camera-settle waiter, which has no ordering relationship to the timer and on
// the Firefox software-WebGL local gate finishes only ~0.8 s before enablement
// (issue #33).
//
// `navigationStart` is the tightest race-free anchor available to the harness:
// the timer is scheduled in the mount effect (~0.7 s after navigation here), and
// that instant is not observable through the canvas-gated probe (the canvas —
// and thus every snapshot — first appears ~2.7 s in, AFTER scheduling, and any
// canvas-relative anchor races the timer). The mount offset is therefore folded
// into the measurement, so the FLOOR margin is kept small (500 ms) to still trip
// on a delay materially shorter than 4000 ms; a regression within ~0.7 s of the
// boundary is beyond what a from-navigation floor can resolve without adding
// test-only instrumentation to app code.
const ENABLE_DELAY_MS = 4000;
const INERT_FLOOR_MS = ENABLE_DELAY_MS - 500;

async function snapshotOrFail(page: Parameters<typeof readGraphSnapshot>[0]): Promise<GraphSnapshot> {
    const snapshot = await readGraphSnapshot(page);
    expect(snapshot, "graph handle should stay reachable").not.toBeNull();
    return snapshot as GraphSnapshot;
}

async function waitForPointerEnablement(
    page: Parameters<typeof readGraphSnapshot>[0],
): Promise<void> {
    await expect
        .poll(
            async () => (await readGraphSnapshot(page))?.controlsEnabled ?? false,
            {
                message:
                    "expected navigation controls to enable after the configured delay",
                timeout: 20_000,
            },
        )
        .toBe(true);
}

test("settles an initial force layout with positioned nodes", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);

    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return (
                    snapshot !== null &&
                    snapshot.sceneNodeCount > 100 &&
                    snapshot.positionedNodeCount === snapshot.sceneNodeCount &&
                    snapshot.layoutSpread > 0
                );
            },
            {
                message:
                    "expected every scene node to hold numeric coordinates with a nonzero layout spread",
                timeout: 30_000,
            },
        )
        .toBe(true);

    const snapshot = await snapshotOrFail(page);
    expect(snapshot.contextLostCount).toBe(0);
    expectCleanErrorBudget(errors);
});

test("rotates the camera automatically until paused, then resumes", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);

    const rotatingDelta = await sampleCameraMotion(page, 800);
    expect(
        rotatingDelta,
        "auto-rotation should move the camera",
    ).toBeGreaterThan(MOTION_FLOOR);

    await ensureRotationPaused(page);
    await page.waitForTimeout(300);
    const pausedDelta = await sampleCameraMotion(page, 800);
    expect(pausedDelta, "a paused camera should hold still").toBeLessThan(
        STILL_EPSILON,
    );

    await page
        .getByRole("button", {name: "Resume Auto Rotation", exact: true})
        .click();
    const resumedDelta = await sampleCameraMotion(page, 800);
    expect(
        resumedDelta,
        "resuming should restart camera motion",
    ).toBeGreaterThan(MOTION_FLOOR);

    expectCleanErrorBudget(errors);
});

test("keeps pointer navigation inert until the enable delay elapses", async ({page}) => {
    // Reference for the enable-latency floor below. Captured before navigation
    // so it precedes the mount that schedules the enable timer — the timer can
    // then only fire at least ENABLE_DELAY_MS after this instant.
    const navigationStart = Date.now();
    const errors = await openGraphPage(page);

    // Reach the imperative handle as early as possible — the enable timer
    // starts at component mount and runs 4000 ms. Observing controls disabled
    // here proves they do not start enabled.
    const early = await waitForGraphHandle(page);
    expect(
        early.controlsEnabled,
        "navigation controls should start disabled",
    ).toBe(false);

    // Real input cannot be *delivered* inside the pre-enablement window in
    // this environment: SwiftShader plus force-engine warmup saturates the
    // main thread, and a measured wheel dispatch blocked ~6 s — past the
    // 4 s enable delay (recorded qualification evidence). The inert-before
    // half is therefore verified by timing: controls start disabled (asserted
    // above) and do not enable until the delay elapses, and real input is
    // exercised immediately after enablement.
    //
    // The enable latency is measured from `navigationStart` rather than gated
    // on a camera-settle waiter: camera placement has no ordering relationship
    // to the enable timer, so gating on it raced the boundary and spuriously
    // observed controls already enabled (issue #33). A floor below the delay is
    // race-free (the timer cannot fire that early) yet still fails on premature
    // enablement — the invariant `enableLatencyMs >= INERT_FLOOR_MS` means the
    // controls stayed inert across the whole `[0, INERT_FLOOR_MS)` window.
    await waitForPointerEnablement(page);
    const enableLatencyMs = Date.now() - navigationStart;
    expect(
        enableLatencyMs,
        "navigation controls must stay inert until the enable delay elapses",
    ).toBeGreaterThanOrEqual(INERT_FLOOR_MS);

    // The same real input must work once enabled.
    const beforeZoom = await waitForStableCameraDistance(page);
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -240);
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return snapshot === null
                    ? 0
                    : Math.abs(snapshot.cameraDistance - beforeZoom.cameraDistance);
            },
            {
                message: "wheel input after enablement should zoom the camera",
                timeout: SETTLE_TIMEOUT_MS,
            },
        )
        .toBeGreaterThan(ZOOM_EPSILON);

    expectCleanErrorBudget(errors);
});

test("zooms out with the wheel", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await waitForPointerEnablement(page);
    await ensureRotationPaused(page);
    await page.waitForTimeout(300);

    // Each wheel direction is verified from its own virgin settled state (a
    // fresh page per direction): back-to-back opposite wheels interact
    // through the Trackball's internal zoom state and are not the semantic
    // the matrix qualifies.
    const start = await waitForStableCameraDistance(page);
    expect(start.noPan, "Trackball pan should remain disabled").toBe(true);

    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, 240);
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return snapshot === null ? 0 : snapshot.cameraDistance;
            },
            {message: "wheel up should zoom the camera out", timeout: SETTLE_TIMEOUT_MS},
        )
        .toBeGreaterThan(start.cameraDistance + ZOOM_EPSILON);

    expectCleanErrorBudget(errors);
});

test("zooms in with the wheel and rotates with a background drag", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await waitForPointerEnablement(page);
    await ensureRotationPaused(page);
    await page.waitForTimeout(300);

    const start = await waitForStableCameraDistance(page);
    await page.mouse.move(400, 300);
    await page.mouse.wheel(0, -240);
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return snapshot === null
                    ? Number.POSITIVE_INFINITY
                    : snapshot.cameraDistance;
            },
            {message: "wheel down should zoom the camera in", timeout: SETTLE_TIMEOUT_MS},
        )
        .toBeLessThan(start.cameraDistance - ZOOM_EPSILON);

    // Trackball rotation via a real background drag away from the controls.
    const beforeDrag = await waitForStableCameraDistance(page);
    await page.mouse.move(150, 450);
    await page.mouse.down();
    await page.mouse.move(450, 250, {steps: 12});
    await page.mouse.up();
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return snapshot === null ? 0 : cameraDelta(beforeDrag, snapshot);
            },
            {
                message: "a background drag should rotate the camera",
                timeout: SETTLE_TIMEOUT_MS,
            },
        )
        .toBeGreaterThan(MOTION_FLOOR);

    expectCleanErrorBudget(errors);
});

test("click-to-focus fixes the node, animates the camera, and reset restores the view", async ({page}) => {
    test.setTimeout(240_000);
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await waitForPointerEnablement(page);

    // At the default camera distance a 6-world-unit node projects to roughly
    // a two-pixel target, so zoom in close with real wheel input first until
    // nodes are realistically hittable. Rapid same-direction wheels
    // accumulate the Trackball's internal zoom offset until its per-frame
    // factor guard stops applying zoom at all (the camera freezes until the
    // offset decays), and per-deltaY effect differs by an order of magnitude
    // between engines — so the loop is adaptive: it detects a stalled burst
    // and pauses to let the internal state decay before continuing. Wheel
    // from a corner: while zooming through the rotating cloud, nodes sweep
    // under the pointer, and the hover pipeline can otherwise register a
    // stray node click that stops rotation and fixes a node prematurely.
    const zoomIntoClickRange = async () => {
        await page.mouse.move(60, 540);
        for (let burst = 0; burst < 60; burst += 1) {
            const before = await snapshotOrFail(page);
            if (before.cameraDistance < 450) {
                break;
            }
            await page.mouse.wheel(0, -2_400);
            await page.waitForTimeout(600);
            const after = await snapshotOrFail(page);
            if (before.cameraDistance - after.cameraDistance < 1) {
                await page.waitForTimeout(2_500);
            }
        }
        return waitForStableCameraDistance(page);
    };

    // The wheel path itself occasionally registers a stray node interaction
    // (observed in both engines) that fixes a node and stops rotation. The
    // aimed click below must be the sole cause of the fix it detects, so on
    // a stray, restart from a fresh page instead of aiming into a corrupted
    // state.
    let zoomed = await zoomIntoClickRange();
    for (let recovery = 0; recovery < 2; recovery += 1) {
        const state = await snapshotOrFail(page);
        if (state.fixedNodeCount === 0) {
            break;
        }
        const reload = await page.goto("/");
        expect(reload?.ok(), "recovery navigation should succeed").toBe(true);
        await waitForSizedCanvas(page);
        await waitForGraphHandle(page);
        await waitForPointerEnablement(page);
        zoomed = await zoomIntoClickRange();
    }
    expect(
        zoomed.cameraDistance,
        "wheel zoom should bring nodes into clickable range",
    ).toBeLessThan(700);

    // Aim at a stationary target: real clicks cannot land on an orbiting
    // projection in this environment — the click's decisive hover raycast
    // runs one render frame after pointerup, and the measured aim-to-raycast
    // latency under software rendering exceeds a close-up node's screen
    // radius even with velocity-led aiming (demonstrated across parked,
    // fresh-aim, and lead-swept strategies; recorded as qualification
    // evidence). Pausing first exercises the same registration/fix pipeline
    // a user does; the stop-rotation-on-click branch is covered by the
    // recorded scripted evidence instead.
    await ensureRotationPaused(page);
    await waitForStableCameraDistance(page);

    // The aimed click below must be the sole cause of the fix it detects.
    const preAim = await snapshotOrFail(page);
    expect(
        preAim.fixedNodeCount,
        "no node should be fixed before the aimed click",
    ).toBe(0);

    // A generous per-attempt registration window matters: the decisive click
    // resolution runs a render frame after pointerup, and dispatching the
    // next attempt's pointerdown would cancel a focus tween the previous
    // click already started.
    //
    // The click is issued hover-first (`settleHoverThenClick`): the library
    // resolves the hovered node only in the render loop's throttled raycast and
    // defers onClick a frame past pointerup, so under software WebGL a bare
    // click can resolve against a not-yet-committed hover and fix nothing. See
    // tests/e2e/pointer.ts for the mechanism (issue #34).
    let clickRegistered = false;
    let preClick: GraphSnapshot | null = null;
    for (let attempt = 0; attempt < 6 && !clickRegistered; attempt += 1) {
        const point = await pickNodeScreenPoint(page);
        if (point === null) {
            await page.waitForTimeout(300);
            continue;
        }

        preClick = await snapshotOrFail(page);
        await settleHoverThenClick(page, point.x, point.y);
        try {
            await expect
                .poll(
                    async () =>
                        (await readGraphSnapshot(page))?.fixedNodeCount ?? 0,
                    {timeout: 2_500},
                )
                .toBeGreaterThan(0);
            clickRegistered = true;
        } catch {
            clickRegistered = false;
        }
    }

    expect(
        clickRegistered,
        "a real node click should register and fix the node",
    ).toBe(true);

    // The camera animates toward the focused node over ~2 s; prove motion
    // relative to the pre-click position.
    const focusBaseline = preClick as GraphSnapshot;
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return snapshot === null
                    ? 0
                    : cameraDelta(focusBaseline, snapshot);
            },
            {
                message: "click-to-focus should move the camera toward the node",
                timeout: 10_000,
            },
        )
        .toBeGreaterThan(MOTION_FLOOR);

    // Reset: resume rotation first so the post-reset resume window applies.
    await page
        .getByRole("button", {name: "Resume Auto Rotation", exact: true})
        .click();
    const beforeReset = await snapshotOrFail(page);
    await page.getByRole("button", {name: "Reset Camera", exact: true}).click();
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                return snapshot === null ? 0 : cameraDelta(beforeReset, snapshot);
            },
            {message: "reset should run zoomToFit", timeout: SETTLE_TIMEOUT_MS},
        )
        .toBeGreaterThan(MOTION_FLOOR);

    // After the ~1 s reset window, active rotation resumes.
    await page.waitForTimeout(1_300);
    const postResetMotion = await sampleCameraMotion(page, 800);
    expect(
        postResetMotion,
        "rotation should resume after the reset window",
    ).toBeGreaterThan(MOTION_FLOOR);

    const finalSnapshot = await snapshotOrFail(page);
    expect(finalSnapshot.contextLostCount).toBe(0);
    expectCleanErrorBudget(errors);
});

test("toggles AxesHelper visibility through the axes control", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    const initial = await waitForGraphHandle(page);
    expect(initial.axesFound, "the AxesHelper should be attached").toBe(true);
    expect(initial.axesVisible, "axes should start hidden").toBe(false);

    await ensureRotationPaused(page);
    await page.getByRole("button", {name: "Show Axes", exact: true}).click();
    await expect
        .poll(
            async () => (await readGraphSnapshot(page))?.axesVisible ?? false,
            {
                message: "Show Axes should reveal the AxesHelper",
                timeout: 15_000,
            },
        )
        .toBe(true);

    await page.getByRole("button", {name: "Hide Axes", exact: true}).click();
    await expect
        .poll(
            async () => (await readGraphSnapshot(page))?.axesVisible ?? true,
            {
                message: "Hide Axes should conceal the AxesHelper",
                timeout: 15_000,
            },
        )
        .toBe(false);

    expectCleanErrorBudget(errors);
});

test("keeps the canvas consistent and interactive across a resize", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await ensureRotationPaused(page);

    // The app does not re-derive the renderer size from later window
    // resizes (canvas dimensions are fixed at mount), so the qualified
    // contract is consistency, not viewport tracking: CSS size,
    // backing-store size, and WebGL drawing buffer must stay nonzero and in
    // agreement with each other, with the graph still interactive.
    await page.setViewportSize({width: 1024, height: 768});
    await expect
        .poll(
            async () =>
                page.evaluate(() => {
                    const canvas = document.querySelector("canvas");
                    if (canvas === null) {
                        return false;
                    }

                    const bounds = canvas.getBoundingClientRect();
                    const webgl2 = canvas.getContext("webgl2");
                    const context = webgl2 ?? canvas.getContext("webgl");
                    return (
                        bounds.width > 0 &&
                        bounds.height > 0 &&
                        canvas.width > 0 &&
                        canvas.height > 0 &&
                        context !== null &&
                        context.drawingBufferWidth === canvas.width &&
                        context.drawingBufferHeight === canvas.height
                    );
                }),
            {
                message:
                    "the canvas should keep consistent nonzero dimensions and a live drawing buffer after a resize",
                timeout: 10_000,
            },
        )
        .toBe(true);

    // The graph must stay interactive after the resize. The enlarged
    // viewport raises software-render frame cost, so the numeric read can
    // lag the click noticeably — poll generously.
    await page.getByRole("button", {name: "Show Axes", exact: true}).click();
    await expect
        .poll(
            async () => (await readGraphSnapshot(page))?.axesVisible ?? false,
            {
                message: "controls should still work after a resize",
                timeout: 15_000,
            },
        )
        .toBe(true);

    const snapshot = await snapshotOrFail(page);
    expect(snapshot.contextLostCount).toBe(0);
    expectCleanErrorBudget(errors);
});

test("remounts a fresh working canvas on re-navigation", async ({page}) => {
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);

    const secondNavigation = await page.goto("/");
    expect(secondNavigation, "re-navigation should return a response").not.toBeNull();
    expect(secondNavigation?.ok(), "re-navigation should succeed").toBe(true);

    await waitForSizedCanvas(page);
    const snapshot = await waitForGraphHandle(page);
    expect(snapshot.contextLostCount).toBe(0);

    expectCleanErrorBudget(errors);
});
