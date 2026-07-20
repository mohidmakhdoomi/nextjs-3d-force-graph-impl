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
and the production build).

The Three.js/force-graph unit is behaviorally qualified and **exact-pinned**:
`three` and `@types/three` are pinned to the same qualified version (currently
`0.185.1`) and kept string-equal so the runtime and its community types cannot
de-align; `react-force-graph-3d` is pinned exactly (`1.29.1`). `three` resolves
as a single deduped runtime (no nested `node_modules/**/node_modules/three`),
and TrackballControls is imported from the documented
`three/addons/controls/TrackballControls.js` path. `tests/toolchain.test.mjs`
enforces all four properties (both pins, single runtime, type alignment, exact
`react-force-graph-3d`) so a later dependency bump cannot silently split the
runtime or de-align the types. Any such upgrade is one atomic rollback unit
(manifest + lockfile + code + contract tests) and must be re-qualified against
the two-engine interaction matrix, not just install/build success. The ESLint flat config (`eslint.config.mjs`) uses
`eslint-plugin-react-hooks` v7's native flat-config support (no
`@eslint/compat`/`fixupPluginRules`) and pins the intended Hooks rule set
explicitly (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) rather
than spreading `configs.recommended`, whose v7 form bundles ~16 rules — spreading
it would silently expand coverage.
