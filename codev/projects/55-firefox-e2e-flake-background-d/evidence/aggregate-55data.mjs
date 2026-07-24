#!/usr/bin/env node
// Aggregates the `#55DATA {json}` records the phase-2 drag diagnostic emits on
// every rep into the Decision-5 statistical H1 measurement + the H1/H2/H3
// discriminator distributions. Usage:
//   node aggregate-55data.mjs <log1> [<log2> ...]
// Each arg is a segment log; the segment label is the file basename.
import {readFileSync} from "node:fs";
import {basename} from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
    console.error("usage: aggregate-55data.mjs <log...>");
    process.exit(1);
}

const rows = [];
for (const file of files) {
    const seg = basename(file).replace(/^phase2-|\.log$/g, "");
    let text = "";
    try {
        text = readFileSync(file, "utf8");
    } catch {
        continue;
    }
    for (const line of text.split("\n")) {
        const idx = line.indexOf("#55DATA ");
        if (idx === -1) continue;
        try {
            rows.push({seg, ...JSON.parse(line.slice(idx + "#55DATA ".length))});
        } catch {
            /* ignore malformed */
        }
    }
}

if (rows.length === 0) {
    console.log("No #55DATA records found yet.");
    process.exit(0);
}

const num = (xs) => xs.filter((x) => typeof x === "number" && !Number.isNaN(x));
const quantile = (xs, q) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const r3 = (x) => (x === null ? "n/a" : Math.round(x * 1000) / 1000);

function summarize(label, subset) {
    if (subset.length === 0) return;
    const hits = subset.filter((r) => r.occHit === true).length;
    const within = subset.filter((r) => r.withinDisk === true).length;
    const reproduced = subset.filter((r) => r.reproduced === true);
    const fixedAfterPos = subset.filter((r) => (r.fixedAfter ?? 0) > 0).length;
    const ctrlAfterFalse = subset.filter((r) => r.ctrlAfter === false).length;
    const zeroMoves = subset.filter((r) => r.movesBetweenDownUp === 0).length;
    const nearest = num(subset.map((r) => r.nearestPx));
    const deltas = num(subset.map((r) => r.maxDelta));
    const moves = num(subset.map((r) => r.movesBetweenDownUp));
    const cand = num(subset.map((r) => r.candidates));
    const camDist = num(subset.map((r) => r.cameraDistance));
    const nearWithin = [10, 20, 30, 50].map(
        (t) => `${t}px:${nearest.filter((x) => x <= t).length}`,
    );
    console.log(`\n=== ${label} (n=${subset.length}) ===`);
    console.log(
        `  REPRODUCED (delta<=floor): ${reproduced.length}` +
            (reproduced.length
                ? ` -> deltas ${reproduced.map((r) => r3(r.maxDelta)).join(", ")}`
                : ""),
    );
    console.log(
        `  H1 occupancy: occHit=${hits} withinDisk=${within} ` +
            `fixedAfter>0=${fixedAfterPos} ctrlAfter=false=${ctrlAfterFalse}`,
    );
    console.log(
        `  H2/H3: movesBetweenDownUp=0 count=${zeroMoves} ` +
            `(moves min/med/max ${r3(quantile(moves, 0))}/` +
            `${r3(quantile(moves, 0.5))}/${r3(quantile(moves, 1))})`,
    );
    console.log(
        `  nearestPx to a node projection: ` +
            `min=${r3(quantile(nearest, 0))} p05=${r3(quantile(nearest, 0.05))} ` +
            `p25=${r3(quantile(nearest, 0.25))} med=${r3(quantile(nearest, 0.5))} ` +
            `max=${r3(quantile(nearest, 1))}`,
    );
    console.log(`  nearestPx<=threshold counts: ${nearWithin.join(" ")}`);
    console.log(
        `  candidates (nodes in front): min=${r3(quantile(cand, 0))} ` +
            `med=${r3(quantile(cand, 0.5))} max=${r3(quantile(cand, 1))}`,
    );
    if (camDist.length) {
        console.log(
            `  cameraDistance (post-zoom, pre-drag): ` +
                `min=${r3(quantile(camDist, 0))} med=${r3(quantile(camDist, 0.5))} ` +
                `max=${r3(quantile(camDist, 1))}`,
        );
    }
    console.log(
        `  drag delta: min=${r3(quantile(deltas, 0))} ` +
            `p05=${r3(quantile(deltas, 0.05))} med=${r3(quantile(deltas, 0.5))} ` +
            `max=${r3(quantile(deltas, 1))}`,
    );
}

summarize("ALL", rows);
const segs = [...new Set(rows.map((r) => r.seg))].sort();
for (const seg of segs) summarize(`segment ${seg}`, rows.filter((r) => r.seg === seg));

// Any reproduced record dumped in full for root-cause.
const repro = rows.filter((r) => r.reproduced === true);
if (repro.length) {
    console.log(`\n=== ${repro.length} REPRODUCED record(s) (full) ===`);
    for (const r of repro) console.log(JSON.stringify(r));
}
