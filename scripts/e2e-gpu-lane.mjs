#!/usr/bin/env node
// Opt-in native-GPU local e2e lane (issue #44 Chromium lane; issue #52 adds the
// Firefox arm).
//
// This wrapper is ADDITIONAL tooling, never the green gate: `npm run validate`
// and CI stay on the qualified SwiftShader serial path. It probes the host for
// a usable hardware-WebGL recipe PER ENGINE, verifies the effective renderer
// through the repo's own Playwright browser BEFORE trusting anything, and runs
// the full e2e suite under the verified configuration (build → production
// server → suite, mirroring `test:smoke`) — falling back loudly to default
// SwiftShader rendering (Chromium) when no hardware candidate verifies.
//
// Two engines (issue #52):
//   - Chromium is probed via the ANGLE candidate matrix (launch flags) + the
//     Mesa d3d12 env. Its deterministic SwiftShader fallback is the CI gate.
//   - Firefox is probed via the SAME Mesa env with NO ANGLE flags and a single
//     probe recipe. Firefox privacy-sanitizes the unmasked renderer to
//     "Generic Renderer", so the raw renderer is read through the ephemeral,
//     PROBE-ONLY preference `webgl.sanitize-unmasked-renderer: false` (never
//     applied to the application-suite Firefox profile). A sanitized string is
//     treated as UNVERIFIABLE, never hardware. Firefox has no portable software
//     equivalent, so on exhaustion it is SKIPPED (never an llvmpipe masquerade).
//
// Deterministic candidate lifecycle (spec 44 FR3, generalized per engine):
//   1. prereq check   — unusable candidates are SKIPPED with an actionable
//                       one-line diagnostic; they are never attempted.
//   2. verification   — the candidate's renderer probe must return a string
//                       that survives the deny-list (no SwiftShader/llvmpipe/
//                       software rasterizer) and is not the sanitized Firefox
//                       string; crash/timeout/software/sanitized ⇒ FAILED.
//   3. exhaustion     — all skipped/failed ⇒ loud software fallback (Chromium)
//                       and Firefox skipped. Never a hard failure by default;
//                       E2E_GPU_REQUIRE=1 converts exhaustion of ANY requested
//                       engine into a non-zero exit for qualification integrity.
//
// Env controls (read ONLY by this wrapper; nothing committed elsewhere reads
// them — spec 44 FR2/FR7):
//   E2E_GPU_FORCE_FALLBACK=1  skip all hardware probing; go straight to the
//                             software-fallback path (Chromium SwiftShader,
//                             Firefox skipped — how Scenario 2 is proven on a
//                             GPU-capable host).
//   E2E_GPU_REQUIRE=1         exit non-zero instead of falling back when any
//                             requested engine does not verify hardware.
//
// CLI (read ONLY by this wrapper):
//   --engine=chromium|firefox|all  select the probe/suite engine set (default
//                                  `all` = both). `all` is the two-engine lane.
//   --probe-only                   probe the requested engine set and print the
//                                  per-engine report; run no build/suite.
//   --mode/--candidate/--channel   Chromium recipe-debugging surface (spec 44
//                                  FR5 matrix); a plain `npm run test:e2e:gpu`
//                                  uses none of them.
//
// Recipe provenance: WSL2 Mesa d3d12 recipe proven end-to-end on this host
// class in bugfix-22 / PR #43 (ANGLE→GL and ANGLE→GL-EGL both reached the
// adapter; ANGLE→Vulkan is a known llvmpipe dead end on WSL2). Native-Linux
// ANGLE-Vulkan proven on a Tesla T4 in experiment 42 run #5. The FR5 matrix
// (spec 44) then proved the d3d12 recipe does NOT need a display: default
// headless (headless shell), new-headless (--channel=chromium), and headed
// WSLg all reach the adapter with identical renderer strings and identical
// full-suite timing — so the lane defaults to HEADLESS and headed remains one
// `--mode=headed` away. Firefox hardware WebGL under the same Mesa d3d12 recipe
// is proven in firefox-native-gpu-e2e-feasibility.md (2026-07-21, go verdict).

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

// The engines the lane can probe/run, in canonical report order.
export const ENGINES = ["chromium", "firefox"];

