import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

const experimentDir = path.dirname(new URL(import.meta.url).pathname);
const issuePath = process.argv[2] ?? path.join(experimentDir, "data/input/issue-61.json");
const outputDir = process.argv[3] ?? path.join(experimentDir, "data/input/canonical");
const expectedFiles = [
    "22_worker_testing.txt",
    "run_6.txt",
    "run_7.txt",
    "run_8.txt",
    "run_9.txt",
    "run_10.txt",
];

const issue = JSON.parse(await readFile(issuePath, "utf8"));

if (issue.number !== 61 || typeof issue.body !== "string") {
    throw new Error(`${issuePath} is not the expected issue #61 export`);
}

await mkdir(outputDir, {recursive: true});

const files = [];
for (const filename of expectedFiles) {
    const marker = `<code>${filename}</code>`;
    const markerIndex = issue.body.indexOf(marker);
    if (markerIndex === -1) {
        throw new Error(`Issue body does not contain ${filename}`);
    }

    const fencedBlock = issue.body.slice(markerIndex).match(/```text\n([\s\S]*?)\n```/);
    if (fencedBlock === null) {
        throw new Error(`Issue body does not contain a text block for ${filename}`);
    }

    // These are reconstructions of the verbatim issue attachments, not claims
    // that the original local files or their metadata survived.
    const content = `${fencedBlock[1]}\n`;
    const outputPath = path.join(outputDir, filename);
    await writeFile(outputPath, content, "utf8");
    files.push({
        path: path.relative(experimentDir, outputPath),
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        provenance: "reconstructed from the verbatim fenced attachment in issue #61",
    });
}

const manifest = {
    source: {
        issue: issue.number,
        title: issue.title,
        url: issue.url,
        updatedAt: issue.updatedAt,
        exportPath: path.relative(experimentDir, issuePath),
    },
    limitation:
        "The text files were reconstructed from issue #61. Their original filesystem metadata and any unposted binary Playwright artifacts are not implied to have survived.",
    files,
};

await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
);

process.stdout.write(`Recovered ${files.length} text artifacts into ${outputDir}\n`);
