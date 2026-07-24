import {expect, test, type Page, type TestInfo} from "@playwright/test";
import process from "node:process";

import {
    cameraDelta,
    ensureRotationPaused,
    nodeOccupancyAtPoint,
    openGraphPage,
    readGraphSnapshot,
    readPointerLog,
    resetPointerLog,
    sampleControls,
    waitForGraphHandle,
    waitForSizedCanvas,
    waitForStableCameraDistance,
    type ControlsSample,
    type GraphSnapshot,
    type NodeOccupancy,
    type PointerLog,
} from "../../e2e/graph-handle";

// Out-of-tree diagnostic harness for issue #55 — the Firefox background-drag
// rotation flake at tests/e2e/matrix.spec.ts:224 ("zooms in with the wheel and
// rotates with a background drag"). It reproduces that exact gesture under the
// graph-handle drag-path instrumentation and DUMPS the discriminating fields on
// a failing (below-floor) drag, so a single captured occurrence attributes the
// failure to H1 (stray node capture), H2 (Firefox synthetic-input delivery
// loss), or H3 (drag-readiness). It is NOT part of the canonical suite (see
// playwright.diag.config.ts) and never gates `npm run validate`.

// The canonical assertion, mirrored verbatim. Overridable ONLY to induce a
// guaranteed failure for the Phase-1 acceptance demo of the dump path
// (DIAG_MOTION_FLOOR=100000); the real reproduction uses the true floor of 1.
const MOTION_FLOOR = Number(process.env.DIAG_MOTION_FLOOR ?? 1);
const ZOOM_EPSILON = 0.5;
// The real test allows 5 s locally / 20 s under CI for the drag to land.
const SETTLE_TIMEOUT_MS = process.env.CI ? 20_000 : 5_000;

// The exact matrix.spec.ts:224 background-drag path.
const DRAG_START = {x: 150, y: 450};
const DRAG_END = {x: 450, y: 250};
const DRAG_STEPS = 12;

async function waitForPointerEnablement(page: Page): Promise<void> {
    await expect
        .poll(async () => (await readGraphSnapshot(page))?.controlsEnabled ?? false, {
            message: "expected navigation controls to enable after the delay",
            timeout: 20_000,
        })
        .toBe(true);
}

// Reads the live UNMASKED WebGL renderer so GPU-lane reproduction runs carry
// renderer evidence in the dump (Phase 2 honesty), mirroring the gpu-lane probe.
// three.js creates a WebGL2 context by default, and getContext returns an
// existing context only for the matching type — so try "webgl2" first (else a
// "webgl" request on a webgl2 canvas returns null and the renderer reads
// "(unavailable)").
async function readRenderer(page: Page): Promise<string | null> {
    return page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!canvas) {
            return null;
        }
        const gl = (canvas.getContext("webgl2") ??
            canvas.getContext("webgl")) as
            | WebGL2RenderingContext
            | WebGLRenderingContext
            | null;
        if (!gl) {
            return null;
        }
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return ext
            ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
            : (gl.getParameter(gl.RENDERER) as string);
    });
}

// Polls the camera delta like the real test but never throws: it records the
// MAXIMUM delta observed within the settle window (a real drag moves the camera
// and the delta persists; a lost drag stays ~0 throughout), so the caller can
// dump evidence and then assert on the captured value.
async function measureSettledDelta(
    page: Page,
    beforeDrag: GraphSnapshot,
): Promise<number> {
    let maxDelta = 0;
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    for (;;) {
        const snapshot = await readGraphSnapshot(page);
        const delta = snapshot === null ? 0 : cameraDelta(beforeDrag, snapshot);
        if (delta > maxDelta) {
            maxDelta = delta;
        }
        if (maxDelta > MOTION_FLOOR || Date.now() >= deadline) {
            return maxDelta;
        }
        await page.waitForTimeout(100);
    }
}

type StepSample = {phase: string; controls: ControlsSample | null};

type DragDiagnostics = {
    variant: string;
    engine: string;
    renderer: string | null;
    maxDelta: number;
    motionFloor: number;
    reproduced: boolean;
    occupancyAtStart: NodeOccupancy | null;
    before: {controlsEnabled: boolean; fixedNodeCount: number} | null;
    after: {controlsEnabled: boolean; fixedNodeCount: number} | null;
    pointerLog: PointerLog;
    // The H2 discriminator: pointermoves delivered STRICTLY between the drag's
    // pointerdown and pointerup, derived from the event sequence (NOT the raw
    // pointerLog.move aggregate, which would also count the pre-drag positioning
    // move to the start point and mask a true "0 moves between down and up").
    movesBetweenDownUp: number;
    stepSamples: StepSample[];
    consoleErrors: number;
    pageErrors: number;
};

