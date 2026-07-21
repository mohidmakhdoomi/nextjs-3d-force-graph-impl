#!/usr/bin/env node
// Opt-in native-GPU local e2e lane (issue #44, spec/plan 44).
//
// This wrapper is ADDITIONAL tooling, never the green gate: `npm run validate`
// and CI stay on the qualified SwiftShader serial path. It probes the host for
// a usable hardware-WebGL recipe, verifies the effective renderer through the
// repo's own Playwright Chromium BEFORE trusting anything, and (phase 2) runs
// the full Chromium e2e suite under the verified flags — falling back loudly
// to default SwiftShader rendering when no hardware candidate verifies.
//
// Deterministic candidate lifecycle (spec FR3):
//   1. prereq check   — unusable candidates are SKIPPED with an actionable
//                       one-line diagnostic; they are never attempted.
//   2. verification   — the candidate's renderer probe must return a string
//                       that survives the deny-list (no SwiftShader/llvmpipe/
//                       software rasterizer); crash/timeout/software ⇒ FAILED,
//                       next candidate is tried.
//   3. exhaustion     — all skipped/failed ⇒ loud software fallback. Never a
//                       hard failure by default; E2E_GPU_REQUIRE=1 converts
//                       exhaustion into a non-zero exit for qualification
//                       integrity.
//
// Env controls (read ONLY by this wrapper; nothing committed elsewhere reads
// them — spec FR2/FR7):
//   E2E_GPU_FORCE_FALLBACK=1  skip all hardware candidates; go straight to the
//                             software-fallback path (how Scenario 2 is proven
//                             on a GPU-capable host).
//   E2E_GPU_REQUIRE=1         exit non-zero instead of falling back when no
//                             candidate verifies (hardware-evidence integrity).
//
// Recipe provenance: WSL2 Mesa d3d12 headed recipe proven end-to-end on this
// host class in bugfix-22 / PR #43 (ANGLE→GL and ANGLE→GL-EGL both reached the
// adapter; ANGLE→Vulkan is a known llvmpipe dead end on WSL2). Native-Linux
// ANGLE-Vulkan proven on a Tesla T4 in experiment 42 run #5.

import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import process from "node:process";

// ---------------------------------------------------------------------------
// Constants and candidate data
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[gpu-lane]";
const WSL_LIB_DIR = "/usr/lib/wsl/lib";
const WSLG_X11_SOCKET = "/mnt/wslg/.X11-unix";
const DXG_DEVICE = "/dev/dxg";
// Playwright wipes its own outputDir (test-results/) at suite start, so probe
// transcripts live in a dedicated gitignored directory that survives the run.
const PROBE_LOG_DIR = "gpu-lane-logs";
// Launch-to-verdict budget per candidate. A probe that cannot produce a
// renderer string inside this window is a failed candidate, not a hang.
const PROBE_TOTAL_TIMEOUT_MS = 45_000;
const PROBE_LAUNCH_TIMEOUT_MS = 30_000;

// Renderer deny-list (spec FR3): any match ⇒ software rendering. Markers from
// experiment 42's probe plus the proven local strings.
const SOFTWARE_RENDERER_MARKERS = [
    "swiftshader",
    "llvmpipe",
    "software",
    "microsoft basic",
];

// Data-driven candidate list, ordered by evidence strength (spec FR2: adding a
// future recipe means appending an entry, not restructuring the lane).
// Shape: {id, summary, hostClass, flags, env, envPrepend, mode}.
export const CANDIDATES = [
    {
        id: "wsl2-d3d12-angle-gl",
        summary:
            "WSL2 Mesa d3d12 via ANGLE native-GL (proven: bugfix-22 / PR #43)",
        hostClass: "wsl2",
        flags: [
            "--use-gl=angle",
            "--use-angle=gl",
            "--ignore-gpu-blocklist",
            "--disable-gpu-sandbox",
        ],
        env: {GALLIUM_DRIVER: "d3d12"},
        envPrepend: {LD_LIBRARY_PATH: WSL_LIB_DIR},
        mode: "headed",
    },
    {
        id: "wsl2-d3d12-angle-gl-egl",
        summary:
            "WSL2 Mesa d3d12 via ANGLE GL-EGL (proven alternate, OpenGL ES 3.1)",
        hostClass: "wsl2",
        flags: [
            "--use-gl=angle",
            "--use-angle=gl-egl",
            "--ignore-gpu-blocklist",
            "--disable-gpu-sandbox",
        ],
        env: {GALLIUM_DRIVER: "d3d12"},
        envPrepend: {LD_LIBRARY_PATH: WSL_LIB_DIR},
        mode: "headed",
    },
    {
        id: "native-linux-angle-vulkan",
        summary:
            "Native Linux via ANGLE-Vulkan (proven: experiment 42 run #5, Tesla T4)",
        hostClass: "native-linux",
        flags: [
            "--use-gl=angle",
            "--use-angle=vulkan",
            "--enable-features=Vulkan",
            "--ignore-gpu-blocklist",
        ],
        env: {},
        envPrepend: {},
        mode: "headless",
    },
    {
        id: "native-linux-angle-gl",
        summary: "Native Linux via ANGLE native-GL (untested variant)",
        hostClass: "native-linux",
        flags: ["--use-gl=angle", "--use-angle=gl", "--ignore-gpu-blocklist"],
        env: {},
        envPrepend: {},
        mode: "headless",
    },
];

