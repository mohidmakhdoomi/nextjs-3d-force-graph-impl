import {expect, test as base} from "@playwright/test";
import process from "node:process";

const ENDPOINT_ENV = {
    chromium: "E2E_CHROMIUM_WS_ENDPOINTS",
    firefox: "E2E_FIREFOX_WS_ENDPOINTS",
    webkit: "E2E_WEBKIT_WS_ENDPOINTS",
} as const;

export const test = base.extend({
    connectOptions: [
        async ({browserName}, use, workerInfo) => {
            const serialized = process.env[ENDPOINT_ENV[browserName]];
            if (serialized === undefined) {
                await use(undefined);
                return;
            }

            const endpoints = JSON.parse(serialized) as string[];
            const wsEndpoint =
                endpoints[workerInfo.parallelIndex % endpoints.length];
            await use({wsEndpoint});
        },
        {scope: "worker"},
    ],
});

export {expect};
export type {Locator, Page} from "@playwright/test";
