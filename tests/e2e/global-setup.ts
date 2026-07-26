import {
    chromium,
    firefox,
    type BrowserServer,
    type FullConfig,
} from "@playwright/test";
import process from "node:process";

import {
    FIREFOX_WEBGL_USER_PREFS,
    resolveChromiumLaunchArgs,
} from "../../scripts/e2e-browser-options.mjs";

const ENDPOINT_ENV = {
    chromium: "E2E_CHROMIUM_WS_ENDPOINTS",
    firefox: "E2E_FIREFOX_WS_ENDPOINTS",
} as const;

const DEFAULT_POOL_SIZE = {
    // Four SwiftShader processes keep enough render pipelines moving without
    // recreating the 11 independent thread pools that saturate this 24-core
    // qualification host. Firefox is hardware-backed here and needs less fanout.
    chromium: 4,
    firefox: 2,
} as const;

type SharedEngine = keyof typeof ENDPOINT_ENV;

/**
 * Starts a bounded browser-server pool for parallel local runs.
 *
 * Playwright normally launches one complete browser (and therefore one
 * SwiftShader GPU process and thread pool) per worker. At 22 workers that
 * multiplies the software renderer itself, creating hundreds of runnable
 * processes and starving browser lifecycle/input work. A small launchServer
 * pool keeps all 22 Playwright workers and their isolated browser contexts,
 * while bounding renderer-owning processes without forcing every page through
 * one serial rendering bottleneck.
 *
 * CI remains unchanged because its resolved worker count is one.
 */
export default async function globalSetup(config: FullConfig) {
    if (config.workers <= 1) {
        return;
    }

    const selectedEngines = new Set(
        config.projects.map((project) => project.name),
    );
    const servers = new Map<SharedEngine, BrowserServer[]>();

    const launchPool = async (
        engine: SharedEngine,
        launch: () => Promise<BrowserServer>,
    ): Promise<void> => {
        const size = Math.min(config.workers, DEFAULT_POOL_SIZE[engine]);
        const pool = await Promise.all(
            Array.from({length: size}, () => launch()),
        );
        servers.set(engine, pool);
        process.env[ENDPOINT_ENV[engine]] = JSON.stringify(
            pool.map((server) => server.wsEndpoint()),
        );
    };

    const launches: Promise<void>[] = [];
    if (selectedEngines.has("chromium")) {
        launches.push(
            launchPool("chromium", () =>
                chromium.launchServer({
                    headless: true,
                    args: resolveChromiumLaunchArgs(process.env),
                }),
            ),
        );
    }
    if (selectedEngines.has("firefox")) {
        launches.push(
            launchPool("firefox", () =>
                firefox.launchServer({
                    headless: true,
                    firefoxUserPrefs: FIREFOX_WEBGL_USER_PREFS,
                }),
            ),
        );
    }
    await Promise.all(launches);

    return async () => {
        for (const engine of servers.keys()) {
            delete process.env[ENDPOINT_ENV[engine]];
        }
        await Promise.all(
            [...servers.values()]
                .flat()
                .map((server) => server.close()),
        );
    };
}
