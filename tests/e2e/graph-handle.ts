import {expect, type Locator, type Page} from "@playwright/test";

/**
 * Numeric snapshot of the live graph, read through the react-force-graph
 * imperative handle from page context. All fields are plain numbers/booleans
 * so the object survives Playwright's evaluate serialization.
 */
export type GraphSnapshot = {
    cameraX: number;
    cameraY: number;
    cameraZ: number;
    cameraDistance: number;
    controlsEnabled: boolean;
    noPan: boolean;
    sceneNodeCount: number;
    positionedNodeCount: number;
    fixedNodeCount: number;
    layoutSpread: number;
    axesFound: boolean;
    axesVisible: boolean;
    contextLostCount: number;
};

export type NodeScreenPoint = {
    x: number;
    y: number;
    distanceToCenter: number;
};

export type FixedNodeScreenPoint = {
    x: number;
    y: number;
    id: string | number;
};

export type NodeScreenById = {
    x: number;
    y: number;
    fixed: boolean;
};

/**
 * Result of raycasting an arbitrary screen point against the node meshes —
 * the inverse of {@link NodeScreenPoint}. Issue #55 drag-path instrumentation:
 * `hit` mirrors the three DragControls raycast that fires node `dragstart`
 * (NDC from the canvas rect → `raycaster.setFromCamera` → `intersectObjects`),
 * so it decides H1 (a "background" drag that actually lands on a node). The
 * screen-space `nearest*` fields are the continuous "how close was the pointer
 * to a node projection" measure and a projected-disk cross-check.
 */
export type NodeOccupancy = {
    // True when the pixel ray pierces a node's world sphere (the DragControls
    // hit-test semantics): a background drag starting here would be captured by
    // the node DragControls, disable the Trackball, and move the node instead.
    hit: boolean;
    hitNodeId: string | number | null;
    // World-space distance from the camera to the nearest pierced sphere.
    hitDepth: number | null;
    // Nearest node by on-screen projection (in front of the camera only).
    nearestNodeId: string | number | null;
    nearestDistancePx: number | null;
    nearestNodeScreen: {x: number; y: number} | null;
    // The nearest node's projected screen radius, and whether the point falls
    // inside that projected disk (a screen-space cross-check of `hit`).
    nearestProjectedRadiusPx: number | null;
    withinProjectedRadius: boolean;
    // Nodes considered (positioned and in front of the camera).
    candidateNodeCount: number;
};


export type CollectedErrors = {
    consoleErrors: string[];
    pageErrors: string[];
};

declare global {
    interface Window {
        __graphProbe: () => GraphSnapshot | null;
        __graphNodeScreen: () => NodeScreenPoint | null;
        __graphFixBestNode: () => FixedNodeScreenPoint | null;
        __graphNodeScreenById: (id: string | number) => NodeScreenById | null;
        __webglContextLostCount: number;
        // Issue #55 H1 fix dependency: node-occupancy / background-point probe
        // (harness-side observation only). The heavyweight phase-2 diagnostics
        // (pointer counters, controls sampler) are evidence-only and live with
        // the out-of-tree diagnostic (tests/diagnostics/55-drag/drag-probe.ts).
        __graphNodeOccupancyAtPoint: (x: number, y: number) => NodeOccupancy | null;
    }
}

/**
 * Installs the page-context probe before app code runs. The probe walks the
 * React fiber tree up from the three.js-created canvas (which has no fiber
 * key) to the first React-managed ancestor, then up the fiber chain to the
 * ref whose `.current` exposes the react-force-graph imperative handle
 * (`graph2ScreenCoords`/`camera`/`controls`/`scene`). Node data is read from
 * the `__data` reference three-forcegraph places on node meshes. The app
 * itself is never modified; this is harness-side observation only.
 */
