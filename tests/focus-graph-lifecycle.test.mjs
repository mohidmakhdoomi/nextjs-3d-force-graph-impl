import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import test from "node:test";
import {URL} from "node:url";

import {createFocusGraphResources} from "../app/components/focusGraphResources.ts";

const focusGraphPath = new URL(
    "../app/components/FocusGraph.tsx",
    import.meta.url,
);
const ambientDeclarationPath = new URL(
    "../app/components/FocusGraph.d.ts",
    import.meta.url,
);
const source = await readFile(focusGraphPath, "utf8");

test("uses stable graph data directly without blanket Three type suppression", async () => {
    await assert.rejects(access(ambientDeclarationPath));
    assert.match(source, /const graphData = useMemo<GraphData>/);
    assert.match(source, /graphData\.nodes\.forEach/);
    assert.doesNotMatch(source, /Graph\?\.props\.graphData/);
    assert.doesNotMatch(source, /mainEffectCounter|counter\.current/);
});

test("replay and cleanup leave no stale timers or axes helpers", () => {
    let nextHandle = 0;
    const intervals = new Map();
    const timeouts = new Map();
    const scheduler = {
        setInterval(callback) {
            const handle = ++nextHandle;
            intervals.set(handle, callback);
            return handle;
        },
        clearInterval(handle) {
            intervals.delete(handle);
        },
        setTimeout(callback) {
            const handle = ++nextHandle;
            timeouts.set(handle, callback);
            return handle;
        },
        clearTimeout(handle) {
            timeouts.delete(handle);
        },
    };
    const sceneObjects = new Set();
    const scene = {
        add: (object) => sceneObjects.add(object),
        remove: (object) => sceneObjects.delete(object),
    };
    const disposalCounts = new Map();
    const axesHelper = (name) => {
        const dispose = () =>
            disposalCounts.set(name, (disposalCounts.get(name) ?? 0) + 1);
        return {
            geometry: {dispose},
            material: [{dispose}],
            visible: false,
        };
    };
    const resources = createFocusGraphResources(scheduler);
    const firstAxes = axesHelper("first");
    const replacementAxes = axesHelper("replacement");
    const liveAxes = axesHelper("live");

    resources.attachAxes(scene, firstAxes);
    resources.attachAxes(scene, replacementAxes);
    assert.deepEqual([...sceneObjects], [replacementAxes]);
    assert.equal(disposalCounts.get("first"), 2);
    resources.cleanup();
    assert.equal(sceneObjects.size, 0);
    assert.equal(disposalCounts.get("replacement"), 2);

    // React development replay sets the same effect up again after cleanup.
    resources.startRotation(() => {});
    resources.startRotation(() => {});
    resources.scheduleInteraction(() => assert.fail("stale interaction"), 4000);
    resources.scheduleReset(() => assert.fail("replaced reset"), 1000);
    resources.scheduleReset(() => assert.fail("stale reset"), 1000);
    resources.attachAxes(scene, liveAxes);

    assert.equal(intervals.size, 1, "rotation setup must be idempotent");
    assert.equal(timeouts.size, 2, "only live interaction/reset timers remain");
    assert.deepEqual([...sceneObjects], [liveAxes]);

    resources.cleanup();
    assert.equal(intervals.size, 0);
    assert.equal(timeouts.size, 0);
    assert.equal(sceneObjects.size, 0);
    assert.equal(disposalCounts.get("live"), 2);
});
