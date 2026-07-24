import type {Page} from "@playwright/test";

/**
 * Issue #55 HEAVYWEIGHT drag-path instrumentation, colocated with the
 * out-of-tree diagnostic that consumes it (never part of the canonical
 * `tests/e2e/` suite). Per spec FR2's committed-vs-evidence-only rule, the
 * committed suite keeps only the H1 fix dependency — the node-occupancy /
 * background-point helper in `tests/e2e/graph-handle.ts` — while these
 * investigation-time diagnostics live here as evidence-only tooling:
 *
 * - delivered-pointer-event counters + a bounded per-event ring: the H2
 *   discriminator (Firefox synthetic-input delivery loss shows up as "0
 *   pointermoves between down and up"); and
 * - a fast TrackballControls sampler: the H1 confirmation (`controls.enabled`
 *   drops to false for the duration of a node DragControls drag).
 *
 * They were used to root-cause the flake in phase 2; the recorded evidence lives
 * under the project evidence dir and the mechanism is written up there. This
 * module keeps the diagnostic re-runnable without re-adding heavyweight capture
 * to the canonical harness.
 */

export type PointerEventRecord = {
    type: "down" | "move" | "up";
    // performance.now() milliseconds at delivery.
    t: number;
    x: number;
    y: number;
    // event.target is the <canvas> (what the DragControls canvas listener sees).
    onCanvas: boolean;
    buttons: number;
    pointerId: number;
    pointerType: string;
};

/**
 * Delivered-pointer-event counters plus a bounded recent-event ring. Capture-
 * phase document listeners count every `pointerdown` / `pointermove` /
 * `pointerup` the content process actually receives, so H2 (Firefox synthetic-
 * input delivery loss) is directly measurable as "0 pointermoves between down
 * and up." Aggregate counts stay exact even when the ring overflows (`dropped`
 * records the overflow).
 */
export type PointerLog = {
    down: number;
    move: number;
    up: number;
    canvasDown: number;
    canvasMove: number;
    canvasUp: number;
    events: PointerEventRecord[];
    dropped: number;
};

/**
 * Cheap, node-iteration-free sample of the TrackballControls state, usable at
 * high frequency across the drag window. `state` is the three `_STATE` enum
 * (NONE −1 / ROTATE 0 / ZOOM 1 / PAN 2 …); `enabled` goes false for the
 * duration of a node DragControls drag and is restored on `dragend`, so the H1
 * "controls disabled during the drag" signature is only visible mid-drag —
 * hence a dedicated fast sampler rather than the full snapshot.
 */
export type ControlsSample = {
    enabled: boolean;
    state: number;
    keyState: number;
    moveCurrX: number;
    moveCurrY: number;
    movePrevX: number;
    movePrevY: number;
};

declare global {
    interface Window {
        __pointerLog: PointerLog;
        __readPointerLog: () => PointerLog;
        __resetPointerLog: () => void;
        __graphControlsSample: () => ControlsSample | null;
    }
}

/**
 * Installs the heavyweight drag-path probe before app code runs. The capture-
 * phase pointer counters must precede the app's own canvas/document handlers, so
 * call this BEFORE `openGraphPage` (its `addInitScript` runs before navigation).
 * Additive observation only — the listeners READ (no preventDefault /
 * stopPropagation), so app pointer handling is unchanged.
 */
