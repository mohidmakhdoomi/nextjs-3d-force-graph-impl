import assert from "node:assert/strict";
import test from "node:test";

import {PerspectiveCamera, Vector3} from "three";

import {orbitCameraStep} from "../app/components/orbitCamera.ts";

// One auto-rotation step, matching FocusGraph.tsx's 20 ms interval.
const STEP = -Math.PI / 300;
// ~100 ticks ≈ 2 s, a representative node-drag duration at 20 ms/tick.
const DRAG_TICKS = 100;
// The drift-free step leaves only quaternion float noise (~1e-6°). The pre-fix
// tick drifts > 10° over this many ticks, so this ceiling sits ~800× above the
// noise floor and ~10000× below the regression it guards against.
const MAX_DRIFT_DEG = 1e-3;

/**
 * Angle (degrees) between the camera's forward vector and the direction from
 * the camera to `target`. Zero means the camera looks exactly at the target;
 * a growing value is the "center of view wanders" drift from issue #27.
 */
function lookAtErrorDeg(camera, target) {
    const forward = camera.getWorldDirection(new Vector3());
    const toTarget = target.clone().sub(camera.position).normalize();
    const dot = Math.max(-1, Math.min(1, forward.dot(toTarget)));
    return (Math.acos(dot) * 180) / Math.PI;
}

test("orbit keeps the camera locked on the target from an off-equatorial start (issue #27)", () => {
    // A focused/reset camera commonly sits off the equatorial plane, where the
    // camera's local up diverges from world up. The pre-fix tick
    // (applyAxisAngle + rotateOnAxis) accumulated orientation error there and
    // relied on TrackballControls.update()'s per-frame lookAt to hide it — a
    // correction that stops during a node drag (controls disabled) with
    // three-render-objects >= 1.42. With the pre-fix tick this start drifts
    // > 10° over the drag; the fixed step must stay numerically pinned.
    const target = new Vector3(0, 0, 0);
    const camera = new PerspectiveCamera(40, 1, 1, 200);
    camera.position.set(120, 90, 200);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);

    let maxError = 0;
    for (let i = 0; i < DRAG_TICKS; i += 1) {
        orbitCameraStep(camera, target, STEP);
        maxError = Math.max(maxError, lookAtErrorDeg(camera, target));
    }

    assert.ok(
        maxError < MAX_DRIFT_DEG,
        `camera view drifted ${maxError.toFixed(4)}° from the target during a ${DRAG_TICKS}-tick orbit`,
    );
});

test("orbit keeps the camera locked on the target from a steep off-equatorial start (issue #27)", () => {
    // A steeper vantage (mostly overhead) diverges local-up from world-up even
    // more; the pre-fix tick drifts > 35° here.
    const target = new Vector3(0, 0, 0);
    const camera = new PerspectiveCamera(40, 1, 1, 200);
    camera.position.set(60, 150, 60);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);

    let maxError = 0;
    for (let i = 0; i < DRAG_TICKS; i += 1) {
        orbitCameraStep(camera, target, STEP);
        maxError = Math.max(maxError, lookAtErrorDeg(camera, target));
    }

    assert.ok(
        maxError < MAX_DRIFT_DEG,
        `camera view drifted ${maxError.toFixed(4)}° from the target during a ${DRAG_TICKS}-tick orbit`,
    );
});

test("orbit still advances the camera around the target (rotation preserved)", () => {
    // Guard that the fix re-aims *and* keeps orbiting: the position must move
    // while the orbit radius (distance to target at the origin) is preserved.
    const target = new Vector3(0, 0, 0);
    const camera = new PerspectiveCamera(40, 1, 1, 200);
    camera.position.set(0, 0, 300);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);

    const before = camera.position.clone();
    orbitCameraStep(camera, target, STEP);

    assert.ok(
        Math.abs(camera.position.length() - before.length()) < 1e-9,
        "orbit radius must be preserved",
    );
    assert.ok(
        camera.position.distanceTo(before) > 1e-3,
        "the camera position must actually rotate each step",
    );
    // And it is still aimed at the target after moving.
    assert.ok(
        lookAtErrorDeg(camera, target) < MAX_DRIFT_DEG,
        "camera must aim at target",
    );
});
