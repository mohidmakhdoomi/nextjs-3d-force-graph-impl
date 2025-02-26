import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

import {fixupPluginRules} from '@eslint/compat';
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
            'react-hooks': fixupPluginRules(eslintPluginReactHooks),
        },
    },
    {
        rules: {
            "react/react-in-jsx-scope": "off",
            "react/jsx-uses-react": "off",
            "@typescript-eslint/no-explicit-any": "off",
            ...eslintPluginReactHooks.configs.recommended.rules,
        }
    },
    nextConfig,
];