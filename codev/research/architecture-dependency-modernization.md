# Architecture and Dependency Modernization

**Project:** Issue #4
**Research date / source access date:** 2026-07-17
**Decision:** Which dependencies should change, to what targets, in what order,
and with which architectural safeguards?

## Scope summary

This report evaluates the checked-in Next.js 3D force-graph application, all 25
direct production and development dependencies, and material lockfile
transitives. It covers current architecture, support and security status,
compatibility constraints, exact or bounded targets, sequencing, validation,
and rollback. It does **not** implement updates, regenerate the lockfile, or
change application code.

Labels used below:

- **Observed** — verified in this repository or its lockfile.
- **External** — verified against current registry, maintainer, or advisory
  information.
- **Recommendation** — an inference or proposed decision.
- Confidence is **high**, **medium**, or **low**.

## Executive recommendation

The repository's basic server/client architecture is sound, but it is not a
safe modernization baseline. The checked-in `next@15.1.11` and
`postcss@8.5.1` are in known affected ranges, the current production audit
reports nine vulnerable package nodes, `next lint` blocks a clean Next 16
migration, and the imperative WebGL component has timer/effect lifecycle risks
that the current validation surface would not catch.

One audit finding cannot currently be eliminated by choosing a stable Next
release alone: registry metadata confirms both Next `15.5.20` and `16.2.10`
still pin nested `postcss@8.4.31`. That affected build-time copy must be tracked
as an upstream residual risk rather than represented as fixed by updating the
root PostCSS package.

Use a staged path:

1. **Establish a reproducible baseline on Node 22 LTS** with explicit
   `engines`/`packageManager`, direct typecheck and ESLint commands, a clean
   build, an audit snapshot, and a small browser smoke test.
2. **Urgently patch within the current architecture:** move Next and its ESLint
   plugin together to `15.5.20`, PostCSS to `8.5.19`, React/DOM and their types
   together to current React 19, remove unused `encoding`, and patch/reclassify
   the Tailwind 3 build stack. This addresses supported Next advisory ranges
   and the direct PostCSS copy, but not Next's pinned nested PostCSS.
3. **Update the 3D stack as an isolated unit:** `three@0.185.1`,
   `@types/three@0.185.1`, and `react-force-graph-3d@1.29.1`, with interaction
   and WebGL regression gates. Do not accept install/build success as proof.
4. **Then trial Next `16.2.10`** as the desired Active-LTS framework target.
   Its breaking surface is small in this repository, but its Node baseline,
   default Turbopack build, and removal of `next lint` justify an isolated
   migration.
5. **Modernize lint/language separately.** TypeScript `6.0.3` is the bounded
   target; TypeScript 7 is blocked by current `typescript-eslint` support.
   ESLint 10 is strategically desirable because ESLint 9 reaches EOL on
   2026-08-06, but `eslint-plugin-react@7.37.5` does not declare ESLint 10 peer
   support. Patch to ESLint 9 maintenance first, then run an ESLint 10
   proof-of-concept without bypassing peer checks.
6. **Do not bundle Tailwind 4 into the security work.** Patch to Tailwind
   `3.4.19` now. Migrate to Tailwind `4.3.3` only after accepting its browser
   floor. Tailwind 4 removes Autoprefixer but, for the documented Next/PostCSS
   integration, still uses `postcss` plus `@tailwindcss/postcss`.

The highest-value surprising finding is that the lockfile audit is not only
framework debt: the force-graph chain reaches currently vulnerable
`lodash-es`, and Tailwind/build chains reach other affected packages. Most have
newer versions permitted by upstream ranges, so every update stage must
regenerate and re-audit the lockfile rather than reviewing only direct version
numbers.

## Current-state architecture

### Observed repository facts

**[Observed, high] Application shape**

- `app/layout.tsx` and async `app/page.tsx` are App Router server components.
- The server page imports static graph data, serializes it, and passes the
  string to `app/components/FocusGraphWrapper.tsx`.
- The wrapper is a client component and dynamically imports `FocusGraph` with
  `{ ssr: false }`. This is an appropriate boundary for browser-only WebGL.
- `FocusGraph.tsx` is a client component using
  `react-force-graph-3d`, Three.js camera/scene/vector/axes objects, and
  `TrackballControls`. It mutates the renderer's camera, controls, scene, and
  node positions.
- Vercel Analytics and Speed Insights are rendered from the server page; Geist
  is loaded through `geist/font/sans` in the layout.
