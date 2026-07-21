// Unit coverage for the opt-in native-GPU lane's pure logic (issue #44).
//
// Everything here is GPU-free, browser-free, and lane-env-free (spec FR7):
// the probe is injected as a plain async function, host facts are injected as
// a fake view, and importing the wrapper module must never launch anything.
import assert from "node:assert/strict";
import test from "node:test";

import {
    CANDIDATES,
    LaneUsageError,
    buildHostView,
    classifyRenderer,
    composeEnv,
    failureDiagnostic,
    fallbackEnv,
    formatReport,
    parseControls,
    partitionCandidates,
    probeRenderer,
    runSelection,
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

function candidateById(id) {
    const candidate = CANDIDATES.find((entry) => entry.id === id);
    assert.ok(candidate, `unknown candidate fixture id: ${id}`);
    return candidate;
}

test("classifyRenderer: proven hardware strings survive the deny-list", () => {
    // The exact strings recorded in bugfix-22 (WSL2 d3d12) and experiment 42
    // run #5 (Kaggle T4).
    assert.equal(
        classifyRenderer(
            "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)",
        ),
        "hardware",
    );
    assert.equal(
        classifyRenderer("ANGLE (NVIDIA Corporation, Tesla T4/PCIe/SSE2, OpenGL ES 3.2)"),
        "hardware",
    );
});

test("classifyRenderer: software rasterizers are denied", () => {
    assert.equal(
        classifyRenderer(
            "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
        ),
        "software",
    );
    assert.equal(
        classifyRenderer("llvmpipe (LLVM 15.0.7, 256 bits)"),
        "software",
    );
    assert.equal(classifyRenderer("Microsoft Basic Render Driver"), "software");
    assert.equal(
        classifyRenderer("Google SwiftShader"),
        "software",
    );
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

test("partitionCandidates: headed candidates need a display; WSLg socket defaults DISPLAY=:0", () => {
    // No DISPLAY, no WSLg socket: headed d3d12 candidates are skipped with the
    // FR11 WSLg diagnostic.
    const noDisplay = partitionCandidates({
        ...wsl2Host,
        display: null,
        hasWslgSocket: false,
    });
    assert.equal(noDisplay.usable.length, 0);
    const headedSkips = noDisplay.skipped.filter(
        ({candidate}) => candidate.hostClass === "wsl2",
    );
    assert.equal(headedSkips.length, 2);
    for (const skip of headedSkips) {
        assert.match(skip.diagnostic, /DISPLAY unset/);
        assert.match(skip.diagnostic, /WSLg not active/);
    }
    // No DISPLAY but the WSLg socket exists: usable, with DISPLAY defaulted to
    // the PR #43 recipe value.
    const socketOnly = partitionCandidates({...wsl2Host, display: null});
    assert.equal(socketOnly.usable.length, 2);
    for (const entry of socketOnly.usable) {
        assert.deepEqual(entry.extraEnv, {DISPLAY: ":0"});
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
                candidate,
                renderer:
                    "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)",
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
            renderer: "llvmpipe (LLVM 15.0.7, 256 bits)",
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

test("failureDiagnostic covers the FR11 cases with cause + remedy + log path", () => {
    const d3d12 = candidateById("wsl2-d3d12-angle-gl");
    const softwareLine = failureDiagnostic({
        candidate: d3d12,
        renderer: "llvmpipe (LLVM 15.0.7, 256 bits)",
        rendererClass: "software",
        error: null,
        logPath: "gpu-lane-logs/probe-wsl2-d3d12-angle-gl.log",
    });
    assert.match(softwareLine, /SOFTWARE renderer "llvmpipe/);
    assert.match(softwareLine, /Mesa/);
    assert.match(softwareLine, /GALLIUM_DRIVER=d3d12/);
    assert.match(softwareLine, /gpu-lane-logs\/probe-wsl2-d3d12-angle-gl\.log/);

    const crashLine = failureDiagnostic({
        candidate: d3d12,
        renderer: null,
        rendererClass: "none",
        error: "browser crashed",
        logPath: "gpu-lane-logs/probe-wsl2-d3d12-angle-gl.log",
    });
    assert.match(crashLine, /FAILED \(browser crashed\)/);
    assert.match(crashLine, /probe transcript: gpu-lane-logs\//);

    const noContextLine = failureDiagnostic({
        candidate: d3d12,
        renderer: "",
        rendererClass: "none",
        error: null,
        logPath: "gpu-lane-logs/probe-wsl2-d3d12-angle-gl.log",
    });
    assert.match(noContextLine, /no usable WebGL context/);
});

test("formatReport emits the exact greppable FR10 contract", () => {
    const report = formatReport({
        mode: "hardware",
        renderer:
            "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)",
        suite: "skipped (--probe-only)",
        wallClock: "12s",
    });
    const lines = report.split("\n");
    assert.equal(lines[0], "=== E2E GPU LANE REPORT ===");
    assert.equal(lines[1], "mode: hardware");
    assert.match(lines[2], /^renderer: ANGLE \(Microsoft Corporation/);
    assert.equal(lines[3], "engine: chromium");
    assert.equal(lines[4], "suite: skipped (--probe-only)");
    assert.equal(lines[5], "wall-clock: 12s");
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
    assert.equal(closed, true, "late-resolving browser must be closed");
    // The transcript was written via the injected writer, with the error.
    assert.equal(transcripts.length, 1);
    assert.match(transcripts[0].path, /probe-wsl2-d3d12-angle-gl\.log/);
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

test("candidate data invariants: sandbox relaxations stay lane-only and evidence-ordered", () => {
    // The first candidate must remain the proven bugfix-22 recipe — selection
    // order is evidence strength (spec FR2).
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
