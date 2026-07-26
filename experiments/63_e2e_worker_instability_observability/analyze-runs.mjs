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
                attachments: row.result.attachments ?? [],
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
        [135, 195, 225].includes(line)
    ) {
        if (/wheel .*should zoom|wheel input after enablement should zoom/i.test(detail)) {
            return {
                combination,
                family: "A",
                signature: "A-camera-distance-unchanged-after-wheel",
                transition:
                    "camera distance remained unchanged within the post-wheel observation budget",
            };
        }
        if (/mouse\.move: Test timeout/i.test(detail)) {
            return {
                combination,
                family: "A",
                signature: "A-background-drag-action-timeout",
                transition:
                    "the wheel phase completed, then the background-drag mouse.move remained pending until the test deadline",
            };
        }
        return {
            combination,
            family: "A",
            signature: /Test timeout/i.test(detail)
                ? "A-unresolved-test-timeout"
                : "A-unresolved",
            transition: "the retained failure does not identify A's first missing transition",
        };
    }
    if (project === "chromium" && normalizedFile === "smoke.spec.ts" && line === 78) {
        if (/locator\.click|visible, enabled and stable/i.test(detail)) {
            const button = /Reset Camera/i.test(detail)
                ? "reset"
                : /Resume Auto Rotation/i.test(detail)
                  ? "resume-rotation"
                  : /Pause Auto Rotation/i.test(detail)
                    ? "pause-rotation"
                    : "unidentified";
            return {
                combination,
                family: "B",
                signature: `B-${button}-click-actionability-hang`,
                transition:
                    `the ordinary ${button} click remained in Playwright's combined visible/enabled/stable actionability wait until the test deadline`,
            };
        }
        return {
            combination,
            family: "B",
            signature: "B-unresolved-smoke",
            transition: "the retained smoke failure does not identify B's first missing transition",
        };
    }
    if (project === "chromium" && normalizedFile === "matrix.spec.ts" && line === 572) {
        return /ERR_ABORTED|frame was detached/i.test(detail)
            ? {
                  combination,
                  family: "C",
                  signature: "C-second-navigation-aborted",
                  transition:
                      "the second page.goto surfaced ERR_ABORTED or frame-detached evidence",
              }
            : {
                  combination,
                  family: "C",
                  signature: "C-second-navigation-timeout-unresolved",
                  transition:
                      "the retained error reaches the test deadline without identifying the navigation stage",
              };
    }
    if (project === "firefox" && normalizedFile === "matrix.spec.ts" && line === 135) {
        if (
            /navigation controls should start disabled|Expected:\s*false[\s\S]*Received:\s*true/i.test(
                detail,
            )
        ) {
            return {
                combination,
                family: "D",
                signature: "D-controls-enabled-at-first-observation",
                transition:
                    "the first successful graph snapshot already reported navigation controls enabled",
            };
        }
        if (/expected the react-force-graph imperative handle/i.test(detail)) {
            return {
                combination,
                family: "D",
                signature: "D-graph-handle-unavailable",
                transition:
                    "the graph handle was not observable before the enable-delay invariant could be checked",
            };
        }
        return {
            combination,
            family: "D",
            signature: "D-unresolved",
            transition: "the retained failure does not identify D's first missing transition",
        };
    }
    if (project === "firefox" && normalizedFile === "matrix.spec.ts" && line === 314) {
        return {
            combination,
            family: "E1",
            signature: "E1-camera-motion-zero-or-unresolved",
            transition: "camera motion was not observed within the retained budget",
        };
    }
    if (project === "firefox" && normalizedFile === "matrix.spec.ts" && line === 225) {
        return {
            combination,
            family: "E2",
            signature: "E2-camera-settle-or-unresolved",
            transition: "the camera did not satisfy the retained settle precondition",
        };
    }
    if (project === "firefox" && normalizedFile === "smoke.spec.ts" && line === 78) {
        return {
            combination,
            family: "F",
            signature: "F-ui-visibility-or-unresolved",
            transition: "the expected UI visibility transition was not observed",
        };
    }
    return {
        combination,
        family: "other",
        signature: "other",
        transition: "not classified by the experiment taxonomy",
    };
}