- Tailwind 3 runs through PostCSS and Autoprefixer at build time.

**[Observed, high] Lifecycle and type risks**

- Rotation uses `setInterval`; initialization and interaction enabling use
  `setTimeout`. No effect returns an unmount cleanup for these timers.
- `parsedData` is reconstructed during every render and is an effect
  dependency. A mutable counter suppresses repeated initialization rather than
  making initialization idempotent. React development remounts or future
  lifecycle changes can therefore expose duplicate/stale work. In React
  Strict Mode's extra development setup/cleanup cycle, the missing cleanup
  leaves work from the first setup alive while the counter suppresses parts of
  the second setup.
- A local `let Graph` is assigned a React element and its
  `Graph?.props.graphData.nodes` is captured by `handleDragEnd`. Because the
  element and dependency are recreated during render, this defeats useful
  callback stability and couples application behavior to an indirect element
  props lookup. It should use state/ref data directly before testing React
  Compiler or newer graph wrappers.
- `app/components/FocusGraph.d.ts` contains only
  `declare module 'three';`. This blanket ambient declaration is unnecessary
  when `@types/three` is installed and may hide the exact type errors that a
  Three.js update needs to reveal.
- `skipLibCheck` is enabled. It reduces friction but also weakens the type gate
  for the most version-sensitive stack.

These are not reasons to abandon the current client boundary. They are reasons
to add timer cleanup and remove the ambient declaration in a small,
behavior-preserving prerequisite change before relying on typecheck and browser
smoke results.

**[Observed, high] Toolchain and package state**

- npm is implied by `package-lock.json`; the lockfile is version 3 with 429
  package records (428 dependencies excluding the root record).
- `package.json` declares neither a Node engine nor a package-manager version.
- Scripts are `dev`, `build`, `start`, and `lint`; `lint` invokes
  `next lint`. There is no explicit typecheck, test, browser smoke, or audit
  command.
- No installed `node_modules` tree is present in this checkout, so the current
  build, lint, typecheck, and user path were not executed during research.
- `encoding` is not imported by application or configuration code.
- Git history shows `encoding` arrived with the initial Vercel-created
  scaffold, not with a documented application requirement.
- `@types/three`, Tailwind, PostCSS, and Autoprefixer are production
  dependencies even though they are type/build tools.
- `tailwind.config.ts` uses CommonJS `module.exports` despite its `.ts`
  extension. This is valid in the present toolchain but is another reason to
  treat Tailwind 4's CSS-first configuration as a migration, not a version
  substitution.

### Runtime and support assumptions

