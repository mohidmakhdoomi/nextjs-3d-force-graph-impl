import {spawn} from "node:child_process";
import {createWriteStream} from "node:fs";
import {appendFile, mkdir, readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {setTimeout} from "node:timers";
import {fileURLToPath} from "node:url";

const experimentDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDir, "../..");
const runArmPath = path.join(experimentDir, "run-arm.mjs");
const swiftShaderProbePath = path.join(experimentDir, "probe-swiftshader-renderers.mjs");
const seriesName = process.argv[2];
const planOnly = process.argv.includes("--plan-only");
const cooldownMs = Number(process.env.E2E_EXPERIMENT_COOLDOWN_MS ?? "5000");

if (!["passive", "passive-lite", "renderer"].includes(seriesName)) {
    throw new Error("Usage: node run-series.mjs passive|passive-lite|renderer");
}
if (process.env.CI) {
    throw new Error("CI must be unset: CI would force the suite to one worker");
}
if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
    throw new Error("E2E_EXPERIMENT_COOLDOWN_MS must be a non-negative number");
}

function pairSequence(prefix, controlFactory, treatmentFactory) {
    return Array.from({length: 5}, (_, index) => index + 1).flatMap((pair) => [
        controlFactory(pair, `${prefix}-${pair}-control`),
        treatmentFactory(pair, `${prefix}-${pair}-treatment`),
    ]);
}

const reducedObservationEnv = {
    E2E_EXPERIMENT_SAMPLE_INTERVAL_MS: "5000",
    E2E_EXPERIMENT_SAMPLE_GPU: "0",
};

const passiveRuns = pairSequence(
    "passive",
    (pair) => ({
        runId: `passive-u${pair}`,
        pair,
        arm: "passive-control",
        renderer: "swiftshader",
        instrumented: false,
        command: ["npm", "run", "test:smoke"],
        swiftShaderProbe: true,
        extraEnv: {},
    }),
    (pair) => ({
        runId: `passive-i${pair}`,
        pair,
        arm: "passive-observed",
        renderer: "swiftshader",
        instrumented: true,
        command: ["npm", "run", "test:smoke"],
        swiftShaderProbe: true,
        extraEnv: {},
    }),
);
const passiveLiteRuns = pairSequence(
    "passive-lite",
    (pair) => ({
        runId: `passive-lite-u${pair}`,
        pair,
        arm: "passive-lite-control",
        renderer: "swiftshader",
        instrumented: false,
        command: ["npm", "run", "test:smoke"],
        swiftShaderProbe: true,
        extraEnv: reducedObservationEnv,
    }),
    (pair) => ({
        runId: `passive-lite-i${pair}`,
        pair,
        arm: "passive-lite-observed",
        renderer: "swiftshader",
        instrumented: true,
        command: ["npm", "run", "test:smoke"],
        swiftShaderProbe: true,
        extraEnv: reducedObservationEnv,
    }),
);
const rendererRuns = pairSequence(
    "renderer",
    (pair) => ({
        runId: `renderer-s${pair}`,
        pair,
        arm: "renderer-swiftshader",
        renderer: "swiftshader",
        instrumented: true,
        command: ["npm", "run", "test:smoke"],
        swiftShaderProbe: true,
        extraEnv: reducedObservationEnv,
    }),
    (pair) => ({
        runId: `renderer-g${pair}`,
        pair,
        arm: "renderer-native",
        renderer: "native-gpu",
        instrumented: true,
        command: ["npm", "run", "test:e2e:gpu"],
        swiftShaderProbe: false,
        extraEnv: {...reducedObservationEnv, E2E_GPU_REQUIRE: "1"},
    }),
);
const runsBySeries = {
    passive: passiveRuns,
    "passive-lite": passiveLiteRuns,
    renderer: rendererRuns,
};
const runs = runsBySeries[seriesName];
const runsRoot = path.join(experimentDir, "data/output/runs");
const rawSeriesDir = path.join(experimentDir, "data/output/series/raw");
const rawProbeDir = path.join(experimentDir, "data/output/probes/swiftshader-runs");
const progressPath = path.join(rawSeriesDir, `${seriesName}-progress.jsonl`);

