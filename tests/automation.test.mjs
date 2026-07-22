import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {URL} from "node:url";

const workflow = await readFile(
    new URL("../.github/workflows/validation.yml", import.meta.url),
    "utf8",
);
const readme = await readFile(
    new URL("../README.md", import.meta.url),
    "utf8",
);
const playwrightConfig = await readFile(
    new URL("../playwright.config.ts", import.meta.url),
    "utf8",
);
const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

// The CI workflow is a multi-job decomposition of `npm run validate`. Extract a
// single job's YAML block (2-space-indented key under `jobs:` up to the next
// job key or EOF) so assertions target the right job rather than the first
// same-named step across jobs.
function jobBlock(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = workflow.match(
        new RegExp(`\\n {2}${escaped}:\\n([\\s\\S]*?)(?=\\n {2}[A-Za-z]|$)`),
    );
    assert.notEqual(match, null, `workflow job "${name}" should exist`);
    return match[0];
}

// Extract a named step's block from within a job block.
function step(block, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = block.match(
        new RegExp(
            `\\n {6}- name: ${escaped}\\n([\\s\\S]*?)(?=\\n {6}- name:|\\n {2}[A-Za-z]|$)`,
        ),
    );
    assert.notEqual(match, null, `step "${name}" should exist in job`);
    return match[0];
}

const depInstallingJobs = ["quality", "e2e", "merge-reports"];

test("triggers on the same events with least-privilege permissions", () => {
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /push:\n {4}branches:\n {6}- main/);
    assert.match(workflow, /permissions:\n {2}contents: read/);
});

test("verifies the exact Node/npm baseline and npm ci in every install job", () => {
    // The reproducibility contract must hold in EVERY job that installs
    // dependencies, not just the first one.
    assert.match(workflow, /NODE_VERSION: 22\.23\.1/);
    assert.match(workflow, /NPM_VERSION: 10\.9\.8/);

    for (const jobName of depInstallingJobs) {
        const block = jobBlock(jobName);
        assert.match(
            block,
            /node-version: 22\.23\.1/,
            `${jobName} pins the Node baseline`,
        );
        const verify = step(block, "Verify toolchain");
        assert.match(verify, /v\$\{NODE_VERSION\}/);
        assert.match(verify, /\$\{NPM_VERSION\}/);
        assert.match(
            step(block, "Install locked dependencies"),
            /run: npm ci/,
            `${jobName} installs via npm ci`,
        );
    }
});

test("enforces lint, typecheck, and unit contracts in the quality job", () => {
    const quality = jobBlock("quality");
    assert.match(step(quality, "Lint"), /run: npm run lint/);
    assert.match(step(quality, "Typecheck"), /run: npm run typecheck/);
    assert.match(step(quality, "Test baseline contracts"), /run: npm test/);
});

test("shards the full Chromium e2e suite at the test level", () => {
    // fullyParallel makes --shard split at the TEST level. The worker count is
    // delegated to the tested resolver (scripts/e2e-workers.mjs, issue #41): CI is
    // hard-pinned to 1 so execution within a shard stays strictly serial (no
    // SwiftShader contention), while local runs scale to hardware. The CI-serial
    // matrix in that resolver is covered by tests/e2e-workers.test.mjs; here we
    // assert only that the config delegates to it.
    assert.match(playwrightConfig, /fullyParallel: true/);
    assert.match(playwrightConfig, /workers: resolveWorkers\(process\.env\)/);
    // CI-only retries (count 2) absorb pre-existing SwiftShader flake (issue #34)
    // so a single flaky attempt can't red the gate; local stays 0 so flakes show.
    assert.match(playwrightConfig, /retries: process\.env\.CI \? 2 : 0/);

    const e2e = jobBlock("e2e");
    // Four shards, and a failing shard must not cancel its siblings.
    assert.match(e2e, /fail-fast: false/);
    assert.match(e2e, /shard: \[1, 2, 3, 4\]/);

    // Build is preserved (was inside `npm run validate`).
    assert.match(step(e2e, "Build production application"), /run: npm run build/);

    // The Chromium engine gate is pinned via E2E_ENGINES, and the full suite is
    // split across shards — no test is dropped.
    const run = step(e2e, "Run e2e shard");
    assert.match(run, /E2E_ENGINES: chromium/);
    assert.match(run, /--shard=\$\{\{ matrix\.shard \}\}\/4/);
    assert.doesNotMatch(e2e, /continue-on-error/);

    // CI installs Chromium only; the Firefox arm stays a LOCAL qualification
    // gate. See codev/reviews/11-upgrade-and-behaviorally-quali.md.
    const browserInstall = step(e2e, "Install Chromium and system dependencies");
    assert.match(browserInstall, /playwright install --with-deps chromium$/m);
    assert.doesNotMatch(browserInstall, /firefox/);

    // Cheap add-on: cache the browser download, keyed on the Playwright version.
    const cache = step(e2e, "Cache Playwright browsers");
    assert.match(cache, /~\/\.cache\/ms-playwright/);
    assert.match(cache, /steps\.playwright\.outputs\.version/);
});