export async function installGraphProbe(page: Page): Promise<void> {
    await page.addInitScript(() => {
        window.__webglContextLostCount = 0;
        document.addEventListener(
            "webglcontextlost",
            () => {
                window.__webglContextLostCount += 1;
            },
            true,
        );

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

        const collectNodeData = (handle: any): any[] => {
            const nodeData = new Set<any>();
            handle.scene().traverse((object: any) => {
                const data = object.__data;
                if (
                    data &&
                    data.id !== undefined &&
                    data.source === undefined &&
                    data.target === undefined
                ) {
                    nodeData.add(data);
                }
            });
            return [...nodeData];
        };

        window.__graphProbe = () => {
            const handle = findHandle();
            if (handle === null) {
                return null;
            }

            const camera = handle.camera();
            const controls = handle.controls();
            const axes = handle.scene().getObjectByName("myAxesHelper");
            const nodes = collectNodeData(handle);

            let positioned = 0;
            let fixed = 0;
            for (const node of nodes) {
                if (
                    typeof node.x === "number" &&
                    typeof node.y === "number" &&
                    typeof node.z === "number"
                ) {
                    positioned += 1;
                }
                if (node.fx !== undefined) {
                    fixed += 1;
                }
            }

            const bbox = handle.getGraphBbox();
            const layoutSpread =
                bbox === null
                    ? 0
                    : Math.hypot(
                          bbox.x[1] - bbox.x[0],
                          bbox.y[1] - bbox.y[0],
                          bbox.z[1] - bbox.z[0],
                      );

            return {
                cameraX: camera.position.x,
                cameraY: camera.position.y,
                cameraZ: camera.position.z,
                cameraDistance: Math.hypot(
                    camera.position.x,
                    camera.position.y,
                    camera.position.z,
                ),
                controlsEnabled: controls.enabled === true,
                noPan: controls.noPan === true,
                sceneNodeCount: nodes.length,
                positionedNodeCount: positioned,
                fixedNodeCount: fixed,
                layoutSpread,
                axesFound: axes !== undefined,
                axesVisible: axes !== undefined && axes.visible === true,
                contextLostCount: window.__webglContextLostCount,
            };
        };

        // Shared picker: the best (closest-to-center, comfortably in front of
        // the camera, within-margin) on-screen node, returned WITH its node
        // data. When zoomed in the camera sits inside the node cloud and
        // graph2ScreenCoords maps nodes BEHIND the camera to plausible on-screen
        // coordinates, so only nodes in front along the view direction are valid
        // click targets.
        const bestOnScreenNode = (): {
            node: any;
            x: number;
            y: number;
            distanceToCenter: number;
        } | null => {
            const handle = findHandle();
            if (handle === null) {
                return null;
            }

            const camera = handle.camera();
            const viewDirection = camera
                .getWorldDirection(camera.position.clone())
                .clone();

            const margin = 60;
            const minDepth = 50;
            let best: {
                node: any;
                x: number;
                y: number;
                distanceToCenter: number;
            } | null = null;
            for (const node of collectNodeData(handle)) {
                if (
                    typeof node.x !== "number" ||
                    typeof node.y !== "number" ||
                    typeof node.z !== "number"
                ) {
                    continue;
                }

                const depth =
                    (node.x - camera.position.x) * viewDirection.x +
                    (node.y - camera.position.y) * viewDirection.y +
                    (node.z - camera.position.z) * viewDirection.z;
                if (depth < minDepth) {
                    continue;
                }

                const coords = handle.graph2ScreenCoords(
                    node.x,
                    node.y,
                    node.z,
                );
                if (
                    coords.x < margin ||
                    coords.y < margin ||
                    coords.x > window.innerWidth - margin ||
                    coords.y > window.innerHeight - margin
                ) {
                    continue;
                }

                const distanceToCenter = Math.hypot(
                    coords.x - window.innerWidth / 2,
                    coords.y - window.innerHeight / 2,
                );
                if (best === null || distanceToCenter < best.distanceToCenter) {
                    best = {node, x: coords.x, y: coords.y, distanceToCenter};
                }
            }
            return best;
        };

        window.__graphNodeScreen = () => {
            const best = bestOnScreenNode();
            return best === null
                ? null
                : {
                      x: best.x,
                      y: best.y,
                      distanceToCenter: best.distanceToCenter,
                  };
        };

        // Deterministically FIX the best on-screen node (pin fx/fy/fz to its
        // current position) and return its screen point + id. This lets a
        // right-click-release test establish a known fixed node WITHOUT relying
        // on the software-WebGL-flaky click/drag fix path (issue #34); the
        // release itself is still exercised through a real right-click. The app
        // is never modified — fx/fy/fz are the same public node fields the drag
        // and click handlers set.
        window.__graphFixBestNode = () => {
            const best = bestOnScreenNode();
            if (best === null) {
                return null;
            }
            best.node.fx = best.node.x;
            best.node.fy = best.node.y;
            best.node.fz = best.node.z;
            return {x: best.x, y: best.y, id: best.node.id};
        };

        // Re-read a specific node's screen point by id. A fixed node stays put
        // (rotation paused, camera settled), so a right-click retry can re-aim
        // at exactly the node it fixed. three-forcegraph can expose more than
        // one scene object whose `__data` carries the same node id (e.g. a mesh
        // plus a label), so prefer the instance that actually holds the pinned
        // fx/fy/fz — that is the one `fixBestNode` mutated and the one the
        // library's raycast resolves as the hovered node — and fall back to the
        // first match otherwise. Without this preference the lookup can report a
        // duplicate, unpinned instance (`fixed: false`) for a node that IS fixed.
        window.__graphNodeScreenById = (id) => {
            const handle = findHandle();
            if (handle === null) {
                return null;
            }

            const matches = collectNodeData(handle).filter(
                (candidate) =>
                    candidate.id === id &&
                    typeof candidate.x === "number" &&
                    typeof candidate.y === "number" &&
                    typeof candidate.z === "number",
            );
            const node =
                matches.find((candidate) => candidate.fx !== undefined) ??
                matches[0];
            if (node === undefined) {
                return null;
            }

            const coords = handle.graph2ScreenCoords(node.x, node.y, node.z);
            return {x: coords.x, y: coords.y, fixed: node.fx !== undefined};
        };

        // Issue #55 H1 discriminator: does an arbitrary screen point sit on a
        // node mesh? This mirrors the three DragControls hit-test — normalized
        // device coords from the canvas rect, a camera ray, and a ray-sphere
        // test against each node's world sphere (the same `node.__threeObj`
        // meshes DragControls raycasts). A `hit` here is a "background" drag
        // that would instead capture a node, disable the Trackball, and move
        // the node (camera delta ~0 — the observed failure signature). THREE's
        // Vector3 is reached through an existing instance (`camera.position`)
        // since the app exposes no global THREE; cloning yields a real Vector3
        // with set/unproject/sub, so no import is needed in page context.
        window.__graphNodeOccupancyAtPoint = (x, y) => {
            const handle = findHandle();
            if (handle === null) {
                return null;
            }
            const canvas = document.querySelector("canvas");
            if (canvas === null) {
                return null;
            }

            const camera = handle.camera();
            const Vec3 = camera.position.constructor;
            const rect = canvas.getBoundingClientRect();

            // NDC exactly as three DragControls._updatePointer computes it, so a
            // hit mirrors the raycast that fires node dragstart.
            const ndcX = ((x - rect.left) / rect.width) * 2 - 1;
            const ndcY = -((y - rect.top) / rect.height) * 2 + 1;

            // raycaster.setFromCamera semantics for a perspective camera:
            // origin at the camera, direction toward the unprojected NDC point.
            camera.updateWorldMatrix(true, false);
            const origin = camera.getWorldPosition(new Vec3());
            const direction = new Vec3(ndcX, ndcY, 0.5)
                .unproject(camera)
                .sub(origin)
                .normalize();
            const viewDirection = camera.getWorldDirection(new Vec3());
            // Camera right axis (world) for projecting a sphere's edge to pixels.
            const right = new Vec3(1, 0, 0)
                .applyQuaternion(camera.quaternion)
                .normalize();

            const center = new Vec3();
            const scale = new Vec3();

            let hitNodeId: string | number | null = null;
            let hitDepth = Number.POSITIVE_INFINITY;
            let nearestNodeId: string | number | null = null;
            let nearestDistancePx = Number.POSITIVE_INFINITY;
            let nearestScreen: {x: number; y: number} | null = null;
            let nearestProjectedRadiusPx: number | null = null;
            let candidateNodeCount = 0;

            for (const node of collectNodeData(handle)) {
                if (
                    typeof node.x !== "number" ||
                    typeof node.y !== "number" ||
                    typeof node.z !== "number"
                ) {
                    continue;
                }
                const obj = node.__threeObj;
                if (!obj) {
                    continue;
                }
                obj.updateWorldMatrix(true, false);
                obj.getWorldPosition(center);

                // Behind-camera nodes are not real targets (graph2ScreenCoords
                // maps them to plausible on-screen coords), so exclude them from
                // both the raycast and the nearest-projection search.
                const depthAlongView =
                    (center.x - origin.x) * viewDirection.x +
                    (center.y - origin.y) * viewDirection.y +
                    (center.z - origin.z) * viewDirection.z;
                if (depthAlongView <= 0) {
                    continue;
                }
                candidateNodeCount += 1;

                // World-space sphere radius read from the node mesh geometry
                // (the mesh DragControls raycasts), scaled by world scale.
                let worldRadius = 0;
                obj.traverse((child: any) => {
                    const geometry = child.geometry;
                    if (!geometry) {
                        return;
                    }
                    if (geometry.boundingSphere === null) {
                        geometry.computeBoundingSphere();
                    }
                    if (geometry.boundingSphere === null) {
                        return;
                    }
                    child.getWorldScale(scale);
                    const maxScale = Math.max(
                        Math.abs(scale.x),
                        Math.abs(scale.y),
                        Math.abs(scale.z),
                    );
                    const r = geometry.boundingSphere.radius * maxScale;
                    if (r > worldRadius) {
                        worldRadius = r;
                    }
                });

                // Ray-sphere intersection (the sphere-mesh case of
                // raycaster.intersectObjects): the pixel ray pierces the node
                // when its perpendicular distance to the center is within the
                // radius and an entry lies ahead of the camera.
                const lx = center.x - origin.x;
                const ly = center.y - origin.y;
                const lz = center.z - origin.z;
                const tca =
                    lx * direction.x + ly * direction.y + lz * direction.z;
                const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
                const r2 = worldRadius * worldRadius;
                if (d2 <= r2) {
                    const thc = Math.sqrt(r2 - d2);
                    const t0 = tca - thc;
                    const t1 = tca + thc;
                    const t = t0 >= 0 ? t0 : t1;
                    if (t >= 0 && t < hitDepth) {
                        hitDepth = t;
                        hitNodeId = node.id;
                    }
                }

                // Screen-space nearest projection + that node's projected radius.
                const coords = handle.graph2ScreenCoords(
                    node.x,
                    node.y,
                    node.z,
                );
                const distancePx = Math.hypot(coords.x - x, coords.y - y);
                if (distancePx < nearestDistancePx) {
                    nearestDistancePx = distancePx;
                    nearestNodeId = node.id;
                    nearestScreen = {x: coords.x, y: coords.y};
                    const edge = handle.graph2ScreenCoords(
                        center.x + right.x * worldRadius,
                        center.y + right.y * worldRadius,
                        center.z + right.z * worldRadius,
                    );
                    nearestProjectedRadiusPx = Math.hypot(
                        edge.x - coords.x,
                        edge.y - coords.y,
                    );
                }
            }

            return {
                hit: hitNodeId !== null,
                hitNodeId,
                hitDepth: Number.isFinite(hitDepth) ? hitDepth : null,
                nearestNodeId,
                nearestDistancePx: Number.isFinite(nearestDistancePx)
                    ? nearestDistancePx
                    : null,
                nearestNodeScreen: nearestScreen,
                nearestProjectedRadiusPx,
                withinProjectedRadius:
                    nearestProjectedRadiusPx !== null &&
                    Number.isFinite(nearestDistancePx) &&
                    nearestDistancePx <= nearestProjectedRadiusPx,
                candidateNodeCount,
            };
        };
    });
}