export async function installDragProbe(page: Page): Promise<void> {
    await page.addInitScript(() => {
        // Delivered-pointer-event counters. Capture-phase, document-level
        // listeners installed before app code see every pointerdown/move/up the
        // content process actually receives — BEFORE the app's own
        // canvas/document handlers — so "0 pointermoves between down and up" (H2
        // Firefox synthetic-input delivery loss) is measured directly. Aggregate
        // counts are exact; a bounded ring keeps the coordinate/timestamp trace
        // cheap (overflow recorded as `dropped`).
        const POINTER_LOG_CAP = 1000;
        window.__pointerLog = {
            down: 0,
            move: 0,
            up: 0,
            canvasDown: 0,
            canvasMove: 0,
            canvasUp: 0,
            events: [],
            dropped: 0,
        };
        window.__resetPointerLog = () => {
            const log = window.__pointerLog;
            log.down = 0;
            log.move = 0;
            log.up = 0;
            log.canvasDown = 0;
            log.canvasMove = 0;
            log.canvasUp = 0;
            log.events = [];
            log.dropped = 0;
        };
        window.__readPointerLog = () => {
            const log = window.__pointerLog;
            return {
                down: log.down,
                move: log.move,
                up: log.up,
                canvasDown: log.canvasDown,
                canvasMove: log.canvasMove,
                canvasUp: log.canvasUp,
                dropped: log.dropped,
                events: log.events.slice(),
            };
        };
        const recordPointer = (
            type: "down" | "move" | "up",
            event: PointerEvent,
        ): void => {
            const log = window.__pointerLog;
            const target = event.target;
            const onCanvas =
                target instanceof Element && target.tagName === "CANVAS";
            log[type] += 1;
            if (onCanvas) {
                if (type === "down") {
                    log.canvasDown += 1;
                } else if (type === "move") {
                    log.canvasMove += 1;
                } else {
                    log.canvasUp += 1;
                }
            }
            if (log.events.length < POINTER_LOG_CAP) {
                log.events.push({
                    type,
                    t: performance.now(),
                    x: event.clientX,
                    y: event.clientY,
                    onCanvas,
                    buttons: event.buttons,
                    pointerId: event.pointerId,
                    pointerType: event.pointerType,
                });
            } else {
                log.dropped += 1;
            }
        };
        document.addEventListener(
            "pointerdown",
            (event) => recordPointer("down", event),
            true,
        );
        document.addEventListener(
            "pointermove",
            (event) => recordPointer("move", event),
            true,
        );
        document.addEventListener(
            "pointerup",
            (event) => recordPointer("up", event),
            true,
        );

        // Minimal handle lookup (mirrors graph-handle's private findHandle):
        // walk the React fiber tree up from the three.js canvas to the ref whose
        // `.current` exposes the react-force-graph imperative handle. Duplicated
        // here rather than exported from the trimmed canonical probe so
        // graph-handle carries no heavyweight surface.
        const findHandle = (): any => {
            const canvas = document.querySelector("canvas");
            if (canvas === null) {
                return null;
            }
            let element: Element | null = canvas;
            let fiberKey: string | undefined;
            while (element !== null && fiberKey === undefined) {
                fiberKey = Object.keys(element).find((key) =>
                    key.startsWith("__reactFiber$"),
                );
                if (fiberKey === undefined) {
                    element = element.parentElement;
                }
            }
            if (element === null || fiberKey === undefined) {
                return null;
            }
            let fiber = (element as any)[fiberKey];
            while (fiber) {
                const ref = fiber.ref;
                if (
                    ref &&
                    typeof ref === "object" &&
                    ref.current &&
                    typeof ref.current.graph2ScreenCoords === "function"
                ) {
                    return ref.current;
                }
                fiber = fiber.return;
            }
            return null;
        };

        // Fast TrackballControls state sample (no node iteration), for high-
        // frequency mid-drag sampling. `enabled` drops to false for the duration
        // of a node DragControls drag (the H1 signature).
        window.__graphControlsSample = () => {
            const handle = findHandle();
            if (handle === null) {
                return null;
            }
            const controls = handle.controls();
            const moveCurr = controls._moveCurr;
            const movePrev = controls._movePrev;
            return {
                enabled: controls.enabled === true,
                state:
                    typeof controls.state === "number"
                        ? controls.state
                        : Number.NaN,
                keyState:
                    typeof controls.keyState === "number"
                        ? controls.keyState
                        : Number.NaN,
                moveCurrX: moveCurr ? moveCurr.x : Number.NaN,
                moveCurrY: moveCurr ? moveCurr.y : Number.NaN,
                movePrevX: movePrev ? movePrev.x : Number.NaN,
                movePrevY: movePrev ? movePrev.y : Number.NaN,
            };
        };
    });
}

/**
 * Issue #55: cheap TrackballControls state sample for mid-drag observation.
 * See {@link ControlsSample}.
 */
export async function sampleControls(
    page: Page,
): Promise<ControlsSample | null> {
    return page.evaluate(() => window.__graphControlsSample());
}

/**
 * Issue #55: zero the delivered-pointer-event counters/ring, so a subsequent
 * gesture's events are counted in isolation. See {@link PointerLog}.
 */
export async function resetPointerLog(page: Page): Promise<void> {
    await page.evaluate(() => window.__resetPointerLog());
}

/**
 * Issue #55: read the delivered-pointer-event counters + recent-event ring.
 * See {@link PointerLog}.
 */
export async function readPointerLog(page: Page): Promise<PointerLog> {
    return page.evaluate(() => window.__readPointerLog());
}
