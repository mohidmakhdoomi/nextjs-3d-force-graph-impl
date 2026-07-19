# Specification 10: Patch and Reclassify CSS, Build, and ESLint 9 Dependencies

## Summary

Patch the vulnerable direct CSS/build packages, correct the dependency
classification of build/type-only packages, remove an unused package, and bring
the current ESLint 9 ecosystem to its supported maintenance baseline in one
atomic manifest/lockfile unit under the repository's exact Node.js `22.23.1` /
npm `10.9.8` contract. This is Stage 1 Group B of the architecture/dependency
modernization roadmap; Group A (Next 15 / React 19) shipped as issue #9.

The intended package actions are:

| Package | Checked-in version | Intended target | Action |
| --- | ---: | ---: | --- |
| `postcss` | `8.5.1` | `8.5.19` | Update; move to dev dependencies |
| `tailwindcss` | `3.4.17` | `3.4.19` | Update; move to dev dependencies |
| `autoprefixer` | `10.4.20` | `10.5.4` | Update; move to dev dependencies |
| `@types/three` | `~0.172.0` | `~0.172.0` | Move to dev dependencies only; no version change |
| `encoding` | `~0.1.13` | — | Remove (unused direct dependency) |
| `@types/node` | `~22.10.7` | `~22.20.1` | Patch within the Node 22 line |
| `eslint` | `~9.18.0` | `~9.39.5` | Patch within ESLint 9 |
| `@eslint/js` | `~9.18.0` | `~9.39.5` | Patch; keep aligned with `eslint` |
| `eslint-plugin-react` | `~7.37.4` | `~7.37.5` | Patch |
| `eslint-plugin-react-hooks` | `5.1.0` | `7.1.1` | Intentional in-line major update |
| `typescript-eslint` | `~8.21.0` | `~8.64.0` | Patch |
| `globals` | `~15.14.0` | `~17.7.0` | Current environment definitions |
| `@eslint/compat` | `~1.2.5` | compatible `1.x` | Keep only where still required |

These versions and all relevant peer ranges must be reverified when
implementation begins. The targets come from the modernization research
(registry checked 2026-07-17); that observation does not replace the required
implementation-time verification. Each manifest entry keeps its existing
range style: entries that are exact today stay exact, entries that carry a
`~` range today keep a `~` range.

Success means the direct PostCSS advisory copy is fixed, build/type-only
packages are correctly classified without breaking the CI or deployment build,
`encoding` is gone, the ESLint 9 flat config retains its intentional rule
coverage, all repository validation gates pass, the complete documented graph
interaction matrix passes in Chromium, and full/production audits are compared
path-by-path with the nested `next > postcss@8.4.31` residual explicitly
documented. It does **not** mean that `npm audit` becomes clean: the nested
PostCSS copy is pinned by Next `15.5.20` and remains an accepted temporary
residual, and the force-graph chain findings are owned by later stages.

## Problem Analysis

### Current state

- The direct `postcss@8.5.1` build dependency is within
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
  / CVE-2026-41305 (`<8.5.10`, fixed at `8.5.10`). Separately, Next `15.5.20`
  pins a nested `postcss@8.4.31` that this issue cannot fix (documented
  residual).
- `postcss`, `tailwindcss`, and `autoprefixer` are declared as production
  `dependencies` even though they are used only at build time by
  `postcss.config.js`. This misclassification inflates the production audit
  (`npm audit --omit=dev`) with build-tool findings and obscures the real
  runtime baseline.
- `@types/three` is declared as a production dependency even though it is a
  type-only package consumed by `tsc` and the bundler at build time. The
  runtime `three` package stays in production dependencies.
- `encoding@~0.1.13` is an unused direct dev dependency: no application or
  configuration code imports it; git history shows it arrived with the
  initial Vercel scaffold. Its removal is hygiene, not a security fix.
