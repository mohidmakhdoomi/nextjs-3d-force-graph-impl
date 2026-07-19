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

## 2026-07-19 — spec-approval gate reached

3-way consultation on the spec: Gemini / Codex / Claude all APPROVE (high
confidence, no blocking issues). Incorporated minor feedback (FR4
source-of-truth wording, @eslint/compat as conditional decision point,
encoding dev-dependency phrasing, globals two-major clarification) and
committed as `[Spec 10] Specification with multi-agent review`. Porch now at
GATE: spec-approval. Notified architect; stopped pending human approval.

## 2026-07-19 — plan-approval gate reached

Plan written (two phases: dependency_baseline → production_qualification,
single PR, commits per phase). 3-way consultation: Gemini / Codex / Claude all
APPROVE (high confidence, zero key issues, no requested changes). Claude
independently verified the FR→phase mapping and the fixupPluginRules /
globals.commonjs decision points. Plan committed as
`[Spec 10] Plan with multi-agent review`. Porch now at GATE: plan-approval.
Notified architect; stopped pending human approval.

## 2026-07-18 — Phase 1 (dependency_baseline) implemented

Resumed session; plan-approval already granted (commit 0d1e338), porch in
implement/dependency_baseline. Executed Phase 1 per plan.

**Toolchain reverify (registry, at implementation time)** — all targets
published, on their intended support lines, engines/peers compatible with Node
22.23.1 + ESLint 9 + TS ~5.7.3:
- postcss 8.5.19 (latest of 8.5 line), tailwindcss 3.4.19 (3.4 line; latest is
  4.x, intentionally not taken), autoprefixer 10.5.4 (peer postcss ^8.1.0 ✓).
- @types/node 22.20.1 (22 line). eslint/@eslint/js 9.39.5 (9 line; latest 10.x
  not taken). eslint-plugin-react 7.37.5 (peer eslint ^9.7 ✓).
  eslint-plugin-react-hooks 7.1.1 (peer eslint ^9 ✓; intentional major from
  5.1.0). typescript-eslint 8.64.0 (peer ts >=4.8.4 <6.1.0 ✓, eslint ^9 ✓).
  globals 17.7.0 (latest; commonjs export still present, verified via
  print-config).

**Hooks / @eslint/compat decision (plan step 7)**: react-hooks 7.1.1 ships
native flat-config support (exports meta/rules/configs.flat), so
`fixupPluginRules` and the entire `@eslint/compat` dependency were REMOVED.
Critically, react-hooks 7's `configs.recommended` now bundles ~16 rules (vs the
old 2). Spreading it would silently expand coverage and break the build, which
the issue forbids ("do not silently change intentional rule coverage"). So the
config now pins the pre-upgrade effective set explicitly:
`react-hooks/rules-of-hooks: error` + `react-hooks/exhaustive-deps: warn`.
Before/after `eslint --print-config app/page.tsx`: 133 rules both sides;
react-hooks rules byte-identical. The only effective-rule deltas are upstream
`@eslint/js` recommended default changes from the eslint 9.18→9.39.5 patch
(added option defaults on no-misleading-character-class,
no-shadow-restricted-names, no-unused-expressions, no-useless-escape; `no-with`
dropped from recommended since `with` is already illegal in strict/ESM) — all
attributable to the intentional in-scope ESLint patch, none from my config edit.

**Manifest**: postcss/tailwindcss/autoprefixer → devDependencies at target
versions; @types/three → devDependencies unchanged (~0.172.0); runtime `three`
stays in dependencies; `encoding` removed; @types/node/eslint/@eslint/js/
eslint-plugin-react/eslint-plugin-react-hooks/typescript-eslint/globals bumped.
Lockfile regenerated with npm 10.9.8 (v3), no --force/--legacy-peer-deps/
overrides/audit-fix. Clean `npm ci` exit 0, no peer warnings. `npm ls` clean:
two postcss copies (root 8.5.19 fixed, next>postcss@8.4.31 residual), tailwind
subtree dedupes to 8.5.19, eslint 9.39.5 dedupes everywhere.

**Contract tests**: added to tests/toolchain.test.mjs — reclassification
(build/type pkgs in devDeps + absent from deps; three stays runtime), encoding
removed everywhere, eslint===@eslint/js on the 9 line. 19/19 pass (clean env).

**Audit evidence**: full 17→13, prod 12→7. Direct postcss advisory
GHSA-qx2v-qp2m-jg93 (<8.5.10) now flags ONLY node_modules/next/node_modules/
postcss (the nested residual) — direct copy fixed. Reclassifying
postcss/tailwind/autoprefixer to devDeps removed brace-expansion/glob/minimatch/
picomatch/yaml from the PRODUCTION audit. Nested residual remains, no override.

**ENV LEAK (infra note for architect + siblings)**: the farm is launched via
pnpm (inherited `npm_config_user_agent=pnpm/10.33.0`, `npm_execpath=.../pnpm`,
`PNPM_SCRIPT_SRC_DIR=codev/.builders/pir-1201`). npm honors a pre-set
`npm_config_user_agent` as a config override, so the pre-existing arch-critical
reproducibility test ("declares the exact Node and npm baseline") sees
pnpm/10.33.0 and fails under a raw `porch check`. Real npm here IS 10.9.8
(`command npm --version`). I did NOT weaken the contract test (plan: existing
invariants untouched). Resolution: invoke porch with the stale pnpm vars
stripped — `env -u npm_config_user_agent -u npm_execpath -u npm_config_globalconfig
-u npm_config_node_gyp -u PNPM_SCRIPT_SRC_DIR -u pnpm_config_verify_deps_before_run
porch check/done 10`. Under that clean env all 19 tests pass and porch check is
green. Architect may prefer to relaunch the farm via npm so raw porch works.
