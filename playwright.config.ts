import {defineConfig, devices} from "@playwright/test";
import process from "node:process";

const baseURL = "http://127.0.0.1:3000";

export default defineConfig({
    testDir: "./tests/e2e",
    timeout: 120_000,
    fullyParallel: false,
    workers: 1,
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    outputDir: "test-results",
    reporter: [
        ["list"],
        ["html", {outputFolder: "playwright-report", open: "never"}],
    ],
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
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
    ],
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
