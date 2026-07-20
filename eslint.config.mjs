import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

import pluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";


const nextConfig = {
    plugins: {
        "@next/next": nextPlugin,
    },
    rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs["core-web-vitals"].rules,
    },
};


export default [
    // Single global-ignore block (has `ignores`, no `files`) — generated output
    // only, never source or tests. Contract-enforced by tests/toolchain.test.mjs.
    {
        ignores: [
            ".next/**",
            "next-env.d.ts",
            "playwright-report/**",
            "test-results/**",
        ],
    },
    {
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    // React on the plugin's native flat-config surface (was the legacy
    // eslint-plugin-react/configs/recommended.js eslintrc shim). Rule-identical to
    // that shim (22 rules) and carries parserOptions.ecmaFeatures.jsx applied
    // globally, so no separate JSX parserOptions block is needed.
    pluginReact.configs.flat.recommended,
    // Hooks stays on its already-flat-native registration (register the plugin
    // object + declare the rules below). The rules themselves live in the
    // deliberate-coverage block so the effective set is explicit.
    {
        plugins: {
            "react-hooks": eslintPluginReactHooks,
        },
    },

    // Globals scoped by file group (FR5), replacing the former single un-scoped
    // globals.commonjs block. globals.node is a strict superset of globals.commonjs,
    // and no-undef is off for .ts/.tsx under typescript-eslint, so the groups below
    // preserve diagnostics while modelling each file's real runtime.
    {
        // Browser: the app/client island runs in the browser and transitively
        // uses window/document/WebGL/requestAnimationFrame/globalThis.
        files: ["app/**/*.{ts,tsx}"],
        languageOptions: {
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        // Node/ESM: toolchain ES modules. Node globals only — NOT the CommonJS
        // wrapper globals, since these are ES modules.
        files: [
            "eslint.config.mjs",
            "playwright.config.ts",
            "scripts/**/*.mjs",
            "tests/**/*.mjs",
        ],
        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },
    {
        // Node/CommonJS: the module.exports config files. Selected by explicit glob
        // (including the .ts-but-CommonJS tailwind.config.ts by name), NOT by a
        // ".ts = ESM / .js = CommonJS" extension heuristic.
        files: ["next.config.js", "postcss.config.js", "tailwind.config.ts"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                ...globals.node,
                ...globals.commonjs,
            },
        },
    },
    {
        // e2e (mixed): the Node Playwright runner plus in-page page.evaluate()
        // callback bodies that reference browser globals. Flat config cannot split
        // globals at the page.evaluate boundary, so these files get both sets.
        files: ["tests/e2e/**"],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
    },

    // Deliberate rule coverage preserved from #10 (FR6). Placed after the shared
    // recommended configs so these offs/severities win.
    {
        rules: {
            "react/react-in-jsx-scope": "off",
            "react/jsx-uses-react": "off",
            "@typescript-eslint/no-explicit-any": "off",
            // Pin the pre-upgrade effective Hooks rule set. eslint-plugin-react-hooks 7's
            // `recommended`/`recommended-latest` bundle 16/17 rules; spreading either would
            // silently expand coverage, so retain exactly the rules enforced before the bump.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        },
    },
    nextConfig,
];
