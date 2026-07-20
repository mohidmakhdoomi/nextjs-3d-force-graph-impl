# Specification 12: Migrate the Application to Next 16 Active LTS

## Summary

Move the framework from the patched Next 15 baseline (`next@15.5.20`, landed by
#11's predecessor #9 and carried through #11) to Next 16 **Active LTS**
(`next@16.2.10`) in an isolated stage, and behaviorally qualify the result. This
is [Stage 3 — Next 16 Active LTS](../research/architecture-dependency-modernization.md#stage-3--next-16-active-lts)
of the architecture/dependency modernization roadmap (tracked under #6; depends
on #11, which shipped as PR #25).

The intended package actions are:

| Package | Checked-in version | Intended target | Dependency group | Action |
| --- | ---: | ---: | --- | --- |
| `next` | `15.5.20` (exact) | exact `16.2.10` | `dependencies` | Upgrade; pin exactly |
| `@next/eslint-plugin-next` | `15.5.20` (exact) | exact `16.2.10` | `devDependencies` | Upgrade; pin exactly; kept string-equal to `next` |

React and React-DOM stay **exactly** at the already-qualified `19.2.7`; the
Three.js/force-graph stack qualified in #11 (`three@0.185.1`,
`react-force-graph-3d@1.29.1`) is unchanged. All other manifest entries are
unchanged. The lockfile moves with the two upgraded packages and their
transitive deltas and is reviewed, not independently pinned.

Next 16 has almost no request-API/config migration surface in this repository
(no middleware, no dynamic request APIs, empty `next.config.js`, a single static
async server component). Its user-visible changes here are operational: it
raises the Node and supported-browser floors, removes the `next lint` command
integration, and makes **Turbopack the default bundler for both `dev` and
`build`**. The stage therefore centers on: running and reviewing the official
Next upgrade codemod; removing the now-redundant `--turbopack` dev flag;
explicitly qualifying the now-default Turbopack production build and the
client-only WebGL island; verifying the Node/browser policy; and re-explaining
the lockfile/audit delta including the known Next-owned nested PostCSS state.

Install/build success cannot validate the imperative WebGL surface, so — exactly
as in #11 — this stage reuses the established two-engine interaction-matrix
qualification (Chromium as the required CI gate, Firefox as the documented local
qualification gate). The whole manifest/lockfile/config/code/test change is one
rollback unit; rollback returns to the patched Next 15 baseline `15.5.20`, never
to `15.1.11`.

## Problem Analysis

### Current state

- `next@15.5.20` and `@next/eslint-plugin-next@15.5.20` are the patched Next 15
  baseline. `15.5.20` is the registry's `backport` dist-tag — the current
  supported 15.x line — and is the sanctioned rollback target for this stage.
- The framework is one Active-LTS line behind: `next@16.2.10` is the registry
  `latest` dist-tag and the current Active LTS. Staying on 15.x keeps the app
  off the supported LTS line the roadmap targets and blocks later stages that
  assume a Next 16 base.
- `package.json` scripts carry two Next-16-obsolete idioms: `dev` is
  `next dev --turbopack` (Turbopack is the Next 16 default for dev, so the flag
  is redundant), and while `lint` is already the explicit `eslint .` CLI path
  established in #7 (Next's removed `next lint` command is not invoked anywhere),
  that removal must be re-confirmed against Next 16, which deletes the command
  outright.
- `build` is `next build`. In Next 16 that defaults to the **Turbopack**
  production bundler rather than webpack; the app has never built or been
  qualified under Turbopack in production mode. Install/build success does not
  exercise the imperative WebGL surface (`app/components/FocusGraph.tsx`:
  `AxesHelper`, `PerspectiveCamera`, `TrackballControls`, and the
  react-force-graph imperative handle), so a bundler change must be behaviorally
  qualified, not asserted.
- The client boundary is a client-only dynamic island: `FocusGraphWrapper.tsx`
  does `dynamic(() => import("./FocusGraph"), {ssr: false})`. The build must keep
  producing a client bundle with exactly one resolved Three runtime and no
  Node-only imports.
- Migration surface is minimal and verified: no `middleware.*`, no dynamic
  request APIs (`cookies`/`headers`/`params`/`searchParams`/`useSearchParams`)
  in `app/`, an empty `next.config.js` (`module.exports = {}`), and
  `app/page.tsx` is a static async server component that stringifies checked-in
  data and renders the island.
- Browser validation is the two-engine Playwright suite qualified in #11:
  Chromium (SwiftShader) is the required CI gate (`E2E_ENGINES=chromium`);
  Firefox is a documented local qualification gate (GPU-less Actions runners
  cannot bring up a Firefox WebGL context). `playwright.config.ts` selects
  engines by `E2E_ENGINES`.
- Contract tests pin the framework: `tests/toolchain.test.mjs` asserts
  `dependencies.next === "15.5.20"`,
  `devDependencies["@next/eslint-plugin-next"] === "15.5.20"`, and that the two
  are string-equal. These move in the same commit as the manifest.
- The lockfile carries a nested `node_modules/next/node_modules/postcss@8.4.31`.
  This is pinned by `next` itself (Stage-0/#10 finding); it is a Next-owned
  build-time residual, not app-controlled.
- Post-#11 audit evidence is the current baseline; existing advisories are
  tracked evidence, not a zero-findings gate.

### Desired state

- `next` and `@next/eslint-plugin-next` at exactly `16.2.10`, kept string-equal;
  React/DOM unchanged at `19.2.7`; a clean supported peer tree; a regenerated
  lockfile (v3) that a fresh `npm ci` reproduces without mutating manifest or
  lock and without 3D-chain or framework peer warnings.
- The official Next 16 upgrade codemod has been run and its output reviewed; the
  final manifest is the exact target group above (no incidental version drift
  the codemod may propose); every codemod change is documented.
- `dev` is `next dev` (no redundant `--turbopack`); no `next lint` invocation
  anywhere; the #7 `eslint .` path and the flat config's direct
  `@next/eslint-plugin-next` wiring are intact and pass under the 16.x plugin.
- `next build` produces a working production build under the now-default
  Turbopack bundler; `next start` serves the root page HTTP 200; the client
  bundle contains no Node-only imports and resolves exactly one Three runtime
  through the client-only island.
- Node and supported-browser policies are verified against the Next 16 upgrade
  guide and documented; they satisfy Next 16 and remain compatible with the
  app's WebGL2 requirement.
- Lint, typecheck, unit/contract tests, Turbopack build, production start, full
  and production audits, the automated browser smoke, and the complete graph
  interaction matrix all pass; the smoke/matrix run per the #11 CI/local split.
- The lockfile review documents the framework delta and re-explains the audit
  delta, and the residual Next-owned nested PostCSS state is explicitly
  dispositioned (it persists: `next@16.2.10` also bundles `postcss@8.4.31`).
- Contract tests and docs are re-pinned to `16.2.10` and stay truthful.

### Stakeholders

- **Site visitors** — the 3D graph is the page's entire interactive surface; any
  regression in canvas bring-up, camera/pointer behavior, or bundle loading from
  the bundler change is a user-facing breakage.
- **Maintainers** — need the app on the Active-LTS line with the default
  Turbopack bundler qualified, without losing the reproducibility contract.
- **Later roadmap stages** (#6) — Stage 4 (language/lint) and beyond assume a
  Next 16 base with a qualified Turbopack build and an intact ESLint CLI path.

## Confirmed Decisions

Registry facts verified 2026-07-20 under the repository toolchain (must be
reverified at implementation time per FR1; this observation does not replace
that verification):

1. **Targets exist and are current/supported.** `next@16.2.10` and
   `@next/eslint-plugin-next@16.2.10` are both the `latest` dist-tag of their
   packages — zero drift from the researched target. The `next` `backport`
   dist-tag is `15.5.20`, confirming the current 15.x line and the rollback
   target.
2. **Node floor is satisfied with margin.** `next@16.2.10` declares
   `engines.node >=20.9.0`; the repository's exact `22.23.1` (in `engines`,
   `.nvmrc`, and enforced by CI/contract tests) satisfies it. No Node change is
   required or permitted by this stage.
3. **React peer is satisfied; no new required peers.** `next@16.2.10` peers
   `react`/`react-dom` at `^18.2.0 || 19.0.0-rc-… || ^19.0.0`; the qualified
   exact `19.2.7` stays. Every other Next 16 peer — `sass`, `@playwright/test`,
   `@opentelemetry/api`, `babel-plugin-react-compiler` — is
   `peerDependenciesMeta.optional`. (`@playwright/test` newly appears as an
   optional peer at `^1.51.1`; the pinned `1.61.1` already satisfies it.) So the
   upgrade introduces no new required runtime or dev dependency.
4. **`next lint` is already removed; only `--turbopack` (dev) is obsolete here.**
   The `lint` script is `eslint .` (the explicit ESLint CLI path from #7); the
   flat config (`eslint.config.mjs`) wires `@next/eslint-plugin-next` directly;
   nothing invokes the `next lint` command that Next 16 deletes. The only
   Next-16-obsolete script idiom left is `--turbopack` on `dev`. `dev` is not
   enumerated by `tests/automation.test.mjs`, so removing the flag is
   contract-safe.
5. **Turbopack is the Next 16 default for `dev` and `build`; rely on the
   default (election).** This spec drops `--turbopack` from `dev` and keeps
   `build` as bare `next build`, which defaults to Turbopack in Next 16, rather
   than pinning an explicit `--turbopack`/`--webpack` flag on either script. The
   now-default Turbopack production build is then explicitly qualified (FR5).
   This is an election, not forced by the issue; the alternative (pin
   `--webpack` to keep the old bundler, or pin `--turbopack` explicitly) is a
   veto point at the spec gate.
6. **The nested PostCSS state persists and is Next-owned.** `next@16.2.10`
   bundles `postcss@8.4.31` exactly as `next@15.5.20` does
   (`node_modules/next/node_modules/postcss`). It is not resolvable by this
   stage without patching Next and is out of scope to change; it is dispositioned
   explicitly in the review (FR10) rather than treated as a new or closed
   finding.
7. **Exact, equal pins retained (house style).** `next` and
   `@next/eslint-plugin-next` are pinned exactly and kept string-equal, and the
   contract test enforces the equality, so the framework runtime and its lint
   plugin cannot silently diverge.

The issue body contains no "Baked Decisions" section; the decisions above are
derived from the issue's scope/acceptance-criteria text (treated as fixed) and
direct registry verification. Decisions 5 and 7 are elections made by this spec;
approving the spec gate confirms them, and the architect may override any at that
gate.

## Scope

### In scope

- Upgrading `next` (→ exact `16.2.10`, `dependencies`) and
  `@next/eslint-plugin-next` (→ exact `16.2.10`, `devDependencies`) in one atomic
  manifest + lockfile + config + code + test change under the exact Node
  `22.23.1` / npm `10.9.8` / lockfile v3 / `npm ci` contract.
- Running the official Next 16 upgrade codemod (`@next/codemod upgrade`) in the
  dedicated branch and reviewing/curating every change it proposes.
- Removing the redundant `--turbopack` flag from the `dev` script and
  re-confirming no `next lint` invocation remains, with the #7 ESLint CLI path
  intact under the 16.x plugin.
- Explicitly qualifying the now-default Turbopack production build (`next build`)
  and a direct production `next start`, including the client WebGL bundle.
- Verifying the client bundle contains no Node-only imports and continues to load
  exactly one Three runtime through the client-only island.
- Verifying and documenting the Node and supported-browser policies against the
  Next 16 upgrade guide.
- Regenerating/reviewing the lockfile and the full/production audit delta,
  path-by-path, and explicitly dispositioning the residual Next-owned nested
  PostCSS state.
- Re-running the two-engine automated smoke and the complete graph interaction
  matrix (Chromium required CI gate + Firefox local qualification, per #11).
- Updating the framework-pinning contract tests (`tests/toolchain.test.mjs`) and
  any README/doc/test enumerations affected by the change (e.g. the `dev`
  script), truthfully.

### Out of scope (non-goals)

- No Tailwind 4, TypeScript major, ESLint 10, React Compiler, or 3D-stack
  upgrade (all are later/separate roadmap stages).
- No React/React-DOM version change — they stay exactly `19.2.7`.
- No new Next features, caching changes, or `next.config.js` additions beyond
  what the upgrade codemod strictly requires; the config stays effectively empty
  unless Next 16 mandates a change.
- No new application routes, features, or test-only application surface. All
  qualification is driven from outside the app (Playwright/CDP against the
  unmodified production page), consistent with #11.
- No opting into the webpack bundler as a permanent choice, and no removal of the
  Next-owned nested PostCSS pin (not app-controlled).
- No zero-findings audit gate: pre-existing advisories remain separately tracked
  evidence, not a blocker here.
- No change to the #11 CI/local engine split (Chromium required in CI, Firefox
  local qualification) — it is reused, not revisited.

## Constraints and Invariants

From the issue (fixed):

- Reverify the current Next 16 target, support status, migration guide, and peer
  requirements before implementation.
- Keep React/DOM exact and supported on the already-qualified React 19 baseline.
- Run and review the official Next upgrade codemod in the dedicated branch.
- Replace the removed `next lint` integration with the explicit ESLint CLI path
  established in #7 (already in place — re-confirm, do not regress).
- Remove the redundant development `--turbopack` flag.
- Explicitly qualify the now-default Turbopack production build and the client
  WebGL bundle.
- Verify Node and supported-browser policies meet Next 16 requirements.
- The client bundle contains no Node-only imports and continues to load exactly
  one Three runtime through the client-only island.
- Explain lockfile/audit changes; explicitly disposition residual nested PostCSS
  risk.
- Rollback returns to the patched Next 15 baseline `15.5.20`, never to
  `15.1.11`.

Repository invariants (fixed):

- Exact Node `22.23.1` / npm `10.9.8`, lockfile v3, clean `npm ci`; no dependency
  regeneration under any other toolchain (the codemod's edits are reconciled to
  the exact target group and the lockfile is regenerated only via npm under the
  pinned toolchain).
- `npm run validate` (lint → typecheck → build+smoke) is the green gate; full and
  production audits are separately validated evidence, and existing advisories
  are not a zero-findings gate.
- Never `git add -A` / `git add .`; commit messages follow
  `[Spec 12][Phase: name] type: Description`.
- `next` stays in `dependencies`; `@next/eslint-plugin-next` stays in
  `devDependencies`.

## Solution Exploration

### Approach A: Manifest-only bump, keep webpack build, skip codemod

Bump the two packages, pin `--webpack` on `build` to keep the old bundler, and
rely on existing gates.

- **Pros**: smallest diff; avoids qualifying a new bundler.
- **Cons**: fails the issue — it explicitly requires running the codemod and
  qualifying the *now-default Turbopack* build. Pinning `--webpack` freezes a
  bundler Next 16 is moving off of, deferring (not removing) the qualification
  and adding a flag the roadmap would later have to unwind.
- **Risk**: medium (defers required work; diverges from LTS defaults).
  **Rejected.**

### Approach B: Chase latest Next at implementation time

Upgrade to whatever `next` is latest on the merge day and re-derive
compatibility on the fly.

- **Pros**: never behind on merge day.
- **Cons**: abandons the researched, reviewable target; any post-research release
  lands without staged analysis. As of 2026-07-20 latest *is* `16.2.10`, so the
  approach buys nothing today and removes the drift tripwire for tomorrow.
- **Risk**: medium-high (unreviewed target). **Rejected** — drift discovered at
  implementation time escalates to the architect instead (FR1).

### Approach C: Codemod-driven atomic upgrade to the researched target, default Turbopack, two-engine behavioral qualification (selected)

Run and review the official Next 16 codemod; pin exactly to `16.2.10`; remove the
redundant `--turbopack` dev flag; keep `build` on the now-default Turbopack and
qualify it plus a direct production start and the client WebGL bundle; verify
Node/browser policy; re-run the two-engine matrix (Chromium CI + Firefox local);
land manifest, lockfile, config, code, tests, and docs as one rollback unit to
`15.5.20`.

- **Pros**: satisfies every acceptance criterion; qualifies the default bundler
  the roadmap is converging on; reuses #11's durable two-engine qualification
  bar; single revert restores the fully-qualified Next 15 baseline.
- **Cons**: qualifying a new production bundler is new surface (mitigated by the
  existing numeric matrix + smoke); the codemod may propose changes beyond the
  target group that must be curated.
- **Risk**: medium, actively mitigated. **Selected.**

**On the bundler election**: `next build` defaults to Turbopack in Next 16.
Staying on webpack (`--webpack`) would minimize behavioral change but is a
deliberate divergence from the LTS default and merely defers the qualification
this stage is meant to do. The spec elects the default because the issue mandates
qualifying the now-default Turbopack build, the numeric interaction matrix + smoke
already provide a behavioral safety net, and adopting the default now avoids a
later forced migration. Veto point at the spec gate (Confirmed Decisions #5).

## Functional Requirements

### FR1 — Implementation-time target reverification

Before any manifest edit, reverify against the npm registry under the repository
toolchain: (a) `next@16.2.10` and `@next/eslint-plugin-next@16.2.10` still exist
and remain the intended (latest/Active-LTS) targets; (b) `next@16.2.10`'s
`engines.node` still admits `22.23.1` and its React peer still admits `19.2.7`
with no new *required* peer; (c) the Next 16 support policy and upgrade guide
have not materially changed the Node/browser floors or the migration steps
relevant here; (d) whether a newer supported 16.x patch has superseded
`16.2.10`. If reverification contradicts the researched target (e.g. a Node floor
above `22.23.1`, a new required peer, or a superseding patch), **stop and
escalate to the architect via `afx send`** rather than silently retargeting.
Record the verification date and findings in the review.

### FR2 — Official upgrade codemod, run and reviewed

Run the official Next 16 upgrade codemod (`@next/codemod upgrade`, or the exact
invocation the reverified upgrade guide specifies) in the dedicated branch under
the pinned toolchain. Review every change it proposes — manifest edits,
`next.config` edits (including a possible `next.config.js` → `next.config.ts`/ESM
format migration, which is reviewed and accepted only if Next 16 actually
requires it; otherwise the config stays as the effectively-empty
`next.config.js`), source codemods, and any script changes. Curate the result:
the final manifest must be exactly the target group (FR3); any incidental version
drift the codemod introduces beyond that group (e.g. bumping React, types, or
unrelated deps) is reverted as out of scope. Document, in the review, what the
codemod changed, what was kept, and what was reverted and why. If the codemod
proposes a change that is genuinely required but out of the stated scope, escalate
rather than silently expanding scope.

### FR3 — Atomic manifest and lockfile update

Update `package.json` (`next` → exact `16.2.10` in `dependencies`;
`@next/eslint-plugin-next` → exact `16.2.10` in `devDependencies`) and regenerate
`package-lock.json` only via npm under Node `22.23.1` / npm `10.9.8`. Lockfile
stays v3; a subsequent clean `npm ci` must succeed without mutating
`package.json` or `package-lock.json` and without peer-dependency
warnings/errors for the framework or the 3D chain. `next` and
`@next/eslint-plugin-next` remain string-equal. Manifest, lockfile, config, code,
and test changes land as one unit (single PR; phase commits within it).

### FR4 — Remove obsolete Next-lint/Turbopack idioms

The `dev` script is `next dev` (no `--turbopack`). No `next lint` command is
invoked anywhere in scripts, CI, or docs; the `lint` script stays `eslint .` (the
#7 CLI path) and the flat config's direct `@next/eslint-plugin-next` wiring
passes under the 16.x plugin with no new suppressions or rule regressions. If the
16.x plugin changes any rule id/output the config relies on, that is called out
and reconciled explicitly, not absorbed silently.

### FR5 — Qualify the now-default Turbopack production build and client bundle

`next build` (defaulting to Turbopack in Next 16) completes successfully; a
direct production `next start` serves the root page HTTP 200; the built client
bundle loads and runs the graph. The client-only dynamic boundary
(`FocusGraphWrapper.tsx`: `dynamic(..., {ssr: false})`) is preserved. The client
bundle contains **no Node-only imports** and resolves **exactly one** Three
runtime through the client-only island.

**Evidence method (explicit, repo-local, so builders don't invent inconsistent
proofs):**
- *Single Three runtime*: `npm ls three` resolves exactly one `three@0.185.1`
  and the lockfile contains no nested `node_modules/**/node_modules/three` entry
  (also enforced by the existing FR12 contract test, mirroring #11).
- *No Node-only imports in the client bundle*: after `next build`, scan the
  emitted client assets under `.next/static/` (the chunks actually shipped to
  the browser) for the `node:` scheme and bare Node-builtin specifiers
  (e.g. `grep -RolE "node:(fs|path|crypto|os|stream|util|process|module|child_process)" .next/static/`
  and the analogous check for the un-prefixed builtins the graph chunk could
  pull in) — the shipped client chunks must match none. A clean production
  `next build` plus successful client-side graph bring-up in the smoke (the
  island renders under `{ssr:false}`) is corroborating evidence, but the
  built-asset scan is the primary proof. The exact commands and their output are
  recorded in the review.

Any Turbopack-specific build output difference relevant to correctness is
recorded in the review.

### FR6 — Preserved client boundary and interaction semantics

No graph prop, handler, timer value (4000 ms enable delay, 20 ms rotation tick,
~1 s reset window), camera parameter (fov 40, near 1, far 200, focus distance
80), or control semantic changes as a result of the framework upgrade — and if
any is forced by Next 16, it is called out explicitly in the review, not absorbed
silently. `app/` source changes are limited to what the codemod strictly requires
(expected: none, given the minimal migration surface); any such change is
documented.

### FR7 — Node and supported-browser policy verification

Confirm and document that the repository's Node policy (`22.23.1`) satisfies Next
16's floor, and reverify Next 16's supported-browser policy from the upgrade
guide. Document the resulting supported-browser statement and confirm it remains
compatible with the app's existing WebGL2 requirement (the qualification engines
already exceed any Next 16 browser floor). If Next 16's browser floor would
require an app-level `browserslist`/policy declaration, add the minimal truthful
declaration and note it; otherwise record that no declaration is required.

### FR8 — Automated validation gates

All of the following pass at the final commit: `npm run lint`,
`npm run typecheck`, `npm test` (including updated contract tests),
`npm run build` (Turbopack), a direct production `npm run start` serving the root
page HTTP 200, `npm run test:smoke`, aggregate `npm run validate`, and the audit
evidence pipeline (`npm run audit:full` / `audit:production` through
`scripts/validate-audit-report.mjs` semantics, preserving original exit codes).

### FR9 — Browser smoke and complete interaction matrix

The automated smoke and the complete graph interaction matrix (the canonical
matrix qualified in #11: canvas creation, initial layout, auto-rotation,
delayed pointer enablement, trackball zoom/rotation, node drag→fix, right-click
unfix, click-to-focus, reset, axes toggle, resize, unmount/remount) pass against
the **Turbopack** production build. The canonical matrix and smoke are the
existing committed suites — `tests/e2e/matrix.spec.ts` (13-item matrix),
`tests/e2e/smoke.spec.ts` (canvas/WebGL readiness + controls + strict error
budget), the shared `tests/e2e/graph-handle.ts` imperative-handle helper, and
the `tests/focus-graph-lifecycle.test.mjs` unit suite — as defined in review 11
(§"Spec Compliance" / FR9). This stage re-runs them, not re-authors them. The #11 CI/local engine split is reused
unchanged: Chromium (SwiftShader) is the required gate (`E2E_ENGINES=chromium`)
locally and in CI; Firefox remains the documented local qualification gate.
Verification stays numeric via the react-force-graph imperative handle, driven
from outside the app; no test-only application surface is added. Class B items
(node drag, node right-click) follow the #11 acceptance semantics (real input
attempted; scripted imperative-handle evidence with baseline-replay recording is
acceptable only for input *delivery* limits, never for wrong handler behavior).
Any behavioral difference from the Next 15 baseline is replayed against the
rollback baseline before being attributed to the upgrade.

### FR10 — Lockfile and audit delta review, PostCSS disposition

Record before/after resolved versions for `next`, `@next/eslint-plugin-next`, and
every transitive entry the upgrade moves; summarize meaningful framework changes
relevant to this app (bundler default, lint integration, Node/browser floors).
Provide before/after full (`npm audit`) and production (`npm audit --omit=dev`)
comparisons, path-by-path, preserving original exit codes per the
validate-audit-report methodology; identify which advisory paths the upgrade
resolves, introduces, or leaves unchanged, with ownership notes. Explicitly
disposition the residual **Next-owned** nested `postcss@8.4.31`
(`node_modules/next/node_modules/postcss`): confirm whether `next@16.2.10` still
pins it (expected: yes), state that it is not app-controllable in this stage, and
carry it forward as a documented build-time residual rather than a closed or new
finding. Raw JSON stays local/CI evidence; the review carries the comparison
tables.

### FR11 — Supply-chain verification of changed lockfile entries

For every lockfile entry changed by this upgrade: (a) `resolved` URLs point only
at the public npm registry (`registry.npmjs.org`) — no git, tarball-URL, or
alternate-registry sources; (b) no changed entry introduces an install script
(`hasInstallScript`/`preinstall`/`install`/`postinstall`) its previous version
lacked. **Listing scope**: every *newly introduced* install script (an entry that
gains one relative to its pre-upgrade version, or a newly added package that has
one) must be individually called out and explained; *pre-existing, unchanged*
install scripts in the changed subgraph need only be confirmed as pre-existing
and unchanged (a summary count/identification suffices — no exhaustive
re-enumeration), consistent with #11's FR6. (c) `npm ci` output shows no
unexpected package-manager behavior. Findings go in the review's lockfile
section.

### FR12 — Contract-test and docs updates

`tests/toolchain.test.mjs` moves its `next` and `@next/eslint-plugin-next` pins
from `15.5.20` to `16.2.10` (keeping the string-equality assertion) and continues
to enforce the Node/npm/lockfile-v3 invariants. `tests/automation.test.mjs`,
README, and any doc/test enumerations affected by the `dev`-script change or the
bundler qualification are updated to stay truthful (e.g. the removed
`--turbopack` flag; any Turbopack build note). All doc/test enumerations updated
in the same rollback unit.

### FR13 — Rollback unit and blocking semantics

The manifest, lockfile, `next.config`/scripts, any codemod source edits, contract
tests, and docs are one revertible unit: a single revert restores the
fully-qualified `next@15.5.20` baseline (**never** `15.1.11`). If any validation
gate or matrix item fails under Next 16 and baseline replay attributes it to the
upgrade, the stage is **blocked** (escalate with evidence); do not ship partial
workarounds (e.g. mixing a 16.x runtime with a 15.x lint plugin, or silently
pinning `--webpack` to dodge a Turbopack failure without architect sign-off).

## Non-Functional Requirements

### Reproducibility

Everything under the exact Node `22.23.1` / npm `10.9.8` / lockfile v3 / `npm ci`
contract; no toolchain drift; the codemod's edits reconciled to the exact target
group; lockfile provenance stays the public registry.

### Behavior preservation

The user-visible contract of the page — timing, camera semantics, pointer
semantics, control buttons, canvas bring-up — is identical before and after,
across the bundler change. This stage exists to prove that, not merely assert it.

### Evidence honesty

Every claim in the review states the bundler (webpack baseline vs. Turbopack
target), engine, renderer, input method (real event vs. scripted handle), and
result. Environment-limited results (e.g. Firefox WebGL on CI) are recorded as
such, consistent with #11.

### Supply-chain integrity

The upgraded framework introduces no new install scripts, no non-registry
sources, and no unexpected package-manager behavior (FR11); audit evidence is
compared path-by-path with original exit codes preserved (FR10).

### Maintainability

The app lands on the Active-LTS line with the default Turbopack bundler qualified
and the ESLint CLI path intact, keeping later stages (language/lint, CSS)
unblocked and the reproducibility/qualification bars unchanged.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Turbopack production build differs from webpack (chunking, module resolution, client/server boundary) and breaks the WebGL island | User-visible regression / broken bundle | FR5 qualifies the Turbopack build + start + single-Three-runtime + no-Node-import checks; FR9 runs the full numeric matrix against the Turbopack build; baseline replay before attribution |
| Codemod proposes out-of-scope changes (React bump, config rewrites, unrelated codemods) | Scope creep / unreviewed drift | FR2 requires reviewing and curating every codemod change; final manifest reconciled to the exact target group; escalate genuinely-required-but-out-of-scope changes |
| `@next/eslint-plugin-next@16` changes rule ids/output the flat config relies on | Lint failure or silent coverage change | FR4 requires the #7 config to pass under the 16.x plugin with explicit reconciliation of any rule change, no silent absorption |
| Next 16 raises the Node or browser floor beyond current policy | Unsupported toolchain / dropped browsers | FR1/FR7 reverify both floors against the upgrade guide; `22.23.1` already exceeds `>=20.9.0`; escalate if a floor exceeds current policy |
| A newer 16.x patch supersedes `16.2.10` at implementation time | Unreviewed target ships | FR1 reverification with escalation, not silent retarget |
| Residual Next-owned nested PostCSS misread as a new/closed finding | Misleading audit story | FR10 confirms `next@16.2.10` still pins `postcss@8.4.31` and carries it forward as a documented, non-app-controllable residual |
| Node-only import leaks into the client bundle under the new bundler | Client runtime break | FR5 explicit no-Node-only-import + single-Three-runtime checks on the client graph chunk |
| Firefox WebGL still cannot run on CI (unchanged from #11) | Misread as regression | Reuse the #11 CI/local split unchanged; Chromium enforces every behavioral assertion in CI; Firefox stays local qualification |

## Acceptance Scenarios

### Scenario 1 — Verified supported target group
`npm ci` on the updated manifest under the exact toolchain completes with a
supported peer tree, lockfile v3, no manifest mutation, exactly `next@16.2.10`
and `@next/eslint-plugin-next@16.2.10` (string-equal), and React/DOM unchanged at
`19.2.7`.

### Scenario 2 — Codemod reviewed and curated
The official Next 16 codemod has been run in the branch; the review lists what it
changed, what was kept, and what incidental drift was reverted, with the final
manifest equal to the target group.

### Scenario 3 — Obsolete idioms gone
`dev` is `next dev` (no `--turbopack`); no `next lint` invocation remains; lint
passes under the 16.x plugin via the `eslint .` CLI path.

### Scenario 4 — Turbopack build qualified
`next build` (Turbopack) succeeds; a direct production `next start` returns the
root page HTTP 200; the client bundle has no Node-only imports and resolves
exactly one Three runtime through the client-only island.

### Scenario 5 — Static and automated gates
Lint, typecheck, `npm test`, Turbopack build, direct production start, the
Chromium-required smoke, and aggregate `validate` all exit 0 at the final commit.

### Scenario 6 — Interaction matrix on the Turbopack build
The complete graph interaction matrix passes (Chromium required gate + Firefox
local qualification) against the Turbopack production build with zero unexpected
page/console/hydration/timer/WebGL-context/GPU errors, per #11 semantics.

### Scenario 7 — Honest lockfile and audit story
The review documents the framework before/after versions, the full/production
audit deltas path-by-path (exit codes preserved), and the explicit disposition of
the residual Next-owned nested `postcss@8.4.31`.

### Scenario 8 — Node/browser policy verified
The review records that `22.23.1` satisfies Next 16's Node floor and states the
Next 16 supported-browser policy, confirming compatibility with the app's WebGL2
requirement.

### Scenario 9 — Atomic rollback
A single revert of the unit restores the fully-qualified `next@15.5.20` baseline
(never `15.1.11`); no follow-up fixes are required to return to green.

### Scenario 10 — Blocking honored
If any gate or interaction fails under Next 16 and baseline replay attributes it
to the upgrade, the stage stops with evidence and escalation — no partial
workarounds, no mixed 16.x-runtime/15.x-plugin combination, no undisclosed
`--webpack` fallback.

## Open Questions

### Critical

- None. Registry verification (2026-07-20) confirmed target existence/currency,
  the Node floor (`>=20.9.0` vs. `22.23.1`), the React peer (`^19.0.0` vs.
  `19.2.7`), no new required peers, and that the nested PostCSS pin persists in
  `next@16.2.10`.

### Important

- None open. The previously contingent choices are settled decisions,
  overridable only at the spec-approval gate: rely on the default Turbopack
  bundler rather than pin `--webpack`/`--turbopack` (Confirmed Decisions #5,
  FR5); exact equal `next`/plugin pins (Confirmed Decisions #7, FR3/FR12); reuse
  the #11 CI/local engine split unchanged (FR9). If the architect wants any
  changed, that happens at the gate, and the spec is amended before planning.

### Nice-to-know

- Whether the Turbopack build materially changes first-load JS / bundle size for
  the graph route versus webpack — worth recording in the review, not a gate.
- Whether Next 16 changes any default `next.config` behavior worth pinning
  explicitly later (kept out of scope here; config stays effectively empty).

## References

- Issue #12; roadmap issue #6; research:
  `codev/research/architecture-dependency-modernization.md` (Stage 3 — Next 16
  Active LTS).
- Direct dependency: spec/plan/review 11 (3D/WebGL two-engine qualification,
  merged PR #25) — source of the interaction matrix, the CI/local engine split,
  and the exact-pin/contract-test discipline reused here.
- Prior stages: spec/plan/review 9 (Next 15/React 19), 10 (CSS/build/ESLint —
  nested PostCSS finding and the #7 ESLint CLI path), 7 (reproducible Node
  toolchain), bugfix 8 (FocusGraph lifecycle hardening).
- `codev/resources/arch.md` / `arch-critical.md` (Validation Baseline;
  reproducibility contract), `codev/resources/lessons-learned.md` /
  `lessons-critical.md` (Validation Evidence).
- Registry verification 2026-07-20: `npm view next dist-tags`,
  `npm view next@16.2.10 engines peerDependencies peerDependenciesMeta`,
  `npm view @next/eslint-plugin-next@16.2.10`, and inspection of the checked-in
  lockfile's `node_modules/next/node_modules/postcss` entry (`8.4.31`, confirmed
  still pinned by `next@16.2.10` and `next@15.5.20`).
- [Next.js support policy](https://nextjs.org/support-policy),
  [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16),
  [Node.js release status](https://nodejs.org/en/about/previous-releases).

## Consultation Log

### Iteration 1 — initial three-way review (2026-07-20)

- **Gemini: APPROVE (high confidence).** Endorsed the exact-pin discipline, the
  codemod-then-curate approach to avoid scope creep, the Turbopack client-bundle
  risk mitigation (no Node-only imports + single Three runtime, backed by the
  two-engine matrix), and the explicit nested-PostCSS disposition. No issues.
- **Claude: APPROVE (high confidence).** Independently verified every factual
  claim against the codebase (manifest versions, scripts, empty config, no
  middleware, static async page, client island, camera/timer parameters,
  contract-test string-equality, `E2E_ENGINES` selection, `dev` not asserted by
  `automation.test.mjs`). No factual errors; internally consistent decisions.
  Three non-blocking notes: (1) call out a possible `next.config.js` →
  `next.config.ts`/ESM codemod change surface; (2) README `dev`-script update
  (already covered by FR12); (3) record webpack-vs-Turbopack bundle-size delta
  (already in Nice-to-know).
- **Codex: COMMENT (high confidence).** Strong, implementation-ready spec; three
  minor evidence-method clarifications, all accepted and incorporated:
  1. FR5 lacked an explicit evidence method for "no Node-only imports reach the
     client chunk" → FR5 now specifies a repo-local method: scan emitted
     `.next/static/` client assets for `node:`/bare-builtin specifiers, plus
     `npm ls three` for the single runtime.
  2. FR9 referenced "the canonical matrix qualified in #11" without a concrete
     pointer → FR9 now names the exact suites (`tests/e2e/matrix.spec.ts`,
     `tests/e2e/smoke.spec.ts`, `tests/e2e/graph-handle.ts`,
     `tests/focus-graph-lifecycle.test.mjs`) and review 11's FR9 section.
  3. FR10/FR11 install-script listing scope was ambiguous → FR11 now states that
     newly introduced install scripts are individually called out, while
     pre-existing unchanged ones need only be confirmed (no exhaustive
     re-enumeration), consistent with #11's FR6.
- Claude note (1) was applied to FR2 (config-format migration is a reviewed
  codemod surface, accepted only if Next 16 requires it).

_Second consultation (after human/gate feedback) to be appended if the spec is
revised at the spec-approval gate._
