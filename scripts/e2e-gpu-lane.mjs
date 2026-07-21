#!/usr/bin/env node
// Opt-in native-GPU local e2e lane (issue #44, spec/plan 44).
//
// This wrapper is ADDITIONAL tooling, never the green gate: `npm run validate`
// and CI stay on the qualified SwiftShader serial path. It probes the host for
// a usable hardware-WebGL recipe, verifies the effective renderer through the
// repo's own Playwright Chromium BEFORE trusting anything, and runs the full
// Chromium e2e suite under the verified flags (build → production server →
// suite, mirroring `test:smoke`) — falling back loudly to default SwiftShader
// rendering when no hardware candidate verifies.
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
// Recipe provenance: WSL2 Mesa d3d12 recipe proven end-to-end on this host
// class in bugfix-22 / PR #43 (ANGLE→GL and ANGLE→GL-EGL both reached the
// adapter; ANGLE→Vulkan is a known llvmpipe dead end on WSL2). Native-Linux
// ANGLE-Vulkan proven on a Tesla T4 in experiment 42 run #5. The FR5 matrix
// (spec 44) then proved the d3d12 recipe does NOT need a display: default
// headless (headless shell), new-headless (--channel=chromium), and headed
// WSLg all reach the adapter with identical renderer strings and identical
// full-suite timing — so the lane defaults to HEADLESS and headed remains one
// `--mode=headed` away.