export async function readGraphSnapshot(
    page: Page,
): Promise<GraphSnapshot | null> {
    return page.evaluate(() => window.__graphProbe());
}

export async function pickNodeScreenPoint(
    page: Page,
): Promise<NodeScreenPoint | null> {
    return page.evaluate(() => window.__graphNodeScreen());
}

export async function fixBestNode(
    page: Page,
): Promise<FixedNodeScreenPoint | null> {
    return page.evaluate(() => window.__graphFixBestNode());
}

export async function nodeScreenPointById(
    page: Page,
    id: string | number,
): Promise<NodeScreenById | null> {
    return page.evaluate((nodeId) => window.__graphNodeScreenById(nodeId), id);
}

/**
 * Issue #55: raycast a screen point against the node meshes (H1 discriminator).
 * See {@link NodeOccupancy}.
 */
export async function nodeOccupancyAtPoint(
    page: Page,
    x: number,
    y: number,
): Promise<NodeOccupancy | null> {
    return page.evaluate(
        (point) => window.__graphNodeOccupancyAtPoint(point.x, point.y),
        {x, y},
    );
}

/**
 * Result of {@link pickBackgroundDragPoint}: the emptiest screen point found for
 * a "background" drag start, with its clearance to the nearest node's projected
 * EDGE (`nearestDistancePx − nearestProjectedRadiusPx`, in screen pixels;
 * `Infinity` when no node is in front of the camera). Edge clearance — not
 * distance to the node centre — is the drag-capture margin: a point 34px from a
 * node whose disk projects to a 25px radius sits only ~9px outside it.
 */
