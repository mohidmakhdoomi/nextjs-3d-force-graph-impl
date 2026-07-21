import {expect, test} from "@playwright/test";
import process from "node:process";
import {
    expectCleanErrorBudget,
    ensureRotationPaused,
    fixBestNode,
    nodeScreenPointById,
    openGraphPage,
    readGraphSnapshot,
    waitForCameraRest,
    waitForGraphHandle,
    waitForSizedCanvas,
    waitForStableCameraDistance,
} from "./graph-handle";
import {settleHoverThenClick} from "./pointer";

// Issue #22: right-clicking a visibly hovered FIXED node must release its
// fx/fy/fz. This is the real-application-handler guard for that contract under
// the CI renderer (headless SwiftShader). The companion node-only unit test
// (tests/right-click-release.test.mjs) models the timing mechanism
// deterministically; this test exercises the genuine
// onNodeRightClick → handleRightClick path in a real WebGL context.
//
// The fix step is deterministic (pin fx/fy/fz on the best on-screen node via
// the harness probe) rather than a real click/drag: the manual-matrix item-11
// concern is the RIGHT-CLICK RELEASE, and chaining a software-WebGL-flaky fix
// click ahead of it would only add unrelated flakiness (issue #34). The release
// itself is a genuine right-click, issued hover-first so the library's
// throttled raycast commits the node as `hoverObj` before the rAF-deferred
// onRightClick resolves — the same technique the click-to-focus test uses, and
// the exact reason a bare right-click "did not release" under SwiftShader.

const SETTLE_TIMEOUT_MS = process.env.CI ? 20_000 : 5_000;

// A projected point must sit this far inside the viewport to be a reliable
// hover target. Matches the on-screen margin `bestOnScreenNode` uses when it
// picks/fixes a node, so any node it approves also clears this gate; a fixed
// node whose projection has drifted outside it (a zoom over-shoot to the
// Trackball's minimum distance) is unreachable and must not be aimed at.
const ON_SCREEN_MARGIN = 40;

