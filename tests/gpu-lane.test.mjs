// Unit coverage for the opt-in native-GPU lane's pure logic (issue #44 Chromium
// lane; issue #52 Firefox arm).
//
// Everything here is GPU-free, browser-free, and lane-env-free (spec 44 FR7):
// the probe is injected as a plain async function, host facts are injected as
// a fake view, and importing the wrapper module must never launch anything.
import assert from "node:assert/strict";
import test from "node:test";

import {
    CANDIDATES,
    ENGINES,
    FIREFOX_PROBE_RECIPE,
    LaneUsageError,
    buildHostView,
    classifyRenderer,
    composeEnv,
    computeRunPlan,
    engineReportLine,
    engineSkipReason,
    failureDiagnostic,
    fallbackEnv,
    formatReport,
    formatWallClock,
    isHeadedRun,
    parseArgs,
    parseControls,
    partitionCandidates,
    playwrightTestArgs,
    probeRenderer,
    reportEntriesFromPlan,
    reportModeLabel,
    runSelection,
    suiteEnvFor,
    suiteResultLabel,
} from "../scripts/e2e-gpu-lane.mjs";

// Host-view fixtures mirroring the shapes the lane must handle.
const wsl2Host = {
    platform: "linux",
    hasDxg: true,
    hasWslLib: true,
    hasWslgSocket: true,
    display: ":0",
};
const nativeLinuxHost = {
    platform: "linux",
    hasDxg: false,
    hasWslLib: false,
    hasWslgSocket: false,
    display: null,
};

// The exact renderer strings recorded in the evidence artifacts.
const CHROMIUM_HW =
    "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)";
const FIREFOX_HW = "D3D12 (NVIDIA GeForce RTX 3080)";

function candidateById(id) {
    const candidate = CANDIDATES.find((entry) => entry.id === id);
    assert.ok(candidate, `unknown candidate fixture id: ${id}`);
    return candidate;
}

test("classifyRenderer: proven hardware strings survive the deny-list", () => {
    // The exact strings recorded in bugfix-22 (WSL2 d3d12), experiment 42
    // run #5 (Kaggle T4), and the Firefox feasibility report (raw renderer read
    // through the probe-only sanitize pref).
    assert.equal(classifyRenderer(CHROMIUM_HW), "hardware");
    assert.equal(
        classifyRenderer("ANGLE (NVIDIA Corporation, Tesla T4/PCIe/SSE2, OpenGL ES 3.2)"),
        "hardware",
    );
    assert.equal(classifyRenderer(FIREFOX_HW), "hardware");
});

test("classifyRenderer: software rasterizers are denied (expanded deny-list)", () => {
    assert.equal(
        classifyRenderer(
            "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
        ),
        "software",
    );
    assert.equal(
        classifyRenderer("llvmpipe (LLVM 21.1.8, 256 bits)"),
        "software",
    );
    assert.equal(classifyRenderer("Microsoft Basic Render Driver"), "software");
    assert.equal(classifyRenderer("Google SwiftShader"), "software");
    // Spec 52 Decision 7 additions: the Mesa software rasterizers Firefox can
    // land on when the d3d12 adapter is not selected.
    assert.equal(classifyRenderer("softpipe"), "software");
    assert.equal(classifyRenderer("llvmpipe (LLVM 21.1.8, 256 bits) lavapipe"), "software");
    assert.equal(classifyRenderer("Mesa swrast"), "software");
});

test("classifyRenderer: the sanitized Firefox renderer is 'unverifiable', never hardware", () => {
    // Firefox privacy-sanitizes the unmasked renderer to "Generic Renderer"
    // when the probe-only pref did not take (spec 52 FR3). It matches no
    // software marker, so a distinct verdict keeps it from reading as hardware.
    assert.equal(classifyRenderer("Generic Renderer"), "unverifiable");
    assert.equal(classifyRenderer("generic renderer"), "unverifiable");
});

test("classifyRenderer: empty/absent strings are 'none', never hardware", () => {
    assert.equal(classifyRenderer(null), "none");
    assert.equal(classifyRenderer(undefined), "none");
    assert.equal(classifyRenderer(""), "none");
    assert.equal(classifyRenderer("   "), "none");
});

test("parseControls: E2E_GPU_FORCE_FALLBACK and E2E_GPU_REQUIRE parse strictly", () => {
    assert.deepEqual(parseControls({}), {
        forceFallback: false,
        requireHardware: false,
    });
    assert.deepEqual(parseControls({E2E_GPU_FORCE_FALLBACK: "1"}), {
        forceFallback: true,
        requireHardware: false,
    });
    assert.deepEqual(parseControls({E2E_GPU_REQUIRE: "true"}), {
        forceFallback: false,
        requireHardware: true,
    });
    // Explicitly-disabled values stay off.
    assert.deepEqual(
        parseControls({E2E_GPU_FORCE_FALLBACK: "0", E2E_GPU_REQUIRE: ""}),
        {forceFallback: false, requireHardware: false},
    );
});

test("parseControls: contradictory controls are a usage error", () => {
    assert.throws(
        () =>
            parseControls({
                E2E_GPU_FORCE_FALLBACK: "1",
                E2E_GPU_REQUIRE: "1",
            }),
        LaneUsageError,
    );
});

test("buildHostView reads the injected fs/env snapshot", () => {
    const checked = [];
    const view = buildHostView({
        platform: "linux",
        exists: (path) => {
            checked.push(path);
            return path === "/dev/dxg";
        },
        env: {DISPLAY: ":0"},
    });
    assert.deepEqual(view, {
        platform: "linux",
        hasDxg: true,
        hasWslLib: false,
        hasWslgSocket: false,
        display: ":0",
    });
    assert.ok(checked.includes("/dev/dxg"));
    assert.ok(checked.includes("/usr/lib/wsl/lib"));
    assert.ok(checked.includes("/mnt/wslg/.X11-unix"));
});