function readZipJsonLines(zipPath, entryName) {
    const result = spawnSync("unzip", ["-p", zipPath, entryName], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) {
        return {
            rows: [],
            error:
                result.error?.message ??
                result.stderr?.trim() ??
                `unzip exited ${result.status}`,
        };
    }
    try {
        return {
            rows: result.stdout
                .split("\n")
                .filter(Boolean)
                .map((line) => JSON.parse(line)),
            error: null,
        };
    } catch (error) {
        return {rows: [], error: error.message};
    }
}

function classifyNavigationTrace(failure, runDir) {
    if (
        failure.family !== "C" ||
        failure.signature !== "C-second-navigation-timeout-unresolved"
    ) {
        return failure;
    }
    const trace = failure.attachments?.find(
        (attachment) =>
            attachment.name === "trace" && attachment.contentType === "application/zip",
    );
    if (trace?.path === undefined) {
        return failure;
    }

    const tracePath = path.join(
        runDir,
        "blob-report/resources",
        path.basename(trace.path),
    );
    const testTrace = readZipJsonLines(tracePath, "test.trace");
    const networkTrace = readZipJsonLines(tracePath, "0-trace.network");
    if (testTrace.error !== null || networkTrace.error !== null) {
        return {
            ...failure,
            traceEvidence: {
                available: false,
                error: testTrace.error ?? networkTrace.error,
            },
        };
    }

    const navigations = testTrace.rows.filter(
        (row) => row.type === "before" && row.params?.url === "/",
    );
    const secondNavigation = navigations[1];
    const secondNavigationAfter = testTrace.rows.find(
        (row) =>
            row.type === "after" &&
            secondNavigation !== undefined &&
            row.callId === secondNavigation.callId,
    );
    const testTimeoutRecorded = testTrace.rows.some(
        (row) => row.type === "error" && /Test timeout/i.test(row.message ?? ""),
    );
    const documentResponses = networkTrace.rows
        .map((row) => row.snapshot)
        .filter(
            (snapshot) =>
                snapshot?._resourceType === "document" &&
                snapshot.request?.url === "http://127.0.0.1:3000/",
        );
    const secondResponse = documentResponses[1];
    const responseBodyCompletionRecorded = Boolean(
        secondResponse !== undefined &&
            Number.isFinite(secondResponse.timings?.receive) &&
            secondResponse.timings.receive >= 0 &&
            Number.isFinite(secondResponse.response?.bodySize) &&
            secondResponse.response.bodySize >= 0 &&
            Number.isFinite(secondResponse.response?._transferSize) &&
            secondResponse.response._transferSize >= 0,
    );
    const traceEvidence = {
        available: true,
        navigationCalls: navigations.length,
        secondNavigationCallDurationMs:
            secondNavigation !== undefined && secondNavigationAfter !== undefined
                ? secondNavigationAfter.endTime - secondNavigation.startTime
                : null,
        testTimeoutRecorded,
        documentResponses: documentResponses.length,
        secondResponseStatus: secondResponse?.response?.status ?? null,
        secondResponseWaitMs: secondResponse?.timings?.wait ?? null,
        secondResponseReceiveMs: secondResponse?.timings?.receive ?? null,
        secondResponseBodyCompletionRecorded: responseBodyCompletionRecorded,
    };

    if (secondNavigation === undefined || !testTimeoutRecorded) {
        return {...failure, traceEvidence};
    }
    if (secondResponse === undefined) {
        return {
            ...failure,
            signature: "C-second-navigation-load-stall-before-response",
            transition:
                "the second page.goto remained pending at the test deadline without a retained document response",
            traceEvidence,
        };
    }
    if (responseBodyCompletionRecorded) {
        return {
            ...failure,
            signature: "C-second-navigation-load-stall-after-complete-response",
            transition:
                `the second page.goto received a complete ${secondResponse.response.status} document response but did not reach load before the test deadline`,
            traceEvidence,
        };
    }
    return {
        ...failure,
        signature: "C-second-navigation-load-stall-response-completion-unrecorded",
        transition:
            `the second page.goto received ${secondResponse.response.status} response headers, but the trace did not record completed document receipt and load did not finish before the test deadline`,
        traceEvidence,
    };
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
    const rawFailures =
        blobOutcome.report !== null
            ? failuresFromBlob(blobRows)
            : reporterFailures.length > 0
              ? reporterFailures
              : failuresFromText(combined);
    const failures = rawFailures.map((failure) =>
        classifyNavigationTrace(failure, runDir),
    );
    const rendererEvidence = await readRendererEvidence(runDir, manifest);
    const artifactDirectory = path.relative(experimentDir, runDir);

    runs.push({
        runId,
        arm: manifest.arm,
        rendererIntent: manifest.rendererIntent,
        instrumented: manifest.instrumented,
        command: manifest.command,
        revision: manifest.revision,
        gitStatusAtStart: manifest.gitStatus?.stdout?.trim() ?? null,
        startedAt: manifest.startedAt,
        finishedAt: manifest.finishedAt,
        durationMs: manifest.durationMs,
        exitCode: manifest.outcome.exitCode,
        signal: manifest.outcome.signal,
        red: manifest.outcome.exitCode !== 0,
        toolchain: {
            node: manifest.node?.stdout?.trim() ?? null,
            npm: manifest.npm?.stdout?.trim() ?? null,
        },
        host: {
            uname: manifest.uname?.stdout?.trim() ?? null,
            cpuCount: manifest.cpuCount,
            totalMemory: manifest.totalMemory,
        },
        environment: manifest.environment,
        configuredWorkers: Number(manifest.environment.E2E_WORKERS),
        reportedWorkers: parseWorkerCount(combined),
        maxActiveTests:
            blobOutcome.report === null
                ? manifest.reporterSummary?.maxActiveTests ?? null
                : maxActiveBlobTests(blobRows),
        blobReportError: blobOutcome.error,
        failures: failures.map((failure) => ({
            combination: failure.combination,
            family: failure.family,
            signature: failure.signature,
            transition: failure.transition,
            project: failure.project,
            file: failure.file,
            line: failure.line,
            title: failure.title,
            status: failure.status,
            source: failure.source,
            traceEvidence: failure.traceEvidence ?? null,
        })),
        failureCount: failures.length,
        combinations: failures.map((failure) => failure.combination),
        signatures: failures.map((failure) => failure.signature),
        engineMix: Object.keys(rendererEvidence.engines),
        rendererEvidence,
        telemetry: summarizeTelemetry(hostEvents, processEvents, gpuEvents),
        artifactDirectory,
        artifactPaths: [
            `${artifactDirectory}/manifest.json`,
            `${artifactDirectory}/stdout.log`,
            `${artifactDirectory}/stderr.log`,
            ...manifest.archivedArtifacts.map(
                (artifact) => `${artifactDirectory}/${artifact}`,
            ),
        ],
        artifacts: await countArtifacts(path.join(runDir, "test-results")),
    });
}