export type BackgroundDragPoint = {
    x: number;
    y: number;
    edgeClearancePx: number;
};

/**
 * Issue #55: choose a genuinely-background screen point to start a "background
 * drag" — the inverse intent of {@link pickNodeScreenPoint}, rooted in the H1
 * root cause. The failing `matrix.spec.ts:224` drag hard-coded its start at
 * `(150, 450)`; this scene is a dense scatter of ~2600 small nodes (projected
 * radius ~1.5–5.5px), so on ~10% of post-zoom layouts a node's disk covered
 * that pixel (an `occHit`, reproduced on SwiftShader and on RTX-3080 hardware).
 * The DragControls raycast then captured the node on pointerdown, disabled the
 * Trackball, and moved the node instead of rotating the camera — the observed
 * ~0.002 camera delta against `MOTION_FLOOR` (1).
 *
 * Every candidate is raycast against the live node meshes with the same test
 * DragControls fires on pointerdown ({@link nodeOccupancyAtPoint}). Points that
 * are a 3-D hit or fall inside the nearest node's projected disk are rejected
 * outright (they would capture a node); of the rest, the one with the GREATEST
 * clearance to the nearest node edge is returned — the emptiest available spot,
 * so the small per-frame force-layout drift between this probe and the gesture
 * (Phase-2 evidence recorded one `occHit` a few frames before pointerdown as
 * the layout micro-drifted) cannot bring a node onto the start point. The
 * caller applies a pixel-margin floor to the returned clearance and fails
 * loudly if even the emptiest point is too close, rather than dragging from an
 * unverified start. Returns `null` only when the probe is unavailable for every
 * candidate, or no candidate is background at all.
 */