test("partitionCandidates: WSL2 host keeps d3d12 candidates, skips native-linux", () => {
    const {usable, skipped} = partitionCandidates(wsl2Host);
    assert.deepEqual(
        usable.map(({candidate}) => candidate.id),
        ["wsl2-d3d12-angle-gl", "wsl2-d3d12-angle-gl-egl"],
    );
    const skippedIds = skipped.map(({candidate}) => candidate.id);
    assert.deepEqual(skippedIds, [
        "native-linux-angle-vulkan",
        "native-linux-angle-gl",
    ]);
    for (const skip of skipped) {
        assert.match(skip.diagnostic, /WSL2/);
        assert.match(skip.diagnostic, /llvmpipe dead end/);
    }
});

test("partitionCandidates: native Linux host keeps ANGLE candidates, skips WSL2", () => {
    const {usable, skipped} = partitionCandidates(nativeLinuxHost);
    assert.deepEqual(
        usable.map(({candidate}) => candidate.id),
        ["native-linux-angle-vulkan", "native-linux-angle-gl"],
    );
    const wsl2Skips = skipped.filter(
        ({candidate}) => candidate.hostClass === "wsl2",
    );
    assert.equal(wsl2Skips.length, 2);
    for (const skip of wsl2Skips) {
        assert.match(skip.diagnostic, /\/dev\/dxg absent/);
    }
});

test("partitionCandidates: /dev/dxg without WSL libs is an actionable skip", () => {
    const {usable, skipped} = partitionCandidates({
        ...wsl2Host,
        hasWslLib: false,
    });
    assert.equal(usable.length, 0);
    const wsl2Skips = skipped.filter(
        ({candidate}) => candidate.hostClass === "wsl2",
    );
    for (const skip of wsl2Skips) {
        assert.match(skip.diagnostic, /\/usr\/lib\/wsl\/lib missing/);
        assert.match(skip.diagnostic, /wsl --update/);
    }
});

test("partitionCandidates: headed mode (override) needs a display; WSLg socket defaults DISPLAY=:0", () => {
    // The lane default is headless (FR5 outcome), so a display-less WSL2 host
    // is fine naturally — but probed/run headed (--mode=headed), the display
    // prereq applies: no DISPLAY, no WSLg socket ⇒ FR11 WSLg diagnostic.
    const displayless = {...wsl2Host, display: null, hasWslgSocket: false};
    const headed = partitionCandidates(displayless, CANDIDATES, "headed");
    assert.equal(headed.usable.length, 0);
    const headedSkips = headed.skipped.filter(
        ({candidate}) => candidate.hostClass === "wsl2",
    );
    assert.equal(headedSkips.length, 2);
    for (const skip of headedSkips) {
        assert.match(skip.diagnostic, /DISPLAY unset/);
        assert.match(skip.diagnostic, /WSLg not active/);
    }
    // No DISPLAY but the WSLg socket exists: headed is usable, with DISPLAY
    // defaulted to the PR #43 recipe value.
    const socketOnly = partitionCandidates(
        {...wsl2Host, display: null},
        CANDIDATES,
        "headed",
    );
    assert.equal(socketOnly.usable.length, 2);
    for (const entry of socketOnly.usable) {
        assert.deepEqual(entry.extraEnv, {DISPLAY: ":0"});
        assert.equal(entry.effectiveMode, "headed");
    }
});

test("partitionCandidates: non-linux platforms skip everything", () => {
    const {usable, skipped} = partitionCandidates({
        ...wsl2Host,
        platform: "darwin",
    });
    assert.equal(usable.length, 0);
    assert.equal(skipped.length, CANDIDATES.length);
    for (const skip of skipped) {
        assert.match(skip.diagnostic, /untested/);
    }
});

test("partitionCandidates: the Firefox recipe reuses the WSL2 host-prereq gating", () => {
    // Spec 52 Decision 3 / plan: the Firefox recipe is candidate-shaped, so its
    // host gating is identical to Chromium's — usable on a WSL2 host, skipped
    // (with the same diagnostics) off it.
    const usableOnWsl2 = partitionCandidates(wsl2Host, [FIREFOX_PROBE_RECIPE]);
    assert.equal(usableOnWsl2.usable.length, 1);
    assert.equal(usableOnWsl2.usable[0].candidate.id, "wsl2-d3d12-firefox");
    assert.equal(usableOnWsl2.usable[0].effectiveMode, "headless");

    const noDxg = partitionCandidates(nativeLinuxHost, [FIREFOX_PROBE_RECIPE]);
    assert.equal(noDxg.usable.length, 0);
    assert.match(noDxg.skipped[0].diagnostic, /\/dev\/dxg absent/);

    const notLinux = partitionCandidates(
        {...wsl2Host, platform: "win32"},
        [FIREFOX_PROBE_RECIPE],
    );
    assert.equal(notLinux.usable.length, 0);
    assert.match(notLinux.skipped[0].diagnostic, /untested/);
});

test("composeEnv injects recipe env and prepends LD_LIBRARY_PATH without mutating the base", () => {
    const base = {
        PATH: "/usr/bin",
        LD_LIBRARY_PATH: "/opt/lib",
        MESA_D3D12_DEFAULT_ADAPTER_NAME: "NVIDIA",
    };
    const frozen = JSON.stringify(base);
    const env = composeEnv(base, candidateById("wsl2-d3d12-angle-gl"), {
        DISPLAY: ":0",
    });
    assert.equal(env.GALLIUM_DRIVER, "d3d12");
    assert.equal(env.LD_LIBRARY_PATH, "/usr/lib/wsl/lib:/opt/lib");
    assert.equal(env.DISPLAY, ":0");
    // Operator-set disambiguators pass through untouched.
    assert.equal(env.MESA_D3D12_DEFAULT_ADAPTER_NAME, "NVIDIA");
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(JSON.stringify(base), frozen);
});