function numberSummary(values) {
    const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
    if (finite.length === 0) {
        return null;
    }
    const middle = Math.floor(finite.length / 2);
    const median =
        finite.length % 2 === 0
            ? (finite[middle - 1] + finite[middle]) / 2
            : finite[middle];
    return {
        count: finite.length,
        min: finite[0],
        median,
        mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
        max: finite.at(-1),
    };
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
        durationMs: numberSummary(armRuns.map((run) => run.durationMs)),
        reportedWorkers: numberSummary(armRuns.map((run) => run.reportedWorkers)),
        maxActiveTests: numberSummary(armRuns.map((run) => run.maxActiveTests)),
        telemetry: {
            maxLoadOneMinute: numberSummary(
                armRuns.map((run) => run.telemetry.maxLoadOneMinute),
            ),
            maxRunnableProcesses: numberSummary(
                armRuns.map((run) => run.telemetry.maxRunnableProcesses),
            ),
            maxCpuPressureSomeAvg10: numberSummary(
                armRuns.map((run) => run.telemetry.maxCpuPressureSomeAvg10),
            ),
            minMemAvailableKiB: numberSummary(
                armRuns.map((run) => run.telemetry.minMemAvailableKiB),
            ),
            minSwapFreeKiB: numberSummary(
                armRuns.map((run) => run.telemetry.minSwapFreeKiB),
            ),
            maxMemoryPressureSomeAvg10: numberSummary(
                armRuns.map((run) => run.telemetry.maxMemoryPressureSomeAvg10),
            ),
        },
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
function buildObserverQualification(profile, controlArm, observedArm) {
    const control = arms[controlArm];
    const observed = arms[observedArm];
    if (control === undefined || observed === undefined) {
        return null;
    }
    return {
        profile,
        controlArm,
        observedArm,
        requiredRunsPresent: control.runs === 5 && observed.runs === 5,
        controlAllRed: control.redRuns === 5,
        observedAllRed: observed.redRuns === 5,
        runtimeComparison: {
            control: control.durationMs,
            observed: observed.durationMs,
            medianDeltaMs: observed.durationMs.median - control.durationMs.median,
            medianRatio: observed.durationMs.median / control.durationMs.median,
        },
        activeConcurrencyComparison: {
            control: control.maxActiveTests,
            observed: observed.maxActiveTests,
            medianDelta:
                control.maxActiveTests === null || observed.maxActiveTests === null
                    ? null
                    : observed.maxActiveTests.median - control.maxActiveTests.median,
        },
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
}

const observerQualificationAttempts = {
    original: buildObserverQualification(
        "1s-host-2s-process-gpu-plus-blob",
        "passive-control",
        "passive-observed",
    ),
    reduced: buildObserverQualification(
        "5s-host-10s-process-no-continuous-gpu-plus-blob",
        "passive-lite-control",
        "passive-lite-observed",
    ),
};
const observerQualification =
    observerQualificationAttempts.reduced ?? observerQualificationAttempts.original;

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
              outcomes: {
                  swiftShaderRedRuns: swiftShader.redRuns,
                  nativeGpuRedRuns: nativeGpu.redRuns,
                  swiftShaderFailures: swiftShader.totalFailures,
                  nativeGpuFailures: nativeGpu.totalFailures,
              },
              endToEndDurationComparison: {
                  swiftShader: swiftShader.durationMs,
                  nativeGpu: nativeGpu.durationMs,
                  medianDeltaMs:
                      nativeGpu.durationMs.median - swiftShader.durationMs.median,
                  nativeToSwiftShaderMedianRatio:
                      nativeGpu.durationMs.median / swiftShader.durationMs.median,
              },
              hostPressureComparison: {
                  swiftShader: swiftShader.telemetry,
                  nativeGpu: nativeGpu.telemetry,
              },
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

const classificationArms = ["passive-lite-observed", "renderer-swiftshader"];
const classifiedOccurrences = runs
    .filter((run) => classificationArms.includes(run.arm))
    .flatMap((run) =>
        run.failures
            .filter((failure) => ["A", "B", "C", "D"].includes(failure.family))
            .map((failure) => ({
                runId: run.runId,
                arm: run.arm,
                combination: failure.combination,
                family: failure.family,
                signature: failure.signature,
                transition: failure.transition,
                status: failure.status,
                traceEvidence: failure.traceEvidence,
            })),
    );
const classification = {
    sourceArms: classificationArms,
    occurrenceCount: classifiedOccurrences.length,
    byFamily: Object.fromEntries(
        ["A", "B", "C", "D"].map((family) => {
            const occurrences = classifiedOccurrences.filter(
                (occurrence) => occurrence.family === family,
            );
            return [
                family,
                {
                    occurrences: occurrences.length,
                    runs: new Set(occurrences.map((occurrence) => occurrence.runId)).size,
                    signatureCounts: Object.fromEntries(
                        [...new Set(occurrences.map((occurrence) => occurrence.signature))].map(
                            (signature) => [
                                signature,
                                occurrences.filter(
                                    (occurrence) => occurrence.signature === signature,
                                ).length,
                            ],
                        ),
                    ),
                },
            ];
        }),
    ),
    perOccurrence: classifiedOccurrences,
};

const summary = {
    generatedAt: new Date().toISOString(),
    runs,
    arms,
    observerQualificationAttempts,
    observerQualification,
    rendererControl,
    classification,
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