export async function pickBackgroundDragPoint(
    page: Page,
    candidates: ReadonlyArray<{x: number; y: number}>,
): Promise<BackgroundDragPoint | null> {
    let best: BackgroundDragPoint | null = null;
    for (const candidate of candidates) {
        const occupancy = await nodeOccupancyAtPoint(
            page,
            candidate.x,
            candidate.y,
        );
        if (occupancy === null) {
            continue;
        }
        // On a node — the ray pierces its sphere or the point sits inside the
        // node's projected disk. Starting here would capture the node and
        // defeat the background-drag premise, so it is never eligible.
        if (occupancy.hit || occupancy.withinProjectedRadius) {
            continue;
        }
        const edgeClearancePx =
            occupancy.nearestDistancePx === null
                ? Number.POSITIVE_INFINITY
                : occupancy.nearestDistancePx -
                  (occupancy.nearestProjectedRadiusPx ?? 0);
        // Guard the numeric corner where the point is outside the disk by the
        // 2-D check yet not strictly beyond the edge — never a safe start.
        if (edgeClearancePx <= 0) {
            continue;
        }
        if (best === null || edgeClearancePx > best.edgeClearancePx) {
            best = {x: candidate.x, y: candidate.y, edgeClearancePx};
        }
    }
    return best;
}

