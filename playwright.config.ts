import {defineConfig, devices} from "@playwright/test";
import process from "node:process";

const baseURL = "http://127.0.0.1:3000";

const allProjects = [
    {
        name: "chromium",
        use: {
            ...devices["Desktop Chrome"],
            viewport: {width: 800, height: 600},
            launchOptions: {
                args: [
                    "--use-angle=swiftshader",
                    "--enable-unsafe-swiftshader",
                ],
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
    retries: 0,
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
