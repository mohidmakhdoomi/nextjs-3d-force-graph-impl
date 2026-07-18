# Specification 9: Patch Next 15 and React to the Supported Security Baseline

## Summary

Move the existing App Router application from `next@15.1.11` and React
`19.0.0` to the supported Next 15 backport and current stable React 19 package
group without beginning the separate Next 16 migration. The manifest and npm
lockfile must change as one reproducible unit under the repository's exact
Node.js `22.23.1` / npm `10.9.8` contract.

The intended package group is:

| Package | Checked-in version | Intended target |
| --- | ---: | ---: |
| `next` | `15.1.11` | `15.5.20` |
| `@next/eslint-plugin-next` | `15.1.6` | `15.5.20` |
| `react` | `19.0.0` | exact `19.2.7` |
| `react-dom` | `19.0.0` | exact `19.2.7` |
| `@types/react` | `19.0.7` | `19.2.17` |
| `@types/react-dom` | `19.0.3` | `19.2.3` |

These versions and all relevant peer ranges must be reverified when
implementation begins. As a specify-time observation on 2026-07-18,
`next@15.5.20` is the npm `backport` release, React `19.2.7` is the npm
`latest` release, and all six intended artifacts are published. This
observation does not replace the required implementation-time verification.

Success means a clean supported peer tree, unchanged server/client and WebGL
boundaries, all repository validation gates passing, the complete documented
graph interaction matrix passing in Chromium, and a durable path-by-path audit
comparison. It does **not** mean that `npm audit` becomes clean: Next
`15.5.20` still pins nested `postcss@8.4.31`, and the repository's separate
CSS/build modernization issue owns the direct PostCSS update.

## Problem Analysis

### Current state

- The lockfile resolves `next@15.1.11`, which is within multiple current
  advisory ranges and is behind the supported Next 15 backport line.
- The framework lint plugin is skewed at `15.1.6` rather than matching the
  framework.
- React and React DOM resolve together at `19.0.0`; their type packages remain
  on the corresponding early React 19 line.
- Next currently accepts React `^19.0.0`, and React DOM currently requires a
  matching React 19 peer. The proposed newer package group must prove the same
  compatibility through actual clean npm resolution rather than assumption.
- The repository now has the prerequisite reproducibility and lifecycle work
  from issues #7 and #8: an exact Node/npm contract, `npm ci`, lint, typecheck,
  production build/start, a real Chromium WebGL smoke, audit evidence
  collection, and idempotent graph resource cleanup.
- The application uses App Router server components in `app/layout.tsx` and
  `app/page.tsx`. `FocusGraphWrapper.tsx` is a client component that dynamically
  imports the WebGL graph with `{ssr: false}`. This is an intentional boundary.
- The checked-in dependency graph contains both the direct
  `postcss@8.5.1` build dependency and Next's pinned nested
  `postcss@8.4.31`. Neither is remediated by changing only the framework/React
  group in this issue.

### Desired state

- Next and its ESLint plugin resolve on the same supported `15.5.x` backport.
- React and React DOM resolve exactly together on stable React `19.2.x`, with
  compatible current React 19 type packages.
- A fresh `npm ci` under the exact declared toolchain succeeds without peer
  bypass flags and produces one React runtime.
- The lockfile contains only expected registry sources, expected majors, and
  explainable transitive changes attributable to the target group.
- Static validation, production build/start, WebGL smoke, and the full manual
  Chromium interaction matrix demonstrate preserved behavior.
- Full and production audit changes are reviewed by advisory and dependency
  path. Fixed findings, inapplicable feature paths, applicable paths, and
  unresolved residuals are distinguished explicitly.
- The review accurately retains the nested `postcss@8.4.31` risk and points to
  its upstream advisory rather than forcing an unsupported override or claiming
  zero findings.

### Stakeholders

- **Repository maintainers** need the smallest support/security backport that
  can serve as a safe base for the later Next 16 migration.
