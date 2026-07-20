# Architecture

This document evolves as the project grows. Update it during the review phase
of any work that introduces or changes architectural patterns.

## Validation Baseline

The repository's reproducibility contract is Node.js `22.23.1`, npm `10.9.8`,
lockfile v3, and clean `npm ci`. `npm run validate` is the single-command local
green gate, whose real production-server two-engine (Chromium and Firefox) smoke
checks WebGL and the core controls in both engines. GitHub Actions does **not**
run that one command; it runs a **contract-equivalent decomposition** of it,
parallelized to cut wall clock (~15 min → ~5–6 min): a `quality` job (lint +
typecheck + `npm test` + audit evidence) and an `e2e` matrix that builds and
runs the FULL Playwright suite split at the test level across four Chromium
shards (`playwright.config.ts` sets `fullyParallel: true` while keeping
`workers: 1`, so each shard is strictly serial). The decomposition drops no
check: lint, typecheck, build, and every e2e test still run, the Chromium engine
gate is pinned via `E2E_ENGINES=chromium`, and a `gate` job gives a single
required status. Do not raise `workers` or trim the qualified per-test waits —
the SwiftShader timing environment (one test at a time) is what the decomposition
preserves. Full and production npm audits are separate evidence: CI validates
their JSON/original status and uploads them without turning existing advisory
totals into a zero-findings gate. Contributor commands and artifact names live in
`README.md`; implementation details live in `.github/workflows/validation.yml`,
`playwright.config.ts`, and `scripts/validate-audit-report.mjs`.

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
the two-engine interaction matrix, not just install/build success.

The ESLint flat config (`eslint.config.mjs`) uses
`eslint-plugin-react-hooks` v7's native flat-config support (no
`@eslint/compat`/`fixupPluginRules`) and pins the intended Hooks rule set
explicitly (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`) rather
than spreading `configs.recommended`, whose v7 form bundles ~16 rules — spreading
it would silently expand coverage.

## Framework and Bundler Baseline

The app runs on Next.js 16 (Active LTS) with React 19 (`react`/`react-dom`
exact-pinned at `19.2.7`). Turbopack is the Next 16 default bundler for **both**
`dev` (`next dev`) and `build` (`next build`); the scripts rely on that default
rather than pinning `--turbopack`/`--webpack`, and the production Turbopack build is
behaviorally qualified against the two-engine interaction matrix (not just build
success). The `next lint` command is gone; linting is the explicit `eslint .` CLI
path with `@next/eslint-plugin-next` wired directly in `eslint.config.mjs` and
exact-pinned string-equal to `next`. The Node floor is `>=20.9.0` (the repo pins
`22.23.1`); the supported-browser floor is Chrome/Edge/Firefox 111 and Safari 16.4
(Next's zero-config default, all WebGL2-capable), so the app declares no
`browserslist`.

`next` bundles its own nested `postcss` (`node_modules/next/node_modules/postcss`,
currently `8.4.31`) that the app cannot control in this stage. It is a documented,
Next-owned build-time residual (audit-neutral and un-fixable from the app — npm
offers only a bogus major downgrade), independent of the app's own top-level
`postcss` (kept patched). Treat it as carried-forward, not a new or closed finding.
