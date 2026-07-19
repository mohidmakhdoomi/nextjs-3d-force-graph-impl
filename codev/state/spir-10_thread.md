# spir-10 thread — Patch and reclassify CSS, build, and ESLint 9 dependencies

## 2026-07-19 — Specify phase started

Project 10 initialized (strict SPIR). Issue #10 = Stage 1 Group B of the
modernization roadmap; depends on #9 (merged as PR #21, present in this
worktree's base: next 15.5.20 / react 19.2.7).

Context gathered:
- Spec 9 (`codev/specs/9-patch-next-15-and-react-to-the.md`) used as format
  model; review 9 holds the post-#9 path-by-path audit baseline that this
  issue's FR9 compares against.
- Research report Stage 1 Group B targets confirmed against current
  `package.json`: postcss 8.5.1→8.5.19, tailwindcss 3.4.17→3.4.19,
  autoprefixer 10.4.20→10.5.4 (all three move to devDependencies),
  @types/three moves to devDependencies unchanged, encoding removed,
  @types/node ~22.10.7→~22.20.1, eslint/@eslint/js ~9.18.0→~9.39.5,
  eslint-plugin-react ~7.37.4→~7.37.5, eslint-plugin-react-hooks
  5.1.0→7.1.1 (intentional major), typescript-eslint ~8.21.0→~8.64.0,
  globals ~15.14.0→current (research: 17.7.0), @eslint/compat 1.x only where
  still required.
- CI (`.github/workflows/validation.yml`) installs via plain `npm ci` (dev
  deps included) and runs the production build — satisfies the
  reclassification precondition on the CI side; no Dockerfile/vercel.json or
  other deploy config exists in-repo.
- `encoding` confirmed unimported (only package.json/lockfile hits in-app
  scope; tests/audit-report.test.mjs hit is node:fs `encoding` option).
- `postcss.config.js` is CJS with tailwindcss+autoprefixer (build-time only);
  @types/three consumed only by tsc/bundler; runtime `three` stays in
  dependencies.

Spec written at `codev/specs/10-patch-and-reclassify-css-build.md`:
13 package actions, FR1–FR12 (verification, atomic manifest+lockfile,
classification correctness, dev-deps confirmation, peer tree + lint coverage
equivalence, lockfile provenance, automated validation, manual Chromium
matrix, audit comparison, PostCSS residual disposition, contract tests,
rollback). Committing as initial draft, then `porch done 10` for the
3-way consultation cycle. Gate: spec-approval — will stop and notify
architect.