/**
 * Vercel injects these scripts only on its platform. A local production
 * server has no endpoints for them, so isolate the tests from that external
 * service while retaining strict error collection for the app itself.
 */
export async function stubVercelScripts(page: Page): Promise<void> {
    for (const scriptPath of [
        "**/_vercel/speed-insights/script.js",
        "**/_vercel/insights/script.js",
    ]) {
        await page.route(scriptPath, (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/javascript",
                body: "",
            }),
        );
    }
}

export function collectErrors(page: Page): CollectedErrors {
    const collected: CollectedErrors = {consoleErrors: [], pageErrors: []};
    page.on("console", (message) => {
        if (message.type() === "error") {
            collected.consoleErrors.push(message.text());
        }
    });
    page.on("pageerror", (error) => {
        collected.pageErrors.push(error.stack ?? error.message);
    });
    return collected;
}

export function expectCleanErrorBudget(collected: CollectedErrors): void {
    expect(
        collected.pageErrors,
        `unexpected page errors:\n${collected.pageErrors.join("\n")}`,
    ).toEqual([]);
    expect(
        collected.consoleErrors,
        `unexpected console errors:\n${collected.consoleErrors.join("\n")}`,
    ).toEqual([]);
}

/**
 * Stubs external scripts, installs the probe, and navigates to the graph
 * page with strict error collection attached. Does not wait for canvas
 * readiness so callers can observe early (pre-enablement) state.
 */
export async function openGraphPage(page: Page): Promise<CollectedErrors> {
    await stubVercelScripts(page);
    await installGraphProbe(page);
    const collected = collectErrors(page);

    const response = await page.goto("/");
    expect(response, "root navigation should return a response").not.toBeNull();
    expect(response?.ok(), "root navigation should succeed").toBe(true);

    return collected;
}

export async function hasSizedCanvas(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (canvas === null) {
            return false;
        }

        const bounds = canvas.getBoundingClientRect();
        return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            canvas.width > 0 &&
            canvas.height > 0
        );
    });
}

export async function waitForSizedCanvas(page: Page): Promise<void> {
    await expect
        .poll(() => hasSizedCanvas(page), {
            message:
                "expected a visible canvas with nonzero CSS and backing-store dimensions",
            timeout: 15_000,
        })
        .toBe(true);
}

export async function waitForGraphHandle(page: Page): Promise<GraphSnapshot> {
    await expect
        .poll(async () => (await readGraphSnapshot(page)) !== null, {
            message: "expected the react-force-graph imperative handle",
            timeout: 15_000,
        })
        .toBe(true);

    const snapshot = await readGraphSnapshot(page);
    if (snapshot === null) {
        throw new Error("graph handle disappeared after being observed");
    }
    return snapshot;
}

async function centerReceivesPointer(locator: Locator): Promise<boolean> {
    return locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const center = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
        );

        return center !== null && (center === element || element.contains(center));
    });
}

/**
 * Ensures continuous rotation is paused via its control button, tolerating a
 * state where rotation already stopped (e.g., an earlier registered node
 * click). Software-rendered WebGL can starve Playwright's initial
 * actionability wait, so first prove that the button's center receives
 * pointer events and then dispatch a forced click; later interactions can
 * use ordinary actionability.
 */
export async function ensureRotationPaused(page: Page): Promise<void> {
    const resumeButton = page.getByRole("button", {
        name: "Resume Auto Rotation",
        exact: true,
    });
    if (await resumeButton.isVisible()) {
        return;
    }

    const rotationButton = page.getByRole("button", {
        name: "Pause Auto Rotation",
        exact: true,
    });
    await expect(rotationButton).toBeVisible();
    await expect
        .poll(() => centerReceivesPointer(rotationButton), {
            message: "rotation control center should receive pointer events",
        })
        .toBe(true);
    await rotationButton.click({force: true});
    await expect(resumeButton).toBeVisible();
}

export function cameraDelta(a: GraphSnapshot, b: GraphSnapshot): number {
    return Math.hypot(
        a.cameraX - b.cameraX,
        a.cameraY - b.cameraY,
        a.cameraZ - b.cameraZ,
    );
}

