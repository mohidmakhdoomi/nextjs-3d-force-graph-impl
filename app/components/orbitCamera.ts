import type {Camera, Vector3} from "three";

/**
 * Advances a turntable-style orbit by one step: rotate the camera's position
 * around its up axis by `angle`, then re-aim the camera at `target`.
 *
 * Re-asserting `lookAt(target)` every step keeps the orbit drift-free and
 * independent of `TrackballControls.update()`. Previously the tick paired
 * `applyAxisAngle` with `rotateOnAxis`, an only-approximate re-aim that
 * accumulates orientation error whenever the camera sits off the equatorial
 * plane (its local up diverges from world up). That error stayed invisible
 * only because `TrackballControls.update()` runs `camera.lookAt(target)` every
 * frame — a correction that `three-render-objects` >= 1.42 skips while controls
 * are disabled (e.g. during a node drag), which surfaced the drift and the
 * snap-back-to-origin on release (issue #27).
 *
 * `target` is expected to be the controls' orbit target (the origin in this
 * app), i.e. the world-space point the position is orbiting about.
 */
export function orbitCameraStep(
    camera: Camera,
    target: Vector3,
    angle: number,
): void {
    const up = camera.up.clone();
    camera.position.applyAxisAngle(up, angle);
    camera.lookAt(target);
}
