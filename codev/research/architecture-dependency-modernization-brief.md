# Research Brief: Architecture and Dependency Modernization

**Project:** Issue #4, “Research architecture and dependency modernization”
**Research date:** 2026-07-17
**Decision to inform:** Produce an evidence-based dependency modernization roadmap before any implementation begins.

## Precise research question

From an architectural-decision perspective, what is the current state of this
Next.js 3D force-graph repository, and which direct dependencies should be
updated, removed, or reclassified; to what exact versions or bounded version
families; in what order; and why?

The answer must balance currency and security with compatibility and migration
risk. It must distinguish an immediately actionable target from a target that
needs a proof-of-concept or further evidence.

## Repository baseline to verify

Treat these as observed starting points, not as substitutes for inspecting the
repository:

- Next.js App Router application with a server `app/page.tsx`, a client wrapper
  using `next/dynamic({ ssr: false })`, and a client-only WebGL graph component.
- The graph uses `react-force-graph-3d`, Three.js classes, and
  `TrackballControls`; it mutates the graph camera, controls, and scene and uses
  timers and React hooks for interaction.
- npm is the apparent package manager. `package-lock.json` is lockfile version
  3 and contains roughly 429 package records. There is no declared
  `packageManager` field or `engines` policy in `package.json`.
- Available scripts are `dev` (`next dev --turbopack`), `build`
  (`next build`), `start` (`next start`), and `lint` (`next lint`). There are no
  committed automated tests, browser tests, typecheck script, or explicit
  security-audit script.
- Configuration includes Next.js, TypeScript, ESLint flat config, Tailwind 3,
  PostCSS, and Autoprefixer. `skipLibCheck` is enabled.

Verify this baseline against the checked-out files and call out any correction.
Clearly label:

1. **Observed repository facts**
2. **Externally verified current facts**
3. **Recommendations or inferences**

## Required targets

The required class is **every direct production and development dependency in
this repository, plus material transitive dependencies that affect runtime,
security, or migration feasibility**. Each direct dependency below must receive
its own row in the decision matrix and specific analysis; do not silently omit
one. If reliable current information cannot be found, say “No information
found” and bound the uncertainty.

### Direct production dependencies

| Package | Declared version/range |
|---|---:|
| `@types/three` | `~0.172.0` |
| `@vercel/analytics` | `~1.4.1` |
| `@vercel/speed-insights` | `~1.1.0` |
| `autoprefixer` | `10.4.20` |
| `geist` | `~1.3.1` |
| `next` | `15.1.11` |
| `postcss` | `8.5.1` |
| `react` | `19.0.0` |
| `react-dom` | `19.0.0` |
| `react-force-graph-3d` | `~1.26.0` |
| `tailwindcss` | `3.4.17` |
| `three` | `~0.172.0` |

### Direct development dependencies

| Package | Declared version/range |
|---|---:|
| `@eslint/compat` | `~1.2.5` |
| `@eslint/js` | `~9.18.0` |
| `@next/eslint-plugin-next` | `15.1.6` |
| `@types/node` | `~22.10.7` |
| `@types/react` | `19.0.7` |
| `@types/react-dom` | `19.0.3` |
| `encoding` | `~0.1.13` |
| `eslint` | `~9.18.0` |
| `eslint-plugin-react` | `~7.37.4` |
| `eslint-plugin-react-hooks` | `5.1.0` |
| `globals` | `~15.14.0` |
| `typescript` | `~5.7.3` |
| `typescript-eslint` | `~8.21.0` |

### Coupled stacks requiring dedicated sections

1. **Framework/runtime:** Next.js, React, React DOM,
   `@next/eslint-plugin-next`, React/DOM types, Node support, App Router,
   React Server Components, and any applicable React compiler changes.
2. **3D/WebGL:** Three.js, `@types/three`, `react-force-graph-3d`, and important
   peer/transitive packages (including the underlying force-graph, renderer,
   controls, React adapter, and any duplicated Three.js risk). Check whether
   Three.js now ships sufficient types and whether separate `@types/three`
   remains appropriate.
3. **CSS pipeline:** Tailwind CSS, PostCSS, and Autoprefixer, including the
   Tailwind 3-to-current migration model, config/CSS changes, browser support,
   and whether packages should move between dependency classes.
4. **Language/lint toolchain:** TypeScript, Node/React types, ESLint flat
   config, `@eslint/*`, `typescript-eslint`, React and Hooks plugins, `globals`,
   and Next’s linting/build integration. Determine whether `encoding` is used,
   transitively required, obsolete, or misclassified.