function summarize(snapshot: GraphSnapshot | null): DragDiagnostics["before"] {
    return snapshot === null
        ? null
        : {
              controlsEnabled: snapshot.controlsEnabled,
              fixedNodeCount: snapshot.fixedNodeCount,
          };
}

// Counts pointermove events STRICTLY between the drag's pointerdown and the
// following pointerup, read from the recorded event sequence. This is the
// correct H2 measure regardless of when the log was reset: the pre-drag
// positioning move (before down) and any stray post-up move are excluded, so a
// true delivery-loss case reports 0 here even though the setup move was
// delivered.
function movesBetweenDownAndUp(log: PointerLog): number {
    const downIndex = log.events.findIndex((event) => event.type === "down");
    if (downIndex === -1) {
        return 0;
    }
    const upIndex = log.events.findIndex(
        (event, index) => index > downIndex && event.type === "up",
    );
    const end = upIndex === -1 ? log.events.length : upIndex;
    let moves = 0;
    for (let index = downIndex + 1; index < end; index += 1) {
        if (log.events[index].type === "move") {
            moves += 1;
        }
    }
    return moves;
}

// Always attaches the full JSON; on a reproduced (below-floor) drag also prints
// the discriminating fields to the run log so the recorded output is
// self-contained evidence.
async function dumpDiagnostics(
    testInfo: TestInfo,
    diagnostics: DragDiagnostics,
): Promise<void> {
    await testInfo.attach(`55-drag-${diagnostics.variant}-${diagnostics.engine}`, {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: "application/json",
    });

    const {pointerLog} = diagnostics;
    const movesBetweenDownUp = diagnostics.movesBetweenDownUp;
    const header = diagnostics.reproduced
        ? `#55 REPRODUCED (${diagnostics.variant} / ${diagnostics.engine}): ` +
          `drag delta ${diagnostics.maxDelta} <= floor ${diagnostics.motionFloor}`
        : `#55 ok (${diagnostics.variant} / ${diagnostics.engine}): ` +
          `drag delta ${diagnostics.maxDelta} > floor ${diagnostics.motionFloor}`;

    const lines = [
        header,
        `  renderer: ${diagnostics.renderer ?? "(unavailable)"}`,
        `  occupancy@start(150,450): hit=${diagnostics.occupancyAtStart?.hit} ` +
            `hitNodeId=${diagnostics.occupancyAtStart?.hitNodeId} ` +
            `nearestPx=${diagnostics.occupancyAtStart?.nearestDistancePx} ` +
            `projRadiusPx=${diagnostics.occupancyAtStart?.nearestProjectedRadiusPx} ` +
            `withinDisk=${diagnostics.occupancyAtStart?.withinProjectedRadius} ` +
            `candidates=${diagnostics.occupancyAtStart?.candidateNodeCount}`,
        `  controls.enabled before=${diagnostics.before?.controlsEnabled} ` +
            `after=${diagnostics.after?.controlsEnabled}`,
        `  fixedNodeCount before=${diagnostics.before?.fixedNodeCount} ` +
            `after=${diagnostics.after?.fixedNodeCount}`,
        `  pointer counts: down=${pointerLog.down} move=${pointerLog.move} ` +
            `up=${pointerLog.up} (canvas move=${pointerLog.canvasMove}) ` +
            `dropped=${pointerLog.dropped}`,
        `  pointermoves between down and up: ${movesBetweenDownUp}`,
    ];
    for (const sample of diagnostics.stepSamples) {
        lines.push(
            `  step ${sample.phase}: enabled=${sample.controls?.enabled} ` +
                `state=${sample.controls?.state}`,
        );
    }
    // Only spell out the full trace when the flake actually reproduced; passing
    // reps keep the log to the single `#55 ok ...` summary line.
    console.log(diagnostics.reproduced ? lines.join("\n") : header);
}