test("keeps audit evidence separate without weakening validation", () => {
    const quality = jobBlock("quality");
    const fullAudit = step(quality, "Capture full audit evidence");
    const productionAudit = step(quality, "Capture production audit evidence");

    for (const auditStep of [fullAudit, productionAudit]) {
        assert.match(auditStep, /if: always\(\)/);
        assert.match(auditStep, /audit_status=\$\?/);
        assert.match(auditStep, /validate-audit-report\.mjs/);
    }
    assert.match(fullAudit, /npm audit --json/);
    assert.match(productionAudit, /npm audit --omit=dev --json/);

    for (const artifactName of ["audit-full", "audit-production"]) {
        assert.match(quality, new RegExp(`name: ${artifactName}`));
    }
});

test("merges sharded reports into one HTML report and keeps diagnostics", () => {
    const e2e = jobBlock("e2e");
    // Each shard emits a machine-readable blob report and its own diagnostics.
    assert.match(step(e2e, "Upload blob report"), /name: blob-report-/);
    assert.match(
        step(e2e, "Upload Playwright test results"),
        /name: playwright-test-results-/,
    );

    const merge = jobBlock("merge-reports");
    assert.match(merge, /needs: e2e/);
    assert.match(merge, /if: always\(\)/);
    assert.match(
        step(merge, "Download blob reports"),
        /pattern: blob-report-\*/,
    );
    assert.match(
        step(merge, "Merge into HTML report"),
        /merge-reports --reporter html/,
    );
    // The combined report keeps the stable `playwright-report` artifact name.
    assert.match(step(merge, "Upload Playwright HTML report"), /name: playwright-report/);
});

test("exposes a hardened single validation gate over quality and e2e", () => {
    const gate = jobBlock("gate");
    assert.match(gate, /needs: \[quality, e2e\]/);
    // Hardening: the gate must ALWAYS run and explicitly assert both upstream
    // jobs succeeded. Without this, a failed/skipped/cancelled upstream leaves
    // the gate skipped, which a required-status check can misread as passing.
    assert.match(gate, /if: always\(\)/);
    assert.match(gate, /test "\$\{\{ needs\.quality\.result \}\}" = "success"/);
    assert.match(gate, /test "\$\{\{ needs\.e2e\.result \}\}" = "success"/);
});

test("documents every direct package command and CI artifact", () => {
    for (const scriptName of [
        "lint",
        "typecheck",
        "build",
        "start",
        "browser:install",
        "test:smoke",
        "validate",
        "audit:full",
        "audit:production",
    ]) {
        assert.equal(typeof packageJson.scripts[scriptName], "string");
        assert.match(readme, new RegExp(`npm run ${scriptName.replace(":", "\\:")}`));
    }

    assert.match(readme, /Node\.js `22\.23\.1` with npm `10\.9\.8`/);
    assert.match(readme, /playwright install --with-deps chromium$/m);
    assert.match(readme, /E2E_ENGINES=chromium/);
    assert.match(readme, /Audits are evidence snapshots, not a zero-finding green gate/);
    assert.match(readme, /`audit-full` and `audit-production` artifacts/);
    assert.match(readme, /`playwright-report`/);
});
