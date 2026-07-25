import {spawn, spawnSync} from "node:child_process";
import {createWriteStream} from "node:fs";
import {cp, mkdir, readFile, rename, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const experimentDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDir, "../..");
const separator = process.argv.indexOf("--");

if (separator === -1 || separator < 5 || separator === process.argv.length - 1) {
    throw new Error(
        "Usage: node run-arm.mjs RUN_ID ARM RENDERER INSTRUMENTED(0|1) -- COMMAND [ARGS...]",
    );
}

const [runId, arm, rendererIntent, instrumentedValue] = process.argv.slice(2, separator);
const command = process.argv.slice(separator + 1);
const instrumented = instrumentedValue === "1";

if (!/^[A-Za-z0-9._-]+$/.test(runId) || !["0", "1"].includes(instrumentedValue)) {
    throw new Error("RUN_ID or INSTRUMENTED value is invalid");
}

const outputRoot = path.join(experimentDir, "data/output/runs");
const runDir = path.join(outputRoot, runId);
const samplerPath = path.join(experimentDir, "passive-sampler.mjs");
const eventPath = path.join(runDir, "events.jsonl");
const telemetryDir = path.join(runDir, "telemetry");
const stdoutPath = path.join(runDir, "stdout.log");
const stderrPath = path.join(runDir, "stderr.log");
const rootArtifactDirs = ["test-results", "playwright-report", "blob-report"];

async function exists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function runCapture(executable, args) {
    const result = spawnSync(executable, args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        env: process.env,
    });
    return {
        command: [executable, ...args],
        status: result.status,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error?.message,
    };
}

async function readOptional(filePath) {
    try {
        return await readFile(filePath, "utf8");
    } catch {
        return null;
    }
}

async function hostSnapshot() {
    const [loadavg, meminfo, cpuPressure, memoryPressure, ioPressure] = await Promise.all([
        readOptional("/proc/loadavg"),
        readOptional("/proc/meminfo"),
        readOptional("/proc/pressure/cpu"),
        readOptional("/proc/pressure/memory"),
        readOptional("/proc/pressure/io"),
    ]);

    return {
        timestamp: new Date().toISOString(),
        uptimeSeconds: os.uptime(),
        osLoadAverage: os.loadavg(),
        osFreeMemory: os.freemem(),
        loadavg,
        meminfo,
        pressure: {
            cpu: cpuPressure,
            memory: memoryPressure,
            io: ioPressure,
        },
        vmstat: runCapture("vmstat", ["-w"]),
        nvidiaSmi: runCapture("nvidia-smi", [
            "--query-gpu=name,driver_version,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw",
            "--format=csv,noheader,nounits",
        ]),
        glxinfo: runCapture("glxinfo", ["-B"]),
    };
}

await mkdir(outputRoot, {recursive: true});
if (await exists(runDir)) {
    throw new Error(`Refusing to overwrite existing run directory: ${runDir}`);
}

const preexistingArtifacts = [];
for (const artifactDir of rootArtifactDirs) {
    const artifactPath = path.join(repositoryRoot, artifactDir);
    if (await exists(artifactPath)) {
        preexistingArtifacts.push(artifactDir);
    }
}
if (preexistingArtifacts.length > 0) {
    throw new Error(
        `Refusing to start with unarchived Playwright output: ${preexistingArtifacts.join(", ")}`,
    );
}
await mkdir(runDir, {recursive: false});

const startedAt = new Date();
const commonMetadata = {
    runId,
    arm,
    rendererIntent,
    instrumented,
    command,
    cwd: repositoryRoot,
    startedAt: startedAt.toISOString(),
    revision: runCapture("git", ["rev-parse", "HEAD"]).stdout.trim(),
    gitStatus: runCapture("git", ["status", "--short"]),
    node: runCapture("node", ["--version"]),
    npm: runCapture("npm", ["--version"]),
    uname: runCapture("uname", ["-srmo"]),
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    environment: Object.fromEntries(
        [
            "CI",
            "DISPLAY",
            "E2E_EXPERIMENT_EVENTS",
            "E2E_WORKERS",
            "E2E_GPU",
            "NODE_ENV",
            "PLAYWRIGHT_BROWSERS_PATH",
            "WAYLAND_DISPLAY",
        ].map((key) => [key, process.env[key] ?? null]),
    ),
    before: await hostSnapshot(),
};
await writeFile(path.join(runDir, "manifest-start.json"), `${JSON.stringify(commonMetadata, null, 2)}\n`);

const childEnvironment = {...process.env};
let sampler = null;
if (instrumented) {
    childEnvironment.E2E_EXPERIMENT_EVENTS = eventPath;
    sampler = spawn(process.execPath, [samplerPath, telemetryDir, "1000"], {
        cwd: repositoryRoot,
        env: {...process.env, E2E_EXPERIMENT_SAMPLE_GPU: "1"},
        stdio: ["ignore", "pipe", "pipe"],
    });
    sampler.stdout.pipe(createWriteStream(path.join(runDir, "sampler-stdout.log")));
    sampler.stderr.pipe(createWriteStream(path.join(runDir, "sampler-stderr.log")));
}

const stdout = createWriteStream(stdoutPath);
const stderr = createWriteStream(stderrPath);
const child = spawn(command[0], command.slice(1), {
    cwd: repositoryRoot,
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.pipe(stdout);
child.stderr.pipe(stderr);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

const outcome = await new Promise((resolve) => {
    child.once("error", (error) => resolve({exitCode: null, signal: null, error: error.message}));
    child.once("close", (exitCode, signal) => resolve({exitCode, signal, error: null}));
});

await Promise.all([
    new Promise((resolve) => stdout.end(resolve)),
    new Promise((resolve) => stderr.end(resolve)),
]);

if (sampler !== null) {
    sampler.kill("SIGTERM");
    await new Promise((resolve) => {
        const timeout = setTimeout(() => {
            sampler.kill("SIGKILL");
            resolve();
        }, 5000);
        sampler.once("close", () => {
            clearTimeout(timeout);
            resolve();
        });
    });
}

const archivedArtifacts = [];
for (const artifactDir of rootArtifactDirs) {
    const sourcePath = path.join(repositoryRoot, artifactDir);
    if (!(await exists(sourcePath))) {
        continue;
    }
    const destinationPath = path.join(runDir, artifactDir);
    try {
        await rename(sourcePath, destinationPath);
    } catch {
        await cp(sourcePath, destinationPath, {recursive: true});
        await rm(sourcePath, {recursive: true, force: true});
    }
    archivedArtifacts.push(artifactDir);
}

const finishedAt = new Date();
let reporterSummary = null;
if (await exists(eventPath)) {
    const events = (await readFile(eventPath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    const runEnd = events.findLast((event) => event.type === "run-end");
    reporterSummary = {
        eventCount: events.length,
        maxActiveTests: runEnd?.maxActiveTests ?? null,
        status: runEnd?.status ?? null,
        testEnds: events.filter((event) => event.type === "test-end").length,
    };
}

const finalManifest = {
    ...commonMetadata,
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    outcome,
    reporterSummary,
    archivedArtifacts,
    after: await hostSnapshot(),
};
await writeFile(path.join(runDir, "manifest.json"), `${JSON.stringify(finalManifest, null, 2)}\n`);
await rm(path.join(runDir, "manifest-start.json"), {force: true});

process.stdout.write(
    `\nExperiment run ${runId} complete: exit=${outcome.exitCode} signal=${outcome.signal ?? "none"}\n`,
);
