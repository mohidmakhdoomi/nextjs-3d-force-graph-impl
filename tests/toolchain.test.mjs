import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import process from "node:process";
import test from "node:test";
import {URL} from "node:url";

import eslintConfig from "../eslint.config.mjs";

// Minimal, dependency-free semver-range satisfaction for the simple
// space-separated comparator form npm records for peer ranges
// (e.g. ">=4.8.4 <6.1.0"). The contract suite must not pull in a semver library,
// so this covers exactly the comparator shapes the assertions below rely on.
const parseVersion = (version) => {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    assert.ok(match, `unparseable version: ${version}`);
    return match.slice(1, 4).map(Number);
};

const compareVersions = (a, b) => {
    const left = parseVersion(a);
    const right = parseVersion(b);
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) {
            return left[index] < right[index] ? -1 : 1;
        }
    }
    return 0;
};

const satisfiesRange = (version, range) =>
    range
        .trim()
        .split(/\s+/)
        .every((comparator) => {
            const match = comparator.match(/^(>=|<=|>|<|=)?(\d+\.\d+\.\d+.*)$/);
            assert.ok(match, `unparseable comparator: ${comparator}`);
            const operator = match[1] ?? "=";
            const order = compareVersions(version, match[2]);
            switch (operator) {
                case ">=":
                    return order >= 0;
                case "<=":
                    return order <= 0;
                case ">":
                    return order > 0;
                case "<":
                    return order < 0;
                default:
                    return order === 0;
            }
        });

const expectedNodeVersion = "22.23.1";
const expectedNpmVersion = "10.9.8";
const expectedGeneratedIgnores = [
    ".next/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
];
const expectedDependencyBaseline = {
    dependencies: {
        next: "16.2.10",
        react: "19.2.7",
        "react-dom": "19.2.7",
    },
    devDependencies: {
        "@next/eslint-plugin-next": "16.2.10",
        "@types/react": "19.2.17",
        "@types/react-dom": "19.2.3",
    },
};
const expectedDevReclassifiedBuildPackages = {
    postcss: "8.5.19",
    tailwindcss: "3.4.19",
    autoprefixer: "10.5.4",
    "@types/three": "0.185.1",
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

test("reclassifies build/type-only packages into devDependencies", () => {
    for (const [packageName, expectedRange] of Object.entries(
        expectedDevReclassifiedBuildPackages,
    )) {
        assert.equal(
            packageJson.devDependencies[packageName],
            expectedRange,
            `${packageName} must be a pinned devDependency`,
        );
        assert.equal(
            Object.hasOwn(packageJson.dependencies, packageName),
            false,
            `${packageName} must not remain a runtime dependency`,
        );
    }

    // The runtime Three.js stack stays in dependencies even though its types moved out.
    assert.equal(packageJson.dependencies.three, "0.185.1");
    assert.equal(Object.hasOwn(packageJson.devDependencies, "three"), false);
});

test("removes the unused encoding dependency entirely", () => {
    assert.equal(Object.hasOwn(packageJson.dependencies, "encoding"), false);
    assert.equal(Object.hasOwn(packageJson.devDependencies, "encoding"), false);
    assert.equal(
        Object.hasOwn(packageLock.packages, "node_modules/encoding"),
        false,
    );
});

test("aligns eslint and @eslint/js on the same ESLint 9 line", () => {
    const eslintRange = packageJson.devDependencies.eslint;

    assert.equal(eslintRange, packageJson.devDependencies["@eslint/js"]);
    assert.match(eslintRange, /^~9\./);
    assert.equal(
        packageLock.packages["node_modules/eslint"].version,
        packageLock.packages["node_modules/@eslint/js"].version,
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

test("locks exactly one three runtime aligned with its types", () => {
    const threeRuntimeRecords = Object.entries(packageLock.packages).filter(
        ([packagePath]) =>
            packagePath === "node_modules/three" ||
            packagePath.endsWith("/node_modules/three"),
    );

    // Exactly one resolved three, no nested node_modules/**/node_modules/three.
    assert.deepEqual(
        threeRuntimeRecords.map(([packagePath]) => packagePath),
        ["node_modules/three"],
    );

    const manifestThree = packageJson.dependencies.three;
    const manifestTypes = packageJson.devDependencies["@types/three"];

    // Runtime three is pinned exactly (no range prefix) to the qualified 0.185.1.
    assert.equal(manifestThree, "0.185.1");
    assert.match(manifestThree, /^\d+\.\d+\.\d+$/);
    assert.equal(threeRuntimeRecords[0][1].version, manifestThree);
    assert.doesNotMatch(threeRuntimeRecords[0][1].version, /[-+]/);

    // Runtime three and its community types stay exactly string-equal, so a
    // future bump cannot de-align the types from the runtime.
    assert.match(manifestTypes, /^\d+\.\d+\.\d+$/);
    assert.equal(manifestThree, manifestTypes);
    assert.equal(
        packageLock.packages["node_modules/@types/three"].version,
        manifestTypes,
    );
});

test("pins react-force-graph-3d to the qualified release exactly", () => {
    const manifestRfg = packageJson.dependencies["react-force-graph-3d"];

    assert.equal(manifestRfg, "1.29.1");
    assert.match(manifestRfg, /^\d+\.\d+\.\d+$/);
    assert.equal(
        packageLock.packages["node_modules/react-force-graph-3d"].version,
        manifestRfg,
    );
});

test("exposes direct validation and audit commands", () => {
    assert.equal(packageJson.scripts.lint, "eslint .");
    assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
    assert.equal(
        packageJson.scripts["browser:install"],
        "playwright install chromium firefox",
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

test("pins the TypeScript 6 language target exactly within the supported parser range", () => {
    const manifestTypescript = packageJson.devDependencies.typescript;

    // Exact pin (no range prefix), matching the house style for language-critical
    // deps (next/react/three), so the language version cannot drift toward the
    // deferred TypeScript 7 major.
    assert.equal(manifestTypescript, "6.0.3");
    assert.match(manifestTypescript, /^\d+\.\d+\.\d+$/);
    assert.equal(
        packageLock.packages["node_modules/typescript"].version,
        manifestTypescript,
    );

    // typescript-eslint stays on a supported line whose declared TypeScript peer
    // admits 6.0.3 and excludes 6.1.0+. That range is what keeps the
    // "unsupported TypeScript version" parser warning silent under TS 6.0.3 and
    // documents why TypeScript 7 remains deferred (parser-blocked).
    const typescriptEslintPeer =
        packageLock.packages["node_modules/typescript-eslint"].peerDependencies
            .typescript;

    assert.ok(
        satisfiesRange(manifestTypescript, typescriptEslintPeer),
        `typescript-eslint typescript peer "${typescriptEslintPeer}" must admit ${manifestTypescript}`,
    );
    assert.equal(
        satisfiesRange("6.1.0", typescriptEslintPeer),
        false,
        `typescript-eslint typescript peer "${typescriptEslintPeer}" must exclude 6.1.0+`,
    );
    assert.equal(
        satisfiesRange("7.0.0", typescriptEslintPeer),
        false,
        `typescript-eslint typescript peer "${typescriptEslintPeer}" must exclude TypeScript 7`,
    );
});