function isOnScreen(
    point: {x: number; y: number},
    viewport: {width: number; height: number} | null,
): boolean {
    if (viewport === null) {
        return false;
    }
    return (
        point.x >= ON_SCREEN_MARGIN &&
        point.y >= ON_SCREEN_MARGIN &&
        point.x <= viewport.width - ON_SCREEN_MARGIN &&
        point.y <= viewport.height - ON_SCREEN_MARGIN
    );
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

// Wheel the rotating cloud closer until nodes are realistically hittable. Same
// adaptive shape as the click-to-focus test: rapid same-direction wheels stall
// the Trackball's per-frame zoom guard, so a stalled burst pauses to let the
// internal offset decay. Wheeling from a screen corner keeps sweeping nodes out
// from under the pointer so the wheel path does not register a stray fix.
async function zoomIntoClickRange(
    page: Parameters<typeof readGraphSnapshot>[0],
): Promise<void> {
    await page.mouse.move(60, 540);
    for (let burst = 0; burst < 60; burst += 1) {
        const before = await readGraphSnapshot(page);
        if (before !== null && before.cameraDistance < 450) {
            break;
        }
        await page.mouse.wheel(0, -2_400);
        await page.waitForTimeout(600);
        const after = await readGraphSnapshot(page);
        if (
            before !== null &&
            after !== null &&
            before.cameraDistance - after.cameraDistance < 1
        ) {
            await page.waitForTimeout(2_500);
        }
    }
    await waitForStableCameraDistance(page);
    // Drain any pending Trackball zoom offset the wall-clock settle above can
    // miss on a slow runner: otherwise a later frame applies it and slams the
    // camera to its minimum distance AFTER a node is fixed, projecting that node
    // off-screen (issue #22). Frame-based, so it waits exactly as long as the
    // software renderer needs.
    await waitForCameraRest(page);
}

async function reloadGraph(
    page: Parameters<typeof readGraphSnapshot>[0],
): Promise<void> {
    const reload = await page.goto("/");
    expect(reload?.ok(), "recovery navigation should succeed").toBe(true);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await waitForPointerEnablement(page);
    await ensureRotationPaused(page);
}

// Establish exactly one FIXED, on-screen node with the camera genuinely at rest
// — the precondition item 11 describes (the user fixed it before right-clicking).
// Pinning fx/fy/fz (fixBestNode) is the same public state the drag/click
// handlers set and, unlike a real click, triggers no focus-camera animation, so
// once the camera is at rest the pinned node stays exactly where it was fixed.
//
// The ordering is load-bearing: zoomIntoClickRange now DRAINS the pending zoom
// offset (waitForCameraRest) before returning, so the node is fixed only after
// the camera has stopped. A node fixed on a slow-runner zoom plateau projected
// off-screen once that offset later applied and slammed the camera to its
// minimum distance — every retry then aimed off-canvas and released nothing
// (issue #22, shard 4/4). Each try starts from a fresh, offset-free page, a
// stray wheel-path fix restarts clean, and only a fixed node whose projection is
// on-screen is accepted; the rare degenerate viewpoint (camera at the Trackball
// minimum with no hittable node) reloads rather than returning an unreachable aim.
async function establishFixedOnScreenNode(
    page: Parameters<typeof readGraphSnapshot>[0],
    viewport: {width: number; height: number} | null,
): Promise<{id: string | number; x: number; y: number} | null> {
    for (let setup = 0; setup < 3; setup += 1) {
        if (setup > 0) {
            await reloadGraph(page);
        }
        await zoomIntoClickRange(page);

        const preFix = await readGraphSnapshot(page);
        if (preFix === null || preFix.fixedNodeCount !== 0) {
            continue; // stray wheel-path fix — restart from a clean page
        }

        const fixed = await fixBestNode(page);
        if (fixed === null) {
            continue; // no on-screen node at this viewpoint — retry fresh
        }

        await expect
            .poll(
                async () => (await readGraphSnapshot(page))?.fixedNodeCount ?? 0,
                {
                    message: "pinning fx/fy/fz should register the node as fixed",
                    timeout: SETTLE_TIMEOUT_MS,
                },
            )
            .toBe(1);

        // Confirm the camera is still at rest, then that the fixed node projects
        // on-screen. It will unless a residual offset moved the camera after the
        // fix — in which case aiming is hopeless and a fresh page is the fix.
        await waitForCameraRest(page);
        const point = await nodeScreenPointById(page, fixed.id);
        if (point !== null && isOnScreen(point, viewport)) {
            return {id: fixed.id, x: point.x, y: point.y};
        }
    }
    return null;
}

test("right-clicking a fixed node releases its fx/fy/fz", async ({page}) => {
    test.setTimeout(240_000);
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await waitForPointerEnablement(page);
    await ensureRotationPaused(page);

    const viewport = page.viewportSize();
    const target = await establishFixedOnScreenNode(page, viewport);
    expect(
        target,
        "should fix an on-screen node with the camera at rest",
    ).not.toBeNull();
    const fixedTarget = target as {
        id: string | number;
        x: number;
        y: number;
    };

    // Real right-click, hover-first, on the fixed node. Retry: under software
    // WebGL the decisive onRightClick resolves a render frame after pointerup,
    // and a single aim can miss the throttled hover commit. Re-read the node's
    // CURRENT projection each attempt (waitForCameraRest first so it is not read
    // mid-motion) and only dispatch when it is on-screen — the camera is at rest
    // so it stays put, but this refuses to fire blindly off-canvas, the shard-4
    // failure mode. The assertion is only satisfiable by releasing the actual
    // fixed node, so retries cannot pass falsely.
    let released = false;
    for (let attempt = 0; attempt < 6 && !released; attempt += 1) {
        await waitForCameraRest(page);
        const point =
            (await nodeScreenPointById(page, fixedTarget.id)) ?? fixedTarget;
        if (!isOnScreen(point, viewport)) {
            continue;
        }

        await settleHoverThenClick(page, point.x, point.y, 8, "right");
        try {
            await expect
                .poll(
                    async () =>
                        (await readGraphSnapshot(page))?.fixedNodeCount ?? 1,
                    {timeout: 5_000},
                )
                .toBe(0);
            released = true;
        } catch {
            released = false;
        }
    }

    expect(
        released,
        "a real right-click on the fixed node should release its fx/fy/fz",
    ).toBe(true);

    const finalSnapshot = await readGraphSnapshot(page);
    expect(finalSnapshot?.fixedNodeCount ?? 1).toBe(0);
    expect(finalSnapshot?.contextLostCount ?? 1).toBe(0);
    expectCleanErrorBudget(errors);
});
