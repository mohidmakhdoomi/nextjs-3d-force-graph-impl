import {defineConfig, devices} from "@playwright/test";
import process from "node:process";

import {
    FIREFOX_WEBGL_USER_PREFS,
    resolveChromiumLaunchArgs,
} from "./scripts/e2e-browser-options.mjs";
import {resolveWorkers} from "./scripts/e2e-workers.mjs";

const baseURL = "http://127.0.0.1:3000";

// Env-gated Chromium WebGL launch args.
//
// DEFAULT (PW_CHROMIUM_ARGS unset): byte-identical to the previous forced-
// SwiftShader gate. Every local run, `npm run validate`, and the required CI
// Validation gate leave PW_CHROMIUM_ARGS UNSET, so Chromium launches with
// exactly ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] — the same
// deterministic software-WebGL rasterizer as before. This indirection does not
// change any default behavior.
//
// OPT-IN: the native-GPU local lane (`npm run test:e2e:gpu`, issue #44 —
// scripts/e2e-gpu-lane.mjs) consumes this hook: it probes the host, VERIFIES
// the effective renderer through this repo's own Chromium, and only then sets
// PW_CHROMIUM_ARGS to the verified hardware-WebGL flag set (falling back to
// leaving it unset — i.e. these SwiftShader defaults — when no adapter
// verifies). Experiment 42 added the hook for a Kaggle GPU path that was
// REJECTED on Kaggle-AUP grounds (see experiments/42_kaggle_gpu_ci/notes.md);
// the lane runs on real local hardware with no third party or ToS exposure.
// The lane is additional evidence, never the green gate.
const chromiumLaunchArgs = resolveChromiumLaunchArgs(process.env);
const configuredWorkers = resolveWorkers(process.env);
const isParallelLocalRun =
    !process.env.CI &&
    (typeof configuredWorkers === "string" || configuredWorkers > 1);

const allProjects = [
    {
        name: "chromium",
        use: {
            ...devices["Desktop Chrome"],
            viewport: {width: 800, height: 600},
            launchOptions: {
                args: chromiumLaunchArgs,
            },
        },
    },
    {
        name: "firefox",
        use: {
            ...devices["Desktop Firefox"],
            viewport: {width: 800, height: 600},
            launchOptions: {
                firefoxUserPrefs: FIREFOX_WEBGL_USER_PREFS,
            },
        },
    },
];

// Engine selection. Unset (the local qualification gate) runs the full
// two-engine matrix. CI sets E2E_ENGINES=chromium: Chromium's bundled
// SwiftShader is a deterministic software-WebGL rasterizer, so it is the
// required CI gate. Firefox has no SwiftShader equivalent and cannot create a
// WebGL context on GitHub Actions runners (no GPU; Mesa llvmpipe + Xvfb
// absent → "Exhausted GL driver options"), so the Firefox arm stays a
// documented LOCAL qualification gate rather than a flaky CI gate. See
// codev/reviews/11-upgrade-and-behaviorally-quali.md ("CI enforcement vs.
// local qualification").
const requestedEngines = process.env.E2E_ENGINES?.split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
const projects =
    requestedEngines && requestedEngines.length > 0
        ? allProjects.filter((project) =>
              requestedEngines.includes(project.name),
          )
        : allProjects;

if (projects.length === 0) {
    throw new Error(
        `E2E_ENGINES="${process.env.E2E_ENGINES ?? ""}" matched no known ` +
            `engines (available: ${allProjects
                .map((project) => project.name)
                .join(", ")})`,
    );
}

export default defineConfig({
    testDir: "./tests/e2e",
    globalSetup: "./tests/e2e/global-setup.ts",
    // Per-test wall-clock ceiling. CI runners and the explicit parallel local
    // lane render this WebGL scene through software under CPU contention, so
    // compound interaction tests can spend long stretches waiting for a render
    // timeslice. Preserve the qualified serial-local and CI ceilings; only the
    // opt-in parallel stress lane receives the larger scheduler-delay budget.
    timeout: process.env.CI
        ? 240_000
        : isParallelLocalRun
          ? 480_000
          : 120_000,
    expect: {
        timeout: isParallelLocalRun ? 120_000 : 5_000,
    },
    // `fullyParallel` marks every test as an independently schedulable unit,
    // which serves two consumers: CI's `--shard` splits the suite at the TEST
    // level (not the file level), and a local opt-in parallel run (E2E_WORKERS)
    // can fan those units out across workers.
    //
    // `workers` is resolved by resolveWorkers(process.env) (scripts/e2e-workers.mjs,
    // issue #41) — the single tested source of truth for the worker count:
    //   - CI (any truthy `CI`): hard-pinned to 1. The resolver returns BEFORE it
    //     reads E2E_WORKERS, so every sharded job stays strictly serial — one
    //     test at a time, no SwiftShader CPU contention. The qualified CI timing
    //     environment is byte-for-byte unchanged, and a stray E2E_WORKERS can
    //     never parallelize a shard.
    //   - Local default: SERIAL (1), preserving the inexpensive qualification
    //     lane and its existing deadlines/artifacts.
    //   - Local opt-in parallel: E2E_WORKERS=<int|percent> (e.g. 22 or 50%).
    //     Parallel runs use the bounded browser-server pool in global-setup.ts,
    //     contention-aware waits, and no continuous trace/video capture. This
    //     keeps every Playwright worker independently scheduled without spawning
    //     one SwiftShader thread pool and recorder per worker. An invalid value is
    //     a loud WorkerConfigError, never a silent fallback.
    // Local `retries: 0` (below) is preserved so flakes still surface immediately.
    fullyParallel: true,
    workers: configuredWorkers,
    // CI-only retries absorb SwiftShader rendering nondeterminism. The
    // click-to-focus test (matrix.spec.ts) intermittently misses a camera-motion
    // or node-click timing predicate; this predates sharding — it also flaked the
    // old single-job workflow (tracking: issue #34). Local runs keep retries: 0 so
    // flakes surface immediately. A test that only passes on retry is reported as
    // "flaky" in the merged HTML report — that visibility is intentional, not a
    // pass to be hidden.
    retries: process.env.CI ? 2 : 0,
    forbidOnly: Boolean(process.env.CI),
    outputDir: "test-results",
    // Local/default: human-readable `list` + a self-contained HTML report.
    // Sharded CI sets PLAYWRIGHT_BLOB_REPORT so each shard emits a machine
    // `blob` report that the `merge-reports` job stitches into one HTML report;
    // `list` is kept for live per-shard console output. Env unset ⇒ behavior is
    // byte-for-byte the previous local contract.
    reporter: process.env.PLAYWRIGHT_BLOB_REPORT
        ? [["list"], ["blob"]]
        : [
              ["list"],
              ["html", {outputFolder: "playwright-report", open: "never"}],
          ],
    use: {
        baseURL,
        // Recording every page at 22-way SwiftShader concurrency adds another
        // software-rendered frame consumer and makes context teardown take tens
        // of seconds. Keep rich artifacts for the serial qualification/CI lanes;
        // the explicit parallel stress lane favors the behavior under test.
        trace: isParallelLocalRun ? "off" : "retain-on-failure",
        screenshot: "only-on-failure",
        video: isParallelLocalRun ? "off" : "retain-on-failure",
    },
    projects,
    webServer: {
        command:
            "npm run start -- --hostname 127.0.0.1 --port 3000",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