// Renderer deny-list (spec 44 FR3, expanded by spec 52 FR3/Decision 7): any
// match ⇒ software rendering. Markers from experiment 42's probe, the proven
// local strings, plus the Mesa software rasterizers Firefox can silently land
// on (softpipe/lavapipe/swrast) when the d3d12 adapter is not selected.
const SOFTWARE_RENDERER_MARKERS = [
    "swiftshader",
    "llvmpipe",
    "softpipe",
    "lavapipe",
    "swrast",
    "software",
    "microsoft basic",
];

// Firefox privacy-sanitizes the unmasked renderer to this string. It matches no
// software marker, so without an explicit verdict it would falsely read as
// hardware — hence a distinct UNVERIFIABLE class tied to the probe-only pref
// (spec 52 FR3). Seeing it means the probe preference did not take.
const SANITIZED_RENDERER_MARKERS = ["generic renderer"];

// Data-driven Chromium candidate list, ordered by evidence strength (spec 44
// FR2: adding a future recipe means appending an entry, not restructuring the
// lane). Shape: {id, summary, hostClass, flags, env, envPrepend, mode}.
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

// Single Firefox probe recipe (spec 52 Decision 3): the SAME Mesa d3d12 env as
// Chromium, NO ANGLE flags (Firefox has prefs, not launch flags), the same WSL2
// host-prereq gating as the Chromium candidates (reused via partitionCandidates
// through the shared {hostClass, mode} shape), and probe-only Firefox prefs. The
// sanitize pref is confined to this ephemeral probe browser; the committed
// `firefox` Playwright project keeps `webgl.force-enabled: true` only.
export const FIREFOX_PROBE_RECIPE = {
    id: "wsl2-d3d12-firefox",
    summary:
        "WSL2 Mesa d3d12 via Firefox (no ANGLE flags; probe-only " +
        "webgl.sanitize-unmasked-renderer=false to read the raw renderer)",
    hostClass: "wsl2",
    // No launch flags: Firefox reaches the d3d12 adapter through the Mesa env
    // alone. `flags` stays an empty array so the shared candidate-shaped code
    // (partitionCandidates, transcripts) has a uniform field to read.
    flags: [],
    env: {GALLIUM_DRIVER: "d3d12"},
    envPrepend: {LD_LIBRARY_PATH: WSL_LIB_DIR},
    firefoxUserPrefs: {
        "webgl.force-enabled": true,
        "webgl.sanitize-unmasked-renderer": false,
    },
    mode: "headless",
};

// ---------------------------------------------------------------------------
// Pure logic (unit-tested in tests/gpu-lane.test.mjs; no I/O, no Playwright)
// ---------------------------------------------------------------------------

// Lane misuse (contradictory controls, unknown CLI args) — a hard failure in
// every mode, unlike hardware absence which is never one by default.
export class LaneUsageError extends Error {}

