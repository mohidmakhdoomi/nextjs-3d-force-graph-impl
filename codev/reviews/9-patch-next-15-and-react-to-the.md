# Review: Patch Next 15 and React to the Supported Security Baseline

## Summary

Project 9 moved the repository from `next@15.1.11` / React `19.0.0` to
the supported Next 15 backport and stable React 19 package group:

| Package | Before | After |
| --- | ---: | ---: |
| `next` | `15.1.11` | `15.5.20` |
| `@next/eslint-plugin-next` | `15.1.6` | `15.5.20` |
| `react` | `19.0.0` | `19.2.7` |
| `react-dom` | `19.0.0` | `19.2.7` |
| `@types/react` | `19.0.7` | `19.2.17` |
| `@types/react-dom` | `19.0.3` | `19.2.3` |

The six direct entries and lockfile changed atomically under Node `22.23.1` /
npm `10.9.8`. Contract tests now enforce exact pins, framework/plugin and
React/DOM alignment, lockfile synchronization, and a single stable React
runtime. A narrow ESLint compatibility adjustment ignores generated
`next-env.d.ts`, which Next `15.5.20` now emits with a route-types reference
that flat ESLint otherwise traverses.

The production build, start, automated real-WebGL smoke, and manual Chromium
qualification preserved the App Router server/client boundary and
`dynamic(..., { ssr: false })` WebGL island. Manual matrix items 1–10 and 12
passed. Item 11 did not: physical right-click did not release a fixed node
under headless SwiftShader Chromium. The same input and result reproduced from
the rollback baseline, and the available headed WSL attempt still used
SwiftShader and stalled. This review therefore **does not claim 12/12**; it
records item 11 as a baseline-identical, environment/pre-existing limitation
that the architect explicitly kept out of this dependency patch.

The upgrade removed all 20 direct Next advisory IDs present in the baseline,
including the critical middleware advisory. The audit is not clean. Both the
direct `postcss@8.5.1` and `next@15.5.20 > postcss@8.4.31` paths remain affected
by GHSA-qx2v-qp2m-jg93, along with other modernization residuals documented
below.

## Spec Compliance

- [x] **FR1 — target reverification:** all six artifacts, relevant tags,
  engines, dependencies, and peer ranges were rechecked on 2026-07-18 before
  editing. No target drift was found.
- [x] **FR2 — atomic manifest/lock update:** all six manifest entries are exact;
  the root lock metadata matches; lockfile v3 was regenerated with npm
  `10.9.8`; no other direct dependency moved.
- [x] **FR3 — supported peer/runtime tree:** repeated plain `npm ci` and
  `npm ls` runs passed without bypass flags, invalid peers, or unmet peers.
  There is one stable `react@19.2.7` runtime and matching React DOM.
- [x] **FR4 — lock provenance:** every added, removed, and changed lock record
  was reviewed and attributed below. No unexplained source or retained-package
  major appeared.
- [x] **FR5 — architecture preservation:** the page/layout server components,
  client wrapper, and `{ ssr: false }` dynamic WebGL import are unchanged. No
  compiler package, Babel transform, or Next configuration enabled React
  Compiler.
- [x] **FR6 — automated validation:** contract tests, lint, typecheck, build,
  direct production start, Playwright smoke, and `npm run validate` passed.
- [x] **FR7 — manual qualification, with the specified mouse-input caveat:**
  items 1–10 and 12 passed. Item 11 failed identically on the upgrade and
  rollback baseline in the available renderer, so the exact limitation is
  recorded rather than represented as a full matrix pass.
- [x] **FR8 — audit comparison:** full and production reports retained their
  original exit `1`, validated structurally, and were compared advisory by
  advisory and installed path by installed path below.
- [x] **FR9 — PostCSS disposition:** the direct and nested affected copies,
  supported-release limitation, upstream references, accepted residual, and
  issue ownership are explicit below; no override was added.
- [x] **FR10 — rollback:** the rollback baseline and atomic restore/install
  procedure are recorded below.

## Implementation-Time Target Verification

The registry check used Node `v22.23.1` and npm `10.9.8` immediately before the
manifest update:

- `next@15.5.20` and `@next/eslint-plugin-next@15.5.20` were published and
  exactly matched npm's `backport` tag. npm `latest` remained Next 16 and was
  intentionally not selected.