- **Users** need the rendered graph and every documented interaction to remain
  usable.
- **Hosting operators** need a reproducible production build, a supported peer
  tree, and an accurate account of remaining framework/build exposure.

No other stakeholder or support-policy requirement applies beyond issue #9,
parent issue #6, and the architecture/dependency modernization report.

## Confirmed Decisions

The issue and the architect's 2026-07-18 clarification fix these decisions:

1. Remain on Next 15 and React 19 in this stage. Next 16 is separate work.
2. Upgrade Next, its lint plugin, React, React DOM, and the React type packages
   as one coupled target group.
3. Keep the App Router server/client boundary and the `{ssr: false}` dynamic
   WebGL island.
4. Chromium is the only browser required for automated and manual validation
   in this stage.
5. Manual validation covers the complete current graph interaction matrix, not
   only the three button controls in the automated smoke.
6. Commit durable audit totals, path-by-path diffs, applicability conclusions,
   and residual-risk dispositions in the review document only. Do not commit
   generated audit JSON; existing CI artifacts remain the raw evidence channel.
7. Do not bypass npm peer checks and do not use an unsupported blanket
   dependency override.
8. Preserve the nested `postcss@8.4.31` finding with an explicit risk
   disposition and upstream reference.

## Scope

### In scope

- Reverify publication, dist-tags/support status, engine requirements,
  dependency metadata, and peer ranges for every intended target immediately
  before changing the manifest.
- Update only the six named direct package entries to the verified Next 15 /
  React 19 target group.
- Regenerate `package-lock.json` with the repository's exact npm version and
  review the complete lockfile diff.
- Confirm the root lockfile metadata matches the manifest and remains lockfile
  v3.
- Run a clean locked install and inspect npm's resolved peer tree.
- Prove there is exactly one installed/resolved React runtime and a matching
  React DOM.
- Confirm the framework and lint plugin remain version-aligned.
- Inspect expected transitive changes, including Next's platform SWC packages,
  `@next/env`, `styled-jsx`, `scheduler`, `csstype`, and the nested PostCSS
  subtree.
- Run lint, typecheck, tests, production build, production start, and the
  existing browser smoke.
- Manually exercise the complete documented graph interaction matrix in
  Chromium against the production application.
- Capture before/after full and production audit results and review every
  advisory path and disposition.
- Add or adjust narrowly scoped dependency-contract tests if necessary to make
  the intended package/lockfile invariants durable.
- Record implementation evidence, audit analysis, drift, and residual risk in
  `codev/reviews/9-patch-next-15-and-react-to-the.md`.

### Out of scope

- Next 16, its codemods, default-Turbopack migration work, or other strategic
  framework-major changes.
- Any Three.js, `@types/three`, force-graph, or related 3D dependency update.
- Tailwind 4 or any other Tailwind-major migration.
- The direct PostCSS, Tailwind 3, Autoprefixer, ESLint 9 ecosystem, dependency
  reclassification, or `encoding` cleanup owned by issue #10.
- React Compiler enablement or configuration.
- Product features, visual redesign, graph behavior changes, or unrelated code
  cleanup/refactoring.
- Broad browser qualification beyond Chromium.
- Committing generated npm audit JSON snapshots.
- Automatic `npm audit fix`, `--force`, `--legacy-peer-deps`, or blanket
  `overrides`.

## Constraints and Invariants

- Use exactly Node.js `22.23.1` and npm `10.9.8` for installation, lockfile
  generation, and validation. A local shell running a different patch must not
  regenerate the lockfile.
- `package.json` and `package-lock.json` form one atomic change and one rollback
  unit. Neither may be committed or reverted independently.
- `npm ci` is the clean-install proof. A successful pre-existing
  `node_modules` tree is not evidence.
