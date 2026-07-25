import {spawnSync} from "node:child_process";
import {readdir, readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const experimentDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(experimentDir, "../..");
const runsDir = process.argv[2] ?? path.join(experimentDir, "data/output/runs");
const outputDir = process.argv[3] ?? path.join(experimentDir, "data/output");

async function exists(filePath) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

async function readJsonLines(filePath) {
    if (!(await exists(filePath))) {
        return [];
    }
    return (await readFile(filePath, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

async function materializeBlobReport(runDir) {
    const blobDir = path.join(runDir, "blob-report");
    if (!(await exists(blobDir))) {
        return {report: null, error: null};
    }

    const mergedPath = path.join(runDir, "merged-report.json");
    if (await exists(mergedPath)) {
        return {report: JSON.parse(await readFile(mergedPath, "utf8")), error: null};
    }

    const result = spawnSync(
        "npx",
        ["playwright", "merge-reports", "--reporter=json", blobDir],
        {
            cwd: repositoryRoot,
            encoding: "utf8",
            maxBuffer: 64 * 1024 * 1024,
            env: process.env,
        },
    );
    if (result.status !== 0) {
        return {
            report: null,
            error: result.error?.message ?? result.stderr ?? `merge exit ${result.status}`,
        };
    }

    const jsonStart = result.stdout.indexOf("{");
    if (jsonStart === -1) {
        return {report: null, error: "merge-reports produced no JSON object"};
    }
    const report = JSON.parse(result.stdout.slice(jsonStart));
    await writeFile(mergedPath, `${JSON.stringify(report)}\n`);
    return {report, error: null};
}

function flattenBlobResults(report) {
    const rows = [];
    const visitSuite = (suite) => {
        for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
                for (const result of test.results ?? []) {
                    rows.push({
                        project: test.projectName,
                        file: spec.file,
                        line: spec.line,
                        title: spec.title,
                        expectedStatus: test.expectedStatus,
                        result,
                    });
                }
            }
        }
        for (const child of suite.suites ?? []) {
            visitSuite(child);
        }
    };
    for (const suite of report?.suites ?? []) {
        visitSuite(suite);
    }
    return rows;
}

function maxActiveBlobTests(rows) {
    const points = rows
        .filter((row) => row.result.startTime && Number.isFinite(row.result.duration))
        .flatMap((row) => {
            const start = new Date(row.result.startTime).getTime();
            return [
                {time: start, delta: 1},
                {time: start + row.result.duration, delta: -1},
            ];
        })
        .sort((left, right) => left.time - right.time || left.delta - right.delta);
    let active = 0;
    let maximum = 0;
    for (const point of points) {
        active += point.delta;
        maximum = Math.max(maximum, active);
    }
    return points.length === 0 ? null : maximum;
}

function failuresFromBlob(rows) {
    return rows
        .filter((row) => ["failed", "timedOut", "interrupted"].includes(row.result.status))
        .map((row) => {
            const detail = JSON.stringify({
                error: row.result.error,
                errors: row.result.errors,
            });
            const classification = classifyFailure(
                row.project ?? "unknown",
                row.file ?? "unknown",
                row.line ?? 0,
                detail,
            );
            return {
                ...classification,
                project: row.project ?? "unknown",
                file: path.basename(row.file ?? "unknown"),
                line: row.line ?? 0,
                title: row.title ?? "unknown",
                status: row.result.status,
                detail,
                source: "blob-report",
            };
        });
}

function classifyFailure(project, file, line, detail) {
    const normalizedFile = path.basename(file);
    const combination = `${project}:${normalizedFile}:${line}`;

    if (
        project === "chromium" &&
        normalizedFile === "matrix.spec.ts" &&
        [135, 195, 225].includes(line) &&
        /wheel .*should zoom|wheel input after enablement should zoom/i.test(detail)
    ) {
        return {combination, signature: "A-wheel-zero-delta"};
    }
    if (project === "chromium" && normalizedFile === "smoke.spec.ts" && line === 78) {
        return {
            combination,
            signature: /locator\.click|visible, enabled and stable/i.test(detail)
                ? "B-actionability-hang"
                : "B-unresolved-smoke",
        };
    }
    if (project === "chromium" && normalizedFile === "matrix.spec.ts" && line === 572) {
        return {
            combination,
            signature: /ERR_ABORTED|frame was detached/i.test(detail)
                ? "C-navigation-aborted"
                : "C-navigation-timeout-unresolved",
        };
    }
    if (project === "firefox" && normalizedFile === "matrix.spec.ts" && line === 135) {
        return {
            combination,
            signature: /navigation controls should start disabled|Expected:\s*false[\s\S]*Received:\s*true/i.test(
                detail,
            )
                ? "D-controls-enabled-before-probe"
                : "D-unresolved-enable-delay",
        };
    }
    if (project === "firefox" && normalizedFile === "matrix.spec.ts" && line === 314) {
        return {combination, signature: "E1-camera-motion-zero-or-unresolved"};
    }
    if (project === "firefox" && normalizedFile === "matrix.spec.ts" && line === 225) {
        return {combination, signature: "E2-camera-settle-or-unresolved"};
    }
    if (project === "firefox" && normalizedFile === "smoke.spec.ts" && line === 78) {
        return {combination, signature: "F-ui-visibility-or-unresolved"};
    }
    return {combination, signature: "other"};
}

function failuresFromEvents(events) {
    return events
        .filter(
            (event) =>
                event.type === "test-end" &&
                !["passed", "skipped"].includes(event.status),
        )
        .map((event) => {
            const detail = JSON.stringify(event.errors ?? []);
            const file = event.location?.file ?? "unknown";
            const line = event.location?.line ?? 0;
            const classification = classifyFailure(event.project ?? "unknown", file, line, detail);
            return {
                ...classification,
                project: event.project ?? "unknown",
                file: path.basename(file),
                line,
                title: event.titlePath?.at(-1) ?? "unknown",
                status: event.status,
                detail,
                source: "reporter",
            };
        });
}

function failuresFromText(text) {
    const header = /^\s*\d+\)\s+\[(chromium|firefox)]\s+›\s+tests\/e2e\/(smoke|matrix)\.spec\.ts:(\d+):\d+\s+›\s+(.+)$/gm;
    const matches = [...text.matchAll(header)];
    return matches.map((match, index) => {
        const detail = text.slice(match.index, matches[index + 1]?.index ?? text.length);
        const project = match[1];
        const file = `${match[2]}.spec.ts`;
        const line = Number(match[3]);
        return {
            ...classifyFailure(project, file, line, detail),
            project,
            file,
            line,
            title: match[4].trim(),
            status: /Test timeout/i.test(detail) ? "timedOut-or-failed" : "failed",
            detail,
            source: "console",
        };
    });
}

function parseWorkerCount(text) {
    const match = text.match(/Running\s+\d+\s+tests?\s+using\s+(\d+)\s+workers?/i);
    return match === null ? null : Number(match[1]);
}

function parseKiB(value) {
    if (typeof value !== "string") {
        return null;
    }
    const match = value.match(/^([\d.]+)\s+kB$/i);
    return match === null ? null : Number(match[1]);
}

function summarizeTelemetry(hostEvents, processEvents, gpuEvents) {
    const hostSnapshots = hostEvents.filter((event) => event.type === "host-snapshot");
    const processSnapshots = processEvents.filter((event) => event.type === "process-snapshot");
    const gpuSnapshots = gpuEvents.filter((event) => event.type === "gpu-snapshot");
    const max = (values) => (values.length === 0 ? null : Math.max(...values));
    const min = (values) => (values.length === 0 ? null : Math.min(...values));

    return {
        hostSamples: hostSnapshots.length,
        processSamples: processSnapshots.length,
        gpuSamples: gpuSnapshots.length,
        maxLoadOneMinute: max(hostSnapshots.map((event) => event.load.oneMinute).filter(Number.isFinite)),
        maxRunnableProcesses: max(
            hostSnapshots.map((event) => event.load.running).filter(Number.isFinite),
        ),
        minMemAvailableKiB: min(
            hostSnapshots.map((event) => parseKiB(event.memory.memAvailable)).filter(Number.isFinite),
        ),
        minSwapFreeKiB: min(
            hostSnapshots.map((event) => parseKiB(event.memory.swapFree)).filter(Number.isFinite),
        ),
        maxCpuPressureSomeAvg10: max(
            hostSnapshots
                .map((event) => event.pressure.cpu?.some?.avg10)
                .filter(Number.isFinite),
        ),
        maxMemoryPressureSomeAvg10: max(
            hostSnapshots
                .map((event) => event.pressure.memory?.some?.avg10)
                .filter(Number.isFinite),
        ),
        maxRelevantProcessRows: max(processSnapshots.map((event) => event.rows.length)),
        maxGpuUtilizationPercent: max(
            gpuSnapshots
                .flatMap((event) => event.rows)
                .map((row) => Number(row.split(",")[2]?.trim()))
                .filter(Number.isFinite),
        ),
    };
}

async function readRendererEvidence(runDir, manifest) {
    const probePath = path.join(runDir, manifest.rendererProbeArchive ?? "renderer-probe.json");
    if (manifest.rendererProbeArchive !== null && (await exists(probePath))) {
        const report = JSON.parse(await readFile(probePath, "utf8"));
        return {
            source: manifest.rendererProbeArchive,
            verified: Boolean(
                report.verification?.chromiumSwiftShaderVerified &&
                    report.verification?.firefoxRendererObserved,
            ),
            engines: Object.fromEntries(
                (report.results ?? []).map((result) => [
                    result.engine,
                    {
                        renderer: result.renderer,
                        vendor: result.vendor,
                        class: result.class,
                    },
                ]),
            ),
        };
    }

    const gpuLogDir = path.join(runDir, "gpu-lane-logs");
    if (!(await exists(gpuLogDir))) {
        return {source: null, verified: false, engines: {}};
    }

    const engines = {};
    for (const entry of await readdir(gpuLogDir, {withFileTypes: true})) {
        if (!entry.isFile() || !entry.name.startsWith("probe-")) {
            continue;
        }
        const text = await readFile(path.join(gpuLogDir, entry.name), "utf8");
        const engine = text.match(/engine:\s+(chromium|firefox)/)?.[1];
        if (engine === undefined) {
            continue;
        }
        engines[engine] = {
            renderer: text.match(/renderer:\s+"([^"]+)"/)?.[1] ?? null,
            vendor: text.match(/vendor:\s+"([^"]+)"/)?.[1] ?? null,
            class: text.match(/class:\s+(\S+)/)?.[1] ?? null,
            transcript: `gpu-lane-logs/${entry.name}`,
        };
    }
    return {
        source: "gpu-lane-logs",
        verified:
            engines.chromium?.class === "hardware" && engines.firefox?.class === "hardware",
        engines,
    };
}