- Next required Node `^18.18.0 || ^19.8.0 || >=20.0.0`, accepted React and
  React DOM `^19.0.0`, depended on `@next/env@15.5.20`,
  `styled-jsx@5.1.6`, `@swc/helpers@0.5.15`, `caniuse-lite`, and
  `postcss@8.4.31`, and declared all platform SWC packages at `15.5.20`.
- `react@19.2.7` and `react-dom@19.2.7` were the stable `latest` artifacts;
  canary and experimental tags were separate. React DOM peered on
  `react@^19.2.7` and depended on `scheduler@^0.27.0`.
- `@types/react@19.2.17` and `@types/react-dom@19.2.3` were current published
  artifacts. React types depended on `csstype@^3.2.2`; DOM types peered on
  `@types/react@^19.2.0`.
- Node `22.23.1` satisfied every relevant engine and all selected exact
  counterparts satisfied their peer ranges. No implementation-time drift
  required substitution or architect intervention.

## Dependency and Lockfile Review

### Atomicity and peer tree

- `package.json` and `package-lock.json` changed together in commit `0c57149`.
- Lockfile version remained `3`, record count changed from `433` to `432`, and
  the root manifest metadata is byte-for-byte aligned with `package.json`.
- Two later clean `npm ci` runs reproduced the dependency-file hashes without
  `--force`, `--legacy-peer-deps`, warnings about peers, invalid markers, or
  unmet peers.
- `npm ls` reported one `react@19.2.7`, matching `react-dom@19.2.7`;
  `next@15.5.20` and `@next/eslint-plugin-next@15.5.20` aligned;
  `scheduler@0.27.0`, `@types/react@19.2.17`,
  `@types/react-dom@19.2.3`, and `csstype@3.2.3` resolved as expected.
- Every `resolved` tarball uses `https://registry.npmjs.org/`; there are no
  git, file, HTTP, or unknown-registry sources. No retained package changed
  major and no unexpected React runtime appeared.

### Complete lock record inventory

The six added records are all attributable to Next's expanded
`sharp@0.34.5` optional platform subtree:

- `@img/colour@1.1.0`
- `@img/sharp-libvips-linux-ppc64@1.2.4`
- `@img/sharp-libvips-linux-riscv64@1.2.4`
- `@img/sharp-linux-ppc64@0.34.5`
- `@img/sharp-linux-riscv64@0.34.5`
- `@img/sharp-win32-arm64@0.34.5`

The seven removed records are attributable to Next dropping `@swc/counter`
and `busboy`, and `sharp@0.34.5` replacing its old color subtree:

- `@swc/counter@0.1.3`
- `busboy@1.6.0`
- `color@4.2.3`
- `color-string@1.9.1`
- `is-arrayish@0.3.2`
- `simple-swizzle@0.2.2`
- `streamsearch@1.1.0`

The 41 changed records were:

| Group | Records and movement | Attribution |
| --- | --- | --- |
| Root | lock root dependency/devDependency metadata | The six exact direct entries |
| Next core | `next 15.1.11→15.5.20`; `@next/env 15.1.11→15.5.20`; `@next/eslint-plugin-next 15.1.6→15.5.20` | Selected Next backport group |
| Native SWC | Eight optional records: Darwin arm64/x64, Linux arm64 GNU/musl, Linux x64 GNU/musl, Windows arm64/x64, each `15.1.9→15.5.20` | Next's exact platform package declarations |
| React runtime | `react 19.0.0→19.2.7`; `react-dom 19.0.0→19.2.7`; `scheduler 0.25.0→0.27.0` | Selected stable pair and React DOM dependency |
| React types | `@types/react 19.0.7→19.2.17`; `@types/react-dom 19.0.3→19.2.3`; `csstype 3.1.3→3.2.3` | Selected type pair and React type dependency |
| Sharp core | `sharp 0.33.5→0.34.5`; `@emnapi/runtime 1.3.1→1.11.2`; `detect-libc 2.0.3→2.1.2`; nested `semver 7.6.3→7.8.5` | Next widened optional Sharp from `^0.33.5` to `^0.34.3` |
| Sharp platform packages | `@img/sharp-{darwin-arm64,darwin-x64,linux-arm,linux-arm64,linux-s390x,linux-x64,linuxmusl-arm64,linuxmusl-x64,wasm32,win32-ia32,win32-x64} 0.33.5→0.34.5` | `sharp@0.34.5` optional subtree |
| libvips platform packages | `@img/sharp-libvips-{darwin-arm64,darwin-x64,linux-arm,linux-arm64,linux-s390x,linux-x64,linuxmusl-arm64,linuxmusl-x64} 1.0.4/1.0.5→1.2.4` | `sharp@0.34.5` optional subtree |