- All six target entries must remain exact versions, preserving the manifest's
  existing no-range convention. React and React DOM must additionally be
  identical; a mismatched pair, prerelease, canary, or experimental React build
  is not acceptable.
- The intended Next and lint-plugin versions must match.
- Version drift discovered at implementation time must be documented. Do not
  silently substitute a newer major, prerelease, unsupported release, or a
  different package grouping. If the researched target is no longer the
  appropriate supported Next 15 / stable React 19 release, pause for architect
  confirmation before substituting.
- npm peer conflicts, invalid peer markers, or install warnings may not be
  hidden with flags or configuration.
- All resolved package tarballs must come from the expected npm registry unless
  an existing intentional source is identified and explained. No new git,
  file, HTTP, or unknown registry source is permitted.
- The lockfile must not introduce an unexpected package major or duplicate
  React runtime. Incidental transitive changes must be attributable to changed
  parent ranges or documented separately.
- `app/page.tsx` and `app/layout.tsx` remain server components.
  `FocusGraphWrapper.tsx` remains the client boundary and retains a dynamic
  `{ssr: false}` import for `FocusGraph`.
- Compatibility failures must not be "fixed" through unrelated graph
  lifecycle, Three.js, CSS, or lint-stack cleanup.
- Audit commands are diagnostic evidence and may exit nonzero when findings
  exist. Their nonzero vulnerability status is not suppressed or misreported,
  while malformed output or registry failure is not acceptable evidence.
- Audit applicability is feature-specific and path-specific. "Not currently
  exercised" is not synonymous with "not vulnerable"; it must be paired with
  the actual repository feature evidence and an explicit residual disposition.
- The known nested `postcss@8.4.31` copy must remain visible in the review even
  if unrelated audit totals improve.

## Solution Exploration

### Approach A: Update only Next

Move `next` to the backport while retaining the old lint plugin and React
packages.

**Advantages**

- Smallest textual manifest diff.
- Could remove some direct Next advisory ranges.

**Disadvantages**

- Leaves framework/plugin skew.
- Does not establish the researched React security/support baseline.
- Fails the coupled target-group requirement and weakens peer-resolution
  confidence.

**Complexity:** low.  
**Risk:** medium-to-high due to version skew and incomplete remediation.  
**Disposition:** rejected.

### Approach B: Jump directly to Next 16

Move to the current Active LTS framework and combine its migration with React
alignment.

**Advantages**

- Reaches the strategic framework target immediately.
- Avoids a temporary maintenance-line baseline.

**Disadvantages**

- Mixes urgent security work with breaking framework/tooling changes.
- Changes build and browser assumptions and requires separate migration
  analysis.
- Violates the issue's fixed Next 15 decision and makes regressions harder to
  isolate.

**Complexity:** high.  
**Risk:** high for an urgent backport.  
**Disposition:** rejected and deferred to issue #12.

### Approach C: Atomically update the supported Next 15 / React 19 group

Reverify and update the six direct entries together, regenerate the npm
lockfile once under the pinned toolchain, inspect peers and transitives, run
the existing validation surface plus manual Chromium UX, and document audit
diffs and residuals without unrelated upgrades.

**Advantages**

- Honors upstream peer coupling and framework/plugin alignment.
- Produces the smallest supported backport before Next 16.
- Keeps regression attribution focused.
- Uses the baseline and lifecycle defenses already established by issues #7
  and #8.

**Disadvantages**

- Cannot make the audit clean because direct and nested PostCSS work belongs to
  another stage.
- Requires careful path-by-path audit and lockfile review rather than relying on
  install/build success.
- A framework patch jump may still alter transitive SWC, scheduler, or runtime
  behavior.

**Complexity:** medium.  
**Risk:** manageable with exact toolchain use, peer inspection, lockfile
review, production validation, and full UX verification.  
**Disposition:** selected.

## Functional Requirements

### FR1 — Implementation-time target verification

Before manifest modification, evidence MUST record for each intended package:

