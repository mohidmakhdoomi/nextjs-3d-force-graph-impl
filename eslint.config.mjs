import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';


const nextConfig = {
    plugins: {
        '@next/next': nextPlugin,
    },
    rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
    },
};


export default [
    {
        ignores: [
            ".next/**",
            "next-env.d.ts",
            "playwright-report/**",
            "test-results/**",
            "blob-report/**",
        ],
    },
    {settings: {
        "react": {
          "version": "detect"
        }
      }
    },
    {files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"]},
    {languageOptions: {parserOptions: {ecmaFeatures: {jsx: true}}, globals: {...globals.commonjs}}}, // ...globals.browser,
    pluginJs.configs.recommended,
    ...tseslint.configs.recommended,
    pluginReactConfig,
    {
        plugins: {
            'react-hooks': eslintPluginReactHooks,
        },
    },
    {
        rules: {
            "react/react-in-jsx-scope": "off",
            "react/jsx-uses-react": "off",
            "@typescript-eslint/no-explicit-any": "off",
            // Pin the pre-upgrade effective Hooks rule set. eslint-plugin-react-hooks 7's
            // `recommended` bundles many additional rules; spreading it would silently
            // expand coverage, so retain exactly the rules enforced before the major bump.
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",
        }
    },
    nextConfig,
];
