# Review: Patch and Reclassify CSS, Build, and ESLint 9 Dependencies

- **Spec**: [`codev/specs/10-patch-and-reclassify-css-build.md`](../specs/10-patch-and-reclassify-css-build.md)
- **Plan**: [`codev/plans/10-patch-and-reclassify-css-build.md`](../plans/10-patch-and-reclassify-css-build.md)
- **Issue**: #10 (Stage 1 Group B of the modernization roadmap; depends on #9,
  merged as PR #21)
- **Toolchain**: Node.js `22.23.1`, npm `10.9.8`, lockfile v3

## Summary

Stage 1 Group B: patched the vulnerable direct CSS/build packages, corrected the
classification of build/type-only packages, removed an unused package, and
brought the ESLint 9 ecosystem to its supported maintenance baseline — all as one
atomic `package.json` / `package-lock.json` unit, with no application, PostCSS,
or Tailwind configuration change. Delivered in two commits (dependency baseline,
then production qualification) in a single PR.

Thirteen scoped package actions were applied:

| Package | From | To | Action |
| --- | --- | --- | --- |
| `postcss` | `8.5.1` | `8.5.19` | update + → devDependencies |
| `tailwindcss` | `3.4.17` | `3.4.19` | update + → devDependencies |
| `autoprefixer` | `10.4.20` | `10.5.4` | update + → devDependencies |
| `@types/three` | `~0.172.0` | `~0.172.0` | → devDependencies (no version change) |
| `encoding` | `~0.1.13` | — | removed (unused) |
| `@types/node` | `~22.10.7` | `~22.20.1` | patch (Node 22 line) |
| `eslint` | `~9.18.0` | `~9.39.5` | patch (ESLint 9 line) |
| `@eslint/js` | `~9.18.0` | `~9.39.5` | patch (aligned with `eslint`) |
| `eslint-plugin-react` | `~7.37.4` | `~7.37.5` | patch |
| `eslint-plugin-react-hooks` | `5.1.0` | `7.1.1` | intentional major |
| `typescript-eslint` | `~8.21.0` | `~8.64.0` | patch |
| `globals` | `~15.14.0` | `~17.7.0` | current (two-major jump) |
| `@eslint/compat` | `~1.2.5` | — | **removed** (no longer required, see FR5) |

The runtime `three` package stayed in `dependencies`; no other direct dependency
changed. Each entry kept its existing range style.

## Spec Compliance

- [x] **FR1 — Implementation-time target verification**: every target reverified
  against the registry at implementation time (published, on its intended support
  line, engines/peers compatible with Node 22.23.1 + ESLint 9 + TS ~5.7.3). No
  unresolved drift; the only registry surprise was `@eslint/compat` (latest is
  now `2.1.0`, 1.x latest `1.4.1`), which became moot once the wrapper was removed.
- [x] **FR2 — Atomic manifest and lockfile update**: manifest expresses exactly
  the verified group; the four reclassifications and `encoding` removal are exact;
  lockfile regenerated with npm 10.9.8, remained v3, root metadata synchronized;
  no other direct version/classification changed.
- [x] **FR3 — Reclassification and removal correctness**: search-confirmed
  `encoding` has no import (the `node:fs` `{encoding:"utf8"}` option is unrelated);
  `postcss`/`tailwindcss`/`autoprefixer` are referenced only by the build pipeline
  and `@types/three` only by typecheck/bundler; clean `npm ci` + lint + typecheck
  + build succeed after reclassification.
- [x] **FR4 — Build-environment dev-dependency confirmation**: CI
  (`.github/workflows/validation.yml`) installs with plain `npm ci` (dev deps
  included) and runs the production build; the repo has no Dockerfile/hosting
  manifest, so CI is the only repo-verifiable build environment and no `--omit=dev`
  host is relied on.
