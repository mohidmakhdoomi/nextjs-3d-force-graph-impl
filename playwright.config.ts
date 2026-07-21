import {defineConfig, devices} from "@playwright/test";
import process from "node:process";

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
// OPT-IN: an opt-in lane may set PW_CHROMIUM_ARGS to a hardware-WebGL flag set
// instead of software SwiftShader. Experiment 42 added this hook to run the suite
// on a real GPU; the *Kaggle* path was REJECTED on Kaggle-AUP grounds (see
// experiments/42_kaggle_gpu_ci/notes.md) and its dispatch workflow was removed.
// The hook is retained to serve issue #44 (opt-in native-GPU LOCAL lane), which
// can set PW_CHROMIUM_ARGS to the ANGLE-Vulkan flag set proven in experiment 42
// run #5 — on real local hardware, with no third party or ToS exposure.
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
                    // No GPU is available in headless CI; force software
                    // WebGL rather than failing context creation.
                    "webgl.force-enabled": true,
                },
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
    // Per-test wall-clock ceiling. CI runners render this WebGL scene through a
    // software rasterizer (SwiftShader) with no GPU, so the compound
    // interaction tests (several camera-settle polls + real drags) run far
    // slower — the whole suite sits near the local 120 s budget on CI. Give CI
    // headroom over the local budget; local timing is unchanged. (The
    // click-to-focus test keeps its own explicit 240 s override either way.)
    timeout: process.env.CI ? 240_000 : 120_000,
    // `fullyParallel` marks every test as an independently schedulable unit so
    // `--shard` splits the suite at the TEST level (not the file level). With
    // `workers: 1` still pinned, execution within any single job stays strictly
    // serial — one test at a time, no SwiftShader CPU contention — so the
    // qualified timing environment is unchanged. CI fans the shards out across
    // parallel jobs; local `npm run validate` still runs one worker start to
    // finish. Do NOT raise `workers`: in-job parallelism reintroduces the
    // contention these timing-sensitive assertions were qualified against.
    fullyParallel: true,
    workers: 1,
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
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
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
