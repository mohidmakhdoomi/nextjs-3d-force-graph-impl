import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import test from "node:test";
import {URL} from "node:url";

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

test("owns and cleans up graph lifecycle resources", () => {
    assert.match(source, /clearTimeout\(interactionTimer\)/);
    assert.match(source, /clearTimeout\(resetTimer\.current\)/);
    assert.match(source, /clearInterval\(rotateTimer\.current\)/);
    assert.match(source, /scene\.remove\(axesHelper\)/);
    assert.match(source, /axesHelper\.geometry\.dispose\(\)/);
    assert.match(source, /material\.dispose\(\)/);
});
