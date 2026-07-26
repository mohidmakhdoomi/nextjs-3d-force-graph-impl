import process from "node:process";

import {resolveWorkers} from "../../scripts/e2e-workers.mjs";

const workers = resolveWorkers(process.env);

export const isParallelE2ERun =
    !process.env.CI && (typeof workers === "string" || workers > 1);

// The serial and CI lanes retain their previously qualified deadlines. The
// explicit local stress lane has 22 isolated pages contending for a bounded
// SwiftShader browser pool, so wall-clock waits must cover scheduler delay
// rather than treating lack of a render timeslice as a behavioral failure.
export const READINESS_TIMEOUT_MS = isParallelE2ERun ? 120_000 : 15_000;
export const POINTER_ENABLE_TIMEOUT_MS = isParallelE2ERun ? 120_000 : 20_000;
export const SETTLE_TIMEOUT_MS = process.env.CI
    ? 20_000
    : isParallelE2ERun
      ? 120_000
      : 5_000;
export const INTERACTION_TIMEOUT_MS = isParallelE2ERun ? 120_000 : 15_000;
export const CLICK_REGISTRATION_TIMEOUT_MS = isParallelE2ERun ? 15_000 : 2_500;
export const LONG_TEST_TIMEOUT_MS = isParallelE2ERun ? 480_000 : 240_000;