async function exists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function runProcess(command, args, {env, stdoutPath, stderrPath}) {
    return new Promise((resolve, reject) => {
        const stdout = createWriteStream(stdoutPath);
        const stderr = createWriteStream(stderrPath);
        const child = spawn(command, args, {
            cwd: repositoryRoot,
            env,
            stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.pipe(stdout);
        child.stderr.pipe(stderr);
        child.once("error", reject);
        child.once("close", (exitCode, signal) => {
            Promise.all([
                new Promise((done) => stdout.end(done)),
                new Promise((done) => stderr.end(done)),
            ]).then(() => resolve({exitCode, signal}));
        });
    });
}

async function runSwiftShaderProbe(run) {
    const outputPath = path.join(rawProbeDir, `${run.runId}.json`);
    const errorPath = path.join(rawProbeDir, `${run.runId}.stderr.log`);
    const outcome = await runProcess(process.execPath, [swiftShaderProbePath], {
        env: process.env,
        stdoutPath: outputPath,
        stderrPath: errorPath,
    });
    if (outcome.exitCode !== 0) {
        throw new Error(
            `${run.runId} renderer probe failed: exit=${outcome.exitCode} signal=${outcome.signal}`,
        );
    }
    const report = JSON.parse(await readFile(outputPath, "utf8"));
    if (!report.verification.chromiumSwiftShaderVerified) {
        throw new Error(`${run.runId} did not verify Chromium SwiftShader`);
    }
    return outputPath;
}

async function waitForCooldown() {
    if (cooldownMs === 0) {
        return;
    }
    await new Promise((resolve) => setTimeout(resolve, cooldownMs));
}

await Promise.all([
    mkdir(runsRoot, {recursive: true}),
    mkdir(rawSeriesDir, {recursive: true}),
    mkdir(rawProbeDir, {recursive: true}),
]);
await writeFile(
    path.join(rawSeriesDir, `${seriesName}-plan.json`),
    `${JSON.stringify({
        seriesName,
        startedAt: new Date().toISOString(),
        order: runs.map((run) => run.runId),
        cooldownMs,
        workers: 22,
        runs,
    }, null, 2)}\n`,
);

if (planOnly) {
    process.stdout.write(`${runs.map((run) => run.runId).join("\n")}\n`);
    process.exit(0);
}

for (const [index, run] of runs.entries()) {
    const runDir = path.join(runsRoot, run.runId);
    const manifestPath = path.join(runDir, "manifest.json");
    if (await exists(manifestPath)) {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        process.stdout.write(
            `${run.runId} already complete: command exit=${manifest.outcome.exitCode}\n`,
        );
        continue;
    }
    if (await exists(runDir)) {
        throw new Error(`${run.runId} has an incomplete run directory; refusing to overwrite`);
    }

    let rendererProbePath = null;
    if (run.swiftShaderProbe) {
        rendererProbePath = await runSwiftShaderProbe(run);
    }

    const driverStdout = path.join(rawSeriesDir, `${run.runId}.stdout.log`);
    const driverStderr = path.join(rawSeriesDir, `${run.runId}.stderr.log`);
    const env = {
        ...process.env,
        ...run.extraEnv,
        E2E_WORKERS: "22",
        E2E_RENDERER_PROBE_PATH: rendererProbePath ?? "gpu-lane-self-probe",
    };
    const outcome = await runProcess(
        process.execPath,
        [
            runArmPath,
            run.runId,
            run.arm,
            run.renderer,
            run.instrumented ? "1" : "0",
            "--",
            ...run.command,
        ],
        {env, stdoutPath: driverStdout, stderrPath: driverStderr},
    );
    if (outcome.exitCode !== 0) {
        throw new Error(
            `${run.runId} harness failed: exit=${outcome.exitCode} signal=${outcome.signal}`,
        );
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const progress = {
        timestamp: new Date().toISOString(),
        seriesName,
        index: index + 1,
        total: runs.length,
        runId: run.runId,
        arm: run.arm,
        renderer: run.renderer,
        commandExitCode: manifest.outcome.exitCode,
        durationMs: manifest.durationMs,
        archivedArtifacts: manifest.archivedArtifacts,
    };
    await appendFile(progressPath, `${JSON.stringify(progress)}\n`);
    process.stdout.write(
        `${run.runId} ${index + 1}/${runs.length}: command exit=${manifest.outcome.exitCode}, ` +
            `duration=${Math.round(manifest.durationMs / 1000)}s\n`,
    );

    if (index < runs.length - 1) {
        await waitForCooldown();
    }
}

process.stdout.write(`${seriesName} series complete (${runs.length} runs)\n`);
