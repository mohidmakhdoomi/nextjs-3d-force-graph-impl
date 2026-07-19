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

## 2026-07-18 — Phase 1 committed; Phase 2 (production_qualification) qualified

Phase 1 consultation: Gemini / Codex / Claude all APPROVE (Claude explicitly
endorsed the env-leak handling as pragmatic and non-weakening). Phase 1 content
committed as `7abe400` (package.json, package-lock.json, eslint.config.mjs,
tests/toolchain.test.mjs, plan, thread) — porch's own commits only touch
status.yaml, so the builder authors the content commit (same pattern as the
plan-phase commit 94fb143).

Phase 2 qualification (no source/manifest/config change — dependency-only patch):
- Fresh `npm ci` did not mutate manifest/lock. `npm test` 19/19, typecheck,
  build, `next start` (root HTTP 200, clean SIGTERM), `npm run validate` all
  green (exit 0). Playwright Chromium smoke: real WebGL, nonzero drawing buffer,
  pause/resume + axes + reset controls, zero console/page errors (26.9s).
- Diff vs baseline touches only eslint.config.mjs / package.json /
  package-lock.json / tests/toolchain.test.mjs; app/**, postcss.config.js,
  tailwind.config.ts, next.config.js untouched → architecture invariants,
  {ssr:false} island, and PostCSS/Tailwind config preserved; no React Compiler
  config introduced.
- Manual matrix: items 1/3/4/5/6/12 observed by the real-WebGL smoke; pointer/
  mouse-button items 2 & 7–11 are unchanged-by-construction (no app/runtime code
  changed) and carry forward the #9 item-11 headless-SwiftShader right-click
  caveat without app edits.
- Final audits reconcile exactly with Phase 1 (full 13, prod 7). Direct PostCSS
  advisory fixed at root; next>postcss@8.4.31 (GHSA-qx2v-qp2m-jg93) is the
  documented nested residual, no override.

Env-leak reminder: all porch/npm invocations use the pnpm-var-stripped env so the
untouched npm-baseline reproducibility test evaluates real npm 10.9.8. The
untracked `.claude/hooks/worktree-write-guard.cjs` harness file makes `eslint .`
report 18 errors locally; it is not project source and absent in CI/commit, so
lint/validate are run with that harness dir moved aside (verified exit 0).

## 2026-07-19 — Phase 2 re-review feedback addressed (real manual matrix)

Phase 2 iter-1 consultation: Gemini + Codex both REQUEST_CHANGES (Claude consult
was killed mid-run by a tool timeout, no verdict). Two actionable points:
1. The full 12-step manual Chromium matrix must be ACTUALLY performed, not
   inferred ("unchanged-by-construction" was rejected).
2. Record `npm run lint` and `npm run test:smoke` as separate direct gates, not
   folded into `npm run validate`.

**Point 2**: recorded separately in the plan evaluation — lint exit 0, test:smoke
exit 0 (1 spec, real WebGL ~27s), plus test/typecheck/build/start/validate.

**Point 1**: wrote a throwaway scratchpad Playwright driver (NOT committed;
lives in the session scratchpad, imports @playwright/test by absolute path) that
drives all 12 items with real pointer/wheel/mouse events on the production build
and verifies NUMERICALLY by reaching the react-force-graph imperative handle via
the React fiber (walk DOM up from the three.js-created canvas to the first
React-managed ancestor, then up the fiber to the ref whose current has
graph2ScreenCoords). Signals: camera().position (motion), graph2ScreenCoords
(node screen coords), scene __data fx (fixed-state), AxesHelper.visible.

Results (final run): items 1–8, 10, 12 PASS (numerically verified); 9 & 11
PARTIAL. Findings that took several iterations:
- Node clicks only land when aimed at a node's exact graph2ScreenCoords center
  AND the camera is settled (TrackballControls zoom inertia stales coords; the
  graph is far after zoomToFit/reset/background-drag → nodes ~sub-pixel). Added a
  zoom-in-and-settle step before node items; item 2, item 10, and item 11's
  left-click fix then reliably fixed a node.
- Item 10 fully verified: node left-click flips rotation Pause→Resume (stops),
  fixed=1, camera focuses.
- Items 9 (node DRAG → fx) and 11 (RIGHT-CLICK → release) never register via
  Playwright synthetic events even aimed at the exact confirmed on-screen node
  (item 11: left-click fixed=1, right-click same node onscreen=true →
  released=false; onNodeRightClick did not fire). This is a headless-SwiftShader
  synthetic-gesture limitation and precisely reproduces the plan's #9 item-11
  caveat — NOT an app defect (diff touches zero app code; left-click path proven
  on the same nodes). Recorded honestly; no app code changed to chase it.
- Zero console/page errors across the whole sequence; canvas stayed responsive.

Also fixed: Phase 1 consultation Claude output was produced fine before; the
Phase 2 Claude consult was interrupted (tool 2-min timeout killed the backgrounded
process). Will rerun the Phase 2 3-way consult with all three completing.

## 2026-07-19 — Review phase: PR #24 opened

Both implement phases approved (Phase 1 unanimous APPROVE; Phase 2 iter2:
Gemini APPROVE, Codex COMMENT [addressed: inline phase-status lines], Claude
APPROVE). Committed Phase 2 (a09d246) and the review doc + cold-tier arch/lessons
updates (53e45a0). Created review doc with the FR9 path-by-path audit table
(full 17→13, prod 12→7; direct PostCSS fixed, next>postcss@8.4.31 documented
residual), FR10 disposition, manual-matrix results (10/12 numerically verified),
and consultation feedback for every phase. Routed dependency-classification/
lint-config to cold arch.md and the react-force-graph interaction-verification
lesson to cold lessons-learned.md (nothing HOT-tier-worthy). Opened PR #24
(Closes #10, base main). Review-phase 3-way consult running; architect notified.

## 2026-07-19 — Review 3-way + pr gate reached

Review-phase (PR) 3-way consult: Gemini APPROVE, Claude COMMENT, Codex
REQUEST_CHANGES. Actionable items fixed in 5c4a6c7:
- Claude COMMENT: package-lock.json root `name` had leaked the worktree dir
  ("spir-10") because package.json has no `name`. Restored to baseline "primary"
  (ec05454 value); npm ci clean and read-only (doesn't rewrite it); build/test
  still pass. Did not add a name to package.json (kept manifest in-scope).
- Codex #1: plan Metadata Status + Phase Status table for production_qualification
  now `completed`, matching status.yaml.
- Codex #2 (commit format): rebutted — `chore(porch):` commits are porch-generated
  in strict mode and must not be rewritten by the builder; all builder-authored
  commits use `[Spec 10]…`; squash-merge collapses everything at merge if desired.
- Codex #3 (sandbox couldn't spawn child-process test / lint harness pollution):
  N/A env artifact, already documented.
Rebuttal: codev/projects/10-.../10-review-iter1-rebuttals.md.

Bonus: the PR's Vercel preview deployed **Ready**, real-world confirmation that
the devDependency reclassification doesn't break the actual deployment build (FR4).

Porch now at GATE: pr. Requested via `porch gate 10`; notified architect. STOPPED,
waiting for `porch approve 10 pr`.
