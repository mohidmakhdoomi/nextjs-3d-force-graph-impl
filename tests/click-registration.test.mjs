import assert from "node:assert/strict";
import test from "node:test";

import {settleHoverThenClick} from "./e2e/pointer.ts";

// Deterministic regression harness for issue #34: the intermittent
// "a real node click should register and fix the node" failure under software
// WebGL (Chromium + SwiftShader on CI).
//
// It reproduces the exact library mechanism that races, in plain JS, with no
// browser or WebGL:
//   - three-render-objects resolves the hovered node only inside the render
//     loop, via a raycast throttled to ~50 ms. The node under the pointer
//     therefore becomes `hoverObj` only after a few frames of "aim-to-raycast"
//     latency (modelled by HOVER_LATENCY_FRAMES).
//   - The click is deferred one animation frame past pointerup:
//     `requestAnimationFrame(() => onClick(hoverObj || null, ...))`. It fixes a
//     node only if `hoverObj` is that node at the frame it resolves.
//
// A fake `page` drives this model through the SAME `settleHoverThenClick`
// helper the suite ships, and through a bare move+down+up (the pre-fix code).
// The bare sequence resolves its deferred click before any raycast has
// committed the hover → no fix. Moving first and waiting real frames lets the
// hover commit → fix. If the fix is reverted (or its settle-frame count drops
// below the modelled latency) the "registers" assertion fails.

const HOVER_LATENCY_FRAMES = 3; // frames the raycast needs to commit the hover
const TARGET = {x0: 100, y0: 100, x1: 300, y1: 300};
const TARGET_CENTER = {x: 200, y: 200};

function createFakeGraph() {
    const model = {
        frame: 0,
        overSinceFrame: null, // frame the pointer entered the node, else null
        pressed: false,
        hoverObj: null, // "node" only after the raycast commits it
        pendingClickFrame: null, // frame of pointerup; click resolves next frame
        fixedCount: 0,
    };

    const overTarget = (x, y) =>
        x >= TARGET.x0 && x <= TARGET.x1 && y >= TARGET.y0 && y <= TARGET.y1;

    // One render-loop frame: commit the throttled hover raycast, then resolve
    // any deferred click reading that hover (mirrors three-render-objects).
    const tickFrame = () => {
        model.frame += 1;
        model.hoverObj =
            model.overSinceFrame !== null &&
            model.frame - model.overSinceFrame >= HOVER_LATENCY_FRAMES
                ? "node"
                : null;
        if (model.pendingClickFrame !== null && model.frame > model.pendingClickFrame) {
            if (model.hoverObj === "node") {
                model.fixedCount += 1;
            }
            model.pendingClickFrame = null;
        }
    };

    const setPointer = (x, y) => {
        if (overTarget(x, y)) {
            if (model.overSinceFrame === null) {
                model.overSinceFrame = model.frame;
            }
        } else {
            model.overSinceFrame = null;
            model.hoverObj = null;
        }
    };

    const page = {
        mouse: {
            async move(x, y) {
                setPointer(x, y);
            },
            async down() {
                model.pressed = true;
            },
            async up() {
                if (!model.pressed) {
                    return;
                }
                model.pressed = false;
                model.pendingClickFrame = model.frame; // deferred to next frame
            },
        },
        // Run the helper's real page-context frame loop against the model clock:
        // its `requestAnimationFrame(cb)` advances exactly one render frame.
        async evaluate(fn, arg) {
            const realRaf = globalThis.requestAnimationFrame;
            globalThis.requestAnimationFrame = (cb) => {
                tickFrame();
                cb(model.frame);
                return model.frame;
            };
            try {
                return await fn(arg);
            } finally {
                globalThis.requestAnimationFrame = realRaf;
            }
        },
    };

    // Advance the render loop after a click is issued (in the browser the loop
    // never stops; the deferred click resolves on a following frame).
    const runRenderLoop = (frames) => {
        for (let i = 0; i < frames; i += 1) {
            tickFrame();
        }
    };

    return {page, model, runRenderLoop};
}

async function bareClick(page, x, y) {
    // The pre-fix sequence: move then immediately press/release, with no frames
    // in between for the hover raycast to commit.
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
}

test("a bare click loses the hover race and fixes no node (the #34 bug)", async () => {
    const {page, model, runRenderLoop} = createFakeGraph();
    await bareClick(page, TARGET_CENTER.x, TARGET_CENTER.y);
    runRenderLoop(HOVER_LATENCY_FRAMES + 3); // give the loop ample time
    assert.equal(
        model.fixedCount,
        0,
        "a bare move+down+up should resolve its deferred click before the hover " +
            "raycast commits — reproducing the intermittent no-fix failure",
    );
});

test("settleHoverThenClick registers the fix by letting the hover commit first", async () => {
    const {page, model, runRenderLoop} = createFakeGraph();
    await settleHoverThenClick(page, TARGET_CENTER.x, TARGET_CENTER.y);
    runRenderLoop(2); // resolve the deferred click
    assert.equal(
        model.fixedCount,
        1,
        "moving first and waiting real animation frames must let the hover " +
            "raycast commit the node before the deferred click resolves",
    );
});

test("too few settle frames still lose the race (the frames are the fix)", async () => {
    // Guards against the fix degrading to a token wait: the settle must clear
    // the aim-to-raycast latency, so a count below it must still miss. This is
    // what makes the default (> the modelled latency) load-bearing.
    const {page, model, runRenderLoop} = createFakeGraph();
    await settleHoverThenClick(page, TARGET_CENTER.x, TARGET_CENTER.y, 1);
    runRenderLoop(2);
    assert.equal(
        model.fixedCount,
        0,
        "one settle frame is below the modelled hover latency and must not fix",
    );
});
