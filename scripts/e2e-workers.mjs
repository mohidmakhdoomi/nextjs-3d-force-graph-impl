// Pure worker-count resolution for the local Playwright e2e suite (issue #41).
//
// `playwright.config.ts` historically pinned `workers: 1` for every environment;
// this module is the single tested source of truth for the LOCAL worker count so
// the config becomes a thin consumer (`workers: resolveWorkers(process.env)`).
// It has NO I/O, NO `process.env` access, and NO Playwright import — env is
// passed in explicitly so the contract is trivially unit-testable in isolation
// (see tests/e2e-workers.test.mjs) and decoupled from Playwright.
//
// Resolution contract (spec 41 FR2/FR8), in precedence order:
//   1. CI guard (absolute, first): `env.CI` truthy ⇒ the number 1. Returning
//      before reading E2E_WORKERS makes CI precedence structural — the sharded
//      matrix's per-job serial contract is preserved automatically and cannot be
//      overridden by a stray E2E_WORKERS in the environment. The truthy check
//      mirrors the config's existing `process.env.CI ? … : …` idiom (retries,
//      timeout), so CI resolution stays consistent across the config.
//   2. E2E_WORKERS override: a positive integer (`4`) resolves to that number; a
//      percentage (`50%`) is passed through to Playwright as a string (Playwright
//      computes the count from `os.cpus().length`). Empty/unset falls to the
//      default; anything malformed is a LOUD failure (WorkerConfigError), never a
//      silent fallback — mirroring the config's fail-closed E2E_ENGINES guard.
//   3. Default: DEFAULT_LOCAL_WORKERS (`1`, serial). Phase-3 qualification (issue
//      #41) showed parallel workers destabilize the timing-sensitive Chromium
//      matrix.spec.ts camera-settle/drag assertions under SwiftShader CPU
//      contention (4-5 of 22 tests fail on every parallel run — the problem is
//      destabilization, not slowness: parallel is faster) and amplify the known
//      Firefox flake #33 even on hardware — so a `retries: 0` gate cannot default
//      to parallel. Parallelism is therefore OPT-IN via E2E_WORKERS (most useful
//      on the native-GPU lane, where it runs ~4x faster and mostly green; see the
//      review for the recorded evidence and spec Decision 4 / Scenario 5).

// The local default worker count. Phase-3 qualification (issue #41) flipped this
// from the originally-proposed parallel `'50%'` to serial `1` (spec Decision 4 /
// Scenario 5): parallel workers destabilize the timing-sensitive SwiftShader gate
// (4-5 of 22 tests fail on every parallel run — destabilization, not slowness), so
// the qualified `retries: 0` local gate stays serial. Parallelism is opt-in via
// E2E_WORKERS (`'50%'` is the recommended value, most useful on the native-GPU
// lane). Kept as a named constant so the config and tests reference one value.
export const DEFAULT_LOCAL_WORKERS = 1;

// A malformed E2E_WORKERS value — a hard configuration failure, never a silent
// fallback (spec 41 FR2). Mirrors LaneUsageError in scripts/e2e-gpu-lane.mjs: a
// distinct class so the config (and tests) can tell operator misconfiguration
// apart from any other error.
export class WorkerConfigError extends Error {}

// A bare positive integer: one or more digits, no leading zero, no sign, no
// decimal point, no exponent. `1e2`, `01`, `1.5`, `-1`, `0` all fail this.
const INTEGER_PATTERN = /^[1-9][0-9]*$/;
// The same positive integer followed by a literal `%`. `0%`, `%`, `50 %` fail.
const PERCENTAGE_PATTERN = /^[1-9][0-9]*%$/;

/**
 * Resolve the Playwright `workers` value for a local run from the environment.
 *
 * Pure: reads only the passed `env`, never mutates it, performs no I/O.
 *
 * @param {Record<string, string | undefined>} env - environment map (the config
 *   passes `process.env`).
 * @returns {number | string} `1` when `CI` is set; otherwise the `E2E_WORKERS`
 *   override — a positive integer as a `number`, a percentage as a `string` —
 *   or the serial default `1` when `E2E_WORKERS` is unset/empty.
 * @throws {WorkerConfigError} when `E2E_WORKERS` is set to a malformed value.
 */
export function resolveWorkers(env) {
    // 1. CI guard — absolute and first. A truthy CI value forces serial (1)
    //    before E2E_WORKERS is even read, so nothing can weaken the sharded
    //    matrix's per-job serial contract.
    if (env.CI) {
        return 1;
    }

    // 2. E2E_WORKERS override. Undefined or whitespace-only is treated as unset
    //    (a wrapper exporting E2E_WORKERS="" must fall through, not hard-fail).
    const raw = env.E2E_WORKERS;
    if (raw !== undefined) {
        const value = raw.trim();
        if (value.length > 0) {
            if (INTEGER_PATTERN.test(value)) {
                return Number(value);
            }
            if (PERCENTAGE_PATTERN.test(value)) {
                return value;
            }
            throw new WorkerConfigError(
                `E2E_WORKERS="${raw}" is not a valid worker count — expected a ` +
                    "positive integer (e.g. 4) or a percentage (e.g. 50%), " +
                    "not zero, negative, decimal, or non-numeric",
            );
        }
    }

    // 3. Serial default (see DEFAULT_LOCAL_WORKERS). Parallel is opt-in only,
    //    via the E2E_WORKERS branch above.
    return DEFAULT_LOCAL_WORKERS;
}
