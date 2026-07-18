import type {AxesHelper, Scene} from "three";

type IntervalHandle = ReturnType<typeof setInterval>;
type TimeoutHandle = ReturnType<typeof setTimeout>;

type TimerScheduler = {
    setInterval(callback: () => void, delay: number): IntervalHandle;
    clearInterval(handle: IntervalHandle): void;
    setTimeout(callback: () => void, delay: number): TimeoutHandle;
    clearTimeout(handle: TimeoutHandle): void;
};

export function createFocusGraphResources(
    scheduler: TimerScheduler = globalThis,
) {
    let rotationTimer: IntervalHandle | undefined;
    let resetTimer: TimeoutHandle | undefined;
    let interactionTimer: TimeoutHandle | undefined;
    let axes: {scene: Scene; helper: AxesHelper} | undefined;

    const stopRotation = () => {
        if (rotationTimer !== undefined) {
            scheduler.clearInterval(rotationTimer);
            rotationTimer = undefined;
        }
    };

    const cancelReset = () => {
        if (resetTimer !== undefined) {
            scheduler.clearTimeout(resetTimer);
            resetTimer = undefined;
        }
    };

    const cancelInteraction = () => {
        if (interactionTimer !== undefined) {
            scheduler.clearTimeout(interactionTimer);
            interactionTimer = undefined;
        }
    };

    const detachAxes = () => {
        if (axes === undefined) {
            return;
        }

        const {scene, helper} = axes;
        axes = undefined;
        scene.remove(helper);
        helper.geometry.dispose();
        const materials = Array.isArray(helper.material)
            ? helper.material
            : [helper.material];
        materials.forEach((material) => material.dispose());
    };

    return {
        startRotation(callback: () => void) {
            if (rotationTimer === undefined) {
                rotationTimer = scheduler.setInterval(callback, 20);
            }
        },
        stopRotation,
        scheduleReset(callback: () => void, delay: number) {
            cancelReset();
            resetTimer = scheduler.setTimeout(() => {
                resetTimer = undefined;
                callback();
            }, delay);
        },
        cancelReset,
        scheduleInteraction(callback: () => void, delay: number) {
            cancelInteraction();
            interactionTimer = scheduler.setTimeout(() => {
                interactionTimer = undefined;
                callback();
            }, delay);
        },
        attachAxes(scene: Scene, helper: AxesHelper) {
            detachAxes();
            axes = {scene, helper};
            scene.add(helper);
        },
        setAxesVisible(visible: boolean) {
            if (axes !== undefined) {
                axes.helper.visible = visible;
            }
        },
        cleanup() {
            stopRotation();
            cancelReset();
            cancelInteraction();
            detachAxes();
        },
    };
}