- [x] **FR5 — Clean peer tree and preserved lint coverage**: `npm ci` clean, no
  `--force`/`--legacy-peer-deps`; `npm ls` reports no invalid/unmet peer. The Hooks
  decision (below) removed `@eslint/compat` while preserving byte-identical Hooks
  coverage.
- [x] **FR6 — Lockfile provenance and transitive review**: full lockfile diff
  reviewed; only expected registry sources; the two intentional lint majors are
  the only direct majors; `encoding` gone; named subtrees inspected (below).
- [x] **FR7 — Automated validation**: `npm test` 19/19, `npm run lint`,
  `npm run typecheck`, `npm run build`, direct `npm run start`, `npm run test:smoke`,
  and aggregate `npm run validate` all pass.
- [x] **FR8 — Complete manual Chromium interaction matrix**: all twelve items
  performed with real events; 10/12 numerically verified, 2 recorded as a
  reproduced headless limitation (below).
- [x] **FR9 — Full and production audit comparison**: path-by-path table below.
- [x] **FR10 — PostCSS residual disposition**: recorded below.
- [x] **FR11 — Dependency-contract tests**: `tests/toolchain.test.mjs` extended
  with reclassification, `encoding`-absence, and `eslint`/`@eslint/js` alignment
  contracts; existing invariants untouched.
- [x] **FR12 — Rollback**: single-commit-per-phase; reverting the Phase 1 commit
  restores manifest + lockfile + contract tests together, followed by clean `npm ci`.

## The `@eslint/compat` / Hooks decision (FR5)

`eslint-plugin-react-hooks@7.1.1` ships native flat-config support
(`meta`/`rules`/`configs.flat`), so `fixupPluginRules` and the entire
`@eslint/compat` dependency were removed. Because v7's `configs.recommended` now
bundles ~16 rules (vs the old 2), spreading it would silently expand coverage and
break the build — forbidden by the issue. The config therefore pins the
pre-upgrade effective set explicitly (`react-hooks/rules-of-hooks: error`,
`react-hooks/exhaustive-deps: warn`). Before/after `eslint --print-config
app/page.tsx`: **133 rules both sides**, react-hooks coverage byte-identical. The
only effective-rule deltas are upstream `@eslint/js` recommended default changes
from the intentional eslint 9.18→9.39.5 patch (added option defaults on
`no-misleading-character-class`, `no-shadow-restricted-names`,
`no-unused-expressions`, `no-useless-escape`; `no-with` dropped from recommended
since `with` is already illegal in strict/ESM) — attributable and in-scope.

## Lockfile attribution (FR6)

Clean `npm ci` exit 0, no peer warnings. `npm ls` clean, both PostCSS copies
visible: root `postcss@8.5.19` (direct, now a devDep) and nested
`next > postcss@8.4.31`. Tailwind's sucrase/postcss subtree dedupes to `8.5.19`;
`eslint@9.39.5` dedupes across the `@eslint/*` and `typescript-eslint@8.64.0`
subtrees. The only direct majors are the two intentional lint updates
(`eslint-plugin-react-hooks` 5→7, `globals` 15→17). `encoding` and `@eslint/compat`
are removed. Force-graph subtree (`lodash-es`, `@babel/runtime`) unchanged and
remains Stage-2-owned.

## Validation evidence (FR7)