**[External, high]** Node 22 and 24 are LTS on the research date; Node 20
reached EOL on 2026-03-24. Next 16 requires Node 20.9+, while ESLint 10 and
`@eslint/compat@2` require at least Node 20.19, Node 22.13, or Node 24.
Standardizing initially on a current Node 22 LTS patch is the least disruptive
choice because the repository already uses Node 22 types. Node 24 can be a
separate runtime qualification. See the
[Node release table](https://nodejs.org/en/about/previous-releases).

**[External, high]** Next 16 is Active LTS and Next 15 is Maintenance LTS.
Maintenance releases can include semver-minor security changes, so remaining
on `15.1.x` is not an adequate interpretation of “staying on Next 15.” See the
[Next.js support policy](https://nextjs.org/support-policy).

## Per-package decision matrix

Resolved current versions come from `package-lock.json`. Latest versions and
dist-tags were rechecked against the npm registry on 2026-07-17. “Now” means
the first safe-baseline stages; “later” means an isolated major migration or
explicit decision gate.

### Direct production dependencies

| Package | Current resolved | Target/action | Priority | Risk / grouping | Rationale and confidence |
|---|---:|---|---|---|---|
| `@types/three` | 0.172.0 | **0.185.1**, move to dev deps | Recommended | High; group with Three and force-graph | Three still points TypeScript users to community types; exact runtime/type alignment minimizes drift. **High** |
| `@vercel/analytics` | 1.4.1 | **2.0.1** | Recommended | Low-medium; observability stage | Current Next-specific binding is documented; verify beacon and redaction. **High** |
| `@vercel/speed-insights` | 1.1.0 | **2.0.0** | Recommended | Low-medium; observability stage | v2 adds resilient intake/config including sampling; verify network events and cost/privacy settings. **High** |
| `autoprefixer` | 10.4.20 | **10.5.4**, dev dep now; remove with Tailwind 4 | Recommended | Low; group with CSS | Build-only under Tailwind 3; redundant under Tailwind 4. **High** |
| `geist` | 1.3.1 | Replace with `next/font/google` `Geist`; if deferred, **1.7.2** | Optional | Low; code/config change | Next can self-host Geist without this package. Not a security blocker. **High** |
| `next` | 15.1.11 | **15.5.20 now**, then **16.2.10** trial/target | **Urgent** | Medium; match plugin, React, Node | Current version is in multiple advisory ranges. Backport first minimizes emergency change; Active-LTS 16 is the strategic target. **High** |
| `postcss` | 8.5.1 | **8.5.19**, move to dev deps | **Urgent** | Low; CSS/lockfile group | `<8.5.10` is affected by CVE-2026-41305. This fixes the direct build copy; stable Next still pins an affected nested copy that must be tracked separately. **High** |
| `react` | 19.0.0 | **19.2.7** | Recommended | Medium; group with DOM/types/Next | Current stable React 19 baseline; do not mix React/DOM versions. **High** |
| `react-dom` | 19.0.0 | **19.2.7** | Recommended | Medium; group with React/types/Next | Exact peer match to React. **High** |
| `react-force-graph-3d` | 1.26.0 | **1.29.1** | Recommended | **High runtime risk**; group with Three/types | Latest wrapper pulls newer 3D stack. Installation compatibility is broad, but imperative behavior needs browser testing. **High version / medium behavior** |
| `tailwindcss` | 3.4.17 | **3.4.19 now**; **4.3.3** only after browser/PoC gate; dev dep | Recommended / optional major | Medium; group with CSS config | v3 LTS patch is low risk. v4 changes directives/config/plugin and browser floor. **High** |
| `three` | 0.172.0 | **0.185.1** | Recommended | **High runtime risk**; group with types/force-graph | Latest force-graph transitive stack requires Three >=0.179. Use one tested exact release, not mismatched intermediate types. **High version / medium behavior** |

### Direct development dependencies

| Package | Current resolved | Target/action | Priority | Risk / grouping | Rationale and confidence |
|---|---:|---|---|---|---|
| `@eslint/compat` | 1.2.5 | Patch in current line; evaluate **2.1.0** and then removal in ESLint 10 trial | Optional | Medium; Node/ESLint group | Used only to adapt Hooks rules. Do not remove until the updated flat config passes. **Medium** |
| `@eslint/js` | 9.18.0 | **9.39.5 now**; **10.0.1** with ESLint 10 | Recommended | Medium; exact ESLint major | Core configs must track the ESLint line. **High** |
| `@next/eslint-plugin-next` | 15.1.6 | **15.5.20 now**, then **16.2.10** | **Urgent** | Match Next | Avoid framework/plugin rule skew. **High** |
| `@types/node` | 22.10.7 | **22.20.1** while Node 22 is policy | Recommended | Low; runtime policy | Match the chosen Node major, not the overall `@types/node@26` latest. **High** |
| `@types/react` | 19.0.7 | **19.2.17** | Recommended | Low; React group | Match current React 19 types. **High** |
| `@types/react-dom` | 19.0.3 | **19.2.3** | Recommended | Low; React group | Requires `@types/react ^19.2`. **High** |
| `encoding` | 0.1.13 | **Remove** | Cleanup now | Low | Unused direct dependency with no modernization value. Removal is not presented as a security fix. **High** |
| `eslint` | 9.18.0 | **9.39.5 now**; ESLint **10.7.0** PoC | Recommended / time-sensitive | Medium-high; plugin/Node group | v9 reaches EOL 2026-08-06, but React plugin peer support blocks an unqualified v10 recommendation. **High** |
| `eslint-plugin-react` | 7.37.4 | **7.37.5**; reassess for ESLint 10 | Optional patch / blocker | Medium | Latest peer range ends at ESLint 9; never hide this with `--legacy-peer-deps`. **High** |
| `eslint-plugin-react-hooks` | 5.1.0 | **7.1.1** | Recommended | Medium; config/React group | Current release supports flat config and declares ESLint 10. **High** |
| `globals` | 15.14.0 | **17.7.0** | Optional | Low; lint group | Current environment definitions; review changes to declared globals. **High** |
| `typescript` | 5.7.3 | **6.0.3**; defer 7.x | Recommended | Medium; type/lint group | TS 6 is the transition release; TS 7 exceeds current typescript-eslint support. **High** |
| `typescript-eslint` | 8.21.0 | **8.64.0** | Recommended | Medium; ESLint/TS group | Supports ESLint 8–10 but TypeScript only `<6.1`, defining the TS 6 ceiling. **High** |

Registry references: [Next](https://www.npmjs.com/package/next),
[React](https://www.npmjs.com/package/react),
[Three](https://www.npmjs.com/package/three),
[`@types/three`](https://www.npmjs.com/package/@types/three),
[`react-force-graph-3d`](https://www.npmjs.com/package/react-force-graph-3d),
[Tailwind](https://www.npmjs.com/package/tailwindcss),
[ESLint](https://www.npmjs.com/package/eslint),
[TypeScript](https://www.npmjs.com/package/typescript), and
[`typescript-eslint`](https://www.npmjs.com/package/typescript-eslint).

## Coupled-stack analysis

### 1. Next.js, React, React DOM, and Next lint

**[External, high]** Next 16 requires Node 20.9+, makes Turbopack the default
for both development and build, removes `next lint`, fully removes synchronous
request API access, and raises its browser baseline to Chrome/Edge/Firefox 111
and Safari 16.4. The official codemod can migrate `next lint` to the ESLint CLI.
See the [Next 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16).

**[Observed, high]** This repository has no middleware/proxy, request APIs,
custom caching, image configuration, or webpack configuration. Its `next.config`
is empty. Therefore the application-code surface of the Next 16 migration is
small. The meaningful risks are tooling and the client WebGL bundle:

- `next lint` must become an explicit `eslint .` command.
- The existing development script's `--turbopack` flag becomes redundant, and
  production build moves from webpack to Turbopack by default.
- The dynamic client island must still load exactly one Three.js runtime and
  avoid importing Node-only modules.
- React Compiler should remain **off** during modernization. It is optional,
  and this imperative component is a poor place to combine compiler-driven
  memoization with framework and rendering changes.

**Resolution:** patch Next 15 first because the current version is unsafe, then
move to Next 16 in its own stage. This is a risk-control sequence, not a
recommendation to remain indefinitely on Maintenance LTS.

### 2. Three.js and the force-graph chain

The lockfile currently resolves:

```text
react-force-graph-3d 1.26.0
├─ react-kapsule 2.5.2 (React peer >=16.13.1)
└─ 3d-force-graph 1.76.0
   ├─ three-forcegraph 1.42.12
   │  └─ d3-force-3d 3.0.5 / ngraph.forcelayout 3.3.1
   ├─ three-render-objects 1.37.0
   │  ├─ float-tooltip 1.7.3 → preact 10.25.4
   │  ├─ polished 4.x → @babel/runtime
   │  └─ kapsule 1.x → lodash-es 4.x
   └─ three >=0.118 <1 (dependency)
```

The current lock contains one `three@0.172.0`; no duplicate Three runtime was
observed. In the latest graph chain,
`react-force-graph-3d@1.29.1` requests `3d-force-graph ^1.79`, and current
`3d-force-graph@1.80.0` requires Three `>=0.179 <1`; current
`three-render-objects` also requires `>=0.179`. That makes a Three update a
real grouping constraint, not merely stylistic alignment.

`react-kapsule` has a broad React peer and is not an observed React 19 install
blocker, but it is the adapter actually translating the imperative graph
object into React lifecycle behavior. `d3-force-3d`/ngraph determine layout
behavior, while `float-tooltip` introduces a non-obvious Preact client runtime.
The Stage 2 lockfile review must therefore confirm these packages and not stop
at the three named direct dependencies.

Three's documentation still directs TypeScript users to community-maintained
types and recommends addon imports through `three/addons/...`; see the
[Three installation guide](https://threejs.org/manual/en/installation.html).
Therefore:

- retain `@types/three`, but move it to dev dependencies;
- use the same `0.185.1` release for runtime and types;
- test the current
  `three/examples/jsm/controls/TrackballControls.js` import and prefer the
  documented `three/addons/controls/TrackballControls.js` path if migration
  guidance requires it;
- remove the blanket `FocusGraph.d.ts` declaration only in a controlled
  baseline commit, fix surfaced types, then keep `skipLibCheck` removal as a
  separate tightening step.

The decisive validation is behavioral: canvas creation, initial layout,
auto-rotation, pointer enable delay, Trackball zoom/rotation, drag/fix/unfix,
click-to-focus, reset, axes visibility, resize, unmount/remount, console
warnings, and WebGL context stability on at least Chromium and one other
supported browser.

### 3. Tailwind, PostCSS, and Autoprefixer

The current setup is a conventional Tailwind 3 pipeline and can be safely
patched without migrating architecture. Its packages should be dev
dependencies, subject to confirming the deployment build installs dev
dependencies.

Tailwind 4 is a separate migration:

- replace `@tailwind base/components/utilities` with
  `@import "tailwindcss"`;
- use `@tailwindcss/postcss`;
- remove Autoprefixer because v4 handles prefixing;
- migrate JS/TS theme configuration to the v4 CSS-first model where possible;
- validate custom `hsl(var(--...))` colors and generated arbitrary utilities.

Contrary to two investigations, **PostCSS is not necessarily removed**. The
official Next-compatible PostCSS setup installs `tailwindcss`,
`@tailwindcss/postcss`, and `postcss`. The
[Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
also states that v4 requires Safari 16.4+, Chrome 111+, and Firefox 128; stay
on v3.4 when older browsers matter. The WebGL nature of this app suggests a
modern audience, but that is an inference, not an approved browser policy.
Next 16 and Tailwind 4 share the Chrome 111/Safari 16.4 floor, but Tailwind's
Firefox 128 floor is stricter than Next's Firefox 111, so accepting Next 16
does not by itself settle Tailwind 4 support.

### 4. TypeScript and ESLint flat-config ecosystem

The project already uses flat config, reducing ESLint 10 migration work.
However:

- The actual config applies `globals.commonjs` broadly while browser globals
  are commented out, imports the legacy-shaped React recommended config, and
  wraps only the Hooks plugin through `fixupPluginRules`. Modernization must
  test the config as written, adopt the current Hooks flat config where
  possible, and decide whether browser and Node/CommonJS globals should be
  scoped by file rather than globally declared.
- ESLint 10 changes config lookup, recommended rules, JSX reference tracking,
  and Node requirements; see the
  [ESLint 10 release notes](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/).
- ESLint 9 is only Maintenance and reaches EOL on 2026-08-06; see
  [ESLint version support](https://eslint.org/version-support/).
- `eslint-plugin-react-hooks@7.1.1` supports ESLint 10, but
  `eslint-plugin-react@7.37.5` declares only through ESLint 9.
- `typescript-eslint@8.64.0` supports ESLint 8–10 but TypeScript
  `>=4.8.4 <6.1.0`; see its
  [dependency matrix](https://typescript-eslint.io/users/dependency-versions/).
- TypeScript 6 explicitly prepares projects for TypeScript 7 removals; see the
  [TypeScript 6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html).

The safe target is TypeScript 6.0.3. TypeScript 7.0.2 may be published, but it
is unsupported by the lint parser today. For ESLint, patch v9 immediately and
time-box a v10 trial. A successful trial must have a clean peer tree and
equivalent intentional rule coverage; `--force` or `--legacy-peer-deps` is not
an acceptable compatibility decision.

### 5. Vercel packages and Geist

The 2.x Analytics and Speed Insights packages support Next 13+ and React
18/19. Vercel documents framework-specific `.../next` imports and layout-level
placement. Analytics offers `beforeSend`; Speed Insights v2 adds code-level
`sampleRate`, `beforeSend`, and resilient/dynamic endpoints. See
[Analytics configuration](https://vercel.com/docs/analytics/package) and
[Speed Insights configuration](https://vercel.com/docs/speed-insights/package).

Upgrade both packages together in a low-risk observability stage, use the Next
bindings, and validate actual beacons rather than only rendering. Confirm
privacy redaction and sample/cost policy with the owner.

The repository currently imports `@vercel/analytics/react` and
`@vercel/speed-insights/react` in `app/page.tsx`. Those client components do
execute in the browser even though they are included by a server component.
Moving to the documented `.../next` bindings in `app/layout.tsx` would make
route-wide placement explicit if the application grows beyond one page.

The external `geist` package remains usable, but Next now documents
`Geist` through `next/font/google`, which self-hosts fonts without browser
requests to Google. Replacing the package is a small optional dependency
reduction; see [Next font guidance](https://nextjs.org/docs/pages/getting-started/fonts).

## Security and material transitive findings

### Lockfile audit

**[Observed/external, high]** The following command was executed locally on
2026-07-17 against the checked-in lockfile; `--package-lock-only` does not
require an installed `node_modules` tree:

```text
npm audit --omit=dev --package-lock-only
critical 1 | high 4 | moderate 4 | total 9 vulnerable package nodes
```

The “production” count is inflated by Tailwind/PostCSS/Autoprefixer being
classified as production dependencies, but the result is still actionable.
After reclassification, rerun the production audit and preserve that result as
the meaningful runtime baseline; keep a separate full audit for build/CI risk.

- `next@15.1.11` is the package node to which npm assigns the aggregate
  critical severity. Applicability is mixed: the critical authorization bypass
  requires middleware (absent here); rewrite, CSP-nonce, image, WebSocket, and
  Cache Components findings likewise require features not observed; App
  Router/RSC denial-of-service and cache findings are more broadly relevant.
  npm identifies `15.5.20` as the non-major fix target for the Next advisory
  set. See
  [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw).
- Both the root `postcss@8.5.1` and Next's internal PostCSS copy are below the
  `8.5.10` fix for an XSS-on-stringify advisory. This application does not
  parse and embed user-provided CSS, so direct exploitability appears low, but
  updating the root copy is straightforward. Direct registry checks confirm
  that **Next 15.5.20 and 16.2.10 still specify nested
  `postcss@8.4.31`**. An upstream bump has landed only outside the selected
  stable lines, so implementation must record this build-time residual rather
  than claim a zero-audit result or force an unsupported override. See
  [Next issue #93604](https://github.com/vercel/next.js/issues/93604) and
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93).
- The current force-graph path reaches `kapsule → lodash-es`, and the locked
  `lodash-es` is flagged high. Current `lodash-es@4.18.1` is allowed by the
  existing major range, so a fresh lock may resolve it without an override;
  verify rather than assume.
- The force-graph renderer also reaches `polished → @babel/runtime`; the locked
  Babel runtime is flagged moderate and a newer compatible 7.x exists.
- Tailwind's toolchain contributes affected `sucrase` children
  (`glob`, `minimatch`, `brace-expansion`), plus affected `picomatch` and
  `yaml` paths. Updating Tailwind 3 and refreshing the lock should be followed
  by a path-by-path audit review.

Do not use blanket `overrides` as the first response. Let supported parent
updates resolve the graph, re-audit, and use a narrow override only when its
parent's declared range and tests demonstrate compatibility.

## Staged roadmap, validation, and rollback

### Stage 0 — reproducible baseline

**Changes**

- Choose a current Node 22 LTS patch; add an exact/bounded `engines.node` policy
  and a `packageManager` entry for the npm major used to generate lockfile v3.
- Add `typecheck: tsc --noEmit`, replace or supplement lint with `eslint .`,
  add a single validation command, and record full and production audit output.
- Perform `npm ci`; verify current lint, typecheck, build, and production start.
- Add a minimal browser smoke (Playwright is appropriate) that loads the page,
  observes a canvas, captures console/page errors, and exercises core buttons.
- In a small prerequisite change, add timer cleanup/make graph initialization
  idempotent, replace the `Graph?.props` closure with direct graph data, and
  remove the ambient `declare module 'three'` workaround, addressing real
  surfaced types. Do not change dependencies in that commit.

**Go gate:** clean install is reproducible; baseline build and user path are
known. If the existing version fails, record it rather than attributing the
failure to a later upgrade.

**Rollback:** revert only baseline code/tool changes; retain documented
observations.

### Stage 1 — urgent supported baseline

**Group A: framework/security**

- Next `15.5.20`
- `@next/eslint-plugin-next 15.5.20`
- React/DOM `19.2.7`
- React types `19.2.17` / `19.2.3`

**Group B: low-risk hygiene/build patches**

- PostCSS `8.5.19`, Tailwind `3.4.19`, Autoprefixer `10.5.4`
- Reclassify build/type-only packages to dev dependencies
- Remove `encoding`
- Patch Node 22 types and ESLint 9/tool plugins within their current supported
  major families

Keep A and B as separate commits/PRs if practical so framework and CSS/audit
regressions can be bisected.

**Go gate:** clean peer tree; typecheck/lint/build/start; no high/critical audit
finding with an available supported non-major fix; the known nested PostCSS
residual is explicitly dispositioned; browser smoke passes; lockfile diff
contains no unexplained package source or major.

**Rollback:** restore both manifest and lockfile from the previous commit.
Never roll back only `package.json`.

### Stage 2 — 3D/WebGL unit

- Update `three`, `@types/three`, and `react-force-graph-3d` together.
- Inspect resolved versions of `3d-force-graph`, `three-forcegraph`,
  `three-render-objects`, `react-kapsule`, `d3-force-3d`,
  `ngraph.forcelayout`, `float-tooltip`, `preact`, `kapsule`, `lodash-es`,
  `polished`, and Babel runtime.
- Update addon import if required by Three guidance.

**Go gate:** all automated gates plus the full graph interaction matrix on
Chromium and one other supported browser; no duplicate Three runtime; no WebGL
context, hydration, timer, or console errors.

**Rollback:** revert the complete 3D manifest/lockfile/code unit. If one
interaction fails, do not selectively pin mismatched Three types.

### Stage 3 — Next 16 Active LTS

- Run the official upgrade codemod in a dedicated branch.
- Move Next/plugin to `16.2.10`; keep React/DOM exact and supported.
- Remove `next lint` and redundant `--turbopack`; explicitly test the now-default
  Turbopack production build.

**Go gate:** Node/browser policies satisfy Next 16; typecheck/lint/build/start
and WebGL smoke pass; bundle contains no Node-only client imports; audit is no
worse.

**Rollback:** revert the entire Next 16 stage to the already-patched 15.5.20
baseline, not to 15.1.11.

### Stage 4 — language and lint

- Move TypeScript to `6.0.3` and fix deprecations without suppressing them
  indefinitely.
- Update `typescript-eslint`, Hooks/React plugins, globals, and compat.
- Trial ESLint 10 separately. Either wait for `eslint-plugin-react` support or
  deliberately replace its rules; do not bypass the peer conflict.
- Revisit `@eslint/compat` only after the final config passes.

**Go gate:** no unsupported peer combination or parser version warning; lint
coverage is intentionally equivalent or improved; build/typecheck unchanged.

### Stage 5 — optional CSS and hosted-service changes

**Tailwind 4** requires an explicit browser-policy decision and its own visual
diff. Keep PostCSS, add `@tailwindcss/postcss`, remove Autoprefixer, migrate CSS
directives/theme configuration, and validate light/dark custom colors.

**Vercel/font** upgrades can be isolated: update both observability packages,
use Next-specific bindings, verify beacons/redaction/sampling, then optionally
replace `geist` with `next/font/google`.

## Deferrals and explicit blockers

| Item | Status | What unblocks it |
|---|---|---|
| TypeScript 7 | **Blocked** | A `typescript-eslint` release supporting TS 7, followed by typecheck/lint qualification |
| ESLint 10 production adoption | **Blocked/time-sensitive** | `eslint-plugin-react` peer support or an approved removal/replacement of its rule set |
| Tailwind 4 | **Optional/blocked by policy** | Acceptance of Safari 16.4+, Chrome 111+, Firefox 128+ and a successful visual PoC |
| React Compiler | **Defer** | Separate experiment after imperative WebGL lifecycle is cleaned up and dependency migration is stable |
| Removing `skipLibCheck` | **Defer but track** | Clean 3D/runtime type alignment; attempt in its own tightening change |
| Replacing force-graph with React Three Fiber | **Out of scope** | Only a separate architecture study if the supported force-graph update fails requirements |

## Disagreements and resolution

1. **Direct Next 16 versus a Next 15 backport first.** Gemini and Claude favored
   direct latest; Codex favored 15.5 first. Resolved to **15.5.20 urgently, then
   16.2.10**. This removes known exposure with the smallest first diff while
   still converging on Active LTS.
2. **Latest Three versus a conservative intermediate.** Claude proposed an
   intermediate; Codex proposed current latest. Resolved to **0.185.1 as an
   isolated group** because current force-graph transitive releases require
   Three >=0.179 and matching 0.185.1 types exist. A behavioral gate controls
   risk better than selecting an arbitrary middle release.
3. **Tailwind 4 immediately versus defer.** Resolved to **3.4.19 now and 4.3.3
   only after a browser-policy PoC**. There is no security need to combine the
   major CSS migration with urgent work.
4. **Remove PostCSS under Tailwind 4.** Rejected. Official Tailwind's PostCSS
   integration still installs PostCSS and `@tailwindcss/postcss`; only
   Autoprefixer becomes redundant.
5. **Remove `@types/three`.** Rejected. Three's own installation guide still
   directs TypeScript users to community definitions; the correct action is
   to keep exact alignment and reclassify it as development-only.
6. **ESLint 10 immediately versus ESLint 9 maintenance.** Resolved to patch v9
   now and urgently PoC v10. ESLint 9's near EOL argues for v10, while the
   current React plugin peer range prevents claiming v10 is already a clean
   supported combination.
7. **TypeScript latest versus bounded support.** Resolved to TypeScript 6.0.3;
   current `typescript-eslint` explicitly excludes 6.1+.
8. **Strict Mode characterization.** The component has observable cleanup and
   idempotency flaws, but “structurally incompatible with React 19” is too
   strong. The report treats lifecycle cleanup as a prerequisite validated by
   remount/browser tests.

## Gaps and limitations

- No dependency installation or application execution was performed, so
  present build behavior and proposed migration behavior remain to be proven.
- npm registry metadata establishes published versions and peers, not runtime
  compatibility with this application's imperative camera behavior.
- The repository does not state supported browsers, deployment platform,
  privacy requirements, or Node/npm policy; Tailwind 4 and hosted-observability
  choices depend on owner decisions.
- Audit results identify affected package/range paths, not exploitability.
  Several advisories require features absent here, while App Router/RSC
  exposure is broader. Implementation should preserve an advisory-by-advisory
  disposition.
- No automated performance or visual baseline exists. A functional canvas
  smoke will not detect all force-layout, GPU, bundle-size, or Core Web Vitals
  regressions.
- Package releases and advisories change. Recheck registry dist-tags, support
  tables, and `npm audit` immediately before implementation.

## Changes from critique

All three critics confirmed coverage of the 25 direct dependencies and five
coupled stacks. The final report:

- added `react-kapsule`, physics engines, `float-tooltip`, and Preact to the 3D
  transitive analysis and Stage 2 gate;
- documented the current Vercel React imports/page placement and recommended
  Next bindings/layout placement;
- analyzed the repository's actual globals, legacy React config, and Hooks
  compatibility wrapper instead of discussing ESLint only generically;
- elevated the Strict Mode timer/idempotency risk and the `Graph?.props`
  callback pattern into Stage 0 prerequisites;
- separated Next advisory applicability by middleware/feature-specific versus
  App Router/RSC exposure;
- clarified that the lockfile-only audit was actually executed, and that a
  post-reclassification production audit becomes the runtime baseline;
- corrected the PostCSS remediation: both selected stable Next targets still
  pin affected `8.4.31`, so it is a documented build-time residual rather than
  a falsely closed finding;
- clarified that Next 16 and Tailwind 4 browser floors overlap but are not
  identical because Tailwind requires newer Firefox.

Rejected critique is documented in the companion rebuttals file. Most notably,
registry rechecks confirm Tailwind `4.3.3` and Autoprefixer `10.5.4`; the audit
did run locally without `node_modules`; the official Next font documentation
does list Geist; and effort-hour estimates would be false precision before a
baseline install.

## Sources

All external sources were accessed 2026-07-17.

- [Next.js support policy](https://nextjs.org/support-policy)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [React 19.2 release](https://react.dev/blog/2025/10/01/react-19-2)
- [Three.js installation, addons, and TypeScript guidance](https://threejs.org/manual/en/installation.html)
- [`react-force-graph-3d` package](https://www.npmjs.com/package/react-force-graph-3d)
- [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind/PostCSS installation](https://tailwindcss.com/docs/installation/using-postcss)
- [TypeScript 6 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)
- [`typescript-eslint` supported dependency versions](https://typescript-eslint.io/users/dependency-versions/)
- [ESLint 10 release notes](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/)
- [ESLint version support](https://eslint.org/version-support/)
- [Vercel Analytics package configuration](https://vercel.com/docs/analytics/package)
- [Vercel Speed Insights package configuration](https://vercel.com/docs/speed-insights/package)
- [Next.js font guidance](https://nextjs.org/docs/pages/getting-started/fonts)
- [Next middleware authorization advisory](https://github.com/advisories/GHSA-f82v-jwr5-mffw)
- [PostCSS CVE-2026-41305](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [Next issue tracking the nested PostCSS pin](https://github.com/vercel/next.js/issues/93604)