test.describe("issue #55 background-drag diagnostic", () => {
    // Faithful reproduction: the EXACT matrix.spec.ts:224 gesture (single
    // move({steps:12}) call — the real synthetic-dispatch timing), instrumented
    // before/after. The pointer counters expose H2 directly (0 pointermoves
    // between down and up ⇒ delivery loss); the start-point occupancy plus the
    // after-drag fixedNodeCount expose H1.
    test("faithful :224 gesture — delivery counters + occupancy", async ({
        page,
    }, testInfo) => {
        const errors = await openGraphPageDiagnostics(page);
        const beforeDrag = errors.beforeDrag;

        const occupancyAtStart = await nodeOccupancyAtPoint(
            page,
            DRAG_START.x,
            DRAG_START.y,
        );
        const before = summarize(await readGraphSnapshot(page));

        // Position at the start point FIRST, THEN reset — the pre-drag
        // positioning move must not be counted as a drag delivery (Codex
        // phase_1 review), so a true H2 loss can read 0 moves between down/up.
        await page.mouse.move(DRAG_START.x, DRAG_START.y);
        await resetPointerLog(page);
        await page.mouse.down();
        await page.mouse.move(DRAG_END.x, DRAG_END.y, {steps: DRAG_STEPS});
        await page.mouse.up();

        const maxDelta = await measureSettledDelta(page, beforeDrag);
        const after = summarize(await readGraphSnapshot(page));
        const pointerLog = await readPointerLog(page);

        const diagnostics: DragDiagnostics = {
            variant: "faithful",
            engine: testInfo.project.name,
            renderer: errors.renderer,
            maxDelta,
            motionFloor: MOTION_FLOOR,
            reproduced: maxDelta <= MOTION_FLOOR,
            occupancyAtStart,
            before,
            after,
            pointerLog,
            movesBetweenDownUp: movesBetweenDownAndUp(pointerLog),
            stepSamples: [],
            consoleErrors: errors.collected.consoleErrors.length,
            pageErrors: errors.collected.pageErrors.length,
        };
        await dumpDiagnostics(testInfo, diagnostics);

        expect(
            maxDelta,
            "a background drag should rotate the camera",
        ).toBeGreaterThan(MOTION_FLOOR);
    });

    // Instrumented-stepped variant: the same start/end path issued one segment
    // at a time so TrackballControls state and controls.enabled can be sampled
    // MID-drag. H1's "controls disabled during the drag" is only visible here
    // (dragend restores controls.enabled on pointerup), and a mid-drag
    // state===ROTATE with a growing _moveCurr confirms rotation was consumed.
    test("stepped :224 gesture — mid-drag controls/state", async ({
        page,
    }, testInfo) => {
        const errors = await openGraphPageDiagnostics(page);
        const beforeDrag = errors.beforeDrag;

        const occupancyAtStart = await nodeOccupancyAtPoint(
            page,
            DRAG_START.x,
            DRAG_START.y,
        );
        const before = summarize(await readGraphSnapshot(page));
        const stepSamples: StepSample[] = [];

        // Position at the start point FIRST, THEN reset (Codex phase_1 review):
        // the pre-drag positioning move is excluded so movesBetweenDownUp is a
        // true drag-delivery count.
        await page.mouse.move(DRAG_START.x, DRAG_START.y);
        await resetPointerLog(page);
        await page.mouse.down();
        stepSamples.push({phase: "afterDown", controls: await sampleControls(page)});
        for (let step = 1; step <= DRAG_STEPS; step += 1) {
            const t = step / DRAG_STEPS;
            await page.mouse.move(
                DRAG_START.x + (DRAG_END.x - DRAG_START.x) * t,
                DRAG_START.y + (DRAG_END.y - DRAG_START.y) * t,
            );
            if (step % 3 === 0 || step === DRAG_STEPS) {
                stepSamples.push({
                    phase: `move${step}`,
                    controls: await sampleControls(page),
                });
            }
        }
        await page.mouse.up();
        stepSamples.push({phase: "afterUp", controls: await sampleControls(page)});

        const maxDelta = await measureSettledDelta(page, beforeDrag);
        const after = summarize(await readGraphSnapshot(page));
        const pointerLog = await readPointerLog(page);

        const diagnostics: DragDiagnostics = {
            variant: "stepped",
            engine: testInfo.project.name,
            renderer: errors.renderer,
            maxDelta,
            motionFloor: MOTION_FLOOR,
            reproduced: maxDelta <= MOTION_FLOOR,
            occupancyAtStart,
            before,
            after,
            pointerLog,
            movesBetweenDownUp: movesBetweenDownAndUp(pointerLog),
            stepSamples,
            consoleErrors: errors.collected.consoleErrors.length,
            pageErrors: errors.collected.pageErrors.length,
        };
        await dumpDiagnostics(testInfo, diagnostics);

        expect(
            maxDelta,
            "a stepped background drag should rotate the camera",
        ).toBeGreaterThan(MOTION_FLOOR);
    });
});

// Shared preamble wrapper: collects errors + reads the renderer + runs the
// exact matrix.spec.ts:224 preamble (open, settle the layout, enable pointer
// navigation, pause auto-rotation, wheel-zoom IN and settle). Node projections
// grow with proximity here, precisely the condition H1 needs. Returns
// everything the two variants share.
async function openGraphPageDiagnostics(page: Page): Promise<{
    collected: Awaited<ReturnType<typeof openGraphPage>>;
    renderer: string | null;
    beforeDrag: GraphSnapshot;
}> {
    // openGraphPage installs the probe (with the #55 pointer instrumentation)
    // and navigates with strict error collection attached.
    const collected = await openGraphPage(page);
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

    const beforeDrag = await waitForStableCameraDistance(page);
    const renderer = await readRenderer(page);
    return {collected, renderer, beforeDrag};
}