// ---------------------------------------------------------------------------
// Pure logic (unit-tested in tests/gpu-lane.test.mjs; no I/O, no Playwright)
// ---------------------------------------------------------------------------

// Lane misuse (contradictory controls, unknown CLI args) — a hard failure in
// every mode, unlike hardware absence which is never one by default.
export class LaneUsageError extends Error {}

export function classifyRenderer(renderer) {
    if (typeof renderer !== "string" || renderer.trim().length === 0) {
        return "none";
    }
    const lower = renderer.toLowerCase();
    return SOFTWARE_RENDERER_MARKERS.some((marker) => lower.includes(marker))
        ? "software"
        : "hardware";
}

export function parseControls(env) {
    const enabled = (value) => value === "1" || value === "true";
    const forceFallback = enabled(env.E2E_GPU_FORCE_FALLBACK);
    const requireHardware = enabled(env.E2E_GPU_REQUIRE);
    if (forceFallback && requireHardware) {
        throw new LaneUsageError(
            "E2E_GPU_FORCE_FALLBACK and E2E_GPU_REQUIRE are contradictory " +
                "(cannot require hardware while forcing software fallback)",
        );
    }
    return {forceFallback, requireHardware};
}

// Snapshot of the host facts the prereq checks read. Injected in unit tests;
// built from the real fs/env by main().
export function buildHostView({platform, exists, env}) {
    return {
        platform,
        hasDxg: exists(DXG_DEVICE),
        hasWslLib: exists(WSL_LIB_DIR),
        hasWslgSocket: exists(WSLG_X11_SOCKET),
        display: env.DISPLAY ?? null,
    };
}

// Prereq check (FR3 step 1). Returns {usable, skipped}: usable entries carry
// `extraEnv` (e.g. a defaulted DISPLAY) alongside the candidate; skipped
// entries carry the FR11 cause + remedy diagnostic.
export function partitionCandidates(hostView, candidates = CANDIDATES) {
    const usable = [];
    const skipped = [];
    for (const candidate of candidates) {
        if (hostView.platform !== "linux") {
            skipped.push({
                candidate,
                diagnostic:
                    `platform is ${hostView.platform} — the lane is qualified ` +
                    "on Linux/WSL2 only (other platforms: untested, use the " +
                    "default SwiftShader suite)",
            });
            continue;
        }
        if (candidate.hostClass === "wsl2") {
            if (!hostView.hasDxg) {
                skipped.push({
                    candidate,
                    diagnostic:
                        `${DXG_DEVICE} absent — WSL2 GPU paravirtualization ` +
                        "not available (not a WSL2 host, or WSL GPU support " +
                        "is disabled)",
                });
                continue;
            }
            if (!hostView.hasWslLib) {
                skipped.push({
                    candidate,
                    diagnostic:
                        `${DXG_DEVICE} present but ${WSL_LIB_DIR} missing — ` +
                        "WSL GPU driver libraries not mounted; update WSL " +
                        "(`wsl --update`) and ensure GPU support is enabled",
                });
                continue;
            }
            let extraEnv = {};
            if (candidate.mode === "headed") {
                if (!hostView.display && !hostView.hasWslgSocket) {
                    skipped.push({
                        candidate,
                        diagnostic:
                            `DISPLAY unset and ${WSLG_X11_SOCKET} absent — ` +
                            "WSLg not active, headed hardware mode " +
                            "unavailable (start WSLg or export DISPLAY to a " +
                            "reachable X server)",
                    });
                    continue;
                }
                if (!hostView.display) {
                    // WSLg is present but the shell did not export DISPLAY;
                    // default to WSLg's standard :0 (the PR #43 recipe).
                    extraEnv = {DISPLAY: ":0"};
                }
            }
            usable.push({candidate, extraEnv});
            continue;
        }
        // native-linux candidates
        if (hostView.hasDxg) {
            skipped.push({
                candidate,
                diagnostic:
                    `host is WSL2 (${DXG_DEVICE} present) — ANGLE-Vulkan/` +
                    "native-GL is a known llvmpipe dead end under WSL2; the " +
                    "d3d12 recipe covers this host",
            });
            continue;
        }
        usable.push({candidate, extraEnv: {}});
    }
    return {usable, skipped};
}