- The ESLint 9 ecosystem is behind its supported maintenance line:
  `eslint`/`@eslint/js` `9.18.0`, `eslint-plugin-react` `7.37.4`,
  `eslint-plugin-react-hooks` `5.1.0`, `typescript-eslint` `8.21.0`, and
  `globals` `15.14.0`. ESLint 9 itself remains the correct major because
  `eslint-plugin-react` does not yet declare ESLint 10 peer support (the
  ESLint 10 trial is blocked and tracked separately).
- `@types/node@~22.10.7` lags the declared Node `22.23.1` runtime policy
  within the Node 22 line.
- The post-#9 audit (see review 9) still records these paths relevant to this
  issue: direct `postcss@8.5.1`; `brace-expansion@1.1.11/2.0.1` via
  `eslint`/`typescript-eslint`/`tailwindcss > sucrase`; `glob@10.4.5` via
  `tailwindcss > sucrase`; `js-yaml@4.1.0` via `eslint > @eslint/eslintrc`;
  `minimatch@3.1.2/9.0.5` via the same lint/Tailwind paths;
  `picomatch@2.3.1` via `tailwindcss > chokidar > anymatch` and hoisted
  fast-glob consumers; `yaml@2.4.5` via `tailwindcss > postcss-load-config`.
  The force-graph chain findings (`lodash-es`, `@babel/runtime`) are owned by
  the rendering-stack stage but must be inspected after regeneration because a
  fresh lockfile may move them within existing parent ranges.
- The repository already has the reproducibility and lifecycle defenses from
  issues #7, #8, and #9: exact Node/npm contract, `npm ci`, lint, typecheck,
  contract tests, production build/start, Chromium WebGL smoke, CI audit
  evidence capture, and the post-#9 path-by-path audit disposition table.

### Desired state

- The direct PostCSS copy resolves at `>=8.5.10` (researched target
  `8.5.19`), removing the direct advisory path.
- `postcss`, `tailwindcss`, `autoprefixer`, and `@types/three` live in
  `devDependencies`; the production dependency graph contains only runtime
  packages; CI and any build host still install dev dependencies so the
  production build keeps working.
- `encoding` is absent from the manifest and lockfile, and no import
  requires it.
- The ESLint 9 ecosystem resolves on its current supported maintenance
  versions with a clean peer tree, and the flat config keeps its intentional
  Next, React, Hooks, JS, and TypeScript rule coverage.
- `@types/node` tracks the Node 22 policy line.
- A fresh `npm ci` under the exact declared toolchain succeeds without peer
  bypass flags.
- The lockfile diff is fully attributable: expected registry sources only, no
  unexpected majors outside the two intentional lint-tool major updates,
  no unexplained transitive churn.
- Full and production audits are compared path-by-path against the post-#9
  baseline; supported parent updates are preferred over overrides; the nested
  `next > postcss@8.4.31` residual is explicitly documented with its upstream
  advisory reference.

### Stakeholders

- **Repository maintainers** need an honest, bisectable hygiene/build patch
  that reduces audit noise without breaking the lint/type/build gates.
- **Users** need the rendered graph and every documented interaction to
  remain usable (no behavior change is intended).
- **Hosting operators** need the production build to keep working after
  reclassification, an accurate production-audit runtime baseline, and an
  explicit account of the remaining nested PostCSS exposure.

No other stakeholder or support-policy requirement applies beyond issue #10,
parent tracker #6, and the architecture/dependency modernization report.

## Confirmed Decisions

The issue body fixes these decisions (baked by the architect):

1. Keep Tailwind 3 and the current PostCSS configuration architecture.
2. Keep ESLint 9; do not bypass peer constraints or silently change
   intentional rule coverage.
3. Regenerate the lockfile and inspect the affected Tailwind, force-graph,
   Babel runtime, lodash-es, glob/minimatch, picomatch, and YAML paths.
4. Confirm the deployment/build environment installs dev dependencies before
   reclassification.
5. Do not use blanket `overrides` as the first response to audit findings;
   supported parent updates are preferred.
