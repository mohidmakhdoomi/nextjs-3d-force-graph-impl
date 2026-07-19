# Architecture

This document evolves as the project grows. Update it during the review phase
of any work that introduces or changes architectural patterns.

## Validation Baseline

The repository's reproducibility contract is Node.js `22.23.1`, npm `10.9.8`,
lockfile v3, and clean `npm ci`. GitHub Actions runs contract tests plus the
shared `npm run validate` gate, whose real production-server Chromium smoke
checks WebGL and the core controls. Full and production npm audits are separate
evidence: CI validates their JSON/original status and uploads them without
turning existing advisory totals into a zero-findings gate. Contributor commands
and artifact names live in `README.md`; implementation details live in
`.github/workflows/validation.yml`, `playwright.config.ts`, and
`scripts/validate-audit-report.mjs`.

## Dependency Classification and Lint Config

Build-time and type-only packages are `devDependencies`: `postcss`,
`tailwindcss`, `autoprefixer` (the PostCSS/Tailwind build pipeline) and
`@types/three` (typecheck/bundler only). The runtime `three` package stays in
`dependencies`. This keeps `npm audit --omit=dev` a meaningful runtime baseline;
the deploy/CI environment must install dev dependencies (CI runs plain `npm ci`
and the production build). The ESLint flat config (`eslint.config.mjs`) uses
`eslint-plugin-react-hooks` v7's native flat-config support (no
`@eslint/compat`/`fixupPluginRules`) and pins the intended Hooks rule set
explicitly (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) rather
than spreading `configs.recommended`, whose v7 form bundles ~16 rules — spreading
it would silently expand coverage.