import {spawn} from "node:child_process";
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
            "WSL2 Mesa d3d12 via ANGLE native-GL (proven: bugfix-22 / PR #43; " +
            "headless validated by the spec-44 FR5 matrix + full-suite run)",
        hostClass: "wsl2",
        flags: [
            "--use-gl=angle",
            "--use-angle=gl",
            "--ignore-gpu-blocklist",
            "--disable-gpu-sandbox",
        ],
        env: {GALLIUM_DRIVER: "d3d12"},
        envPrepend: {LD_LIBRARY_PATH: WSL_LIB_DIR},
        mode: "headless",
    },
    {
        id: "wsl2-d3d12-angle-gl-egl",
        summary:
            "WSL2 Mesa d3d12 via ANGLE GL-EGL (proven alternate, OpenGL ES " +
            "3.1; headless validated by the spec-44 FR5 matrix)",
        hostClass: "wsl2",
        flags: [
            "--use-gl=angle",
            "--use-angle=gl-egl",
            "--ignore-gpu-blocklist",
            "--disable-gpu-sandbox",
        ],
        env: {GALLIUM_DRIVER: "d3d12"},
        envPrepend: {LD_LIBRARY_PATH: WSL_LIB_DIR},
        mode: "headless",
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
// `extraEnv` (e.g. a defaulted DISPLAY) and the `effectiveMode` (the
// candidate's own mode unless overridden — the FR5 matrix probes headless
// variants of headed candidates via the override). Skipped entries carry the
// FR11 cause + remedy diagnostic.
export function partitionCandidates(
    hostView,
    candidates = CANDIDATES,
    modeOverride = null,
) {
    const usable = [];
    const skipped = [];
    for (const candidate of candidates) {
        const effectiveMode = modeOverride ?? candidate.mode;
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
            if (effectiveMode === "headed") {
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
            usable.push({candidate, extraEnv, effectiveMode});
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
        usable.push({candidate, extraEnv: {}, effectiveMode});
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

// Env for the actual suite run (spec FR4: full Chromium suite, workers/
// retries/timeouts untouched — those stay the config's own defaults).
// Hardware mode injects the verified recipe via the merged PW_CHROMIUM_ARGS
// hook; fallback mode guarantees the config's default SwiftShader args.
export function suiteEnvFor(mode, baseEnv, candidate = null, extraEnv = {}) {
    if (mode === "hardware") {
        const env = composeEnv(baseEnv, candidate, extraEnv);
        env.E2E_ENGINES = "chromium";
        env.PW_CHROMIUM_ARGS = candidate.flags.join(" ");
        return env;
    }
    const env = fallbackEnv(baseEnv);
    env.E2E_ENGINES = "chromium";
    return env;
}

// Headed mode reaches Playwright through the CLI flag — no config change.
export function playwrightTestArgs(headed) {
    return headed ? ["playwright", "test", "--headed"] : ["playwright", "test"];
}

export function suiteResultLabel(exitCode) {
    return exitCode === 0 ? "pass" : `fail (exit ${exitCode})`;
}

export function formatWallClock(totalSeconds, buildSeconds, suiteSeconds) {
    return (
        `${totalSeconds}s (build ${buildSeconds}s, suite ${suiteSeconds}s)`
    );
}

// FR3 steps 2–3: try usable candidates in order with the injected probe until
// one verifies as hardware; report every attempt. `probe` is injected so unit
// tests never touch Playwright.
export async function runSelection({usable, probe, log}) {
    const attempts = [];
    for (const {candidate, extraEnv, effectiveMode} of usable) {
        log(`probing candidate ${candidate.id} (${candidate.summary})`);
        const attempt = await probe(candidate, extraEnv, effectiveMode);
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
        channel = null,
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
    // One transcript per matrix cell: mode (and channel, when probing the
    // full-binary new-headless variant) distinguish repeat probes of the same
    // candidate from each other instead of overwriting.
    const logPath = join(
        PROBE_LOG_DIR,
        `probe-${candidate.id}-${headless ? "headless" : "headed"}` +
            `${channel ? `-${channel}` : ""}.log`,
    );
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
    logLine(
        `binary: ${
            channel
                ? `channel "${channel}" (full Chromium, new headless)`
                : headless
                  ? "playwright default headless (chromium headless shell)"
                  : "playwright chromium (full binary, headed)"
        }`,
    );

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
                ...(channel ? {channel} : {}),
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

// Exported for tests. --mode/--candidate/--channel exist for the FR5
// headless-vs-headed matrix and recipe debugging; a plain `npm run
// test:e2e:gpu` uses none of them.
export function parseArgs(argv) {
    const args = {probeOnly: false, mode: null, candidate: null, channel: null};
    for (const arg of argv) {
        if (arg === "--probe-only") {
            args.probeOnly = true;
        } else if (arg.startsWith("--mode=")) {
            const value = arg.slice("--mode=".length);
            if (value !== "headed" && value !== "headless") {
                throw new LaneUsageError(
                    `--mode must be "headed" or "headless", got "${value}"`,
                );
            }
            args.mode = value;
        } else if (arg.startsWith("--candidate=")) {
            const value = arg.slice("--candidate=".length);
            if (!CANDIDATES.some((candidate) => candidate.id === value)) {
                throw new LaneUsageError(
                    `unknown candidate "${value}" (known: ${CANDIDATES.map(
                        (candidate) => candidate.id,
                    ).join(", ")})`,
                );
            }
            args.candidate = value;
        } else if (arg.startsWith("--channel=")) {
            args.channel = arg.slice("--channel=".length);
        } else {
            throw new LaneUsageError(`unknown argument: ${arg}`);
        }
    }
    if (args.channel && !args.probeOnly) {
        // PW_CHROMIUM_ARGS injects launch args only — the suite cannot switch
        // Playwright channel without config changes, so a channel probe must
        // not pretend its result transfers to a suite run.
        throw new LaneUsageError(
            "--channel is probe-only (--probe-only): the suite cannot inject " +
                "a Playwright channel through PW_CHROMIUM_ARGS",
        );
    }
    return args;
}

// Run one delegated stage (build or suite) with inherited stdio so its own
// output streams through; the lane never re-implements what the stage does.
function runStage(label, command, commandArgs, env) {
    log(`running ${label}: ${command} ${commandArgs.join(" ")}`);
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const child = spawn(command, commandArgs, {env, stdio: "inherit"});
        child.on("error", reject);
        child.on("close", (code) => {
            resolve({
                code: code ?? 1,
                seconds: Math.round((Date.now() - startedAt) / 1000),
            });
        });
    });
}

// Probe the host and settle on the run mode (FR2/FR3). Returns
// {mode: "hardware", candidate, extraEnv, effectiveMode, renderer} |
// {mode: "software-fallback", renderer} | {mode: "abort"} (E2E_GPU_REQUIRE).
async function resolveMode(controls, args) {
    if (controls.forceFallback) {
        fallbackWarning("forced by E2E_GPU_FORCE_FALLBACK=1 (no probe was run)");
        return {
            mode: "software-fallback",
            renderer: "(not probed — default SwiftShader args used)",
        };
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
    const candidates = args.candidate
        ? CANDIDATES.filter((candidate) => candidate.id === args.candidate)
        : CANDIDATES;
    const {usable, skipped} = partitionCandidates(
        hostView,
        candidates,
        args.mode,
    );
    for (const skip of skipped) {
        log(`candidate ${skip.candidate.id} SKIPPED: ${skip.diagnostic}`);
    }

    const selection = await runSelection({
        usable,
        probe: (candidate, extraEnv, effectiveMode) =>
            probeRenderer(candidate, extraEnv, {
                baseEnv: process.env,
                headless: effectiveMode !== "headed",
                channel: args.channel,
            }),
        log,
    });

    if (selection.status === "hardware") {
        const usableEntry = usable.find(
            (entry) => entry.candidate === selection.attempt.candidate,
        );
        return {
            mode: "hardware",
            candidate: selection.attempt.candidate,
            extraEnv: usableEntry?.extraEnv ?? {},
            effectiveMode:
                usableEntry?.effectiveMode ??
                selection.attempt.candidate.mode,
            renderer: selection.attempt.renderer,
        };
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
        return {mode: "abort"};
    }
    fallbackWarning(
        "no usable hardware candidate (see per-candidate diagnostics above)",
    );
    return {
        mode: "software-fallback",
        renderer: "(no hardware renderer — default SwiftShader args used)",
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const controls = parseControls(process.env);
    const startedAt = Date.now();
    const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000);

    const outcome = await resolveMode(controls, args);
    if (outcome.mode === "abort") {
        return 1;
    }

    if (args.probeOnly) {
        console.log(
            formatReport({
                mode: outcome.mode,
                renderer: outcome.renderer,
                suite: "skipped (--probe-only)",
                wallClock: `${elapsedSeconds()}s`,
            }),
        );
        return 0;
    }

    // Full lane: build + suite, mirroring `test:smoke` (build && playwright
    // test; the production server comes from the config's webServer block).
    // The build never needs recipe env; it runs under the untouched
    // inherited env in both modes.
    const build = await runStage("build", "npm", ["run", "build"], process.env);
    if (build.code !== 0) {
        // A failed build is a lane-internal hard failure in every mode (FR3).
        log(`build FAILED (exit ${build.code}) — not running the suite`);
        console.log(
            formatReport({
                mode: outcome.mode,
                renderer: outcome.renderer,
                suite: `not-run (build failed, exit ${build.code})`,
                wallClock: `${elapsedSeconds()}s (build ${build.seconds}s)`,
            }),
        );
        return build.code;
    }

    const headed =
        outcome.mode === "hardware" && outcome.effectiveMode === "headed";
    const suite = await runStage(
        "suite",
        "npx",
        playwrightTestArgs(headed),
        suiteEnvFor(outcome.mode, process.env, outcome.candidate,
            outcome.extraEnv),
    );

    if (outcome.mode === "software-fallback") {
        // FR3: the fallback notice appears at start AND with the final
        // report, so fallback output can never read as hardware evidence.
        fallbackWarning("this suite ran under SOFTWARE rendering (see above)");
    }
    console.log(
        formatReport({
            mode: outcome.mode,
            renderer: outcome.renderer,
            suite: suiteResultLabel(suite.code),
            wallClock: formatWallClock(
                elapsedSeconds(),
                build.seconds,
                suite.seconds,
            ),
        }),
    );
    // The suite's own pass/fail semantics are the lane's exit code (FR3).
    return suite.code;
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
