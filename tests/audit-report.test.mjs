import assert from "node:assert/strict";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import process from "node:process";
import {spawnSync} from "node:child_process";
import test from "node:test";
import {URL} from "node:url";

const validatorPath = new URL(
    "../scripts/validate-audit-report.mjs",
    import.meta.url,
);

function auditReport(vulnerabilities = {}) {
    const total = Object.keys(vulnerabilities).length;

    return {
        auditReportVersion: 2,
        vulnerabilities,
        metadata: {
            vulnerabilities: {
                info: 0,
                low: 0,
                moderate: total,
                high: 0,
                critical: 0,
                total,
            },
            dependencies: {
                prod: 1,
                dev: 0,
                optional: 0,
                peer: 0,
                peerOptional: 0,
                total: 1,
            },
        },
    };
}

async function runValidator(t, contents, originalExitCode) {
    const directory = await mkdtemp(join(tmpdir(), "audit-report-test-"));
    t.after(() => rm(directory, {recursive: true, force: true}));
    const reportPath = join(directory, "audit.json");
    await writeFile(
        reportPath,
        typeof contents === "string" ? contents : JSON.stringify(contents),
    );

    return spawnSync(
        process.execPath,
        [validatorPath.pathname, reportPath, String(originalExitCode)],
        {encoding: "utf8"},
    );
}

test("accepts a clean npm audit report with exit code zero", async (t) => {
    const result = await runValidator(t, auditReport(), 0);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Valid npm audit report: 0 finding/);
});

test("accepts advisory evidence with npm audit exit code one", async (t) => {
    const result = await runValidator(
        t,
        auditReport({
            example: {
                name: "example",
                severity: "moderate",
                isDirect: false,
                via: [],
                effects: [],
                range: "*",
                nodes: ["node_modules/example"],
                fixAvailable: false,
            },
        }),
        1,
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 finding.*1 affected package/);
});

test("rejects malformed or non-audit JSON", async (t) => {
    const malformed = await runValidator(t, "{", 1);
    const registryError = await runValidator(
        t,
        {error: {code: "EAI_AGAIN", summary: "registry unavailable"}},
        1,
    );

    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /cannot read valid JSON/);
    assert.equal(registryError.status, 1);
    assert.match(
        registryError.stderr,
        /metadata\.vulnerabilities is missing or invalid/,
    );
});

test("rejects report totals inconsistent with the original exit", async (t) => {
    const cleanFailure = await runValidator(t, auditReport(), 1);
    const advisorySuccess = await runValidator(
        t,
        auditReport({example: {severity: "moderate"}}),
        0,
    );

    assert.equal(cleanFailure.status, 1);
    assert.match(cleanFailure.stderr, /exit code 1 is inconsistent/);
    assert.equal(advisorySuccess.status, 1);
    assert.match(advisorySuccess.stderr, /exit code 0 is inconsistent/);
});
