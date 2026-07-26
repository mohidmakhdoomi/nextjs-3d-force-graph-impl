import {chromium, firefox} from "@playwright/test";
import process from "node:process";
import {clearTimeout, setTimeout} from "node:timers";

const SOFTWARE_MARKERS = [
    "swiftshader",
    "llvmpipe",
    "softpipe",
    "lavapipe",
    "swrast",
    "software",
    "microsoft basic",
];
const probeScript = `(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return {renderer: null, vendor: null};
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return {
        renderer: info
            ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        vendor: info
            ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL)
            : gl.getParameter(gl.VENDOR),
    };
})()`;

function rendererClass(renderer) {
    if (renderer === null) {
        return "none";
    }
    const normalized = renderer.toLowerCase();
    if (normalized.includes("generic renderer")) {
        return "unverifiable";
    }
    return SOFTWARE_MARKERS.some((marker) => normalized.includes(marker))
        ? "software"
        : "hardware";
}

async function withTimeout(operation, timeoutMs, label) {
    let timer;
    try {
        return await Promise.race([
            operation,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function probe(engine, browserType, launchOptions) {
    const startedAt = Date.now();
    let browser;
    try {
        browser = await withTimeout(
            browserType.launch({...launchOptions, headless: true, timeout: 30_000}),
            45_000,
            `${engine} launch`,
        );
        const page = await browser.newPage();
        const result = await withTimeout(
            page.evaluate(probeScript),
            15_000,
            `${engine} WebGL probe`,
        );
        return {
            engine,
            ...result,
            class: rendererClass(result.renderer),
            durationMs: Date.now() - startedAt,
        };
    } catch (error) {
        return {
            engine,
            renderer: null,
            vendor: null,
            class: "error",
            error: error.message,
            durationMs: Date.now() - startedAt,
        };
    } finally {
        await browser?.close().catch(() => {});
    }
}

const results = [
    await probe("chromium", chromium, {
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    }),
    await probe("firefox", firefox, {
        firefoxUserPrefs: {
            "webgl.force-enabled": true,
            "webgl.sanitize-unmasked-renderer": false,
        },
    }),
];
const chromiumResult = results.find((result) => result.engine === "chromium");
const verification = {
    chromiumSwiftShaderVerified:
        chromiumResult?.class === "software" &&
        chromiumResult.renderer?.toLowerCase().includes("swiftshader"),
    firefoxRendererObserved:
        results.find((result) => result.engine === "firefox")?.renderer !== null,
};
const report = {
    timestamp: new Date().toISOString(),
    intent: "default-suite-renderers-with-explicit-chromium-swiftshader",
    launch: {
        chromiumArgs: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        firefoxPrefs: {
            "webgl.force-enabled": true,
            "webgl.sanitize-unmasked-renderer": false,
        },
    },
    results,
    verification,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!verification.chromiumSwiftShaderVerified || !verification.firefoxRendererObserved) {
    process.exitCode = 1;
}