The Next metadata retained `styled-jsx@5.1.6` and nested
`postcss@8.4.31`. The installed support tree explicitly confirmed
`@next/env@15.5.20`, all eight SWC records, `scheduler@0.27.0`,
`csstype@3.2.3`, and both PostCSS copies.

## Validation Evidence

| Gate | Result |
| --- | --- |
| `npm ci` | Passed repeatedly; final run installed/audited 403 packages with no peer-resolution failure. Audit findings remained diagnostic. |
| `npm test` | 16/16 passed, 0 failed, 0 skipped. |
| `npm run lint` | Passed after the narrow generated `next-env.d.ts` ignore. |
| `npm run typecheck` | Passed. |
| `npm run build` | Passed on Next `15.5.20`; `/` and `/_not-found` prerendered successfully. |
| Direct `npm run start -- --hostname 127.0.0.1 --port 3000` | Root returned HTTP `200` and 250,706 bytes; controlled SIGTERM produced exit `143`. |
| `npm run test:smoke` | One Chromium real-WebGL smoke passed against the production server. |
| `npm run validate` | Passed lint, typecheck, build, start, and Chromium smoke end to end. |
| Full / production audits | Both structurally valid; both intentionally retained original exit `1`. |

Next emitted a workspace-root warning because this isolated worktree and its
parent checkout both contain lockfiles. This is a builder-layout artifact:
normal checkout/CI has one root lockfile, so no `outputFileTracingRoot`
configuration was added.

The source diff contains no change to `app/page.tsx`, `app/layout.tsx`, or
`app/components/FocusGraphWrapper.tsx`. Page/layout remain server components,
the wrapper remains the client boundary, and the graph still loads dynamically
with `{ ssr: false }`. `next.config.js` remains empty, no Babel configuration
exists, and no package/config enables React Compiler.

## Manual Chromium Interaction Matrix

The production application used a populated 2,734-node / 1,367-link graph and
an 800×600 initialized WebGL drawing buffer. Page/console/WebGL/timer errors
were collected throughout.

| # | Interaction | Result |
| ---: | --- | --- |
| 1 | Visible, nonzero WebGL canvas and populated graph | Pass |
| 2 | Pointer disabled initially, enabled after delay | Pass |
| 3 | Automatic horizontal rotation | Pass |
| 4 | Pause/resume stops and restarts rotation | Pass |
| 5 | Show/Hide Axes toggles both directions | Pass |
| 6 | Reset Camera fits the graph and preserves paused/active behavior | Pass |
| 7 | Wheel zoom in and out | Pass |
| 8 | Trackball background drag rotates view | Pass |
| 9 | Successive node drags fix the released node and release the prior node | Pass |
| 10 | Node left-click focuses, stops rotation, fixes target, releases prior node | Pass, with the software-renderer timer frozen between physical pointer-down/up so the asynchronous raycast retained the visibly hovered node |
| 11 | Physical right-click releases the fixed node | **Failed/unverifiable in this environment; not claimed as pass** |
| 12 | Canvas remains responsive with no unexpected errors | Pass |

For item 11, a physical right-click on a visibly hovered fixed node left
`fx`/`fy`/`fz` unchanged in headless SwiftShader Chromium. The identical
procedure and outcome reproduced from rollback baseline `fef4da9` with
Next `15.1.11` / React `19.0.0`, proving no upgrade drift. A bounded headed
attempt used the available WSL display but still reported ANGLE SwiftShader and
stalled before completing the interaction. The architect directed no
application change, classified the result as environment/pre-existing and
out-of-scope, and required this exact limitation to remain visible.

## Audit Review

### Snapshot and interpretation

| Graph | Before | After | Original exit |
| --- | --- | --- | ---: |
| Full | 14 affected package records: 2 low, 6 moderate, 5 high, 1 critical | 17 records: 2 low, 10 moderate, 5 high, 0 critical | `1` |
| Production (`--omit=dev`) | 9 records: 4 moderate, 4 high, 1 critical | 12 records: 8 moderate, 4 high, 0 critical | `1` |