// Classify a raw renderer string into exactly one verdict. Only "hardware" is
// trusted; "unverifiable" is the Firefox sanitized string (probe pref did not
// take); "software" is any deny-listed rasterizer; "none" is empty/absent.
export function classifyRenderer(renderer) {
    if (typeof renderer !== "string" || renderer.trim().length === 0) {
        return "none";
    }
    const lower = renderer.toLowerCase();
    if (SANITIZED_RENDERER_MARKERS.some((marker) => lower.includes(marker))) {
        return "unverifiable";
    }
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
// FR11 cause + remedy diagnostic. Reused for both engines: the Firefox recipe
// is candidate-shaped ({hostClass, mode}), so its host gating is identical.
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

// FR11 diagnostic for a FAILED (attempted) candidate. Names the engine and
// points at the engine-tagged transcript so a two-engine run's failures are
// never ambiguous about which browser produced them.
export function failureDiagnostic(attempt) {
    const {engine, candidate, renderer, rendererClass, error, logPath} = attempt;
    const label = `${engine ? `${engine} ` : ""}candidate ${candidate.id}`;
    const where = logPath ? ` — probe transcript: ${logPath}` : "";
    if (error) {
        return (
            `${label} FAILED (${error}) — probe crashed or ` +
            `timed out under this flag/env set${where}`
        );
    }
    if (rendererClass === "none") {
        return (
            `${label} produced no usable WebGL context / ` +
            `empty renderer string${where}`
        );
    }
    if (rendererClass === "unverifiable") {
        // The sanitized-renderer branch (spec 52 FR3/FR11): a Firefox probe that
        // reports "Generic Renderer" means the probe-only preference did not
        // take — the REMEDY is the preference, NOT the Mesa/adapter hint below.
        return (
            `${label} returned the sanitized renderer "${renderer}" — the ` +
            "probe-only preference webgl.sanitize-unmasked-renderer=false did " +
            "not take, so Firefox hid the true renderer (privacy-sanitized to " +
            `"Generic Renderer"); this is UNVERIFIABLE, not hardware${where}`
        );
    }
    const mesaHint =
        candidate.hostClass === "wsl2"
            ? "Mesa d3d12 driver missing or not selected (needs Mesa with " +
              "the d3d12 gallium driver; recipe env GALLIUM_DRIVER=d3d12, " +
              `LD_LIBRARY_PATH=${WSL_LIB_DIR})`
            : "adapter not reachable via this backend";
    return (
        `${label} returned SOFTWARE renderer ` +
        `"${renderer}" — ${mesaHint}${where}`
    );
}

// Report line for one engine's outcome (spec 52 FR10). Stable phrasing — the
// FR8 stability evidence and future #41 qualification grep these lines.
export function engineReportLine(outcome) {
    if (outcome.state === "hardware") {
        return outcome.renderer;
    }
    if (outcome.state === "software-fallback") {
        return "(software-fallback — SwiftShader)";
    }
    if (outcome.state === "skipped") {
        return `skipped (unverified — ${outcome.reason})`;
    }
    return "(unknown)";
}

// Machine-greppable final report (spec 52 FR10). Replaces the #44 single
// `engine: chromium` / `renderer:` lines with a per-engine contract. `engines`
// is an ordered [{engine, renderer}] list; every requested engine gets exactly
// one `renderer.<engine>` line (a skipped engine is represented explicitly,
// never omitted silently).
export function formatReport({mode, engines, suite, wallClock}) {
    return [
        "=== E2E GPU LANE REPORT ===",
        `mode: ${mode}`,
        `engines: ${engines.map((entry) => entry.engine).join(",")}`,
        ...engines.map((entry) => `renderer.${entry.engine}: ${entry.renderer}`),
        `suite: ${suite}`,
        `wall-clock: ${wallClock}`,
    ].join("\n");
}

// The report `mode:` label for a run plan (spec 52 FR10: hardware |
// software-fallback | skipped). skip-empty (no verified engine) reads as
// "skipped"; abort never reaches a report.
export function reportModeLabel(planMode) {
    return planMode === "skip-empty" ? "skipped" : planMode;
}

// Whether the suite runs headed. Only a hardware run can be headed (fallback is
// always the config's default headless), and only when the run's uniform
// effective mode is "headed" (the --mode=headed override) — true for BOTH
// Chromium-inclusive and Firefox-only hardware runs, not just Chromium.
export function isHeadedRun(plan) {
    return plan.mode === "hardware" && plan.effectiveMode === "headed";
}

// Build the ordered per-engine report entries for a run plan.
export function reportEntriesFromPlan(plan, requestedEngines) {
    return requestedEngines
        .filter((engine) => plan.engines[engine])
        .map((engine) => ({
            engine,
            renderer: engineReportLine(plan.engines[engine]),
        }));
}

// Two-engine verification gating (spec 52 FR4, Decisions 4–6) — a PURE decision
// function. Given the requested engine set, each engine's probe verdict, and
// the controls, decide the run shape. Only "hardware" runs the combined suite;
// non-strict exhaustion keeps Chromium's deterministic SwiftShader fallback and
// SKIPS Firefox (never an llvmpipe masquerade); a Firefox-only set with no
// hardware yields an empty engine set that must never reach Playwright
// (skip-empty, exit 0); E2E_GPU_REQUIRE=1 aborts before build/suite.
//
// A verdict is {engine, verified, renderer, reason?, candidate?, extraEnv?,
// effectiveMode?}. `verified` is true only for a hardware renderer.
export function computeRunPlan({requestedEngines, verdicts = {}, controls}) {
    const hasChromium = requestedEngines.includes("chromium");
    const requestsFirefox = requestedEngines.includes("firefox");

    // Forced software fallback: no probe was run. (FORCE_FALLBACK + REQUIRE is a
    // usage error already rejected by parseControls.)
    if (controls.forceFallback) {
        if (hasChromium) {
            const engines = {
                chromium: {state: "software-fallback"},
            };
            if (requestsFirefox) {
                engines.firefox = {
                    state: "skipped",
                    reason:
                        "forced fallback, Firefox has no software equivalent",
                };
            }
            return {mode: "software-fallback", suiteEngines: ["chromium"], engines};
        }
        // Firefox-only + forced fallback ⇒ vacuous no-op skip (spec 52 FR4):
        // Firefox has no software path, so there is nothing to run. Exit 0.
        return {
            mode: "skip-empty",
            suiteEngines: [],
            engines: {
                firefox: {
                    state: "skipped",
                    reason:
                        "forced fallback, Firefox has no software equivalent",
                },
            },
        };
    }

    const unverified = requestedEngines.filter(
        (engine) => !verdicts[engine]?.verified,
    );

    // Every requested engine verified hardware ⇒ combined hardware run.
    if (unverified.length === 0) {
        const engines = {};
        for (const engine of requestedEngines) {
            engines[engine] = {
                state: "hardware",
                renderer: verdicts[engine].renderer,
            };
        }
        const plan = {
            mode: "hardware",
            suiteEngines: [...requestedEngines],
            engines,
            // The --mode override is applied uniformly across engines, so every
            // verified engine shares one effective mode; it drives the headed
            // suite dispatch (isHeadedRun) for Chromium-inclusive AND
            // Firefox-only hardware runs alike.
            effectiveMode:
                verdicts[requestedEngines[0]]?.effectiveMode ?? "headless",
        };
        if (hasChromium) {
            plan.chromiumCandidate = verdicts.chromium.candidate;
            plan.chromiumExtraEnv = verdicts.chromium.extraEnv ?? {};
        }
        if (requestsFirefox) {
            plan.firefoxRecipe = verdicts.firefox.candidate;
            plan.firefoxExtraEnv = verdicts.firefox.extraEnv ?? {};
        }
        return plan;
    }

    // Not all verified. Strict mode aborts before any build/suite (Decision 5).
    if (controls.requireHardware) {
        const engines = {};
        for (const engine of requestedEngines) {
            const verdict = verdicts[engine];
            engines[engine] = verdict?.verified
                ? {state: "hardware", renderer: verdict.renderer}
                : {state: "skipped", reason: verdict?.reason ?? "unverified"};
        }
        return {mode: "abort", suiteEngines: [], engines, unverified};
    }

    // Non-strict honest fallback (Decision 6).
    if (hasChromium) {
        const engines = {chromium: {state: "software-fallback"}};
        if (requestsFirefox) {
            engines.firefox = {
                state: "skipped",
                reason: verdicts.firefox?.reason ?? "unverified",
            };
        }
        return {mode: "software-fallback", suiteEngines: ["chromium"], engines};
    }
    // Firefox-only, non-strict, unverified ⇒ empty engine set ⇒ skip, exit 0.
    return {
        mode: "skip-empty",
        suiteEngines: [],
        engines: {
            firefox: {
                state: "skipped",
                reason: verdicts.firefox?.reason ?? "unverified",
            },
        },
    };
}

// Env for the actual suite run (spec 44 FR4 / spec 52 FR5: the full suite for
// the resolved engine set, workers/retries/timeouts untouched — those stay the
// config's own defaults). Consumes the run plan from computeRunPlan:
//   - Hardware with Chromium in the set (Chromium alone OR Chromium+Firefox):
//     inject the verified Chromium recipe's Mesa env into the suite process and
//     set E2E_ENGINES to the resolved set; a two-engine run's Firefox INHERITS
//     that same Mesa env with no new config hook (Decision 9). PW_CHROMIUM_ARGS
//     stays Chromium-scoped.
//   - Hardware, Firefox-only: inject the Firefox recipe's Mesa env directly
//     (same GALLIUM_DRIVER + LD_LIBRARY_PATH); no PW_CHROMIUM_ARGS.
//   - Software-fallback: the config's own SwiftShader defaults, Chromium only
//     (Firefox is skipped, not run — Decision 6), exactly the #44 fallback.
// skip-empty / abort run no suite, so calling this for them is a lane-internal
// invariant violation (guarded below), not a reachable path.
export function suiteEnvFor(plan, baseEnv) {
    if (plan.mode === "hardware") {
        const engineList = plan.suiteEngines.join(",");
        if (plan.suiteEngines.includes("chromium")) {
            const env = composeEnv(
                baseEnv,
                plan.chromiumCandidate,
                plan.chromiumExtraEnv ?? {},
            );
            env.E2E_ENGINES = engineList;
            env.PW_CHROMIUM_ARGS = plan.chromiumCandidate.flags.join(" ");
            return env;
        }
        const env = composeEnv(
            baseEnv,
            plan.firefoxRecipe,
            plan.firefoxExtraEnv ?? {},
        );
        env.E2E_ENGINES = engineList;
        return env;
    }
    if (plan.mode === "software-fallback") {
        const env = fallbackEnv(baseEnv);
        env.E2E_ENGINES = "chromium";
        return env;
    }
    throw new Error(
        `suiteEnvFor: no suite runs for plan mode "${plan.mode}" ` +
            "(skip-empty/abort must return before build/suite)",
    );
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

// Short human reason for an engine that did NOT verify hardware — used in the
// report's `renderer.<engine>: skipped (unverified — <reason>)` line and the
// start-of-run skip notice. The full per-candidate diagnostics are already
// logged inline by runSelection; this is the one-line summary.
export function engineSkipReason(attempts, skipped) {
    if (attempts.length === 0) {
        // Every recipe was skipped by the host-prereq check.
        return skipped.length > 0
            ? "host prerequisites not met (see per-candidate diagnostics)"
            : "no usable recipe for this host";
    }
    const last = attempts[attempts.length - 1];
    if (last.error) {
        return `probe failed (${last.error})`;
    }
    if (last.rendererClass === "unverifiable") {
        return `sanitized renderer "${last.renderer}" — probe preference did not take`;
    }
    if (last.rendererClass === "software") {
        return `software renderer "${last.renderer}"`;
    }
    return "no usable WebGL context";
}

// ---------------------------------------------------------------------------
// Side-effectful pieces (probe + CLI)
// ---------------------------------------------------------------------------

function timestamp() {
    return new Date().toISOString();
}

// Launch the repo's own Playwright browser under the candidate's flags/env/prefs
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

// Resolve the Playwright BrowserType for an engine. Injected in tests.
async function importBrowserType(engine) {
    const pw = await import("@playwright/test");
    return engine === "firefox" ? pw.firefox : pw.chromium;
}

// Exported for the timed-out-probe cleanup tests: `launcher`, timeouts, and
// transcript writing are injectable; defaults are the real Playwright path.
// The launch differs per engine — Chromium takes `args` (+ optional channel),
// Firefox takes `firefoxUserPrefs` — but the watchdog/late-reap/bounded-close
// machinery is engine-independent.
export async function probeRenderer(
    candidate,
    extraEnv,
    {
        engine = "chromium",
        baseEnv,
        headless,
        channel = null,
        launcher = importBrowserType,
        totalTimeoutMs = PROBE_TOTAL_TIMEOUT_MS,
        launchTimeoutMs = PROBE_LAUNCH_TIMEOUT_MS,
        closeTimeoutMs = 5_000,
        writeTranscript = writeTranscriptFile,
    },
) {
    const startedAt = Date.now();
    const transcript = [];
    const logLine = (line) => transcript.push(`${timestamp()} ${line}`);
    // One transcript per matrix cell: engine + mode (and channel, when probing
    // the full-binary new-headless Chromium variant) distinguish repeat probes
    // from each other instead of overwriting.
    const logPath = join(
        PROBE_LOG_DIR,
        `probe-${engine}-${candidate.id}-${headless ? "headless" : "headed"}` +
            `${channel ? `-${channel}` : ""}.log`,
    );
    const env = composeEnv(baseEnv, candidate, extraEnv);
    logLine(`engine: ${engine}`);
    logLine(`candidate: ${candidate.id} (${candidate.summary})`);
    if (engine === "firefox") {
        logLine(`prefs: ${JSON.stringify(candidate.firefoxUserPrefs)}`);
    } else {
        logLine(`flags: ${candidate.flags.join(" ")}`);
    }
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
            engine === "firefox"
                ? "playwright firefox"
                : channel
                  ? `channel "${channel}" (full Chromium, new headless)`
                  : headless
                    ? "playwright default headless (chromium headless shell)"
                    : "playwright chromium (full binary, headed)"
        }`,
    );

    const attempt = {
        engine,
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
    // before launch resolves would orphan the browser process and keep the
    // lane alive (Codex impl-review, iteration 1).
    let launchPromise = null;
    let timer = null;
    try {
        const browserType = await launcher(engine);
        const launchOptions = {
            headless,
            env,
            timeout: launchTimeoutMs,
        };
        if (engine === "firefox") {
            launchOptions.firefoxUserPrefs = candidate.firefoxUserPrefs;
        } else {
            launchOptions.args = candidate.flags;
            if (channel) {
                launchOptions.channel = channel;
            }
        }
        const work = (async () => {
            launchPromise = browserType.launch(launchOptions);
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

// The recipe set to probe for an engine. Chromium iterates the ANGLE candidate
// matrix (optionally narrowed by --candidate); Firefox has a single recipe.
function recipesForEngine(engine, args) {
    if (engine === "firefox") {
        return [FIREFOX_PROBE_RECIPE];
    }
    return args.candidate
        ? CANDIDATES.filter((candidate) => candidate.id === args.candidate)
        : CANDIDATES;
}

// Exported for tests. --mode/--candidate/--channel exist for the FR5
// headless-vs-headed matrix and recipe debugging; a plain `npm run
// test:e2e:gpu` uses none of them. --engine selects the engine set (spec 52
// FR7): `all` (default) is the two-engine lane.
export function parseArgs(argv) {
    const args = {
        probeOnly: false,
        mode: null,
        candidate: null,
        channel: null,
        engines: [...ENGINES],
    };
    for (const arg of argv) {
        if (arg === "--probe-only") {
            args.probeOnly = true;
        } else if (arg.startsWith("--engine=")) {
            const value = arg.slice("--engine=".length);
            if (value === "all") {
                args.engines = [...ENGINES];
            } else if (ENGINES.includes(value)) {
                args.engines = [value];
            } else {
                throw new LaneUsageError(
                    `--engine must be "chromium", "firefox", or "all", got ` +
                        `"${value}"`,
                );
            }
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

// Probe a single engine and return its verdict:
//   {engine, verified, renderer, rendererClass, reason?, candidate?, extraEnv?,
//    effectiveMode?}
// `verified` is true only for a hardware renderer; the winning candidate/env is
// carried for the suite run (Chromium: the ANGLE candidate; Firefox: the recipe).
async function probeSingleEngine(engine, hostView, args) {
    const recipes = recipesForEngine(engine, args);
    const {usable, skipped} = partitionCandidates(hostView, recipes, args.mode);
    for (const skip of skipped) {
        log(`[${engine}] candidate ${skip.candidate.id} SKIPPED: ${skip.diagnostic}`);
    }
    const selection = await runSelection({
        usable,
        probe: (candidate, extraEnv, effectiveMode) =>
            probeRenderer(candidate, extraEnv, {
                engine,
                baseEnv: process.env,
                headless: effectiveMode !== "headed",
                channel: engine === "chromium" ? args.channel : null,
            }),
        log,
    });

    if (selection.status === "hardware") {
        const usableEntry = usable.find(
            (entry) => entry.candidate === selection.attempt.candidate,
        );
        return {
            engine,
            verified: true,
            renderer: selection.attempt.renderer,
            rendererClass: "hardware",
            candidate: selection.attempt.candidate,
            extraEnv: usableEntry?.extraEnv ?? {},
            effectiveMode:
                usableEntry?.effectiveMode ??
                selection.attempt.candidate.mode,
        };
    }

    const last = selection.attempts[selection.attempts.length - 1];
    return {
        engine,
        verified: false,
        renderer: last?.renderer ?? null,
        rendererClass: last?.rendererClass ?? "none",
        reason: engineSkipReason(selection.attempts, skipped),
    };
}

// Probe every requested engine and return a {engine: verdict} map.
async function probeEngines(requestedEngines, args) {
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
    const verdicts = {};
    for (const engine of requestedEngines) {
        verdicts[engine] = await probeSingleEngine(engine, hostView, args);
    }
    return verdicts;
}

// --probe-only: probe the requested engine set and print the per-engine report;
// run no build/suite. Reports each engine's ACTUAL probe result (a probe is a
// diagnostic, not a run), while `mode:` reflects what a full run WOULD be.
async function runProbeOnly(args, controls, elapsedSeconds) {
    const requestedEngines = args.engines;
    if (controls.forceFallback) {
        fallbackWarning(
            "forced by E2E_GPU_FORCE_FALLBACK=1 (no probe was run)",
        );
    }
    const verdicts = controls.forceFallback
        ? {}
        : await probeEngines(requestedEngines, args);
    const plan = computeRunPlan({requestedEngines, verdicts, controls});

    if (plan.mode === "abort") {
        log(
            "E2E_GPU_REQUIRE=1 — not every requested engine verified hardware; " +
                "exiting non-zero",
        );
        return 1;
    }

    const engines = requestedEngines.map((engine) => {
        if (controls.forceFallback) {
            return {engine, renderer: engineReportLine(plan.engines[engine])};
        }
        const verdict = verdicts[engine];
        return {
            engine,
            renderer: verdict.verified
                ? verdict.renderer
                : `skipped (unverified — ${verdict.reason})`,
        };
    });
    console.log(
        formatReport({
            mode: reportModeLabel(plan.mode),
            engines,
            suite: "skipped (--probe-only)",
            wallClock: `${elapsedSeconds()}s`,
        }),
    );
    return 0;
}

// Full lane: build + suite, mirroring `test:smoke`. Probes the full requested
// engine set, gates on computeRunPlan, and runs ONE Playwright invocation for
// the resolved suite engine set (E2E_ENGINES=chromium,firefox for the default
// two-engine hardware run; Chromium-only SwiftShader on honest fallback). An
// empty engine set (Firefox-only, unverified) is never handed to Playwright.
async function runFullLane(args, controls, elapsedSeconds) {
    const requestedEngines = args.engines;
    const verdicts = controls.forceFallback
        ? {}
        : await probeEngines(requestedEngines, args);
    const plan = computeRunPlan({requestedEngines, verdicts, controls});

    if (plan.mode === "abort") {
        // E2E_GPU_REQUIRE=1 and some requested engine did not verify hardware:
        // fail before build/suite (Decision 5). Per-candidate diagnostics were
        // already logged inline during probing.
        log(
            "E2E_GPU_REQUIRE=1 — not every requested engine verified hardware " +
                `(unverified: ${plan.unverified.join(", ")}); exiting non-zero ` +
                "before build/suite",
        );
        return 1;
    }

    if (plan.mode === "skip-empty") {
        // Empty engine set (Scenario 7): Firefox unverified and Chromium not
        // requested. The lane MUST NOT invoke Playwright with an empty
        // E2E_ENGINES (it trips the config's projects.length===0 guard), so it
        // skips build/suite entirely and exits 0 — hardware absence is never a
        // hard failure by default.
        log(
            "no verified engine to run (Firefox unverified, Chromium not " +
                "requested) — skipping build and suite",
        );
        console.log(
            formatReport({
                mode: reportModeLabel(plan.mode),
                engines: reportEntriesFromPlan(plan, requestedEngines),
                suite: "skipped (no verified engine)",
                wallClock: `${elapsedSeconds()}s`,
            }),
        );
        return 0;
    }

    if (plan.mode === "software-fallback") {
        // FR3: the fallback notice appears at start AND with the final report,
        // so fallback output can never read as hardware evidence.
        fallbackWarning(
            controls.forceFallback
                ? "forced by E2E_GPU_FORCE_FALLBACK=1 (no probe was run)"
                : "no usable hardware candidate (see per-candidate diagnostics above)",
        );
    }

    // The build never needs recipe env; it runs under the untouched inherited
    // env in both modes.
    const build = await runStage("build", "npm", ["run", "build"], process.env);
    if (build.code !== 0) {
        // A failed build is a lane-internal hard failure in every mode (FR3).
        log(`build FAILED (exit ${build.code}) — not running the suite`);
        console.log(
            formatReport({
                mode: reportModeLabel(plan.mode),
                engines: reportEntriesFromPlan(plan, requestedEngines),
                suite: `not-run (build failed, exit ${build.code})`,
                wallClock: `${elapsedSeconds()}s (build ${build.seconds}s)`,
            }),
        );
        return build.code;
    }

    const suite = await runStage(
        "suite",
        "npx",
        playwrightTestArgs(isHeadedRun(plan)),
        suiteEnvFor(plan, process.env),
    );

    if (plan.mode === "software-fallback") {
        fallbackWarning("this suite ran under SOFTWARE rendering (see above)");
    }
    console.log(
        formatReport({
            mode: reportModeLabel(plan.mode),
            engines: reportEntriesFromPlan(plan, requestedEngines),
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

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const controls = parseControls(process.env);
    const startedAt = Date.now();
    const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000);

    if (args.probeOnly) {
        return runProbeOnly(args, controls, elapsedSeconds);
    }
    return runFullLane(args, controls, elapsedSeconds);
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