6. Keep framework/security work (issue #9) and this build/hygiene work as
   separately reviewable PRs. This issue is the build/hygiene PR and depends
   on #9 so lockfile-changing work remains sequential; #9 merged as PR #21.
7. Explicit non-goals: no Tailwind 4, no TypeScript 6, no ESLint 10, no
   Three.js, force-graph, or Next 16 migration.

## Scope

### In scope

- Reverify publication, dist-tags/support status, engine requirements,
  dependency metadata, and peer ranges for every intended target immediately
  before changing the manifest.
- Apply the thirteen package actions in the target table as one atomic
  manifest/lockfile change.
- Move `postcss`, `tailwindcss`, `autoprefixer`, and `@types/three` to
  `devDependencies` without changing the Tailwind 3 / PostCSS configuration
  architecture.
- Remove `encoding` after re-confirming no application/config import
  requires it.
- Confirm and document that the build environments (CI and any deployment
  host) install dev dependencies before relying on the reclassification.
- Evaluate whether `@eslint/compat`'s `fixupPluginRules` wrapper is still
  required by the updated Hooks plugin; keep a compatible `@eslint/compat`
  1.x where still required, and preserve equivalent intentional rule coverage
  either way.
- Regenerate `package-lock.json` with the repository's exact npm version and
  review the complete lockfile diff, including the Tailwind/sucrase, ESLint,
  force-graph, Babel runtime, lodash-es, glob/minimatch, picomatch, and YAML
  subtrees.
- Run a clean locked install and inspect npm's resolved peer tree.
- Run lint, typecheck, contract tests, production build, production start,
  and the existing browser smoke; run the complete manual Chromium graph
  interaction matrix.
- Capture before/after full and production audit results and review every
  advisory path and disposition, reusing the post-#9 baseline table.
- Add or adjust narrowly scoped dependency-contract tests so the
  classification and lint-baseline invariants are durable.
- Record implementation evidence, audit analysis, drift, and residual risk in
  `codev/reviews/10-patch-and-reclassify-css-build.md`.

### Out of scope

- Tailwind 4, `@tailwindcss/postcss`, CSS-first config migration, or any
  visual/CSS redesign.
- ESLint 10 trial or adoption; any peer-bypass to force it.
- TypeScript 6 or any `typescript` version change.
- Three.js, `@types/three` version changes, force-graph, or any 3D-stack
  update (Stage 2).
- Next 16 migration work (Stage 3).
- Direct remediation of the force-graph chain findings (`lodash-es`,
  `@babel/runtime`) beyond lockfile inspection and honest documentation.
- Remediation of Next's nested `postcss@8.4.31` (unsupported; documented
  residual only).
- Vercel observability package or Geist changes (Stage 5).
- Product features, graph behavior changes, or unrelated code
  cleanup/refactoring.
- Committing generated npm audit JSON snapshots.
- `npm audit fix`, `--force`, `--legacy-peer-deps`, or blanket `overrides`.

## Constraints and Invariants

- Use exactly Node.js `22.23.1` and npm `10.9.8` for installation, lockfile
  generation, and validation. A local shell running a different patch must
  not regenerate the lockfile.
- `package.json` and `package-lock.json` form one atomic change and one
  rollback unit. Neither may be committed or reverted independently.
- `npm ci` is the clean-install proof. A successful pre-existing
  `node_modules` tree is not evidence.
- Each updated manifest entry preserves its existing range style (exact stays
  exact, `~` stays `~`). Only the two intentional lint-tool major updates
  (`eslint-plugin-react-hooks` `5.1.0` → `7.1.1`, `globals` `15.x` → current)
  cross a major boundary, and both are fixed by the issue.
- `eslint` and `@eslint/js` must remain on the same ESLint 9 line.
- The updated Hooks plugin must declare a peer range that accepts the pinned
  ESLint 9 line; if it does not, that is drift — pause for architect
  confirmation rather than bypassing the peer check.
- Version drift discovered at implementation time must be documented. Do not
  silently substitute a newer major, prerelease, unsupported release, or a
  different package grouping. If a researched target is no longer the
  appropriate supported release, pause for architect confirmation before
  substituting.
- npm peer conflicts, invalid peer markers, or install warnings may not be
  hidden with flags or configuration.
