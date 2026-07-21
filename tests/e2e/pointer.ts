import type {Page} from "@playwright/test";

/**
 * Awaits `frames` real animation frames in page context.
 *
 * Frame-based waiting self-scales to render speed: under GPU-less software
 * WebGL (SwiftShader/llvmpipe on CI runners) a single frame can take far longer
 * than on local hardware, so the same frame count buys proportionally more
 * wall-clock exactly where the rendering is slow — without hard-coding an
 * environment-specific millisecond timeout.
 */
export async function waitForAnimationFrames(
    page: Page,
    frames: number,
): Promise<void> {
    await page.evaluate(async (count) => {
        const nextFrame = () =>
            new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
            );
        for (let i = 0; i < count; i += 1) {
            await nextFrame();
        }
    }, frames);
}

/**
 * Clicks a graph node hover-first to defeat a software-WebGL timing race.
 *
 * react-force-graph-3d (three-render-objects) resolves the hovered node only
 * inside the render loop — a raycast throttled to ~50 ms (`pointerRaycaster
 * ThrottleMs`) — and defers the click itself one animation frame past
 * pointerup: `requestAnimationFrame(() => onClick(hoverObj || null, ...))`. A
 * bare move+down+up can therefore resolve its deferred click before any raycast
 * has committed the node under the pointer as `hoverObj`, so `onNodeClick`
 * fires with a null hover and no node is fixed. Under GPU-less software
 * rendering, where a single frame dominates the throttle window, this surfaces
 * as the intermittent "a real node click should register and fix the node"
 * failure (issue #34): the CI trace of a failing run shows repeated clicks at
 * one stable, hittable node projection that never register a fix.
 *
 * Moving first and letting real animation frames elapse forces a committed
 * hover raycast to register the node BEFORE pointerdown/up, so the deferred
 * click reads a resolved hover. This only ADDS frame-based (self-scaling)
 * waits — it trims none, and it does not touch worker concurrency.
 *
 * The same mechanism — and therefore the same fix — applies to a RIGHT-click
 * (issue #22). three-render-objects dispatches BOTH buttons from the single
 * `pointerup` handler behind the same `requestAnimationFrame`, reading the same
 * throttled `hoverObj`; only `ev.button` differs (0 → `onClick`, 2 →
 * `onRightClick`). So a bare right-click on a fixed node loses the identical
 * hover race and releases nothing — exactly the manual-matrix item-11 report —
 * while a hover-first right-click reads a resolved hover and releases it. Pass
 * `button: "right"` to exercise that path.
 */
export async function settleHoverThenClick(
    page: Page,
    x: number,
    y: number,
    settleFrames = 5,
    button: "left" | "right" = "left",
): Promise<void> {
    await page.mouse.move(x, y);
    // Let committed hover raycasts run at the new pointer position before the
    // click is dispatched — so the deferred onClick/onRightClick reads a
    // resolved hover.
    await waitForAnimationFrames(page, settleFrames);
    await page.mouse.down({button});
    await page.mouse.up({button});
}