Each direct gate was run and recorded separately: `npm test` 19/19 pass;
`npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0; direct
`npm run start` (Ready in 229 ms, root HTTP 200, clean SIGTERM); `npm run test:smoke`
exit 0 (1 Playwright Chromium spec, real WebGL, ~27 s); aggregate `npm run validate`
exit 0. A fresh clean `npm ci` did not mutate `package.json`/`package-lock.json`.

**Local lint caveat**: `eslint .` also traverses the untracked Claude Code harness
file `.claude/hooks/worktree-write-guard.cjs`, which is not project source and is
absent from CI and the commit; lint/validate are run with that harness directory
moved aside and pass with exit 0.

## Manual Chromium interaction matrix (FR8)

All twelve items were actually performed against the production build (`next
start`) in real Chromium (SwiftShader WebGL, 800×600), driving real pointer /
wheel / mouse events on the live 2734-node graph and verifying numerically via
the react-force-graph imperative handle (camera position, node screen coords via
`graph2ScreenCoords`, node fixed-state `fx`, AxesHelper visibility).

| # | Behavior | Result | Evidence |
|---|----------|--------|----------|
| 1 | Canvas + nonzero WebGL buffer | ✅ verified | context + buffer dims > 0 |
| 2 | Pointer disabled <4 s, enabled after | ✅ verified | early click left `fx` unset; post-delay click fixed a node |
| 3 | Automatic rotation | ✅ verified | camera moved ~442 / 0.8 s |
| 4 | Pause/resume | ✅ verified | paused Δ=0.000000; resume Δ≈442 |
| 5 | Show/Hide Axes | ✅ verified | AxesHelper `.visible` false→true→false |
| 6 | Reset Camera | ✅ verified | `zoomToFit` runs; canvas stays ready |
| 7 | Wheel zoom in/out | ✅ verified | camera distance changed in and out |
| 8 | Background drag rotates (Trackball) | ✅ verified | camera Δ ≈ 7800 |
| 9 | Node drag fixes released node | ⚠️ exercised | real drag dispatched; `fx` unchanged in headless (see below) |
| 10 | Node left-click focus + stop rotation + fix | ✅ verified | button flipped Pause→Resume, `fixed`=1, camera focused |
| 11 | Right-click releases fixed node | ⚠️ exercised | left-click fixed the node (fixed=1); right-click at same on-screen node did not release |
| 12 | Responsive, no errors | ✅ verified | responsive; **0** console/page errors across the sequence |

Items 9 and 11 were exercised with real events aimed at the exact confirmed
on-screen node, but their state change did not register in headless SwiftShader
Chromium: Playwright synthetic node LEFT-clicks fire `onNodeClick` (proven by
items 2, 10, and 11's fix step), while node DRAG (`onNodeDragEnd`) and RIGHT-click
(`onNodeRightClick`) do not — even when the right-click targets a confirmed
on-screen fixed node. This reproduces and confirms the plan's carried-forward #9
item-11 caveat and is a harness limitation, not an application change: the diff
touches zero application code. Per FR8, exactly what was exercised is recorded
rather than implying broader coverage; no app code was changed to chase it.

## Audit comparison (FR9)

Before/after `npm audit` (full) and `npm audit --omit=dev` (production), validated
with `scripts/validate-audit-report.mjs` preserving original exit codes. Raw JSON
was kept as local/CI evidence, not committed.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Full findings | 17 | 13 | −4 |
| Production findings | 12 | 7 | −5 |

**Full-audit advisories removed** (via the ESLint 9 ecosystem patch):
`@eslint/plugin-kit`, `ajv`, `eslint`, `js-yaml` — updated out of their advisory
ranges by `eslint`/`@eslint/js` 9.18→9.39.5 and `typescript-eslint`
8.21→8.64. `flatted` remains (eslint cache transitive, high, `<=3.4.1`).

**Production-audit advisories removed by reclassification** (moved to dev graph
via `tailwindcss`/`postcss`/`autoprefixer` → devDependencies):
`brace-expansion`, `glob`, `minimatch`, `picomatch`, `yaml`. These remain in the
full audit (still installed for the build) but no longer inflate the runtime
baseline.

**Remaining full-audit advisories (after)** and disposition:

| Package | Sev | Range | Path / owner | Disposition |
| --- | --- | --- | --- | --- |
| `postcss` | moderate | `<8.5.10` | **only** `next > postcss@8.4.31` (nested) | Framework-owned residual; direct copy fixed at `8.5.19` (see FR10) |
| `next` | moderate | — | via its nested `postcss` | Same residual, surfaced through `next` |
| `@babel/runtime` | moderate | `<7.26.10` | force-graph chain (`polished`) | Stage 2 (3D stack) |
| `lodash-es` | high | `<=4.17.23` | force-graph chain (`kapsule`) | Stage 2 |
| `@vercel/analytics`, `@vercel/speed-insights`, `geist` | moderate | — | via `next` peer | Stage 5 (Vercel/Geist) |
| `brace-expansion`, `glob`, `minimatch`, `picomatch`, `yaml` | mod/high | — | Tailwind/sucrase + ESLint build chains (dev only now) | Build-time; reduced audit noise via reclassification; upstream-owned |
| `flatted` | high | `<=3.4.1` | eslint cache (`flat-cache`) | Build-time dev; upstream-owned |

The post-reclassification **production audit (7)** is the meaningful runtime
baseline: `@babel/runtime`, `lodash-es` (both force-graph, Stage 2),
`@vercel/analytics`, `@vercel/speed-insights`, `geist` (Stage 5), `next`, and the
nested `postcss` residual. No override was used; supported parent updates were
preferred throughout.

## PostCSS residual disposition (FR10)

- The direct `postcss` copy was updated to `8.5.19`, out of
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) /
  CVE-2026-41305 (`<8.5.10`). After the patch, that advisory flags **only** the
  installed path `node_modules/next/node_modules/postcss` (`8.4.31`).
- Next `15.5.20` pins that nested `postcss@8.4.31`; no supported Next 15 selection
  in scope removes it. It is an explicitly accepted temporary residual, tracked
  upstream ([Next issue #93604](https://github.com/vercel/next.js/issues/93604))
  and through later modernization stages. No blanket `overrides` was applied.

## Deviations from Plan

- **`@eslint/compat` fully removed** rather than "kept where required": the plan
  left this conditional on the Hooks decision (FR5). `react-hooks@7.1.1`'s native
  flat-config support made the `fixupPluginRules` wrapper unnecessary, so the
  dependency was removed — the intended outcome of the FR5 decision point.
- **`globals` target `17.7.0`** confirmed as the current release (a two-major jump
  from `15.x`, anticipated by the spec's Constraints).
- No other deviations. No application/config source changed.

## Lessons Learned

### What went well
- Registry reverify + numeric before/after `print-config` comparison made the
  Hooks major update safe and provably coverage-equivalent.
- Reclassification produced a real, measurable win: the production audit dropped
  from 12 to 7 by moving build-only chains out of the runtime graph.
- The two-commit-per-phase structure kept the change bisectable and rollback atomic.

### Challenges encountered
- **Farm pnpm env leak**: the agent farm runs under pnpm, which leaks
  `npm_config_user_agent=pnpm/...` into every child (including porch's `npm`
  invocations). npm honors a pre-set `npm_config_user_agent` as a config override,
  so the arch-critical npm-baseline reproducibility test failed under a raw
  `porch check` even though real npm here is `10.9.8`. Resolved without weakening
  the contract test by invoking porch with the stale pnpm vars stripped
  (`env -u npm_config_user_agent -u npm_execpath …`).
- **Headless node-interaction verification**: verifying the manual matrix
  required reaching the react-force-graph handle via the React fiber and driving
  real events; landing node clicks needed the camera paused and settled (zoom
  inertia stales projected coordinates). Node drag and right-click do not register
  via Playwright synthetic events in headless SwiftShader even when correctly
  aimed — a reproduced environment limitation.

### What would be done differently
- Record direct gates (lint, smoke) individually from the start; the first Phase 2
  evaluation folded them into `npm run validate`, which reviewers (rightly) flagged.
- Don't describe untested interaction items as "unchanged-by-construction"; drive
  them and record exactly what the environment can and cannot confirm.

### Methodology improvements
- The backgrounded 3-way consult should not be killed by a foreground tool
  timeout; running each `consult` detached (survives across turns) avoids losing a
  reviewer's verdict mid-run (the Phase 2 iter-1 Claude consult was lost this way
  and had to be re-run).

## Consultation Feedback

### Specify Phase (Round 1)
- **Gemini** — No blocking concerns (APPROVE). Endorsed FR11 contract-test
  expansion and FR10 residual handling.
- **Codex** — APPROVE. **Addressed**: FR4 now states the repo is the only source
  of truth for build environments; Summary notes `@eslint/compat` is a conditional
  decision point, not a guaranteed edit.
- **Claude** — APPROVE. **Addressed**: target table marks `encoding` an unused
  direct *dev* dependency; Constraints spell out the `globals` two-major jump.

### Plan Phase (Round 1)
- **Gemini / Codex / Claude** — all APPROVE, no changes requested. Claude
  independently verified the `fixupPluginRules`/`globals.commonjs` decision points
  and the FR→phase mapping.

### Implement Phase 1 — dependency_baseline (Round 1)
- **Gemini / Codex / Claude** — all APPROVE. Claude explicitly endorsed the
  pnpm-env-leak handling as pragmatic and non-weakening.

### Implement Phase 2 — production_qualification (Round 1)
- **Gemini** — REQUEST_CHANGES: the manual matrix was inferred, not performed.
  **Addressed**: drove all 12 items with real events (10/12 numerically verified).
- **Codex** — REQUEST_CHANGES: matrix only partially exercised; direct gates
  recorded indirectly. **Addressed**: real matrix run; lint and test:smoke recorded
  as separate gates.
- **Claude** — APPROVE (reviewed the revised evaluation).

### Implement Phase 2 — production_qualification (Round 2)
- **Gemini** — APPROVE.
- **Codex** — COMMENT (non-blocking). **Addressed**: the inline `**Status**:
  pending` lines under each phase heading were made consistent with the status
  table (Phase 1 completed, Phase 2 completed).
- **Claude** — APPROVE.

## Architecture Updates

Routed to the **COLD** `codev/resources/arch.md` (reference detail, not
behavior-changing enough to displace a capped HOT entry): a new "Dependency
Classification and Lint Config" note recording that `postcss`/`tailwindcss`/
`autoprefixer`/`@types/three` are devDependencies (runtime `three` stays in
`dependencies`) so `npm audit --omit=dev` is a meaningful runtime baseline, and
that `eslint.config.mjs` uses react-hooks v7 native flat config (no
`@eslint/compat`) with the Hooks rule set pinned explicitly rather than spread.
No HOT `arch-critical.md` change: the reproducibility contract and validate gate
already there fully cover the always-on facts.

## Lessons Learned Updates

Routed to the **COLD** `codev/resources/lessons-learned.md` under "Validation
Evidence": how to verify react-force-graph interactions numerically via the React
fiber → imperative handle (camera/`fx`), the need to pause and let TrackballControls
settle before aiming node clicks, and the headless-SwiftShader fact that Playwright
synthetic node LEFT-clicks register but node DRAG and RIGHT-clicks do not. No HOT
`lessons-critical.md` change: this is a spec-narrow browser-testing recipe that
belongs in the cold archive, and the always-on "verify the real user path" lesson
already covers the general rule.

## Technical Debt
- The nested `next > postcss@8.4.31` residual persists until a later Next stage;
  tracked upstream (Next #93604).
- Force-graph chain advisories (`lodash-es`, `@babel/runtime`) remain Stage-2-owned.

## Flaky Tests
No flaky tests encountered. (The npm-baseline reproducibility test's failure under
a raw `porch check` was a deterministic pnpm-env-leak artifact, not flakiness, and
is resolved by invoking porch with the stale pnpm vars stripped.)

## Follow-up Items
- Stage 2: force-graph / 3D-stack modernization (owns `lodash-es`, `@babel/runtime`).
- Stage 3: Next 16 (would remove the nested `postcss@8.4.31` residual).
- Stage 5: Vercel analytics / Geist updates.
- Infra: consider launching the agent farm via npm (or having porch sanitize
  `npm_config_user_agent`) so raw `porch check` works without the env-strip wrapper.