// Compose the spawn/launch env for a candidate from a base env, WITHOUT
// mutating the base (fallback correctness depends on the base staying
// pristine). Operator-set disambiguators (MESA_D3D12_DEFAULT_ADAPTER_NAME,
// LIBGL_ALWAYS_SOFTWARE) simply pass through from the base.
export function composeEnv(baseEnv, candidate, extraEnv = {}) {
    const env = {...baseEnv, ...candidate.env, ...extraEnv};
    for (const [key, value] of Object.entries(candidate.envPrepend)) {
        env[key] = baseEnv[key] ? `${value}:${baseEnv[key]}` : value;
    }
    return env;
}

// Env for the software-fallback suite run: the pristine inherited env minus
// PW_CHROMIUM_ARGS (guaranteeing the config's default SwiftShader args even
// if the operator's shell had it exported). No lane recipe key can leak in
// because recipe env is composed per-spawn, never written into process.env.
export function fallbackEnv(baseEnv) {
    const env = {...baseEnv};
    delete env.PW_CHROMIUM_ARGS;
    return env;
}

// FR11 diagnostic for a FAILED (attempted) candidate.
export function failureDiagnostic(attempt) {
    const {candidate, renderer, rendererClass, error, logPath} = attempt;
    const where = logPath ? ` — probe transcript: ${logPath}` : "";
    if (error) {
        return (
            `candidate ${candidate.id} FAILED (${error}) — probe crashed or ` +
            `timed out under this flag/env set${where}`
        );
    }
    if (rendererClass === "none") {
        return (
            `candidate ${candidate.id} produced no usable WebGL context / ` +
            `empty renderer string${where}`
        );
    }
    const mesaHint =
        candidate.hostClass === "wsl2"
            ? "Mesa d3d12 driver missing or not selected (needs Mesa with " +
              "the d3d12 gallium driver; recipe env GALLIUM_DRIVER=d3d12, " +
              `LD_LIBRARY_PATH=${WSL_LIB_DIR})`
            : "adapter not reachable via this backend";
    return (
        `candidate ${candidate.id} returned SOFTWARE renderer ` +
        `"${renderer}" — ${mesaHint}${where}`
    );
}

// Machine-greppable final report (spec FR10). Stable keys — the FR8 stability
// evidence and future #41 qualification grep these exact lines.
export function formatReport({mode, renderer, suite, wallClock}) {
    return [
        "=== E2E GPU LANE REPORT ===",
        `mode: ${mode}`,
        `renderer: ${renderer ?? "(none — suite ran without a probe verdict)"}`,
        "engine: chromium",
        `suite: ${suite}`,
        `wall-clock: ${wallClock}`,
    ].join("\n");
}

// FR3 steps 2–3: try usable candidates in order with the injected probe until
// one verifies as hardware; report every attempt. `probe` is injected so unit
// tests never touch Playwright.
export async function runSelection({usable, probe, log}) {
    const attempts = [];
    for (const {candidate, extraEnv} of usable) {
        log(`probing candidate ${candidate.id} (${candidate.summary})`);
        const attempt = await probe(candidate, extraEnv);
        attempts.push(attempt);
        if (!attempt.error && attempt.rendererClass === "hardware") {
            log(
                `candidate ${candidate.id} VERIFIED hardware renderer: ` +
                    `"${attempt.renderer}"`,
            );
            return {status: "hardware", attempt, attempts};
        }
        log(failureDiagnostic(attempt));
    }
    return {status: "exhausted", attempts};
}