5. **Hosted observability/runtime utilities:** Vercel Analytics, Speed
   Insights, and `geist`, including current integration guidance, privacy or
   runtime implications, and whether Next now provides a preferable font path.

Also discover material transitive members of these classes that were not named
above. Focus on packages that impose peer constraints, duplicate heavyweight
runtime code, carry relevant advisories, or materially change the migration
sequence; do not inventory all lockfile entries mechanically.

## Questions each investigator must answer

1. What is the current architecture and dependency graph, including
   server/client and SSR boundaries, WebGL lifecycle, build/runtime assumptions,
   package-manager/lockfile state, and validation capabilities?
2. As of 2026-07-17, what are the latest stable releases and supported/LTS
   version families for every direct package? What Node and browser baselines,
   peer requirements, and framework support policies constrain the choices?
3. For every direct package, should it be **urgent**, **recommended**,
   **optional**, **blocked**, **remove**, **replace**, or **reclassify**? Give
   current resolved version, recommended target/action, priority, risk,
   grouping constraints, and rationale.
4. Which migration guides, breaking changes, deprecations, or security
   advisories apply between the repository’s current version and the proposed
   target? Do not infer vulnerability solely from a version number: verify the
   affected range and repository exposure.
5. What compatibility risks are specific to this client-only 3D application:
   Next/React server-client boundaries, dynamic import/SSR behavior, Strict
   Mode and hooks, force-graph refs and peer support, Three.js runtime/type
   drift, WebGL/browser/GPU behavior, Turbopack/build changes, CSS changes, and
   lint/type changes?
6. Which upgrades must be grouped, and which should be isolated? Propose a
   staged order with preconditions, validation and rollback gates, and clear
   stopping criteria.
7. What minimal missing quality/security tooling is necessary to modernize
   safely? Keep this strictly tied to dependency validation, not a general
   product wishlist.
8. What should be deferred, and what evidence or experiment would unblock it?

## Evidence and method

- Inspect `package.json`, `package-lock.json`, application/config files, and
  relevant git history. Do not modify dependencies, regenerate the lockfile, or
  edit application code.
- Prefer primary, current sources: official release/support/migration
  documentation, package manifests and registries, maintainers’ repositories
  and changelogs, GitHub Security Advisories, NVD/CVE records, and official
  Node/browser support tables. Use secondary sources only to supplement them.
- Link evidence directly and give an access date. Separate a package’s latest
  published version from the version actually recommended for this repository.
- Check release dates and support status rather than assuming “latest major” is
  best. Note prerelease versus stable status explicitly.
- Report confidence (`high`, `medium`, or `low`) on key claims. Be candid about
  unavailable evidence and contradictions. Record surprising findings.
- Independently investigate. Do not rely on or attempt to infer what the other
  investigators concluded.

## Scope boundaries

### In scope

- Repository and lockfile inspection
- Architecture and compatibility analysis
- Current release, support, peer, migration, and advisory research
- Per-package decisions, modernization sequencing, validation, rollback, and
  narrowly relevant quality/security gaps

### Out of scope

- Editing dependency manifests or application/configuration code
- Regenerating `package-lock.json`
- Implementing or testing migrations
- General feature, design, performance, accessibility, or testing wishlists
  unrelated to safe modernization
- Treating an unactionable “upgrade everything to latest” list as a roadmap

## Required investigation output

Produce a standalone investigation with:

1. Baseline corrections and current-state architecture
2. A dedicated section for each of the five coupled stacks
3. A decision-matrix row for **every direct dependency**
4. Material transitive/security findings
5. Compatibility constraints and a staged roadmap with gates/rollback
6. Deferrals and minimum tooling gaps
7. Sources with access dates
8. Confidence annotations, evidence gaps, disagreements within sources, and
   surprises

Aim for sufficient depth to support the final decision (approximately
3,000–5,000 words plus tables), while prioritizing precise evidence over
length.

## Acceptance criteria for the final synthesis

The final report must stand alone and include:

- Scope summary and executive recommendation
- Verified current-state architecture and dependency graph
- Per-package current → target/action → priority/risk/rationale matrix
- Dedicated analysis of all five coupled stacks
- Current support, peer, migration, security, browser, and Node constraints
- Phased roadmap with grouping, validation, rollback, and stop/go gates
- Urgent, recommended, optional, blocked, removed/reclassified, and deferred
  decisions stated distinctly
- Evidence links with access dates and confidence annotations
- Explicit gaps/limitations, disagreements and resolution, and changes made
  after three-way critique
- Clear separation of observed facts, external facts, and recommendations