async function countArtifacts(root) {
    if (!(await exists(root))) {
        return {traces: 0, videos: 0, screenshots: 0};
    }

    const counts = {traces: 0, videos: 0, screenshots: 0};
    const pending = [root];
    while (pending.length > 0) {
        const current = pending.pop();
        for (const entry of await readdir(current, {withFileTypes: true})) {
            const entryPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                pending.push(entryPath);
            } else if (entry.name === "trace.zip") {
                counts.traces += 1;
            } else if (/\.(webm|mp4)$/i.test(entry.name)) {
                counts.videos += 1;
            } else if (/\.png$/i.test(entry.name)) {
                counts.screenshots += 1;
            }
        }
    }
    return counts;
}

const runEntries = (await readdir(runsDir, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const runs = [];
for (const runId of runEntries) {
    const runDir = path.join(runsDir, runId);
    const manifestPath = path.join(runDir, "manifest.json");
    if (!(await exists(manifestPath))) {
        continue;
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const blobOutcome = await materializeBlobReport(runDir);
    const blobRows = flattenBlobResults(blobOutcome.report);
    const [stdout, stderr, events, hostEvents, processEvents, gpuEvents] = await Promise.all([
        readFile(path.join(runDir, "stdout.log"), "utf8").catch(() => ""),
        readFile(path.join(runDir, "stderr.log"), "utf8").catch(() => ""),
        readJsonLines(path.join(runDir, "events.jsonl")),
        readJsonLines(path.join(runDir, "telemetry/host.jsonl")),
        readJsonLines(path.join(runDir, "telemetry/processes.jsonl")),
        readJsonLines(path.join(runDir, "telemetry/gpu.jsonl")),
    ]);
    const combined = `${stdout}\n${stderr}`;
    const reporterFailures = failuresFromEvents(events);
    const failures =
        blobOutcome.report !== null
            ? failuresFromBlob(blobRows)
            : reporterFailures.length > 0
              ? reporterFailures
              : failuresFromText(combined);

    runs.push({
        runId,
        arm: manifest.arm,
        rendererIntent: manifest.rendererIntent,
        instrumented: manifest.instrumented,
        revision: manifest.revision,
        startedAt: manifest.startedAt,
        durationMs: manifest.durationMs,
        exitCode: manifest.outcome.exitCode,
        signal: manifest.outcome.signal,
        red: manifest.outcome.exitCode !== 0,
        configuredWorkers: Number(manifest.environment.E2E_WORKERS),
        reportedWorkers: parseWorkerCount(combined),
        maxActiveTests:
            blobOutcome.report === null
                ? manifest.reporterSummary?.maxActiveTests ?? null
                : maxActiveBlobTests(blobRows),
        blobReportError: blobOutcome.error,
        failures: failures.map((failure) => ({
            combination: failure.combination,
            signature: failure.signature,
            project: failure.project,
            file: failure.file,
            line: failure.line,
            title: failure.title,
            status: failure.status,
            source: failure.source,
        })),
        failureCount: failures.length,
        combinations: failures.map((failure) => failure.combination),
        signatures: failures.map((failure) => failure.signature),
        rendererEvidence: await readRendererEvidence(runDir, manifest),
        telemetry: summarizeTelemetry(hostEvents, processEvents, gpuEvents),
        artifacts: await countArtifacts(path.join(runDir, "test-results")),
    });
}

function armSummary(arm) {
    const armRuns = runs.filter((run) => run.arm === arm);
    const combinationCounts = {};
    const signatureCounts = {};
    for (const run of armRuns) {
        for (const combination of new Set(run.combinations)) {
            combinationCounts[combination] = (combinationCounts[combination] ?? 0) + 1;
        }
        for (const signature of run.signatures) {
            signatureCounts[signature] = (signatureCounts[signature] ?? 0) + 1;
        }
    }
    return {
        runs: armRuns.length,
        redRuns: armRuns.filter((run) => run.red).length,
        totalFailures: armRuns.reduce((sum, run) => sum + run.failureCount, 0),
        combinationCounts,
        signatureCounts,
    };
}

const arms = Object.fromEntries([...new Set(runs.map((run) => run.arm))].map((arm) => [arm, armSummary(arm)]));
const observerTargets = [
    "chromium:smoke.spec.ts:78",
    "chromium:matrix.spec.ts:225",
    "chromium:matrix.spec.ts:572",
];
const control = arms["passive-control"];
const observed = arms["passive-observed"];
const observerQualification =
    control === undefined || observed === undefined
        ? null
        : {
              requiredRunsPresent: control.runs === 5 && observed.runs === 5,
              observedAllRed: observed.redRuns === 5,
              targetDifferences: Object.fromEntries(
                  observerTargets.map((target) => [
                      target,
                      (observed.combinationCounts[target] ?? 0) -
                          (control.combinationCounts[target] ?? 0),
                  ]),
              ),
              observerEffectAcceptable:
                  control.runs === 5 &&
                  observed.runs === 5 &&
                  observed.redRuns === 5 &&
                  observerTargets.every(
                      (target) =>
                          Math.abs(
                              (observed.combinationCounts[target] ?? 0) -
                                  (control.combinationCounts[target] ?? 0),
                          ) <= 1,
                  ),
          };

const swiftShader = arms["renderer-swiftshader"];
const nativeGpu = arms["renderer-native"];
const rendererRuns = runs.filter((run) =>
    ["renderer-swiftshader", "renderer-native"].includes(run.arm),
);
const rendererControl =
    swiftShader === undefined || nativeGpu === undefined
        ? null
        : {
              requiredRunsPresent: swiftShader.runs === 5 && nativeGpu.runs === 5,
              everyRunRendererVerified: rendererRuns.every(
                  (run) => run.rendererEvidence.verified,
              ),
              targetCounts: Object.fromEntries(
                  observerTargets.map((target) => [
                      target,
                      {
                          swiftShader: swiftShader.combinationCounts[target] ?? 0,
                          nativeGpu: nativeGpu.combinationCounts[target] ?? 0,
                      },
                  ]),
              ),
              swiftShaderCoreRecurrent: observerTargets.every(
                  (target) => (swiftShader.combinationCounts[target] ?? 0) >= 4,
              ),
              nativeGpuCoreClean: observerTargets.every(
                  (target) => (nativeGpu.combinationCounts[target] ?? 0) === 0,
              ),
              comparableWithinOneRun: observerTargets.every(
                  (target) =>
                      Math.abs(
                          (swiftShader.combinationCounts[target] ?? 0) -
                              (nativeGpu.combinationCounts[target] ?? 0),
                      ) <= 1,
              ),
              decision:
                  swiftShader.runs !== 5 || nativeGpu.runs !== 5
                      ? "incomplete"
                      : !rendererRuns.every((run) => run.rendererEvidence.verified)
                        ? "inconclusive-unverified-renderer"
                        : observerTargets.every(
                                (target) =>
                                    (swiftShader.combinationCounts[target] ?? 0) >= 4,
                            ) &&
                            observerTargets.every(
                                (target) => (nativeGpu.combinationCounts[target] ?? 0) === 0,
                            )
                          ? "strong-support-swiftshader-amplifier"
                          : observerTargets.every(
                                  (target) =>
                                      Math.abs(
                                          (swiftShader.combinationCounts[target] ?? 0) -
                                              (nativeGpu.combinationCounts[target] ?? 0),
                                      ) <= 1,
                              )
                            ? "refute-swiftshader-decisive-amplifier"
                            : "mixed-needs-follow-up",
          };

const summary = {
    generatedAt: new Date().toISOString(),
    runs,
    arms,
    observerQualification,
    rendererControl,
};
await writeFile(path.join(outputDir, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

const csvHeader = [
    "runId",
    "arm",
    "rendererIntent",
    "instrumented",
    "red",
    "durationMs",
    "reportedWorkers",
    "maxActiveTests",
    "failureCount",
    "rendererVerified",
    "chromiumRenderer",
    "firefoxRenderer",
    "combinations",
    "signatures",
    "traceCount",
    "videoCount",
    "screenshotCount",
].join(",");
const csvRows = runs.map((run) =>
    [
        run.runId,
        run.arm,
        run.rendererIntent,
        run.instrumented,
        run.red,
        run.durationMs,
        run.reportedWorkers,
        run.maxActiveTests,
        run.failureCount,
        run.rendererEvidence.verified,
        run.rendererEvidence.engines.chromium?.renderer,
        run.rendererEvidence.engines.firefox?.renderer,
        run.combinations.join(";"),
        run.signatures.join(";"),
        run.artifacts.traces,
        run.artifacts.videos,
        run.artifacts.screenshots,
    ]
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
);
await writeFile(path.join(outputDir, "run-summary.csv"), `${csvHeader}\n${csvRows.join("\n")}\n`);

process.stdout.write(`Analyzed ${runs.length} runs from ${runsDir}\n`);
