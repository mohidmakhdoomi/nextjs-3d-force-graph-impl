// Browser launch options shared by Playwright's config and the parallel-run
// browser servers. Keeping these in one module ensures a connected worker uses
// the same renderer contract as an ordinarily launched Playwright browser.

export const SWIFTSHADER_CHROMIUM_ARGS = [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
];

export const FIREFOX_WEBGL_USER_PREFS = {
    // No GPU is available in headless CI; force software WebGL rather than
    // failing context creation. On a host with a working adapter Firefox can
    // still select that adapter.
    "webgl.force-enabled": true,
};

/**
 * Resolve Chromium's renderer args, preserving the native-GPU lane's explicit
 * PW_CHROMIUM_ARGS override and the default SwiftShader gate.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function resolveChromiumLaunchArgs(env) {
    return env.PW_CHROMIUM_ARGS
        ? env.PW_CHROMIUM_ARGS.split(/\s+/).filter((arg) => arg.length > 0)
        : SWIFTSHADER_CHROMIUM_ARGS;
}
