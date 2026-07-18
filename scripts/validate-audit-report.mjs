import console from "node:console";
import {readFile} from "node:fs/promises";
import process from "node:process";

const severityNames = ["info", "low", "moderate", "high", "critical"];

function fail(message) {
    console.error(`Invalid npm audit evidence: ${message}`);
    process.exitCode = 1;
}

const [reportPath, rawExitCode, ...extraArguments] = process.argv.slice(2);

if (
    reportPath === undefined ||
    rawExitCode === undefined ||
    extraArguments.length > 0
) {
    fail(
        "usage: node scripts/validate-audit-report.mjs <audit.json> <original-exit-code>",
    );
} else if (!/^\d+$/.test(rawExitCode)) {
    fail(`original exit code is not a nonnegative integer: ${rawExitCode}`);
} else {
    const originalExitCode = Number(rawExitCode);
    let report;

    try {
        report = JSON.parse(await readFile(reportPath, "utf8"));
    } catch (error) {
        fail(
            `cannot read valid JSON from ${reportPath}: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
    }

    if (process.exitCode === undefined) {
        const vulnerabilityCounts = report?.metadata?.vulnerabilities;
        const vulnerabilities = report?.vulnerabilities;

        if (
            vulnerabilityCounts === null ||
            typeof vulnerabilityCounts !== "object" ||
            Array.isArray(vulnerabilityCounts)
        ) {
            fail("metadata.vulnerabilities is missing or invalid");
        } else if (
            vulnerabilities === null ||
            typeof vulnerabilities !== "object" ||
            Array.isArray(vulnerabilities)
        ) {
            fail("vulnerabilities is missing or invalid");
        } else {
            const expectedCountNames = [...severityNames, "total"];
            const invalidCountName = expectedCountNames.find(
                (name) =>
                    !Number.isInteger(vulnerabilityCounts[name]) ||
                    vulnerabilityCounts[name] < 0,
            );

            if (invalidCountName !== undefined) {
                fail(
                    `metadata.vulnerabilities.${invalidCountName} must be a nonnegative integer`,
                );
            } else {
                const severityTotal = severityNames.reduce(
                    (total, name) => total + vulnerabilityCounts[name],
                    0,
                );
                const total = vulnerabilityCounts.total;
                const affectedPackages = Object.keys(vulnerabilities).length;

                if (severityTotal !== total) {
                    fail(
                        `severity counts sum to ${severityTotal}, but total is ${total}`,
                    );
                } else if (total > 0 && affectedPackages === 0) {
                    fail(
                        "nonzero vulnerability metadata has no affected package records",
                    );
                } else if (total === 0 && affectedPackages > 0) {
                    fail(
                        "zero vulnerability metadata has affected package records",
                    );
                } else if (
                    (total === 0 && originalExitCode !== 0) ||
                    (total > 0 && originalExitCode !== 1)
                ) {
                    fail(
                        `original exit code ${originalExitCode} is inconsistent with total ${total}`,
                    );
                } else {
                    console.log(
                        `Valid npm audit report: ${total} finding(s) across ${affectedPackages} affected package(s); original exit ${originalExitCode}.`,
                    );
                }
            }
        }
    }
}