- All resolved package tarballs must come from the expected npm registry. No
  new git, file, HTTP, or unknown registry source is permitted.
- The lockfile must not introduce an unexpected package major or duplicate
  runtime outside the intended target group. Incidental transitive changes
  must be attributable to changed parent ranges or documented separately.
- The Tailwind 3 pipeline (`postcss.config.js` with `tailwindcss` and
  `autoprefixer` plugins, `tailwind.config.ts`, `app/globals.css` directives)
  remains architecturally unchanged.
- The ESLint flat config keeps its intentional coverage: Next
  (`recommended` + `core-web-vitals`), React (`recommended`, with the
  repository's explicit `react-in-jsx-scope`/`jsx-uses-react` off),
  React Hooks (`recommended`), JS (`@eslint/js` recommended), and TypeScript
  (`typescript-eslint` recommended, with `@typescript-eslint/no-explicit-any`
  off). Rule changes must be deliberate and documented, never silent.
- `app/page.tsx` and `app/layout.tsx` remain server components;
  `FocusGraphWrapper.tsx` remains the client boundary with the dynamic
  `{ssr: false}` import.
- The runtime `three` package remains a production dependency; only
  `@types/three` is reclassified.
- Audit commands are diagnostic evidence and may exit nonzero when findings
  exist. Their nonzero vulnerability status is not suppressed or misreported.
- The known nested `next > postcss@8.4.31` copy must remain visible in the
  review even if unrelated audit totals improve.
- Manifest/lockfile rollback is atomic and also restores any
  dependency-contract test changed solely for this patch.

## Solution Exploration

### Approach A: Patch only the direct PostCSS copy

Update `postcss` to `8.5.19` and stop.

**Advantages**

- Smallest possible security-relevant diff.

**Disadvantages**

- Leaves the misclassification that inflates the production audit.
- Leaves the ESLint 9 ecosystem behind its supported maintenance line weeks
  before ESLint 9 EOL.
- Leaves `encoding` and the Tailwind/sucrase transitive findings in place.
- Fails the issue's explicit scope.

**Complexity:** low.
**Risk:** low, but incomplete.
**Disposition:** rejected.

### Approach B: Bundle the strategic majors (Tailwind 4, ESLint 10, TypeScript 6)

Combine the hygiene patches with the deferred major migrations.

**Advantages**

- Reaches the strategic end state in one pass.

**Disadvantages**

- Violates the issue's explicit non-goals and baked decisions.
- `eslint-plugin-react` does not declare ESLint 10 peer support; bundling
  would force a peer bypass or rule-coverage change.
- Tailwind 4 requires a browser-policy decision and visual PoC that this
  stage cannot supply.
- Mixes low-risk hygiene with breaking migrations, destroying bisectability.

**Complexity:** high.
**Risk:** high.
**Disposition:** rejected; each major remains tracked under #6 in its own
stage.

### Approach C: Atomic Group B patch and reclassification (selected)

Reverify and apply the thirteen package actions together: patch the CSS/build
trio and reclassify them plus `@types/three`, remove `encoding`, patch
`@types/node`, patch the ESLint 9 ecosystem including the two intentional
lint-tool major updates, regenerate the npm lockfile once under the pinned
toolchain, inspect peers and the named transitive subtrees, run the existing
validation surface plus manual Chromium UX, and compare audits path-by-path
with the nested PostCSS residual explicitly documented.

**Advantages**

- Honors the staged roadmap's separation between framework/security (#9) and
  build/hygiene (this issue).
- One atomic manifest/lockfile unit keeps rollback trivial.
- Reclassification makes the production audit a meaningful runtime baseline.
- Supported parent updates resolve most affected transitive paths without
  overrides.
- Uses the validation and audit-comparison defenses already established by
  issues #7, #8, and #9.

**Disadvantages**

- Cannot make the audit clean: the nested PostCSS residual and the
  force-graph chain findings remain for later stages.
- Requires careful path-by-path audit and lockfile review rather than relying
  on install/build success.
- The Hooks plugin major update may require small, deliberate flat-config
  adjustments (e.g., retiring `fixupPluginRules`), which must be proven
  coverage-equivalent.

**Complexity:** medium.
**Risk:** manageable with exact toolchain use, peer inspection, lockfile
review, production validation, and full UX verification.
**Disposition:** selected.

## Functional Requirements

### FR1 — Implementation-time target verification

Before manifest modification, evidence MUST record for each intended package:

- that the exact artifact is published;
- relevant dist-tag/support status;
- declared Node engine requirements against Node `22.23.1`;
- direct dependencies that materially affect the lockfile; and
- peer ranges, specifically:
  - `eslint-plugin-react-hooks@7.1.1` accepts the pinned ESLint 9 line;
  - `eslint-plugin-react@7.37.5` accepts the pinned ESLint 9 line;
  - `typescript-eslint@8.64.0` supports the checked-in TypeScript `~5.7.3`;
  - `@eslint/js@9.39.5` matches the `eslint@9.39.5` line; and
  - the chosen `globals` release's engine range accepts Node `22.23.1`.

Any difference from the intended target table MUST be recorded and resolved
under the drift constraint before installation.

### FR2 — Atomic manifest and lockfile update

- `package.json` MUST express exactly the verified target group. Each entry
  preserves its existing range style.
- `postcss`, `tailwindcss`, `autoprefixer`, and `@types/three` MUST move from
  `dependencies` to `devDependencies`; no other production dependency may be
  reclassified, and the runtime `three` package MUST NOT move.
- `encoding` MUST be removed from the manifest.
- `package-lock.json` MUST be regenerated with npm `10.9.8`, remain lockfile
  v3, and synchronize its root dependency metadata (including the dependency
  classification) with the manifest.
- No other direct dependency version or classification may change.

### FR3 — Reclassification and removal correctness

- No application, configuration, test, or script import may require
  `encoding` after removal; the removal MUST be re-confirmed by search, not
  assumed from research.
- `postcss`, `tailwindcss`, and `autoprefixer` MUST be consumed only by the
  build-time PostCSS/Tailwind pipeline, and `@types/three` only by
  typecheck/build; this MUST be evidenced by their actual import/reference
  sites.
- After reclassification, `npm ci` followed by lint, typecheck, and the
  production build MUST succeed, proving the build-time consumers still
  resolve the moved packages.

### FR4 — Build-environment dev-dependency confirmation

- The review MUST document the evidence that the build environments install
  dev dependencies: CI runs `npm ci` (which includes dev dependencies) and
  the CI validation job runs the production build.
- If any deployment host outside the repository is identified that installs
  with `--omit=dev`, reclassification MUST pause for architect confirmation.
  No such host configuration exists in the repository today.

### FR5 — Clean peer tree and preserved lint coverage

From a clean working tree state after lockfile generation:

- `npm ci` MUST succeed without `--force`, `--legacy-peer-deps`, or
  equivalent bypass configuration.
- npm inspection MUST report no invalid or unmet peer among the lint stack
  or elsewhere.
- The ESLint flat config MUST retain the intentional coverage listed in the
  Constraints: Next, React, Hooks, JS, and TypeScript sets with the same
  explicit rule overrides as today.
- If the updated Hooks plugin natively supports the repository's flat-config
  usage, the `@eslint/compat` `fixupPluginRules` wrapper MAY be retired and
  the dependency removed; otherwise a compatible `@eslint/compat` 1.x MUST be
  kept. Either way, `npm run lint` MUST pass with no new suppressions and no
  silent rule loss, and any config diff MUST be minimal and documented.
- The lint baseline contract test (`tests/toolchain.test.mjs` imports and
  inspects `eslint.config.mjs`) MUST keep passing, updated only as needed for
  intentional config changes.

### FR6 — Lockfile provenance and transitive review

The complete lockfile diff MUST be reviewed rather than accepting npm's
output unexamined. The review MUST record:

- all changed, added, and removed package records;
- the parent/direct-range reason for each material transitive change;
- any changed engine, optional dependency, peer, integrity, or registry
  source metadata that affects reproducibility;
- the state of the named subtrees: Tailwind/sucrase (glob, minimatch,
  brace-expansion, picomatch, yaml), ESLint (`@eslint/eslintrc`, js-yaml,
  minimatch, brace-expansion), force-graph (kapsule/lodash-es,
  polished/@babel/runtime), and the nested `next > postcss` copy;
- confirmation that no unrelated direct package or unexpected major moved;
- confirmation that no unexplained source appeared; and
- confirmation that `encoding` and its unique transitive children (if any)
  are gone.

Expected target-group transitive movement is not automatically suspicious,
but it must still be attributable. Unexplained churn blocks completion.

### FR7 — Automated validation

After a clean `npm ci`, the exact repository commands MUST prove:

1. contract/unit tests pass (`npm test`);
2. ESLint passes (`npm run lint`);
3. TypeScript `--noEmit` passes (`npm run typecheck`);
4. the Next production build succeeds (`npm run build`);
5. `next start` serves the production application successfully; and
6. the Playwright Chromium smoke passes against that production server,
   including a real initialized WebGL drawing buffer and the axes, reset,
   and rotation control transitions.

The aggregate `npm run validate` gate MUST remain green. Direct build/start
evidence MUST also be recorded so a browser-server lifecycle failure is
diagnosable.

### FR8 — Complete manual Chromium interaction matrix

Against the production build in Chromium, manual UX verification MUST
exercise and record all current documented behaviors:

1. the page loads with a visible, nonzero WebGL graph canvas and populated
   graph;
2. pointer interaction is initially disabled and becomes enabled after the
   configured delay;
3. automatic horizontal rotation is observable;
4. pause and resume controls stop and restart automatic rotation;
5. Show/Hide Axes visibly toggles the axes helper in both directions;
6. Reset Camera fits the graph and preserves the specified pause/resume
   rotation behavior;
7. mouse-wheel input zooms the graph in and out;
8. background drag rotates the view with the Trackball controls;
9. node drag fixes the released node and releases the prior fixed node as
   documented;
10. left-clicking a node focuses the camera, stops auto-rotation, fixes that
    node, and releases other fixed nodes;
11. right-clicking the fixed node releases it; and
12. the canvas remains responsive and no unexpected page, console, hydration,
    WebGL, or timer error appears through the sequence.

The test MAY use representative nodes rather than every node. If a documented
mouse-button variant cannot be distinguished reliably, the review must state
exactly what was exercised rather than imply broader coverage.

### FR9 — Full and production audit comparison

Run and retain raw CI evidence for both:

- the complete dependency graph (`npm audit`); and
- the production graph (`npm audit --omit=dev`).

The review document MUST contain durable before/after totals and a
path-by-path table measured against the post-#9 baseline in review 9. For
every advisory/path present in either baseline or updated result, record:

- package, advisory identifier/URL, severity, and vulnerable range;
- before and after root-to-affected-package paths;
- production or development/build classification, noting how the
  reclassification changes the production graph's meaning;
- whether the patch fixed, added, removed, reclassified, or left the path
  unchanged;
- the repository feature or build/runtime mechanism needed to exercise it;
- evidence of whether that mechanism exists here;
- applicability/reachability conclusion with confidence; and
- remediation owner, accepted residual, or other explicit disposition.

Totals alone do not satisfy this requirement. The production audit after
reclassification MUST be presented as the meaningful runtime baseline, and
the force-graph chain findings MUST keep their Stage 2 ownership
disposition.

### FR10 — PostCSS residual disposition

The final review MUST explicitly record that:

- the direct `postcss` copy was updated out of the
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
  / CVE-2026-41305 range (or document drift if it was not);
- Next `15.5.20`'s pinned nested `postcss@8.4.31` remains within that
  advisory range;
- the nested copy is a framework-owned build-time transitive that no
  supported Next 15 release selection eliminates in this stage;
- no unsupported blanket override is applied;
- it remains an explicitly accepted temporary residual tracked through the
  upstream framework/dependency path (Next issue #93604) and later
  modernization work; and
- the actual installed nested path after regeneration is identified.

### FR11 — Dependency-contract tests

- The existing contract tests in `tests/` MUST be updated so the intended
  invariants are durable: the reclassified packages appear in
  `devDependencies` at their intended versions, `encoding` is absent, and
  the `eslint`/`@eslint/js` alignment holds.
- Existing invariants (Node/npm baseline, lockfile v3 synchronization,
  React/DOM exact pair, Next/plugin alignment, Playwright pin) MUST NOT be
  weakened.
- Tests MUST check externally meaningful package and lockfile behavior, not
  npm implementation details.

### FR12 — Rollback

- The pre-patch commit is the rollback baseline.
- Rollback MUST restore `package.json` and `package-lock.json` together,
  plus any contract test changed solely for this patch, in the same
  operation.
- A rollback MUST be followed by `npm ci` under the exact toolchain to prove
  the old graph is restored.
- Rollback MUST never retain a new manifest with an old lockfile or vice
  versa.

## Non-Functional Requirements

### Security and support accuracy

- Do not claim a supported or secure state based only on version numbers.
- Do not claim the audit is clean while the nested PostCSS copy or any other
  finding remains.
- Do not describe a non-exercised feature path as impossible without
  evidence.
- Do not use peer or audit bypasses to create a nominally successful result.
- The `encoding` removal is hygiene; it MUST NOT be presented as a security
  fix.

### Reproducibility

- All dependency-changing work uses the declared Node/npm pair.
- A fresh checkout can reproduce the installed graph with `npm ci`.
- Manifest/lock synchronization, classification, and registry provenance are
  reviewable in git.

### Behavior preservation

- No intentional product, visual, server/client-boundary, lint-coverage, or
  graph-interaction change is allowed.
- Automated and manual validation use the real production application and
  real WebGL implementation rather than mocks.

### Maintainability

- Audit conclusions are concise but durable in the review document.
- Generated JSON remains in CI artifacts, avoiding volatile repository
  snapshots.
- Any test added for classification/version invariants checks externally
  meaningful behavior.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Researched versions drift before implementation | An obsolete target could be selected | Reverify immediately before editing; document drift; require architect confirmation for substitution |
| Reclassification breaks a build host that omits dev dependencies | Production build failure | FR4 evidence before reclassification; pause on any contrary finding |
| Hooks plugin major update changes rule behavior | Silent lint-coverage loss | Peer-range verification, coverage-equivalence check, minimal documented config diff, contract test on the flat config |
| `@eslint/compat` removed while still required | Lint runtime failure | Evaluate against the updated plugin; keep compatible 1.x where required |
| Patch updates move transitive audit paths unexpectedly | Supply-chain or tooling regression | Full lockfile source/major/integrity review and named-subtree inspection |
| Production-audit totals change meaning after reclassification | Misleading security comparison | Present before/after with classification deltas explicit; keep full audit as the build/CI risk view |
| Install/build passes while graph behavior regresses | User-facing breakage | Complete manual interaction matrix, not only build/smoke |
| Audit totals improve but applicable paths remain | False security claim | Before/after path-by-path applicability table; nested PostCSS stays explicit |
| Wrong npm patch rewrites lockfile | Non-reproducible churn | Enforce Node `22.23.1` / npm `10.9.8` before regeneration |
| Unrelated modernization enters the diff | Hard-to-bisect regression | Thirteen-entry direct scope, lockfile attribution, reject unrelated manifest/code cleanup |

## Acceptance Scenarios

### Scenario 1 — Verified supported target group

Given implementation has not modified the manifest, when registry/support and
peer metadata are rechecked, then every selected artifact is published,
supported within its fixed line (Tailwind 3, ESLint 9, Node 22 types),
compatible with the exact Node baseline, and any drift is documented before
proceeding.

### Scenario 2 — Correct classification with working builds

Given the atomic manifest/lockfile update, when a fresh `npm ci` runs in a
dev-dependency-installing environment, then the production build, lint, and
typecheck succeed with the CSS/type packages resolved from `devDependencies`,
`encoding` absent, and the lockfile root metadata matching the manifest.

### Scenario 3 — Lockfile integrity

Given the updated lockfile, when its root metadata, sources, majors, and
named subtrees are inspected, then every changed record is explained, sources
are expected, the only direct majors are the two intentional lint-tool
updates, and `encoding` plus its unique children are gone.

### Scenario 4 — Static and production validation

Given the clean installed graph, when tests, lint, typecheck, build, start,
smoke, and aggregate validation run, then each required green gate passes
without suppressions and the production WebGL page reports no unexpected
errors.

### Scenario 5 — Complete graph UX

Given the production page in Chromium, when the maintainer performs the
complete manual interaction matrix, then delayed pointer enablement,
rotation, buttons, Trackball navigation, node fix/focus/release behavior, and
rendering remain observably equivalent.

### Scenario 6 — Honest audit delta

Given before and after full/production audit evidence, when each advisory
path is compared, then the review identifies what changed, why the path is or
is not applicable to current repository features, how reclassification moved
paths between graphs, and who owns each remaining risk. The direct PostCSS
fix and the nested `next > postcss@8.4.31` residual are both explicit.

### Scenario 7 — Atomic rollback

Given a failure requires rollback, when the patch is reverted, then the
manifest, lockfile, and patch-specific contract tests return to the same
pre-patch commit and a fresh `npm ci` restores that prior graph.

## Open Questions

### Critical

None. The architect baked the scope, staging, classification, peer, and
override decisions into the issue.

### Important

- Do implementation-time registry/support checks reveal newer appropriate
  in-line releases (e.g., PostCSS, Tailwind 3.4.x, ESLint 9.39.x, Hooks,
  globals)? Substitution requires an explicit documented decision rather than
  autonomous drift.
- Does `eslint-plugin-react-hooks@7.1.1`'s native flat-config support make
  the `@eslint/compat` `fixupPluginRules` wrapper unnecessary here? This is
  an implementation measurement governed by FR5's coverage-equivalence rule.
- Which baseline audit paths disappear, change classification, or remain
  after regeneration? This is an implementation measurement, not a reason to
  pre-judge audit cleanliness.

### Nice-to-know

- Whether the fresh lockfile incidentally resolves `lodash-es` or
  `@babel/runtime` to fixed versions within existing parent ranges; any such
  movement is documented but does not change their Stage 2 ownership.

## References

- [Issue #10](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/10)
- [Parent modernization tracker #6](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/6)
- [Architecture and dependency modernization report](../research/architecture-dependency-modernization.md)
- [Specification 9](9-patch-next-15-and-react-to-the.md) and its
  [review](../reviews/9-patch-next-15-and-react-to-the.md) (post-#9 audit baseline)
- [PostCSS advisory GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [Next issue #93604 (nested PostCSS)](https://github.com/vercel/next.js/issues/93604)
- [ESLint version support](https://eslint.org/version-support/)
- [typescript-eslint dependency matrix](https://typescript-eslint.io/users/dependency-versions/)
- [eslint-plugin-react-hooks npm releases](https://www.npmjs.com/package/eslint-plugin-react-hooks?activeTab=versions)
- [Tailwind npm releases](https://www.npmjs.com/package/tailwindcss?activeTab=versions)
- [PostCSS npm releases](https://www.npmjs.com/package/postcss?activeTab=versions)

## Consultation Log

### Clarification before initial draft

The issue body carries the architect's baked decisions: keep Tailwind 3 and
the current PostCSS architecture; keep ESLint 9 without peer bypasses or
silent rule-coverage changes; reverify all targets; confirm dev-dependency
installation before reclassification; prefer supported parent updates over
overrides; keep this work sequential after #9 (merged as PR #21) and
separately reviewable from it. No further clarification was required.

### Initial three-way review

Pending Porch-managed review.

### Post-feedback three-way review

Pending human feedback and Porch-managed re-review.
