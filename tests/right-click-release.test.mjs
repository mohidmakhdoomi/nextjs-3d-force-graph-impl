import assert from "node:assert/strict";
import test from "node:test";

import {settleHoverThenClick} from "./e2e/pointer.ts";

// Deterministic regression harness for issue #22: right-clicking a visibly
// hovered FIXED node must release it (clear fx/fy/fz). Like the issue-#34
// click-registration harness it ships beside, it reproduces the exact library
// mechanism in plain JS — no browser, no WebGL, no GPU — so it stays green under
// software rendering (CI is SwiftShader-only).
//
// The mechanism (three-render-objects): BOTH mouse buttons are dispatched from
// the SAME `pointerup` handler, deferred one animation frame by the SAME
// `requestAnimationFrame`, reading the SAME throttled-raycast `hoverObj`; only
// `ev.button` differs (0 → onClick fixes, 2 → onRightClick releases). The
// hovered node becomes `hoverObj` only a few frames after the pointer arrives
// (aim-to-raycast latency, modelled by HOVER_LATENCY_FRAMES). So a bare
// move+down+up RIGHT-click resolves its deferred `onRightClick` before the
// raycast has committed the hover → the handler fires with a null hover and
// releases nothing. That is exactly the manual-matrix item-11 report ("physical
// right-click did not release the fixed node") under headless SwiftShader — an
// automation-environment timing limitation, confirmed by a native-GPU repro
// where the release works. Moving first and waiting real frames lets the hover
// commit so the deferred right-click releases the node. If the shared
// hover-first fix regresses (or its settle count drops below the modelled
// latency) the "releases" assertion fails.

const HOVER_LATENCY_FRAMES = 3; // frames the raycast needs to commit the hover
const TARGET = {x0: 100, y0: 100, x1: 300, y1: 300};
const TARGET_CENTER = {x: 200, y: 200};

function createFakeGraph() {
    const model = {
        frame: 0,
        overSinceFrame: null, // frame the pointer entered the node, else null
        pressed: false,
        hoverObj: null, // "node" only after the raycast commits it
        pendingClick: null, // {frame, button}; resolves on a later frame
        // One node, already FIXED — the precondition item 11 describes: the user
        // fixed it (left-click / drag) before right-clicking to release it.
        fixed: true,
    };

    const overTarget = (x, y) =>
        x >= TARGET.x0 && x <= TARGET.x1 && y >= TARGET.y0 && y <= TARGET.y1;

    // One render-loop frame: commit the throttled hover raycast, then resolve
    // any deferred click reading that hover (mirrors three-render-objects, incl.
    // its `ev.button` branch: onClick fixes, onRightClick releases).
    const tickFrame = () => {
        model.frame += 1;
        model.hoverObj =
            model.overSinceFrame !== null &&
            model.frame - model.overSinceFrame >= HOVER_LATENCY_FRAMES
                ? "node"
                : null;
        if (
            model.pendingClick !== null &&
            model.frame > model.pendingClick.frame
        ) {
            if (model.hoverObj === "node") {
                if (model.pendingClick.button === "right") {
                    model.fixed = false; // onNodeRightClick releases a fixed node
                } else {
                    model.fixed = true; // onNodeClick fixes it
                }
            }
            model.pendingClick = null;
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
            async up(opts) {
                if (!model.pressed) {
                    return;
                }
                model.pressed = false;
                model.pendingClick = {
                    frame: model.frame, // deferred to next frame
                    button: opts?.button ?? "left",
                };
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

async function bareRightClick(page, x, y) {
    // The pre-fix sequence: move then immediately press/release, with no frames
    // in between for the hover raycast to commit.
    await page.mouse.move(x, y);
    await page.mouse.down({button: "right"});
    await page.mouse.up({button: "right"});
}

test("a bare right-click loses the hover race and releases no node (the item-11 report)", async () => {
    const {page, model, runRenderLoop} = createFakeGraph();
    assert.equal(model.fixed, true, "precondition: the node starts fixed");
    await bareRightClick(page, TARGET_CENTER.x, TARGET_CENTER.y);
    runRenderLoop(HOVER_LATENCY_FRAMES + 3); // give the loop ample time
    assert.equal(
        model.fixed,
        true,
        "a bare move+down+up right-click should resolve its deferred onRightClick " +
            "before the hover raycast commits — reproducing the item-11 " +
            "'right-click did not release the fixed node' failure",
    );
});

test("settleHoverThenClick(button:right) releases the fixed node by letting the hover commit first", async () => {
    const {page, model, runRenderLoop} = createFakeGraph();
    await settleHoverThenClick(page, TARGET_CENTER.x, TARGET_CENTER.y, 5, "right");
    runRenderLoop(2); // resolve the deferred right-click
    assert.equal(
        model.fixed,
        false,
        "moving first and waiting real animation frames must let the hover " +
            "raycast commit the node before the deferred right-click resolves, " +
            "so onNodeRightClick releases it",
    );
});

test("too few settle frames still lose the race (the frames are the fix)", async () => {
    // Guards against the fix degrading to a token wait: the settle must clear
    // the aim-to-raycast latency, so a count below it must still miss. This is
    // what makes the default (> the modelled latency) load-bearing.
    const {page, model, runRenderLoop} = createFakeGraph();
    await settleHoverThenClick(page, TARGET_CENTER.x, TARGET_CENTER.y, 1, "right");
    runRenderLoop(2);
    assert.equal(
        model.fixed,
        true,
        "one settle frame is below the modelled hover latency and must not release",
    );
});