test("composeEnv sets LD_LIBRARY_PATH outright when the base has none", () => {
    const env = composeEnv({PATH: "/usr/bin"}, candidateById("wsl2-d3d12-angle-gl"));
    assert.equal(env.LD_LIBRARY_PATH, "/usr/lib/wsl/lib");
});

test("composeEnv: the Firefox recipe composes the same Mesa env (no ANGLE flags involved)", () => {
    const env = composeEnv({PATH: "/usr/bin"}, FIREFOX_PROBE_RECIPE);
    assert.equal(env.GALLIUM_DRIVER, "d3d12");
    assert.equal(env.LD_LIBRARY_PATH, "/usr/lib/wsl/lib");
});

test("fallbackEnv strips PW_CHROMIUM_ARGS and nothing else, without mutating the base", () => {
    const base = {
        PATH: "/usr/bin",
        PW_CHROMIUM_ARGS: "--use-gl=angle",
        DISPLAY: ":0",
    };
    const frozen = JSON.stringify(base);
    const env = fallbackEnv(base);
    assert.equal(Object.hasOwn(env, "PW_CHROMIUM_ARGS"), false);
    assert.equal(env.PATH, "/usr/bin");
    assert.equal(env.DISPLAY, ":0");
    assert.equal(JSON.stringify(base), frozen);
});

test("runSelection: first hardware verdict wins and stops probing", async () => {
    const calls = [];
    const usable = partitionCandidates(wsl2Host).usable;
    const selection = await runSelection({
        usable,
        probe: async (candidate) => {
            calls.push(candidate.id);
            return {
                engine: "chromium",
                candidate,
                renderer: CHROMIUM_HW,
                rendererClass: "hardware",
                error: null,
                logPath: "gpu-lane-logs/probe-x.log",
            };
        },
        log: () => {},
    });
    assert.equal(selection.status, "hardware");
    assert.equal(selection.attempt.candidate.id, "wsl2-d3d12-angle-gl");
    assert.deepEqual(calls, ["wsl2-d3d12-angle-gl"]);
});