// ---------------------------------------------------------------------------
// Side-effectful pieces (probe + CLI)
// ---------------------------------------------------------------------------

function timestamp() {
    return new Date().toISOString();
}

// Launch the repo's own Playwright Chromium under the candidate's flags/env
// and read the effective UNMASKED_RENDERER_WEBGL. The page-side body is a
// string because it runs in the browser, not in Node (and the file's lint
// scope is Node globals only).
const PROBE_PAGE_SCRIPT = `(() => {
    const canvas = document.createElement("canvas");
    const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) {
        return {renderer: null, vendor: null};
    }
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
        renderer: dbg
            ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        vendor: dbg
            ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
            : gl.getParameter(gl.VENDOR),
    };
})()`;

function writeTranscriptFile(logPath, text) {
    mkdirSync(PROBE_LOG_DIR, {recursive: true});
    writeFileSync(logPath, text);
}

async function importChromium() {
    const {chromium} = await import("@playwright/test");
    return chromium;
}

// Exported for the timed-out-probe cleanup tests: `launcher`, timeouts, and
// transcript writing are injectable; defaults are the real Playwright path.
export async function probeRenderer(
    candidate,
    extraEnv,
    {
        baseEnv,
        headless,
        launcher = importChromium,
        totalTimeoutMs = PROBE_TOTAL_TIMEOUT_MS,
        launchTimeoutMs = PROBE_LAUNCH_TIMEOUT_MS,
        closeTimeoutMs = 5_000,
        writeTranscript = writeTranscriptFile,
    },
) {
    const startedAt = Date.now();
    const transcript = [];
    const logLine = (line) => transcript.push(`${timestamp()} ${line}`);
    const logPath = join(PROBE_LOG_DIR, `probe-${candidate.id}.log`);
    const env = composeEnv(baseEnv, candidate, extraEnv);
    logLine(`candidate: ${candidate.id} (${candidate.summary})`);
    logLine(`flags: ${candidate.flags.join(" ")}`);
    logLine(
        `env injected: ${JSON.stringify({
            ...candidate.env,
            ...extraEnv,
            ...Object.fromEntries(
                Object.keys(candidate.envPrepend).map((key) => [
                    key,
                    env[key],
                ]),
            ),
        })}`,
    );
    logLine(`mode: ${headless ? "headless" : "headed"}`);

    const attempt = {
        candidate,
        headless,
        renderer: null,
        vendor: null,
        rendererClass: "none",
        error: null,
        logPath,
        durationMs: 0,
    };

    // The launch promise is captured OUTSIDE the raced work so a watchdog win
    // can still reap a late-resolving browser: without this, a timeout firing
    // before launch resolves would orphan the Chromium process and keep the
    // lane alive (Codex impl-review, iteration 1).
    let launchPromise = null;
    let timer = null;
    try {
        const chromium = await launcher();
        const work = (async () => {
            launchPromise = chromium.launch({
                headless,
                args: candidate.flags,
                env,
                timeout: launchTimeoutMs,
            });
            const browser = await launchPromise;
            const page = await browser.newPage();
            return page.evaluate(PROBE_PAGE_SCRIPT);
        })();
        // If the watchdog settles the race first, `work` may still reject
        // later (launch failure, closed browser); absorb it so a lost race
        // can never surface as an unhandled rejection.
        work.catch(() => {});
        const watchdog = new Promise((_, reject) => {
            timer = setTimeout(
                () =>
                    reject(
                        new Error(`probe timeout after ${totalTimeoutMs}ms`),
                    ),
                totalTimeoutMs,
            );
        });
        const result = await Promise.race([work, watchdog]);
        attempt.renderer = result.renderer;
        attempt.vendor = result.vendor;
        attempt.rendererClass = classifyRenderer(result.renderer);
        logLine(`renderer: ${JSON.stringify(result.renderer)}`);
        logLine(`vendor: ${JSON.stringify(result.vendor)}`);
        logLine(`class: ${attempt.rendererClass}`);
    } catch (error) {
        attempt.error = error instanceof Error ? error.message : String(error);
        logLine(`ERROR: ${attempt.error}`);
        if (error instanceof Error && error.stack) {
            logLine(error.stack);
        }
    } finally {
        clearTimeout(timer);
        if (launchPromise) {
            // Reap the browser even when the watchdog won the race: await the
            // (possibly still-pending) launch and close its browser, bounded
            // so cleanup can never wedge the lane on a hung launch — the
            // launch's own timeout eventually rejects and is absorbed.
            await Promise.race([
                launchPromise.then((browser) => browser.close()).catch(
                    () => {},
                ),
                new Promise((resolve) => setTimeout(resolve, closeTimeoutMs)),
            ]);
        }
        attempt.durationMs = Date.now() - startedAt;
        logLine(`duration: ${attempt.durationMs}ms`);
        writeTranscript(logPath, `${transcript.join("\n")}\n`);
    }
    return attempt;
}

