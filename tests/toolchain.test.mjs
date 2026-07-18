import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import process from "node:process";
import test from "node:test";
import {URL} from "node:url";

import eslintConfig from "../eslint.config.mjs";

const expectedNodeVersion = "22.23.1";
const expectedNpmVersion = "10.9.8";
const expectedGeneratedIgnores = [
    ".next/**",
    "playwright-report/**",
    "test-results/**",
];
const expectedDependencyBaseline = {
    dependencies: {
        next: "15.5.20",
        react: "19.2.7",
        "react-dom": "19.2.7",
    },
    devDependencies: {
        "@next/eslint-plugin-next": "15.5.20",
        "@types/react": "19.2.17",
        "@types/react-dom": "19.2.3",
    },
};

const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const packageLock = JSON.parse(
    await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);

test("declares the exact Node and npm baseline", async () => {
    const nvmVersion = (
        await readFile(new URL("../.nvmrc", import.meta.url), "utf8")
    ).trim();

    assert.equal(nvmVersion, expectedNodeVersion);
    assert.deepEqual(packageJson.engines, {node: expectedNodeVersion});
    assert.equal(packageJson.packageManager, `npm@${expectedNpmVersion}`);
    assert.equal(process.versions.node, expectedNodeVersion);
    assert.match(
        process.env.npm_config_user_agent ?? "",
        new RegExp(`^npm/${expectedNpmVersion.replaceAll(".", "\\.")}\\s`),
    );
});

test("keeps package metadata and lockfile v3 synchronized", () => {
    const lockRoot = packageLock.packages[""];

    assert.equal(packageLock.lockfileVersion, 3);
    assert.deepEqual(lockRoot.engines, packageJson.engines);
    assert.deepEqual(lockRoot.dependencies, packageJson.dependencies);
    assert.deepEqual(lockRoot.devDependencies, packageJson.devDependencies);
});

test("pins the supported Next and React dependency baseline exactly", () => {
    for (const [dependencyGroup, expectedPackages] of Object.entries(
        expectedDependencyBaseline,
    )) {
        for (const [packageName, expectedVersion] of Object.entries(
            expectedPackages,
        )) {
            const manifestVersion =
                packageJson[dependencyGroup][packageName];

            assert.equal(manifestVersion, expectedVersion);
            assert.match(manifestVersion, /^\d+\.\d+\.\d+$/);
            assert.equal(
                packageLock.packages[`node_modules/${packageName}`].version,
                expectedVersion,
            );
        }
    }

    assert.equal(
        packageJson.dependencies.react,
        packageJson.dependencies["react-dom"],
    );
    assert.equal(
        packageJson.dependencies.next,
        packageJson.devDependencies["@next/eslint-plugin-next"],
    );
});

test("locks exactly one stable React runtime", () => {
    const reactRuntimeRecords = Object.entries(packageLock.packages).filter(
        ([packagePath]) =>
            packagePath === "node_modules/react" ||
            packagePath.endsWith("/node_modules/react"),
    );

    assert.deepEqual(
        reactRuntimeRecords.map(([packagePath]) => packagePath),
        ["node_modules/react"],
    );
    assert.equal(
        reactRuntimeRecords[0][1].version,
        packageJson.dependencies.react,
    );
    assert.equal(
        packageLock.packages["node_modules/react-dom"].peerDependencies.react,
        `^${packageJson.dependencies.react}`,
    );
    assert.doesNotMatch(reactRuntimeRecords[0][1].version, /[-+]/);
});

test("exposes direct validation and audit commands", () => {
    assert.equal(packageJson.scripts.lint, "eslint .");
    assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
    assert.equal(
        packageJson.scripts["browser:install"],
        "playwright install chromium",
    );
    assert.equal(
        packageJson.scripts["test:smoke"],
        "npm run build && playwright test",
    );
    assert.equal(
        packageJson.scripts.validate,
        "npm run lint && npm run typecheck && npm run test:smoke",
    );
    assert.equal(packageJson.scripts["audit:full"], "npm audit");
    assert.equal(
        packageJson.scripts["audit:production"],
        "npm audit --omit=dev",
    );
});

test("pins the Playwright runner exactly", () => {
    assert.equal(packageJson.devDependencies["@playwright/test"], "1.61.1");
    assert.equal(
        packageLock.packages["node_modules/@playwright/test"].version,
        "1.61.1",
    );
});

test("ignores generated output without excluding source or tests", () => {
    const globalIgnoreBlocks = eslintConfig.filter(
        (entry) =>
            Object.hasOwn(entry, "ignores") &&
            !Object.hasOwn(entry, "files"),
    );

    assert.equal(globalIgnoreBlocks.length, 1);
    assert.deepEqual(globalIgnoreBlocks[0].ignores, expectedGeneratedIgnores);
    assert.equal(
        globalIgnoreBlocks[0].ignores.some(
            (pattern) => pattern.startsWith("app") || pattern.startsWith("tests"),
        ),
        false,
    );
});
