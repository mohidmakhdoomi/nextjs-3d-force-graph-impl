import {expect, test} from "@playwright/test";
import process from "node:process";
import {
    expectCleanErrorBudget,
    ensureRotationPaused,
    fixBestNode,
    nodeScreenPointById,
    openGraphPage,
    readGraphSnapshot,
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
}

test("right-clicking a fixed node releases its fx/fy/fz", async ({page}) => {
    test.setTimeout(180_000);
    const errors = await openGraphPage(page);
    await waitForSizedCanvas(page);
    await waitForGraphHandle(page);
    await waitForPointerEnablement(page);
    await ensureRotationPaused(page);

    // Bring nodes into hittable range and start from a clean (no fixed node)
    // state. A stray wheel-path fix (observed in both engines) would make the
    // final `fixedNodeCount === 0` assertion pass for the wrong reason, so
    // recover on a fresh page if one slips through.
    await zoomIntoClickRange(page);
    for (let recovery = 0; recovery < 2; recovery += 1) {
        const snapshot = await readGraphSnapshot(page);
        if (snapshot !== null && snapshot.fixedNodeCount === 0) {
            break;
        }
        const reload = await page.goto("/");
        expect(reload?.ok(), "recovery navigation should succeed").toBe(true);
        await waitForSizedCanvas(page);
        await waitForGraphHandle(page);
        await waitForPointerEnablement(page);
        await ensureRotationPaused(page);
        await zoomIntoClickRange(page);
    }

    // Establish exactly one FIXED node — the precondition item 11 describes
    // (the user fixed it before right-clicking). Pinning fx/fy/fz is the same
    // public state the drag/click handlers set; the release is what this test
    // exercises for real.
    const fixed = await fixBestNode(page);
    expect(fixed, "an on-screen node should be available to fix").not.toBeNull();
    await expect
        .poll(async () => (await readGraphSnapshot(page))?.fixedNodeCount ?? 0, {
            message: "pinning fx/fy/fz should register the node as fixed",
            timeout: SETTLE_TIMEOUT_MS,
        })
        .toBe(1);

    const targetId = (fixed as {id: string | number}).id;

    // Real right-click, hover-first, on the fixed node. Retry: under software
    // WebGL the decisive onRightClick resolves a render frame after pointerup,
    // and a single aim can miss the throttled hover commit. The assertion is
    // only satisfiable by releasing the actual fixed node, so retries only
    // improve the odds of landing the hover — they cannot pass falsely.
    let released = false;
    for (let attempt = 0; attempt < 6 && !released; attempt += 1) {
        const point =
            (await nodeScreenPointById(page, targetId)) ??
            (fixed as {x: number; y: number});
        await settleHoverThenClick(page, point.x, point.y, 5, "right");
        try {
            await expect
                .poll(
                    async () =>
                        (await readGraphSnapshot(page))?.fixedNodeCount ?? 1,
                    {timeout: 2_500},
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