function log(message) {
    console.log(`${LOG_PREFIX} ${message}`);
}

function fallbackWarning(reason) {
    const banner = "=".repeat(66);
    for (const line of [
        banner,
        "WARNING: SOFTWARE FALLBACK — this run is NOT hardware WebGL",
        `reason: ${reason}`,
        "Its results must never be cited as hardware evidence.",
        banner,
    ]) {
        log(line);
    }
}

function parseArgs(argv) {
    const args = {probeOnly: false};
    for (const arg of argv) {
        if (arg === "--probe-only") {
            args.probeOnly = true;
        } else {
            throw new LaneUsageError(`unknown argument: ${arg}`);
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const controls = parseControls(process.env);
    const startedAt = Date.now();
    const wallClock = () => `${Math.round((Date.now() - startedAt) / 1000)}s`;

    if (!args.probeOnly) {
        // Suite execution lands in plan phase 2 (full_lane_and_inertness_proof).
        throw new LaneUsageError(
            "full-suite execution is not wired yet — run with --probe-only",
        );
    }

    if (controls.forceFallback) {
        fallbackWarning("forced by E2E_GPU_FORCE_FALLBACK=1 (no probe was run)");
        console.log(
            formatReport({
                mode: "software-fallback",
                renderer:
                    "(not probed — default SwiftShader args would be used)",
                suite: "skipped (--probe-only)",
                wallClock: wallClock(),
            }),
        );
        return 0;
    }

    const hostView = buildHostView({
        platform: process.platform,
        exists: existsSync,
        env: process.env,
    });
    log(
        `host: platform=${hostView.platform} dxg=${hostView.hasDxg} ` +
            `wslLib=${hostView.hasWslLib} wslgSocket=${hostView.hasWslgSocket} ` +
            `DISPLAY=${hostView.display ?? "(unset)"}`,
    );
    const {usable, skipped} = partitionCandidates(hostView);
    for (const skip of skipped) {
        log(`candidate ${skip.candidate.id} SKIPPED: ${skip.diagnostic}`);
    }

    const selection = await runSelection({
        usable,
        probe: (candidate, extraEnv) =>
            probeRenderer(candidate, extraEnv, {
                baseEnv: process.env,
                headless: candidate.mode !== "headed",
            }),
        log,
    });

    if (selection.status === "hardware") {
        console.log(
            formatReport({
                mode: "hardware",
                renderer: selection.attempt.renderer,
                suite: "skipped (--probe-only)",
                wallClock: wallClock(),
            }),
        );
        return 0;
    }

    // Exhausted. Summarize every skip/failure (FR11) before deciding.
    log("no hardware candidate verified; summary:");
    for (const skip of skipped) {
        log(`  SKIPPED ${skip.candidate.id}: ${skip.diagnostic}`);
    }
    for (const attempt of selection.attempts) {
        log(`  FAILED  ${failureDiagnostic(attempt)}`);
    }
    if (controls.requireHardware) {
        log("E2E_GPU_REQUIRE=1 — exiting non-zero instead of falling back");
        return 1;
    }
    fallbackWarning(
        "no usable hardware candidate (see per-candidate diagnostics above)",
    );
    console.log(
        formatReport({
            mode: "software-fallback",
            renderer:
                "(no hardware renderer — default SwiftShader args would be used)",
            suite: "skipped (--probe-only)",
            wallClock: wallClock(),
        }),
    );
    return 0;
}

const isMain =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    main()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            if (error instanceof LaneUsageError) {
                console.error(`${LOG_PREFIX} usage error: ${error.message}`);
                process.exitCode = 2;
            } else {
                console.error(`${LOG_PREFIX} internal error:`, error);
                process.exitCode = 1;
            }
        });
}