/**
 * Samples the camera twice, `intervalMs` apart, and returns the positional
 * delta. Used to prove rotation motion (delta above a floor) and stillness
 * (delta below an epsilon).
 */
export async function sampleCameraMotion(
    page: Page,
    intervalMs: number,
): Promise<number> {
    const first = await readGraphSnapshot(page);
    await page.waitForTimeout(intervalMs);
    const second = await readGraphSnapshot(page);
    if (first === null || second === null) {
        throw new Error("graph handle unavailable while sampling camera");
    }
    return cameraDelta(first, second);
}

/**
 * Waits until the camera's distance from the origin is stable. Auto-rotation
 * preserves that distance while initial camera placement and Trackball zoom
 * inertia change it, so this settles both without requiring rotation to be
 * paused. An inertia-settling camera stales projected node coordinates and
 * corrupts before/after zoom comparisons.
 */
export async function waitForStableCameraDistance(
    page: Page,
    timeoutMs = 15_000,
): Promise<GraphSnapshot> {
    let previousDistance = Number.NaN;
    await expect
        .poll(
            async () => {
                const snapshot = await readGraphSnapshot(page);
                if (snapshot === null) {
                    return false;
                }

                const stable =
                    Math.abs(snapshot.cameraDistance - previousDistance) < 0.05;
                previousDistance = snapshot.cameraDistance;
                return stable;
            },
            {
                message: "expected the camera distance to settle",
                timeout: timeoutMs,
                intervals: [250],
            },
        )
        .toBe(true);

    const snapshot = await readGraphSnapshot(page);
    if (snapshot === null) {
        throw new Error("graph handle unavailable after camera settled");
    }
    return snapshot;
}

/**
 * Resolves once the camera distance holds steady across `stableFrames`
 * consecutive REAL animation frames, draining any pending Trackball zoom offset.
 *
 * `waitForStableCameraDistance` samples on a wall-clock interval (250 ms) and
 * returns after two close reads. Under GPU-less software rendering on a slow
 * 2-core runner a single frame can take multiple seconds, so a rapid `-2400`
 * wheel burst leaves a large zoom offset pending while consecutive wall-clock
 * reads observe the SAME not-yet-advanced frame — an apparently "stable"
 * plateau. `waitForStableCameraDistance` returns there, the next rendered frame
 * then applies the whole accumulated offset and slams the camera to its minimum
 * distance, and a node fixed on the plateau projects far off-screen (issue #22,
 * shard-4 trace: cameraDistance 1.68 → 0.1, node (407,256) → (3414,2338)).
 *
 * Sampling once PER `requestAnimationFrame` instead defeats that: a slow-frame
 * plateau spans few real frames, and any offset the render loop is still
 * applying moves the distance and resets the stable counter, so this returns
 * only when the camera is genuinely at rest. Frame-based, so it self-scales to
 * render speed; `maxFrames` bounds the wait so a never-resting camera cannot
 * hang the test (the caller re-validates and recovers).
 */
export async function waitForCameraRest(
    page: Page,
    {
        stableFrames = 20,
        epsilon = 0.5,
        maxFrames = 600,
    }: {stableFrames?: number; epsilon?: number; maxFrames?: number} = {},
): Promise<void> {
    await page.evaluate(
        ({stableFrames, epsilon, maxFrames}) =>
            new Promise<void>((resolve) => {
                const distance = (): number => {
                    const snapshot = window.__graphProbe();
                    return snapshot === null
                        ? Number.NaN
                        : snapshot.cameraDistance;
                };
                let previous = distance();
                let stable = 0;
                let frame = 0;
                const tick = (): void => {
                    const current = distance();
                    if (
                        Number.isFinite(current) &&
                        Number.isFinite(previous) &&
                        Math.abs(current - previous) < epsilon
                    ) {
                        stable += 1;
                    } else {
                        stable = 0;
                    }
                    previous = current;
                    frame += 1;
                    if (stable >= stableFrames || frame >= maxFrames) {
                        resolve();
                        return;
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }),
        {stableFrames, epsilon, maxFrames},
    );
}
