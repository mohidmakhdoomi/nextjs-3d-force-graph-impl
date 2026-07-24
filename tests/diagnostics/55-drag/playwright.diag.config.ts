import {defineConfig, devices} from "@playwright/test";
import process from "node:process";

import {resolveWorkers} from "../../../scripts/e2e-workers.mjs";

// Out-of-tree diagnostic Playwright config for issue #55 (the Firefox
// background-drag rotation flake at tests/e2e/matrix.spec.ts:224).
//
// It is deliberately NOT part of the canonical suite. `testDir` points ONLY at
// this folder, so a plain `playwright test` (which uses the repo-root
// playwright.config.ts with testDir "./tests/e2e") never collects the
// diagnostic spec — `npx playwright test --list` proves the canonical test set
// is unchanged. Run this harness explicitly:
//
//   playwright test --config tests/diagnostics/55-drag/playwright.diag.config.ts
//
// The project/engine/webServer setup mirrors the canonical playwright.config.ts
// (same 800x600 viewport, the same PW_CHROMIUM_ARGS SwiftShader-or-hardware
// hook, the same Firefox software-WebGL pref, the same production webServer,
// retries: 0, and E2E_WORKERS via the shared resolver) so the SAME gesture can
// be reproduced on the SwiftShader path OR — by exporting the native-GPU lane
// env (GALLIUM_DRIVER=d3d12, LD_LIBRARY_PATH, PW_CHROMIUM_ARGS) — on hardware
// WebGL in Phase 2, without diverging from how the real test runs. This config
// is evidence-only tooling; it is never the `npm run validate` green gate.

const baseURL = "http://127.0.0.1:3000";

// Byte-identical to the canonical config's default: absent PW_CHROMIUM_ARGS,
// Chromium launches with the deterministic SwiftShader rasterizer; the
// native-GPU lane sets PW_CHROMIUM_ARGS to the verified hardware flag set.
const SWIFTSHADER_CHROMIUM_ARGS = [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
];
const chromiumLaunchArgs = process.env.PW_CHROMIUM_ARGS
    ? process.env.PW_CHROMIUM_ARGS.split(/\s+/).filter((arg) => arg.length > 0)
    : SWIFTSHADER_CHROMIUM_ARGS;

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
                firefoxUserPrefs: {
                    "webgl.force-enabled": true,
                },
            },
        },
    },
];

// Same E2E_ENGINES filter as the canonical config: unset runs both engines;
// `E2E_ENGINES=firefox` narrows to the Firefox arm (the flake's engine).
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
    // Only this diagnostic folder — the canonical testDir ("./tests/e2e") does
    // not reach here, which is what keeps the canonical suite unchanged.
    testDir: ".",
    // The diagnostic runs many repetitions per invocation (Phase 2 uses
    // --repeat-each); keep a generous per-test ceiling since a captured failure
    // waits out the 5 s settle before dumping.
    timeout: 120_000,
    fullyParallel: true,
    // Reuse the canonical worker resolver so Phase 2 can drive the historical
    // highest-recurrence regime (E2E_WORKERS parallel) through this harness.
    workers: resolveWorkers(process.env),
    // Never mask: the diagnostic surfaces the flake, it does not retry it.
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    // Traces/screenshots/video land under the gitignored test-results tree.
    outputDir: "../../../test-results/55-drag-diag",
    reporter: [["list"]],
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects,
    webServer: {
        command: "npm run start -- --hostname 127.0.0.1 --port 3000",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
    },
});
