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
const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

function workflowStep(name) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = workflow.match(
        new RegExp(
            `      - name: ${escapedName}\\n([\\s\\S]*?)(?=\\n      - name:|$)`,
        ),
    );

    assert.notEqual(match, null, `workflow step "${name}" should exist`);
    return match[0];
}

test("runs the exact locked validation path in GitHub Actions", () => {
    assert.match(workflow, /pull_request:/);
    assert.match(workflow, /push:\n {4}branches:\n {6}- main/);
    assert.match(workflow, /permissions:\n {2}contents: read/);
    assert.match(workflow, /node-version: 22\.23\.1/);
    assert.match(workflowStep("Verify toolchain"), /10\.9\.8/);
    assert.match(workflowStep("Install locked dependencies"), /run: npm ci/);
    assert.match(workflowStep("Test baseline contracts"), /run: npm test/);

    // CI enforces the Chromium (SwiftShader) WebGL arm as the deterministic
    // gate: it installs Chromium only, and the Firefox arm of the two-engine
    // matrix stays a documented LOCAL qualification gate (Firefox cannot bring
    // up a WebGL context on GPU-less runners). See
    // codev/reviews/11-upgrade-and-behaviorally-quali.md.
    const browserInstall = workflowStep("Install Chromium and system dependencies");
    assert.match(browserInstall, /playwright install --with-deps chromium$/m);
    assert.doesNotMatch(browserInstall, /firefox/);

    const validation = workflowStep("Validate");
    assert.match(validation, /run: npm run validate/);
    // The Chromium-only gate is pinned via E2E_ENGINES, not by dropping the
    // Firefox project — playwright.config.ts still defines both engines so the
    // local (unset) run is the full two-engine matrix.
    assert.match(validation, /E2E_ENGINES: chromium/);
    assert.doesNotMatch(validation, /continue-on-error/);
});

test("keeps audit evidence separate without weakening validation", () => {
    const fullAudit = workflowStep("Capture full audit evidence");
    const productionAudit = workflowStep("Capture production audit evidence");

    for (const auditStep of [fullAudit, productionAudit]) {
        assert.match(auditStep, /if: always\(\)/);
        assert.match(auditStep, /audit_status=\$\?/);
        assert.match(auditStep, /validate-audit-report\.mjs/);
    }
    assert.match(fullAudit, /npm audit --json/);
    assert.match(productionAudit, /npm audit --omit=dev --json/);

    for (const artifactName of [
        "audit-full",
        "audit-production",
        "playwright-report",
        "playwright-test-results",
    ]) {
        assert.match(workflow, new RegExp(`name: ${artifactName}`));
    }
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
    assert.match(readme, /`playwright-report` and\s+`playwright-test-results` artifacts/);
});