The higher affected-package totals do not represent new advisory IDs. The 20
direct Next advisories disappeared. npm now propagates the unchanged
`next > postcss` advisory through the peer-dependent aggregate records for
`@vercel/analytics`, `@vercel/speed-insights`, and `geist`, adding three
moderate package records to both graphs. `next` itself remains an aggregate
moderate record via PostCSS. Raw JSON is transient/CI evidence and is not
committed.

In the following tables, `R` means the repository root. “Production” reflects
npm's current dependency classification; Tailwind/PostCSS build tooling is
still classified as production in this manifest, so that label is not by
itself proof of runtime reachability.

### Next advisory paths removed by `15.5.20`

Every row had before path `R > next@15.1.11`, appeared in both full and
production audits, and is absent after the update. Disposition for every row:
**fixed by the supported Next 15 backport**.

| Advisory | Severity / vulnerable range | Mechanism and repository evidence | Baseline applicability |
| --- | --- | --- | --- |
| [GHSA-3h52-269p-cp9r](https://github.com/advisories/GHSA-3h52-269p-cp9r) | low; `>=15.0.0 <15.2.2` | Cross-origin Next dev server; `npm run dev` exists, but no exposed/untrusted dev-server deployment is configured | Low, high confidence |
| [GHSA-g5qg-72qw-gw5v](https://github.com/advisories/GHSA-g5qg-72qw-gw5v) | moderate; `>=15.0.0 <=15.4.4` | Image Optimizer cache-key confusion; no `next/image`, `images`, or `remotePatterns` usage | Not evidenced, high confidence |
| [GHSA-xv57-4mr9-wg8v](https://github.com/advisories/GHSA-xv57-4mr9-wg8v) | moderate; `>=15.0.0 <=15.4.4` | Image Optimization content injection; no image-optimizer usage | Not evidenced, high confidence |
| [GHSA-4342-x723-ch2f](https://github.com/advisories/GHSA-4342-x723-ch2f) | moderate; `>=15.0.0-canary.0 <15.4.7` | Middleware redirect SSRF; no middleware or redirect configuration | Not evidenced, high confidence |
| [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) | moderate; `>=10.0.0 <15.5.10` | Image Optimizer remote-pattern DoS; no optimizer/remote-pattern configuration | Not evidenced, high confidence |
| [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf) | high; `>=15.1.1-canary.0 <15.1.12` | Insecure React Server Component request deserialization; App Router/RSC is the root rendering path | Applicable surface existed, medium-high confidence |
| [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw) | critical; `>=15.0.0 <15.2.3` | Middleware authorization bypass; no middleware exists | Not evidenced, high confidence |
| [GHSA-ggv3-7p47-pfv8](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) | moderate; `>=9.5.0 <15.5.13` | Request smuggling in rewrites; no rewrites configured | Not evidenced, high confidence |
| [GHSA-3x4c-7xq6-9pq8](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8) | moderate; `>=10.0.0 <15.5.14` | Unbounded `next/image` disk cache; no image-optimizer usage | Not evidenced, high confidence |
| [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) | high; `>=13.0.0 <15.5.15` | Server Components DoS; App Router/RSC exists | Applicable surface existed, medium-high confidence |
| [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj) | high; `>=13.0.0 <15.5.16` | Server Components DoS; App Router/RSC exists | Applicable surface existed, medium-high confidence |
| [GHSA-3g8h-86w9-wvmq](https://github.com/advisories/GHSA-3g8h-86w9-wvmq) | low; `>=12.2.0 <15.5.16` | Middleware/proxy redirect cache poisoning; no middleware/proxy redirects | Not evidenced, high confidence |
| [GHSA-ffhc-5mcf-pf4q](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q) | moderate; `>=13.4.0 <15.5.16` | App Router CSP nonce XSS; App Router exists, but no nonce/CSP mechanism is configured | Feature precondition absent, high confidence |
| [GHSA-vfv6-92ff-j949](https://github.com/advisories/GHSA-vfv6-92ff-j949) | low; `>=13.4.6 <15.5.16` | RSC cache-busting collision; App Router/RSC exists | Applicable surface existed, medium confidence |
| [GHSA-gx5p-jg67-6x7h](https://github.com/advisories/GHSA-gx5p-jg67-6x7h) | moderate; `>=13.0.0 <15.5.16` | Untrusted `beforeInteractive` script input; no `next/script` usage | Not evidenced, high confidence |
| [GHSA-mg66-mrh9-m8jx](https://github.com/advisories/GHSA-mg66-mrh9-m8jx) | high; `>=15.0.0 <15.5.16` | Cache Components connection exhaustion; no Cache Components configuration | Not evidenced, high confidence |
| [GHSA-h64f-5h5j-jqjh](https://github.com/advisories/GHSA-h64f-5h5j-jqjh) | moderate; `>=10.0.0 <15.5.16` | Image Optimization API DoS; no image-optimizer usage | Not evidenced, high confidence |
| [GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r) | high; `>=13.4.13 <15.5.16` | WebSocket-upgrade SSRF; no upgrade handler or WebSocket route | Not evidenced, high confidence |
| [GHSA-wfc6-r584-vfw7](https://github.com/advisories/GHSA-wfc6-r584-vfw7) | moderate; `>=14.2.0 <15.5.16` | RSC response cache poisoning; App Router/RSC exists | Applicable surface existed, medium-high confidence |
| [GHSA-36qx-fr4f-26g5](https://github.com/advisories/GHSA-36qx-fr4f-26g5) | high; `>=12.2.0 <15.5.16` | Pages Router i18n middleware/proxy bypass; repository uses App Router and has no i18n/middleware config | Not applicable to present shape, high confidence |

### Advisory paths unchanged after the upgrade

For these rows, the listed installed path(s) and advisory set were identical
before and after. The “graph” column covers audit classification; the
mechanism/evidence column distinguishes actual repository use from npm's
classification. None was introduced by Project 9.

| Package / advisories / ranges | Installed path(s), before = after | Graph / mechanism and applicability | Disposition |
| --- | --- | --- | --- |
| `@babel/runtime@7.26.0`; moderate [GHSA-968p-4wvh-cqc8](https://github.com/advisories/GHSA-968p-4wvh-cqc8), `<7.26.10` | `R > react-force-graph-3d > 3d-force-graph > three-render-objects > polished > @babel/runtime` | Full + production. The rendering path is used, but the vulnerable named-capture transpilation operation is build/generated-code specific and no attacker-controlled transpilation exists. Low reachability, medium confidence. | Accepted residual; rendering-stack modernization under #6 |
| `@eslint/plugin-kit@0.2.5` and aggregate `eslint@9.18.0`; low [GHSA-xffm-g5w8-qvg7](https://github.com/advisories/GHSA-xffm-g5w8-qvg7), `<0.3.4` | `R > eslint > @eslint/plugin-kit`; aggregate `R > eslint` | Full/dev only. `npm run lint` uses the parser, but config comments/source are repository controlled. Low exposure, high confidence. | ESLint maintenance under #10 / #6 |
| `ajv@6.12.6`; moderate [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6), `<6.14.0` | `R > eslint > @eslint/eslintrc > ajv` | Full/dev only. ESLint configuration validation exists; no `$data` option or untrusted schema is configured. Not presently reachable, high confidence. | ESLint maintenance under #10 / #6 |
| `brace-expansion@1.1.11/2.0.1`; low/moderate [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw), `1.0.0–1.1.11` and `2.0.0–2.0.1`; [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v), `<1.1.13` and `2.0.0–2.0.2` | `R > eslint > @eslint/config-array > minimatch@3 > brace-expansion@1`; `R > typescript-eslint > typescript-estree > minimatch@9 > brace-expansion@2`; `R > tailwindcss > sucrase > minimatch@9 > brace-expansion@2` | Full; Tailwind path also production-classified. Build/lint glob expansion exists, but patterns are tool/repository controlled. Low exposure, medium-high confidence. | CSS/lint modernization under #10 |
| `flatted@3.3.1`; high [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f), `<3.4.0`; [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh), `<=3.4.1` | `R > eslint > file-entry-cache > flat-cache > flatted` | Full/dev only. ESLint is run without `--cache`, and there is no untrusted serialized cache input. Not presently reached, high confidence. | ESLint maintenance under #10 / #6 |
| `glob@10.4.5`; high [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2), `10.2.0–10.4.5` | `R > tailwindcss > sucrase > glob` | Full + production-classified build tool. The advisory requires glob CLI `-c/--cmd`; repository scripts never invoke it. Not reached, high confidence. | Tailwind/build patch under #10 |
| `js-yaml@4.1.0`; moderate [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m), `4.0.0–4.1.0`; [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), `4.0.0–4.1.1` | `R > eslint > @eslint/eslintrc > js-yaml` | Full/dev only. Lint config is JavaScript and repository controlled; no untrusted YAML/aliases path is present. Not presently reached, high confidence. | ESLint maintenance under #10 / #6 |
| `lodash-es@4.17.21`; high/moderate [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), `4.0.0–4.17.23`; [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh), `<=4.17.23`; [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg), `4.0.0–4.17.22` | `R > react-force-graph-3d > 3d-force-graph > kapsule > lodash-es` (also Kapsule through float-tooltip, three-forcegraph, and three-render-objects) | Full + production. Graph rendering reaches Kapsule, but repository data is static and no `_.template` imports-key or attacker-controlled `_.unset`/`_.omit` path was found. Package reachable; vulnerable operation not evidenced, medium confidence. | Rendering-stack modernization under #6 |
| `minimatch@3.1.2/9.0.5`; high [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), `<3.1.3` / `9.0.0–9.0.5`; [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), `<3.1.3` / `9.0.0–9.0.6`; [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74), `<3.1.4` / `9.0.0–9.0.6` | `R > eslint > @eslint/config-array > minimatch@3`; `R > typescript-eslint > typescript-estree > minimatch@9`; `R > tailwindcss > sucrase > glob > minimatch@9` | Full; Tailwind path also production-classified. Tooling glob patterns are repository/library controlled; no untrusted pattern source exists. Low exposure, medium-high confidence. | CSS/lint modernization under #10 |
| `picomatch@2.3.1`; moderate/high [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p), `<2.3.2`; [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj), `<2.3.2` | `R > tailwindcss > chokidar > anymatch > picomatch`; the same hoisted record is also used by Tailwind/TypeScript-ESLint/Next-plugin fast-glob paths | Full + production-classified. Build/watch/lint pattern matching exists, but patterns are library/repository controlled. Low exposure, medium-high confidence. | CSS/lint modernization under #10 |
| `postcss@8.5.1` and nested `8.4.31`; moderate [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), `<8.5.10` | `R > postcss@8.5.1`; `R > next@15.1.11/15.5.20 > postcss@8.4.31` | Full + production-classified build paths. CSS stringification is exercised during builds, but the repository has no user-supplied CSS parse/embed mechanism. Affected mechanism exists; direct exploitability appears low, medium confidence. | Direct copy owned by #10; nested copy accepted temporarily as detailed below |
| `yaml@2.4.5`; moderate [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp), `2.0.0–2.8.2` | `R > tailwindcss > postcss-load-config > yaml` | Full + production-classified build tool. Configuration is `postcss.config.mjs`, not YAML, so deeply nested YAML parsing is not exercised. Not presently reached, high confidence. | CSS/build modernization under #10 |

### npm aggregate records after the update

These are affected-package propagation records, not new advisory IDs:

| Aggregate record | After path / reason | Disposition |
| --- | --- | --- |
| `next` | `R > next@15.5.20 > postcss@8.4.31` | Same accepted nested PostCSS residual |
| `@vercel/analytics` | `R > @vercel/analytics` peers on affected aggregate `next` | No package-specific advisory; follows Next/PostCSS disposition |
| `@vercel/speed-insights` | `R > @vercel/speed-insights` peers on affected aggregate `next` | No package-specific advisory; follows Next/PostCSS disposition |
| `geist` | `R > geist` peers on affected aggregate `next` | No package-specific advisory; follows Next/PostCSS disposition |
| `eslint` | `R > eslint > @eslint/plugin-kit` | No separate advisory; follows plugin-kit disposition |

### Explicit PostCSS residual disposition

The stable supported `next@15.5.20` metadata pins
`postcss@8.4.31`, installed at:

```text
R > next@15.5.20 > postcss@8.4.31
```

That version remains in
[GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
/ CVE-2026-41305 (`<8.5.10`). It is a framework-owned build-time
transitive that cannot be removed by selecting a supported stable Next 15
release in this stage; the upstream dependency-path status is tracked in
[vercel/next.js#93604](https://github.com/vercel/next.js/issues/93604).
No blanket `overrides` entry, forced audit fix, or peer bypass was added.

This is an explicitly accepted **temporary residual**: builds exercise PostCSS
stringification, but this repository does not accept, parse, and embed
user-provided CSS, so current exploitability appears low. The direct
`R > postcss@8.5.1` copy is separately affected and its supported update belongs
to issue #10. Neither path is described as fixed, and the audit is not
described as clean.

## Rollback

The pre-upgrade rollback baseline is
`d88b1a1fb345b9976ea0d8dc520f10e76e84be3e`. Rollback must restore the
manifest, lockfile, dependency contract, and generated-entry ESLint contract
together:

```bash
git restore --source=d88b1a1fb345b9976ea0d8dc520f10e76e84be3e \
  package.json package-lock.json tests/toolchain.test.mjs eslint.config.mjs
npm ci
```

Run that clean install under Node `22.23.1` / npm `10.9.8` and re-run the
validation gates before redeploying. Never retain the new manifest with the old
lockfile or the old manifest with the new lockfile.

## Deviations from Plan

- **Phase 1 commit recovery:** Porch advanced after review without creating the
  mandatory phase artifact commit. The builder updated the plan evaluation and
  created the planned atomic dependency commit `0c57149`; protocol state
  remained Porch-managed.
- **Phase 2 ESLint compatibility:** Next `15.5.20` generates an ignored
  `next-env.d.ts` whose route-types reference was still traversed by flat
  ESLint. With architect approval, the generated root file was added to the
  existing global ignore list and its exact-ignore contract. No application,
  dependency, or lockfile surface changed.
- **Phase 2 item 11:** the original plan expected all twelve manual checks to
  pass. The right-click result was baseline-identical in the available
  renderer. Per the specification's mouse-input caveat and architect direction,
  it is an explicit failed/unverifiable, out-of-scope follow-up rather than a
  hidden pass or an unrelated application change.
- **Phase 2 commit recovery:** Porch repeated the missing artifact-commit
  transition. The builder created and verified `e8813d6` without editing
  protocol state.

## Lessons Learned

### What Went Well

- Exact toolchain and registry verification prevented a nominal “latest”
  install from crossing into Next 16 or a React canary.
- A complete lock-record comparison made the sizeable Sharp optional-subtree
  movement attributable instead of treating all lock churn as trusted.
- Contract tests turn the six-version group, single React runtime, lock-root
  synchronization, and narrow generated ignore into durable invariants.
- Replaying item 11 against the rollback baseline separated dependency drift
  from a renderer/input limitation and prevented unrelated graph changes.
- Audit exits remained diagnostic evidence; structural validation and
  advisory/path analysis prevented both a false green gate and a false clean
  claim.

### Challenges Encountered

- Next's generated `next-env.d.ts` became a flat-ESLint traversal entry point
  only after building the upgraded framework. The narrow ignore plus
  exact-list test resolved it without weakening source/test coverage.
- Software-WebGL timing made the node left-click raycast sensitive to camera
  movement. Freezing the existing rotation timer only between physical
  pointer-down/up allowed the real handler to be observed.
- Right-click release could not be qualified in the available renderer. Exact
  rollback parity and a bounded headed attempt produced an honest limitation
  rather than speculative application code.
- Porch advanced both implementation phases before making the required
  artifact commit. The branch was recovered with named commits while leaving
  `status.yaml` entirely under Porch control.

### What Would Be Done Differently

- Prepare a native-GPU/manual browser lane before the manual matrix begins so a
  renderer-specific mouse-button result has an immediate independent check.
- Generate the durable audit/path table from a checked script during
  qualification rather than formatting it only during Review.
- Verify the phase artifact commit immediately after every Porch transition
  and stop sooner if the transition omitted it.

### Methodology Improvements

- Porch should block phase transition until the named artifact commit exists,
  not only until consultations approve.
- Consultation commands should always write to repository-relative output
  paths so resumed sessions and Review synthesis can find the complete record.
- Upgrade plans with manual behavior gates should define baseline replay as the
  first classification step for any failed interaction.

### Systematic Findings

- npm audit affected-package totals can increase even when advisory IDs are
  removed because transitive/peer aggregate propagation changes. Security
  review must compare advisory identities and installed paths, not totals alone.
- Generated framework entry points can bypass directory ignores in flat lint
  configurations. Exact ignore-contract tests should guard generated root files
  without excluding application or test prefixes.
- Environment-sensitive WebGL input checks need renderer and physical input
  evidence in addition to DOM-level outcomes.

## Architecture Updates

No architecture update was needed. The dependency backport preserves the
App Router server/client boundary, WebGL island, deployment shape, validation
commands, and runtime behavior. The `next-env.d.ts` ignore is a narrow
validation compatibility detail enforced beside the existing lint contract,
not a new system-shape invariant worthy of either architecture tier.

## Lessons Learned Updates

Added one cold-tier entry to `codev/resources/lessons-learned.md` under
**Validation Evidence**: replay an upgrade-sensitive browser failure against
the rollback baseline and record the exact physical input/renderer instead of
claiming broad coverage. This is durable validation guidance but does not need
a new scarce HOT-tier slot; `lessons-critical.md` already directs builders to
verify the real user path and its cold-doc map already includes Validation
Evidence.

## Consultation Feedback

### Specify Phase — Round 1

#### Gemini

- **Concern:** All six target packages should remain exact pins, not only the
  React pair.
  - **Addressed:** The constraints and FR2 explicitly require exact versions
    without range operators for all six entries.

#### Codex

- No concerns raised — APPROVE.

#### Claude

- No concerns raised — APPROVE.

### Plan Phase — Round 1

#### Gemini

- No concerns raised — APPROVE.

#### Codex

- **Concern:** React Compiler preservation should inspect likely configuration
  surfaces, not only application components.
  - **Addressed:** Phase 2 added inspection of `next.config.js`,
    `package.json`, and any Babel configuration. No compiler enablement was
    found or introduced.

#### Claude

- No concerns raised — APPROVE.

### Dependency Baseline Phase — Round 1

Gemini, Codex, and Claude approved with no concerns. Each confirmed the exact
six-package group, synchronized lockfile v3, meaningful contract tests, single
React runtime, retained PostCSS residual, and unchanged application surface.

### Production Qualification Phase — Round 1

#### Gemini

- No concerns raised — APPROVE.

#### Codex

- **Concern:** Matrix item 11 did not pass, so the phase should not be
  represented as complete or as a 12/12 qualification.
  - **Rebutted:** The builder agreed with the factual failure but demonstrated
    identical physical-input behavior on rollback baseline `fef4da9`, cited
    FR7's environment caveat, and followed explicit architect direction not to
    change application code or block the dependency patch solely on this
    pre-existing result. No 12/12 claim was made.

#### Claude

- No concerns raised — APPROVE. Claude specifically found the limitation and
  narrow ESLint deviation honestly documented and scoped.

### Production Qualification Phase — Round 2

#### Gemini

- No concerns raised — APPROVE.

#### Codex

- **Concern:** Item 11 remains unqualified and must never be represented as a
  literal 12/12 pass; no code change was requested.
  - **Addressed:** The plan, thread, and this review keep item 11 explicitly
    failed/unverifiable, preserve rollback parity, and claim only items 1–10
    and 12.

#### Claude

- No concerns raised — APPROVE. Claude agreed that the baseline-identical
  limitation was properly handled under the architect's scope decision.

## Flaky Tests

No flaky tests were encountered and no test was skipped.

## Technical Debt

- Manual matrix item 11 still needs qualification on a genuinely distinct
  native renderer/input environment; it is baseline-identical and not upgrade
  drift.
- The direct and nested PostCSS findings and the remaining CSS/lint/build
  residuals remain for issue #10.
- Force-graph/Kapsule/Lodash and Babel-runtime residuals remain for the staged
  3D/dependency modernization under parent issue #6.
- Next 16 remains a separate strategic migration after this supported baseline.

## Follow-up Items

- Issue #10: direct PostCSS/Tailwind/Autoprefixer and lint-stack patching,
  classification cleanup, and audit rerun.
- Parent issue #6: staged 3D dependency modernization and subsequent Next 16
  migration.
- Re-run item 11 with a native GPU/browser environment capable of producing a
  result distinct from SwiftShader; do not reopen Project 9 as an upgrade
  regression unless behavior differs from its rollback baseline.