test("runSelection: a failed candidate falls through to the next; exhaustion reports all attempts", async () => {
    const usable = partitionCandidates(wsl2Host).usable;
    const verdicts = {
        "wsl2-d3d12-angle-gl": {
            renderer: "llvmpipe (LLVM 21.1.8, 256 bits)",
            rendererClass: "software",
            error: null,
        },
        "wsl2-d3d12-angle-gl-egl": {
            renderer: null,
            rendererClass: "none",
            error: "probe timeout after 45000ms",
        },
    };
    const logged = [];
    const selection = await runSelection({
        usable,
        probe: async (candidate) => ({
            engine: "chromium",
            candidate,
            logPath: `gpu-lane-logs/probe-${candidate.id}.log`,
            ...verdicts[candidate.id],
        }),
        log: (line) => logged.push(line),
    });
    assert.equal(selection.status, "exhausted");
    assert.equal(selection.attempts.length, 2);
    // Both failure diagnostics were surfaced as they happened.
    assert.ok(logged.some((line) => /SOFTWARE renderer "llvmpipe/.test(line)));
    assert.ok(logged.some((line) => /probe timeout/.test(line)));
});

test("failureDiagnostic covers the FR11 cases with engine + cause + remedy + log path", () => {
    const d3d12 = candidateById("wsl2-d3d12-angle-gl");
    const softwareLine = failureDiagnostic({
        engine: "chromium",
        candidate: d3d12,
        renderer: "llvmpipe (LLVM 21.1.8, 256 bits)",
        rendererClass: "software",
        error: null,
        logPath: "gpu-lane-logs/probe-chromium-wsl2-d3d12-angle-gl-headless.log",
    });
    assert.match(softwareLine, /^chromium candidate wsl2-d3d12-angle-gl/);
    assert.match(softwareLine, /SOFTWARE renderer "llvmpipe/);
    assert.match(softwareLine, /Mesa/);
    assert.match(softwareLine, /GALLIUM_DRIVER=d3d12/);
    assert.match(softwareLine, /probe-chromium-wsl2-d3d12-angle-gl-headless\.log/);

    const crashLine = failureDiagnostic({
        engine: "firefox",
        candidate: FIREFOX_PROBE_RECIPE,
        renderer: null,
        rendererClass: "none",
        error: "browser crashed",
        logPath: "gpu-lane-logs/probe-firefox-wsl2-d3d12-firefox-headless.log",
    });
    // Crash/timeout wording names the engine and points at the engine-tagged
    // transcript (spec 52 FR11, Codex plan-review refinement 1).
    assert.match(crashLine, /^firefox candidate wsl2-d3d12-firefox/);
    assert.match(crashLine, /FAILED \(browser crashed\)/);
    assert.match(crashLine, /probe transcript: gpu-lane-logs\/probe-firefox-/);

    const noContextLine = failureDiagnostic({
        engine: "chromium",
        candidate: d3d12,
        renderer: "",
        rendererClass: "none",
        error: null,
        logPath: "gpu-lane-logs/probe-chromium-wsl2-d3d12-angle-gl-headless.log",
    });
    assert.match(noContextLine, /no usable WebGL context/);
});

test("failureDiagnostic: the Firefox sanitized renderer hints the probe pref, NOT Mesa", () => {
    // Spec 52 FR3/FR11 + Claude plan-review refinement: an 'unverifiable' verdict
    // must produce the probe-only-preference remedy, not the software branch's
    // Mesa/adapter hint (which would mislead the operator).
    const line = failureDiagnostic({
        engine: "firefox",
        candidate: FIREFOX_PROBE_RECIPE,
        renderer: "Generic Renderer",
        rendererClass: "unverifiable",
        error: null,
        logPath: "gpu-lane-logs/probe-firefox-wsl2-d3d12-firefox-headless.log",
    });
    assert.match(line, /^firefox candidate wsl2-d3d12-firefox/);
    assert.match(line, /sanitized renderer "Generic Renderer"/);
    assert.match(line, /webgl\.sanitize-unmasked-renderer=false/);
    assert.match(line, /UNVERIFIABLE, not hardware/);
    // It must NOT emit the software branch's Mesa/GALLIUM hint.
    assert.doesNotMatch(line, /GALLIUM_DRIVER=d3d12/);
    assert.doesNotMatch(line, /SOFTWARE renderer/);
});

test("engineSkipReason summarizes the last attempt (or a host-prereq skip)", () => {
    assert.match(
        engineSkipReason([], [{candidate: FIREFOX_PROBE_RECIPE, diagnostic: "x"}]),
        /host prerequisites not met/,
    );
    assert.match(
        engineSkipReason([{rendererClass: "software", renderer: "llvmpipe", error: null}]),
        /software renderer "llvmpipe"/,
    );
    assert.match(
        engineSkipReason([{rendererClass: "unverifiable", renderer: "Generic Renderer", error: null}]),
        /sanitized renderer .*probe preference did not take/,
    );
    assert.match(
        engineSkipReason([{rendererClass: "none", renderer: null, error: "probe timeout after 45000ms"}]),
        /probe failed \(probe timeout after 45000ms\)/,
    );
});

test("engineReportLine renders each engine outcome state", () => {
    assert.equal(
        engineReportLine({state: "hardware", renderer: FIREFOX_HW}),
        FIREFOX_HW,
    );
    assert.equal(
        engineReportLine({state: "software-fallback"}),
        "(software-fallback — SwiftShader)",
    );
    assert.equal(
        engineReportLine({state: "skipped", reason: "software renderer \"llvmpipe\""}),
        'skipped (unverified — software renderer "llvmpipe")',
    );
});

test("reportModeLabel maps skip-empty to 'skipped'; passes others through", () => {
    assert.equal(reportModeLabel("hardware"), "hardware");
    assert.equal(reportModeLabel("software-fallback"), "software-fallback");
    assert.equal(reportModeLabel("skip-empty"), "skipped");
});

test("formatReport emits the per-engine greppable FR10 contract (two engines)", () => {
    const report = formatReport({
        mode: "hardware",
        engines: [
            {engine: "chromium", renderer: CHROMIUM_HW},
            {engine: "firefox", renderer: FIREFOX_HW},
        ],
        suite: "pass",
        wallClock: "192s (build 45s, suite 147s)",
    });
    const lines = report.split("\n");
    assert.equal(lines[0], "=== E2E GPU LANE REPORT ===");
    assert.equal(lines[1], "mode: hardware");
    assert.equal(lines[2], "engines: chromium,firefox");
    assert.match(lines[3], /^renderer\.chromium: ANGLE \(Microsoft Corporation/);
    assert.equal(lines[4], `renderer.firefox: ${FIREFOX_HW}`);
    assert.equal(lines[5], "suite: pass");
    assert.equal(lines[6], "wall-clock: 192s (build 45s, suite 147s)");
});

test("formatReport: a skipped engine is represented explicitly, never omitted", () => {
    const report = formatReport({
        mode: "software-fallback",
        engines: [
            {engine: "chromium", renderer: "(software-fallback — SwiftShader)"},
            {engine: "firefox", renderer: "skipped (unverified — software renderer \"llvmpipe\")"},
        ],
        suite: "pass",
        wallClock: "10s",
    });
    assert.match(report, /^engines: chromium,firefox$/m);
    assert.match(report, /^renderer\.chromium: \(software-fallback — SwiftShader\)$/m);
    assert.match(report, /^renderer\.firefox: skipped \(unverified — /m);
});

// ---------------------------------------------------------------------------
// computeRunPlan — the two-engine verification-gating decision function
// ---------------------------------------------------------------------------

const nonStrict = {forceFallback: false, requireHardware: false};
const strict = {forceFallback: false, requireHardware: true};
const forced = {forceFallback: true, requireHardware: false};

function chromiumHardwareVerdict() {
    return {
        engine: "chromium",
        verified: true,
        renderer: CHROMIUM_HW,
        candidate: candidateById("wsl2-d3d12-angle-gl"),
        extraEnv: {},
        effectiveMode: "headless",
    };
}
function firefoxHardwareVerdict(effectiveMode = "headless", extraEnv = {}) {
    return {
        engine: "firefox",
        verified: true,
        renderer: FIREFOX_HW,
        candidate: FIREFOX_PROBE_RECIPE,
        extraEnv,
        effectiveMode,
    };
}
function firefoxSoftwareVerdict() {
    return {
        engine: "firefox",
        verified: false,
        renderer: "llvmpipe (LLVM 21.1.8, 256 bits)",
        rendererClass: "software",
        reason: 'software renderer "llvmpipe (LLVM 21.1.8, 256 bits)"',
    };
}

test("computeRunPlan: both engines hardware ⇒ combined two-engine hardware run", () => {
    const plan = computeRunPlan({
        requestedEngines: ["chromium", "firefox"],
        verdicts: {
            chromium: chromiumHardwareVerdict(),
            firefox: firefoxHardwareVerdict(),
        },
        controls: nonStrict,
    });
    assert.equal(plan.mode, "hardware");
    assert.deepEqual(plan.suiteEngines, ["chromium", "firefox"]);
    assert.equal(plan.engines.chromium.state, "hardware");
    assert.equal(plan.engines.chromium.renderer, CHROMIUM_HW);
    assert.equal(plan.engines.firefox.state, "hardware");
    assert.equal(plan.engines.firefox.renderer, FIREFOX_HW);
    // Suite-env carriers for Phase 2.
    assert.equal(plan.chromiumCandidate.id, "wsl2-d3d12-angle-gl");
    assert.equal(plan.effectiveMode, "headless");
    assert.equal(plan.firefoxRecipe.id, "wsl2-d3d12-firefox");
});

test("computeRunPlan: default 'all', Firefox unverified, non-strict ⇒ Chromium SwiftShader + Firefox skipped", () => {
    // Decision 6: not both verify ⇒ honest fallback. Chromium runs its
    // deterministic SwiftShader fallback (even though it verified hardware),
    // Firefox is skipped with a stated reason — never an llvmpipe masquerade.
    const plan = computeRunPlan({
        requestedEngines: ["chromium", "firefox"],
        verdicts: {
            chromium: chromiumHardwareVerdict(),
            firefox: firefoxSoftwareVerdict(),
        },
        controls: nonStrict,
    });
    assert.equal(plan.mode, "software-fallback");
    assert.deepEqual(plan.suiteEngines, ["chromium"]);
    assert.equal(plan.engines.chromium.state, "software-fallback");
    assert.equal(plan.engines.firefox.state, "skipped");
    assert.match(plan.engines.firefox.reason, /llvmpipe/);
});

test("computeRunPlan: default 'all', either engine unverified, strict ⇒ abort", () => {
    const plan = computeRunPlan({
        requestedEngines: ["chromium", "firefox"],
        verdicts: {
            chromium: chromiumHardwareVerdict(),
            firefox: firefoxSoftwareVerdict(),
        },
        controls: strict,
    });
    assert.equal(plan.mode, "abort");
    assert.deepEqual(plan.suiteEngines, []);
    assert.deepEqual(plan.unverified, ["firefox"]);
    assert.equal(plan.engines.chromium.state, "hardware");
    assert.equal(plan.engines.firefox.state, "skipped");
});

test("computeRunPlan: single-engine Chromium preserves the exact #44 behavior", () => {
    const hw = computeRunPlan({
        requestedEngines: ["chromium"],
        verdicts: {chromium: chromiumHardwareVerdict()},
        controls: nonStrict,
    });
    assert.equal(hw.mode, "hardware");
    assert.deepEqual(hw.suiteEngines, ["chromium"]);
    assert.equal(hw.chromiumCandidate.id, "wsl2-d3d12-angle-gl");

    const sw = computeRunPlan({
        requestedEngines: ["chromium"],
        verdicts: {
            chromium: {engine: "chromium", verified: false, reason: "software renderer"},
        },
        controls: nonStrict,
    });
    assert.equal(sw.mode, "software-fallback");
    assert.deepEqual(sw.suiteEngines, ["chromium"]);
    assert.equal(sw.engines.chromium.state, "software-fallback");
    assert.equal(Object.hasOwn(sw.engines, "firefox"), false);
});

test("computeRunPlan: single-engine Firefox hardware runs Firefox alone", () => {
    const plan = computeRunPlan({
        requestedEngines: ["firefox"],
        verdicts: {firefox: firefoxHardwareVerdict()},
        controls: nonStrict,
    });
    assert.equal(plan.mode, "hardware");
    assert.deepEqual(plan.suiteEngines, ["firefox"]);
    assert.equal(plan.engines.firefox.renderer, FIREFOX_HW);
    assert.equal(plan.firefoxRecipe.id, "wsl2-d3d12-firefox");
    assert.equal(Object.hasOwn(plan, "chromiumCandidate"), false);
    assert.equal(plan.effectiveMode, "headless");
});

test("isHeadedRun: the headed suite decision covers Firefox-only hardware (not just Chromium)", () => {
    // Regression guard (Codex phase-2 review): a hardware --engine=firefox
    // --mode=headed run must dispatch headed. The plan's run-level effectiveMode
    // (not a Chromium-only field) drives this, so Firefox-only headed works.
    const chromiumHeaded = computeRunPlan({
        requestedEngines: ["chromium"],
        verdicts: {
            chromium: {
                ...chromiumHardwareVerdict(),
                effectiveMode: "headed",
                extraEnv: {DISPLAY: ":0"},
            },
        },
        controls: nonStrict,
    });
    assert.equal(chromiumHeaded.effectiveMode, "headed");
    assert.equal(isHeadedRun(chromiumHeaded), true);

    const firefoxHeaded = computeRunPlan({
        requestedEngines: ["firefox"],
        verdicts: {firefox: firefoxHardwareVerdict("headed", {DISPLAY: ":0"})},
        controls: nonStrict,
    });
    assert.equal(firefoxHeaded.effectiveMode, "headed");
    // The bug was here: without a run-level effectiveMode this returned false.
    assert.equal(isHeadedRun(firefoxHeaded), true);
    // The headed DISPLAY extraEnv reaches the Firefox suite env.
    assert.equal(suiteEnvFor(firefoxHeaded, {PATH: "/usr/bin"}).DISPLAY, ":0");

    // Default headless hardware and software-fallback are never headed.
    const headless = computeRunPlan({
        requestedEngines: ["chromium", "firefox"],
        verdicts: {
            chromium: chromiumHardwareVerdict(),
            firefox: firefoxHardwareVerdict(),
        },
        controls: nonStrict,
    });
    assert.equal(isHeadedRun(headless), false);
    assert.equal(isHeadedRun({mode: "software-fallback"}), false);
});

test("computeRunPlan: single-engine Firefox unverified, non-strict ⇒ empty-set skip (exit 0), no suite", () => {
    // Scenario 7: an empty engine set must never reach Playwright (it would
    // trip the config's "matched no known engines" guard). Skip build/suite,
    // report Firefox skipped, exit 0.
    const plan = computeRunPlan({
        requestedEngines: ["firefox"],
        verdicts: {firefox: firefoxSoftwareVerdict()},
        controls: nonStrict,
    });
    assert.equal(plan.mode, "skip-empty");
    assert.deepEqual(plan.suiteEngines, []);
    assert.equal(plan.engines.firefox.state, "skipped");
    assert.match(plan.engines.firefox.reason, /llvmpipe/);
    assert.equal(Object.hasOwn(plan.engines, "chromium"), false);
});

test("computeRunPlan: single-engine Firefox unverified, strict ⇒ abort", () => {
    const plan = computeRunPlan({
        requestedEngines: ["firefox"],
        verdicts: {firefox: firefoxSoftwareVerdict()},
        controls: strict,
    });
    assert.equal(plan.mode, "abort");
    assert.deepEqual(plan.unverified, ["firefox"]);
});

test("computeRunPlan: forced fallback with Chromium ⇒ Chromium SwiftShader, Firefox skipped (no probe)", () => {
    const plan = computeRunPlan({
        requestedEngines: ["chromium", "firefox"],
        verdicts: {},
        controls: forced,
    });
    assert.equal(plan.mode, "software-fallback");
    assert.deepEqual(plan.suiteEngines, ["chromium"]);
    assert.equal(plan.engines.chromium.state, "software-fallback");
    assert.equal(plan.engines.firefox.state, "skipped");
    assert.match(plan.engines.firefox.reason, /no software equivalent/);
});

test("computeRunPlan: forced fallback, Firefox-only ⇒ vacuous skip-empty (exit 0), not a usage error", () => {
    // FR4: E2E_GPU_FORCE_FALLBACK=1 --engine=firefox is a benign no-op, NOT a
    // LaneUsageError — Firefox has no software path to force.
    const plan = computeRunPlan({
        requestedEngines: ["firefox"],
        verdicts: {},
        controls: forced,
    });
    assert.equal(plan.mode, "skip-empty");
    assert.deepEqual(plan.suiteEngines, []);
    assert.equal(plan.engines.firefox.state, "skipped");
    assert.match(plan.engines.firefox.reason, /forced fallback/);
});

test("reportEntriesFromPlan renders the requested engines in order", () => {
    const plan = computeRunPlan({
        requestedEngines: ["chromium", "firefox"],
        verdicts: {
            chromium: chromiumHardwareVerdict(),
            firefox: firefoxSoftwareVerdict(),
        },
        controls: nonStrict,
    });
    const entries = reportEntriesFromPlan(plan, ["chromium", "firefox"]);
    assert.deepEqual(
        entries.map((entry) => entry.engine),
        ["chromium", "firefox"],
    );
    assert.equal(entries[0].renderer, "(software-fallback — SwiftShader)");
    assert.match(entries[1].renderer, /^skipped \(unverified — /);
});

test("probeRenderer: a watchdog timeout still reaps a late-resolving browser", async () => {
    // The launch resolves AFTER the watchdog has already failed the probe;
    // the lane must close that late browser instead of orphaning a Chromium
    // process that would keep the run alive.
    let closed = false;
    const fakeBrowser = {
        close: async () => {
            closed = true;
        },
        newPage: async () => ({
            evaluate: async () => ({renderer: "late", vendor: "late"}),
        }),
    };
    const launcher = async () => ({
        launch: () =>
            new Promise((resolve) => {
                setTimeout(() => resolve(fakeBrowser), 100);
            }),
    });
    const transcripts = [];
    const attempt = await probeRenderer(
        candidateById("wsl2-d3d12-angle-gl"),
        {},
        {
            baseEnv: {},
            headless: true,
            launcher,
            totalTimeoutMs: 10,
            closeTimeoutMs: 2_000,
            writeTranscript: (path, text) => transcripts.push({path, text}),
        },
    );
    assert.match(attempt.error, /probe timeout after 10ms/);
    assert.equal(attempt.rendererClass, "none");
    assert.equal(attempt.engine, "chromium");
    assert.equal(closed, true, "late-resolving browser must be closed");
    // The transcript was written via the injected writer, engine-tagged.
    assert.equal(transcripts.length, 1);
    assert.match(
        transcripts[0].path,
        /probe-chromium-wsl2-d3d12-angle-gl-headless\.log/,
    );
    assert.match(transcripts[0].text, /ERROR: probe timeout/);
});

test("probeRenderer: cleanup is bounded when the launch never resolves", async () => {
    // A launch that hangs past its own timeout must not wedge the lane: the
    // close race gives up after closeTimeoutMs and the attempt still returns.
    const launcher = async () => ({
        launch: () => new Promise(() => {}),
    });
    const attempt = await probeRenderer(
        candidateById("wsl2-d3d12-angle-gl"),
        {},
        {
            baseEnv: {},
            headless: true,
            launcher,
            totalTimeoutMs: 10,
            closeTimeoutMs: 20,
            writeTranscript: () => {},
        },
    );
    assert.match(attempt.error, /probe timeout after 10ms/);
    assert.equal(attempt.rendererClass, "none");
});

test("probeRenderer: a launch failure is a failed candidate with the error recorded", async () => {
    const launcher = async () => ({
        launch: async () => {
            throw new Error("browser crashed on startup");
        },
    });
    const transcripts = [];
    const attempt = await probeRenderer(
        candidateById("wsl2-d3d12-angle-gl"),
        {},
        {
            baseEnv: {},
            headless: true,
            launcher,
            totalTimeoutMs: 1_000,
            closeTimeoutMs: 20,
            writeTranscript: (path, text) => transcripts.push({path, text}),
        },
    );
    assert.match(attempt.error, /browser crashed on startup/);
    assert.equal(attempt.rendererClass, "none");
    assert.equal(transcripts.length, 1);
});

test("probeRenderer firefox: launches with firefoxUserPrefs (incl. the probe-only sanitize pref) and NO args", async () => {
    let received = null;
    const fakeBrowser = {
        close: async () => {},
        newPage: async () => ({
            evaluate: async () => ({renderer: FIREFOX_HW, vendor: "Mesa"}),
        }),
    };
    const launcher = async (engine) => ({
        launch: async (options) => {
            received = {engine, options};
            return fakeBrowser;
        },
    });
    const transcripts = [];
    const attempt = await probeRenderer(FIREFOX_PROBE_RECIPE, {}, {
        engine: "firefox",
        baseEnv: {},
        headless: true,
        launcher,
        writeTranscript: (path, text) => transcripts.push({path, text}),
    });
    assert.equal(attempt.engine, "firefox");
    assert.equal(attempt.rendererClass, "hardware");
    assert.equal(attempt.renderer, FIREFOX_HW);
    // The launcher was asked for the firefox browser type; the launch carried
    // the probe-only prefs and no Chromium `args`/`channel`.
    assert.equal(received.engine, "firefox");
    assert.equal(
        received.options.firefoxUserPrefs["webgl.sanitize-unmasked-renderer"],
        false,
    );
    assert.equal(received.options.firefoxUserPrefs["webgl.force-enabled"], true);
    assert.equal(Object.hasOwn(received.options, "args"), false);
    assert.equal(Object.hasOwn(received.options, "channel"), false);
    // Mesa env reached the launch; transcript is firefox-tagged and logs prefs.
    assert.equal(received.options.env.GALLIUM_DRIVER, "d3d12");
    assert.match(
        transcripts[0].path,
        /probe-firefox-wsl2-d3d12-firefox-headless\.log/,
    );
    assert.match(transcripts[0].text, /prefs:/);
});

test("probeRenderer firefox: the sanitized renderer classifies as unverifiable, not hardware", async () => {
    const fakeBrowser = {
        close: async () => {},
        newPage: async () => ({
            evaluate: async () => ({
                renderer: "Generic Renderer",
                vendor: "Microsoft Corporation",
            }),
        }),
    };
    const launcher = async () => ({launch: async () => fakeBrowser});
    const attempt = await probeRenderer(FIREFOX_PROBE_RECIPE, {}, {
        engine: "firefox",
        baseEnv: {},
        headless: true,
        launcher,
        writeTranscript: () => {},
    });
    assert.equal(attempt.rendererClass, "unverifiable");
    assert.equal(attempt.renderer, "Generic Renderer");
});

test("parseArgs: engine selector + matrix flags parse and validate; channel is probe-only", () => {
    assert.deepEqual(parseArgs([]), {
        probeOnly: false,
        mode: null,
        candidate: null,
        channel: null,
        engines: ["chromium", "firefox"],
    });
    assert.deepEqual(
        parseArgs([
            "--probe-only",
            "--mode=headless",
            "--candidate=wsl2-d3d12-angle-gl-egl",
            "--channel=chromium",
        ]),
        {
            probeOnly: true,
            mode: "headless",
            candidate: "wsl2-d3d12-angle-gl-egl",
            channel: "chromium",
            engines: ["chromium", "firefox"],
        },
    );
    // --engine selector (spec 52 FR7): all (default) / chromium / firefox.
    assert.deepEqual(parseArgs(["--engine=all"]).engines, ["chromium", "firefox"]);
    assert.deepEqual(parseArgs(["--engine=chromium"]).engines, ["chromium"]);
    assert.deepEqual(parseArgs(["--engine=firefox"]).engines, ["firefox"]);
    assert.throws(() => parseArgs(["--engine=webkit"]), LaneUsageError);

    assert.throws(() => parseArgs(["--mode=windowed"]), LaneUsageError);
    assert.throws(() => parseArgs(["--candidate=no-such-id"]), LaneUsageError);
    assert.throws(() => parseArgs(["--bogus"]), LaneUsageError);
    // A channel probe result does not transfer to a suite run (the config
    // hook injects args only), so --channel without --probe-only must refuse.
    assert.throws(() => parseArgs(["--channel=chromium"]), LaneUsageError);
});

test("partitionCandidates: headless default has no display prereq (FR5 outcome)", () => {
    // The d3d12 recipe needs no display headless — a display-less WSL2 host
    // (no WSLg at all) still gets both hardware candidates.
    const displayless = {...wsl2Host, display: null, hasWslgSocket: false};
    const natural = partitionCandidates(displayless);
    assert.equal(natural.usable.length, 2);
    for (const entry of natural.usable) {
        assert.equal(entry.effectiveMode, "headless");
        assert.deepEqual(entry.extraEnv, {});
    }
    // Without an override, entries carry the candidate's own mode.
    for (const entry of partitionCandidates(wsl2Host).usable) {
        assert.equal(entry.effectiveMode, entry.candidate.mode);
    }
});

test("suiteEnvFor two-engine hardware: E2E_ENGINES=chromium,firefox; Firefox inherits the Chromium recipe's Mesa env", () => {
    const base = {PATH: "/usr/bin", LD_LIBRARY_PATH: "/opt/lib"};
    const plan = {
        mode: "hardware",
        suiteEngines: ["chromium", "firefox"],
        chromiumCandidate: candidateById("wsl2-d3d12-angle-gl"),
        chromiumExtraEnv: {DISPLAY: ":0"},
        firefoxRecipe: FIREFOX_PROBE_RECIPE,
        firefoxExtraEnv: {},
    };
    const env = suiteEnvFor(plan, base);
    // The resolved set is passed verbatim; Firefox has no separate wiring — it
    // inherits GALLIUM_DRIVER + LD_LIBRARY_PATH from the injected Mesa env.
    assert.equal(env.E2E_ENGINES, "chromium,firefox");
    assert.equal(
        env.PW_CHROMIUM_ARGS,
        "--use-gl=angle --use-angle=gl --ignore-gpu-blocklist --disable-gpu-sandbox",
    );
    assert.equal(env.GALLIUM_DRIVER, "d3d12");
    assert.equal(env.LD_LIBRARY_PATH, "/usr/lib/wsl/lib:/opt/lib");
    assert.equal(env.DISPLAY, ":0");
    // The base env object stays pristine for a later fallback spawn.
    assert.equal(Object.hasOwn(base, "PW_CHROMIUM_ARGS"), false);
    assert.equal(base.LD_LIBRARY_PATH, "/opt/lib");
});

test("suiteEnvFor single-engine Chromium hardware: exact #44 env (E2E_ENGINES=chromium)", () => {
    const base = {PATH: "/usr/bin", LD_LIBRARY_PATH: "/opt/lib"};
    const plan = {
        mode: "hardware",
        suiteEngines: ["chromium"],
        chromiumCandidate: candidateById("wsl2-d3d12-angle-gl"),
        chromiumExtraEnv: {},
    };
    const env = suiteEnvFor(plan, base);
    assert.equal(env.E2E_ENGINES, "chromium");
    assert.equal(
        env.PW_CHROMIUM_ARGS,
        "--use-gl=angle --use-angle=gl --ignore-gpu-blocklist --disable-gpu-sandbox",
    );
    assert.equal(env.GALLIUM_DRIVER, "d3d12");
});

test("suiteEnvFor Firefox-only hardware: Firefox Mesa env, E2E_ENGINES=firefox, NO PW_CHROMIUM_ARGS", () => {
    const base = {PATH: "/usr/bin", LD_LIBRARY_PATH: "/opt/lib"};
    const plan = {
        mode: "hardware",
        suiteEngines: ["firefox"],
        firefoxRecipe: FIREFOX_PROBE_RECIPE,
        firefoxExtraEnv: {},
    };
    const env = suiteEnvFor(plan, base);
    assert.equal(env.E2E_ENGINES, "firefox");
    assert.equal(Object.hasOwn(env, "PW_CHROMIUM_ARGS"), false);
    assert.equal(env.GALLIUM_DRIVER, "d3d12");
    assert.equal(env.LD_LIBRARY_PATH, "/usr/lib/wsl/lib:/opt/lib");
});

test("suiteEnvFor fallback: default SwiftShader args guaranteed, no recipe leakage", () => {
    // Even a shell-exported PW_CHROMIUM_ARGS must not survive into the
    // fallback suite — fallback means the config's own SwiftShader defaults.
    const base = {
        PATH: "/usr/bin",
        PW_CHROMIUM_ARGS: "--use-gl=angle",
        LD_LIBRARY_PATH: "/opt/lib",
    };
    const env = suiteEnvFor({mode: "software-fallback", suiteEngines: ["chromium"]}, base);
    assert.equal(Object.hasOwn(env, "PW_CHROMIUM_ARGS"), false);
    assert.equal(env.E2E_ENGINES, "chromium");
    assert.equal(Object.hasOwn(env, "GALLIUM_DRIVER"), false);
    // Operator-owned values pass through untouched.
    assert.equal(env.LD_LIBRARY_PATH, "/opt/lib");
});

test("suiteEnvFor: skip-empty / abort never produce a suite env (no empty E2E_ENGINES)", () => {
    // Scenario 7 invariant: an empty engine set must never reach Playwright.
    // runFullLane returns before build/suite for these modes; suiteEnvFor
    // refuses them outright as a belt-and-suspenders guard.
    assert.throws(
        () => suiteEnvFor({mode: "skip-empty", suiteEngines: []}, {}),
        /no suite runs for plan mode "skip-empty"/,
    );
    assert.throws(
        () => suiteEnvFor({mode: "abort", suiteEngines: []}, {}),
        /no suite runs for plan mode "abort"/,
    );
});

test("playwrightTestArgs: headed reaches Playwright via the CLI flag only", () => {
    assert.deepEqual(playwrightTestArgs(false), ["playwright", "test"]);
    assert.deepEqual(playwrightTestArgs(true), [
        "playwright",
        "test",
        "--headed",
    ]);
});

test("suiteResultLabel preserves the suite's own exit semantics", () => {
    assert.equal(suiteResultLabel(0), "pass");
    assert.equal(suiteResultLabel(1), "fail (exit 1)");
    assert.equal(suiteResultLabel(3), "fail (exit 3)");
});

test("formatWallClock breaks out build and suite stages", () => {
    assert.equal(formatWallClock(312, 45, 267), "312s (build 45s, suite 267s)");
});

test("candidate data invariants: sandbox relaxations stay lane-only and evidence-ordered", () => {
    // The first candidate must remain the proven bugfix-22 recipe — selection
    // order is evidence strength (spec 44 FR2).
    assert.equal(CANDIDATES[0].id, "wsl2-d3d12-angle-gl");
    for (const candidate of CANDIDATES) {
        // Every candidate must carry the shape the lane's lifecycle relies on.
        assert.ok(Array.isArray(candidate.flags) && candidate.flags.length > 0);
        assert.ok(["wsl2", "native-linux"].includes(candidate.hostClass));
        assert.ok(["headed", "headless"].includes(candidate.mode));
        // The forced-SwiftShader default args must never appear in a hardware
        // candidate (that would re-verify software as "hardware mode").
        for (const flag of candidate.flags) {
            assert.ok(!flag.includes("swiftshader"), `${candidate.id}: ${flag}`);
        }
    }
});

test("Firefox probe recipe invariants: same Mesa env, no ANGLE flags, probe-only sanitize pref", () => {
    // Spec 52 Decision 3: Firefox reaches the adapter via the Mesa env only.
    assert.deepEqual(FIREFOX_PROBE_RECIPE.flags, []);
    assert.equal(FIREFOX_PROBE_RECIPE.hostClass, "wsl2");
    assert.equal(FIREFOX_PROBE_RECIPE.mode, "headless");
    assert.equal(FIREFOX_PROBE_RECIPE.env.GALLIUM_DRIVER, "d3d12");
    assert.equal(FIREFOX_PROBE_RECIPE.envPrepend.LD_LIBRARY_PATH, "/usr/lib/wsl/lib");
    // The probe-only preference lives here (the ephemeral probe), and it exposes
    // the raw renderer — it is NEVER in the committed firefox Playwright project.
    assert.equal(
        FIREFOX_PROBE_RECIPE.firefoxUserPrefs["webgl.sanitize-unmasked-renderer"],
        false,
    );
    assert.equal(
        FIREFOX_PROBE_RECIPE.firefoxUserPrefs["webgl.force-enabled"],
        true,
    );
    // No ANGLE launch flags may sneak into the Firefox recipe.
    assert.equal(FIREFOX_PROBE_RECIPE.flags.length, 0);
});

test("engine constants: canonical order is chromium then firefox", () => {
    assert.deepEqual(ENGINES, ["chromium", "firefox"]);
});