- that the exact artifact is published;
- relevant dist-tag/support status;
- declared Node engine requirements;
- direct dependencies that materially affect the lockfile; and
- peer ranges linking Next to React/DOM, React DOM to React, and React DOM types
  to React types.

At minimum, verification MUST confirm:

- the chosen Next 15 release is the supported backport target;
- the chosen React release is stable React 19;
- Next's peer range accepts both chosen React packages;
- React DOM's React peer accepts the exact chosen React version;
- `@types/react-dom` accepts the chosen `@types/react`; and
- the repository's exact Node version satisfies every relevant engine.

Any difference from the intended target table MUST be recorded and resolved
under the drift constraint before installation.

### FR2 — Atomic manifest and lockfile update

- `package.json` MUST express the verified six-package group as exact versions
  without carets or tildes.
- `react` and `react-dom` MUST use exact identical versions.
- `next` and `@next/eslint-plugin-next` MUST use the same supported Next 15
  version.
- The React type versions MUST remain compatible with each other and the stable
  React 19 API line.
- `package-lock.json` MUST be regenerated with npm `10.9.8`, remain lockfile v3,
  and synchronize its root dependency metadata with the manifest.
- No other direct dependency version or classification may change.

### FR3 — Supported peer and runtime tree

From a clean working tree state after lockfile generation:

- `npm ci` MUST succeed without `--force`, `--legacy-peer-deps`, or equivalent
  bypass configuration.
- npm inspection MUST report no invalid or unmet React/DOM/Next peer.
- The installed and locked tree MUST contain one React runtime version, exactly
  matching React DOM's peer.
- The tree MUST not contain a prerelease/experimental React runtime.
- The Next framework and lint plugin MUST resolve to their intended matching
  versions.

### FR4 — Lockfile provenance and transitive review

The complete lockfile diff MUST be reviewed rather than accepting npm's output
unexamined. The review MUST record:

- all changed, added, and removed package records;
- the parent/direct-range reason for each material transitive change;
- any changed engine, optional dependency, peer, integrity, or registry source
  metadata that affects reproducibility;
- all Next native SWC packages selected for supported platforms;
- the React scheduler and React type-support subtrees;
- confirmation that no unrelated direct package or unexpected major moved;
- confirmation that no unexplained source appeared; and
- confirmation of a single React runtime.

Expected target-group transitive movement is not automatically suspicious, but
it must still be attributable. Unexplained churn blocks completion.

### FR5 — Architecture preservation

- The root page MUST continue to render through the App Router server component
  path.
- Static graph data MUST continue to cross into the same client wrapper.
- The WebGL implementation MUST continue to be dynamically loaded with
  server-side rendering disabled.
- The production page MUST have no new hydration, page, console, or WebGL
  errors.
- No React Compiler behavior may be introduced.

### FR6 — Automated validation

After a clean `npm ci`, the exact repository commands MUST prove:

1. contract/unit tests pass;
2. ESLint passes;
3. TypeScript `--noEmit` passes;
4. the Next production build succeeds;
5. `next start` serves the production application successfully; and
6. the Playwright Chromium smoke passes against that production server,
   including a real initialized WebGL drawing buffer and the axes, reset, and
   rotation control transitions.

The aggregate `npm run validate` gate MUST remain green. Direct build/start
evidence MUST also be recorded so a browser-server lifecycle failure is
diagnosable.

### FR7 — Complete manual Chromium interaction matrix

Against the production build in Chromium, manual UX verification MUST exercise
and record all current documented behaviors:

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

### FR8 — Full and production audit comparison

Run and retain raw CI evidence for both:

- the complete dependency graph (`npm audit`); and
- the production graph (`npm audit --omit=dev`).

The review document MUST contain durable before/after totals and a
path-by-path table. For every advisory/path present in either baseline or
updated result, record:

- package, advisory identifier/URL, severity, and vulnerable range;
- before and after root-to-affected-package paths;
- production or development/build classification;
- whether the upgrade fixed, added, removed, or left the path unchanged;
- the repository feature or build/runtime mechanism needed to exercise it;
- evidence of whether that mechanism exists here;
- applicability/reachability conclusion with confidence; and
- remediation owner, accepted residual, or other explicit disposition.

Totals alone do not satisfy this requirement. If npm coalesces several paths
into one advisory record, all relevant installed paths still require review.

### FR9 — PostCSS residual disposition

The final review MUST explicitly record that:

- the supported Next `15.5.20` package metadata pins nested
  `postcss@8.4.31`;
- that copy remains within
  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
  / CVE-2026-41305 according to the modernization research;
- it is a framework-owned build-time transitive and cannot be eliminated by a
  supported Next 15 release selection in this stage;
- no unsupported blanket override is applied;
- it is an explicitly accepted temporary residual tracked through the upstream
  framework/dependency path and later modernization work; and
- the separate direct `postcss@8.5.1` update is owned by issue #10 and is not
  misrepresented as fixed here.

The review MUST link the upstream advisory and identify the actual installed
path after regeneration.

### FR10 — Rollback

- The pre-upgrade commit is the rollback baseline.
- Rollback MUST restore `package.json` and `package-lock.json` together.
- Any dependency-contract test changed solely for this upgrade MUST roll back
  in the same operation.
- A rollback MUST be followed by `npm ci` under the exact toolchain to prove the
  old graph is restored.
- Rollback MUST never retain a new manifest with an old lockfile or vice versa.

## Non-Functional Requirements

### Security and support accuracy

- Do not claim a supported or secure state based only on version numbers.
- Do not claim the audit is clean while either PostCSS copy or another finding
  remains.
- Do not describe a non-exercised feature path as impossible without evidence.
- Do not use peer or audit bypasses to create a nominally successful result.

### Reproducibility

- All dependency-changing work uses the declared Node/npm pair.
- A fresh checkout can reproduce the installed graph with `npm ci`.
- Manifest/lock synchronization and registry provenance are reviewable in git.

### Behavior preservation

- No intentional product, visual, server/client-boundary, or graph-interaction
  change is allowed.
- Automated and manual validation use the real production application and real
  WebGL implementation rather than mocks.

### Maintainability

- Audit conclusions are concise but durable in the review document.
- Generated JSON remains in CI artifacts, avoiding volatile repository
  snapshots.
- Any test added for version invariants checks externally meaningful package
  and lockfile behavior rather than npm implementation details.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Researched versions drift before implementation | An obsolete target could be selected | Reverify immediately before editing; document drift; require architect confirmation for substitution |
| React/DOM peer mismatch or duplicate runtime | Runtime hooks/rendering failure | Exact pair, clean `npm ci`, peer/tree inspection, single-runtime proof |
| Next patch changes framework transitives unexpectedly | Build/runtime or supply-chain regression | Full lockfile source/major/integrity review and production validation |
| App Router or client-only WebGL boundary regresses | Hydration/server execution failure | Source invariant review plus production Chromium smoke |
| Install/build passes while graph behavior regresses | User-facing breakage | Complete manual interaction matrix, not only build/smoke |
| Audit totals improve but applicable paths remain | False security claim | Before/after path-by-path applicability table |
| Nested PostCSS remains vulnerable | Known build-time residual | Explicit advisory/path/risk disposition; no blanket override; track upstream and #10 |
| Wrong npm patch rewrites lockfile | Non-reproducible churn | Enforce Node `22.23.1` / npm `10.9.8` before regeneration |
| Unrelated modernization enters the diff | Hard-to-bisect regression | Six-package direct scope, lockfile attribution, reject unrelated manifest/code cleanup |

## Acceptance Scenarios

### Scenario 1 — Verified supported target group

