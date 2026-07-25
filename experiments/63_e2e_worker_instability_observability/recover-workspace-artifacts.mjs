import {createHash} from "node:crypto";
import {copyFile, mkdir, readFile, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const experimentDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.argv[2];

if (sourceRoot === undefined) {
    throw new Error("Usage: node recover-workspace-artifacts.mjs ORIGINAL_WORKSPACE_ROOT");
}

const originalDir = path.join(experimentDir, "data/input/original");
const survivorDir = path.join(experimentDir, "data/input/workspace-survivors");
const reconstructedDir = path.join(experimentDir, "data/input/canonical");
const filenames = [
    "22_worker_testing.txt",
    "run_6.txt",
    "run_7.txt",
    "run_8.txt",
    "run_9.txt",
    "run_10.txt",
];

function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}

async function recoverExactFile(filename) {
    const sourcePath = path.join(sourceRoot, filename);
    const destinationPath = path.join(originalDir, filename);
    const reconstructedPath = path.join(reconstructedDir, filename);
    const [source, reconstructed, sourceStat] = await Promise.all([
        readFile(sourcePath),
        readFile(reconstructedPath),
        stat(sourcePath),
    ]);
    const normalizedSource = source
        .toString("utf8")
        .replaceAll("\r\n", "\n")
        .replace(/\n$/, "");
    const normalizedReconstruction = reconstructed.toString("utf8").replace(/\n$/, "");

    if (normalizedSource !== normalizedReconstruction) {
        throw new Error(
            `${filename} does not match the issue reconstruction after line-ending normalization`,
        );
    }

    await copyFile(sourcePath, destinationPath);
    return {
        path: path.relative(experimentDir, destinationPath),
        sourcePath,
        bytes: source.length,
        sha256: sha256(source),
        modifiedAt: sourceStat.mtime.toISOString(),
        lineEndings: source.includes(Buffer.from("\r\n")) ? "CRLF" : "LF-or-mixed",
        normalizedMatchesIssueReconstruction: true,
    };
}

async function recoverSmallSurvivor(relativeSourcePath, relativeDestinationPath) {
    const sourcePath = path.join(sourceRoot, relativeSourcePath);
    const destinationPath = path.join(survivorDir, relativeDestinationPath);
    const source = await readFile(sourcePath);
    await mkdir(path.dirname(destinationPath), {recursive: true});
    await copyFile(sourcePath, destinationPath);
    return {
        path: path.relative(experimentDir, destinationPath),
        sourcePath,
        bytes: source.length,
        sha256: sha256(source),
    };
}

await Promise.all([mkdir(originalDir, {recursive: true}), mkdir(survivorDir, {recursive: true})]);
const originals = [];
for (const filename of filenames) {
    originals.push(await recoverExactFile(filename));
}

const lastRun = await recoverSmallSurvivor(
    "test-results/.last-run.json",
    "test-results-last-run.json",
);
const rendererLogs = await Promise.all([
    recoverSmallSurvivor(
        "gpu-lane-logs/probe-chromium-wsl2-d3d12-angle-gl-headless.log",
        "gpu-lane-logs/probe-chromium-wsl2-d3d12-angle-gl-headless.log",
    ),
    recoverSmallSurvivor(
        "gpu-lane-logs/probe-firefox-wsl2-d3d12-firefox-headless.log",
        "gpu-lane-logs/probe-firefox-wsl2-d3d12-firefox-headless.log",
    ),
]);
const reportPath = path.join(sourceRoot, "playwright-report/index.html");
const report = await readFile(reportPath);

const manifest = {
    recoveredAt: new Date().toISOString(),
    sourceRoot,
    originals,
    retainedFailureArtifactSearch: {
        scope: "main workspace plus builder worktrees, excluding .git, node_modules, and .next",
        patterns: ["trace.zip", "*.webm", "*.mp4", "test-failed-*.png", "*.dmp", "chrome_debug.log"],
        matches: [],
        conclusion:
            "No issue-61 trace, video, screenshot, browser stderr, or crash dump survived in the searched workspace.",
    },
    unrelatedSurvivors: {
        lastRun: {
            ...lastRun,
            parsed: JSON.parse(await readFile(path.join(sourceRoot, "test-results/.last-run.json"), "utf8")),
            conclusion: "The surviving test-results marker is a later passing run, not issue-61 failure evidence.",
        },
        playwrightReport: {
            sourcePath: reportPath,
            bytes: report.length,
            sha256: sha256(report),
            copied: false,
            conclusion:
                "The lone surviving HTML report accompanies a later passing result and was inventoried but not copied.",
        },
        rendererLogs: {
            files: rendererLogs,
            conclusion:
                "These 2026-07-24 logs prove prior same-host hardware-renderer viability but do not replace current per-run verification.",
        },
    },
};

await writeFile(
    path.join(experimentDir, "data/input/artifact-recovery.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`Recovered ${originals.length} original text artifacts from ${sourceRoot}\n`);