Given implementation has not modified the manifest, when registry/support and
peer metadata are rechecked, then every selected artifact is published,
supported within the fixed Next 15 / React 19 decision, compatible with the
exact Node baseline, and any drift is documented before proceeding.

### Scenario 2 — Reproducible clean installation

Given the atomic manifest/lockfile update was generated with npm `10.9.8`, when
the install tree is removed and `npm ci` runs, then installation succeeds
without bypass flags and npm reports no invalid or unmet target-group peer.

### Scenario 3 — Lockfile integrity

Given the updated lockfile, when its root metadata, sources, majors, target
subtrees, and React runtime instances are inspected, then the root matches the
manifest, every changed record is explained, sources are expected, and exactly
one stable React runtime is present.

### Scenario 4 — Static and production validation

Given the clean installed graph, when tests, lint, typecheck, build, start,
smoke, and aggregate validation run, then each required green gate passes
without suppressions and the production WebGL page reports no unexpected
errors.

### Scenario 5 — Complete graph UX

Given the production page in Chromium, when the maintainer performs the
complete manual interaction matrix, then delayed pointer enablement, rotation,
buttons, Trackball navigation, node fix/focus/release behavior, and rendering
remain observably equivalent.

### Scenario 6 — Honest audit delta

Given before and after full/production audit evidence, when each advisory path
is compared, then the review identifies what changed, why the path is or is not
applicable to current repository features, and who owns each remaining risk.
Nested `next > postcss@8.4.31` remains explicit.

### Scenario 7 — Atomic rollback

Given a failure requires rollback, when the upgrade is reverted, then the
manifest, lockfile, and upgrade-specific contract test return to the same
pre-upgrade commit and a fresh `npm ci` restores that prior graph.

## Open Questions

### Critical

None. The architect resolved the environment, evidence, stakeholder, and
framework-major decisions.

### Important

- Do implementation-time registry/support checks reveal a newer appropriate
  Next 15 backport or stable React 19 patch? If so, substitution requires an
  explicit documented decision rather than autonomous drift.
- Which current audit advisory paths disappear, change, or remain after npm
  regenerates the graph? This is an implementation measurement, not a reason to
  pre-judge audit cleanliness.

### Nice-to-know

- Whether a later issue should automate additional node-level/Trackball UX
  actions currently required only in the manual matrix. That expansion is not
  required for this urgent dependency patch.

## References

- [Issue #9](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/9)
- [Parent modernization tracker #6](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/6)
- [Architecture and dependency modernization report](../research/architecture-dependency-modernization.md)
- [Next.js support policy](https://nextjs.org/support-policy)
- [Next npm releases](https://www.npmjs.com/package/next?activeTab=versions)
- [React npm releases](https://www.npmjs.com/package/react?activeTab=versions)
- [Next security advisories](https://github.com/vercel/next.js/security/advisories)
- [PostCSS advisory GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)
- [CSS/build dependency patch issue #10](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/10)
- [Strategic Next 16 migration issue #12](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/12)

## Consultation Log

### Clarification before initial draft

The architect confirmed on 2026-07-18 that Chromium alone is required for this
stage; manual verification must cover the complete graph interaction matrix;
durable audit analysis belongs in the review while generated JSON remains a CI
artifact; the relevant stakeholders are maintainers, users, and hosting
operators; and the fixed Next 15 / React 19 decision and issue constraints must
be preserved.

### Initial three-way review

Gemini, Codex, and Claude all approved the specification with high confidence.
They found the requirements complete, technically feasible, factually
consistent with the repository, and sufficiently explicit about peer
resolution, production/UX validation, audit-path analysis, rollback, and the
known PostCSS residual. Codex and Claude identified no required changes.
Gemini's sole minor suggestion was to make the repository's existing exact-pin
convention explicit for all six target entries, not only React and React DOM;
the Constraints and FR2 now state that requirement.

### Post-feedback three-way review

Pending human feedback and Porch-managed re-review.
