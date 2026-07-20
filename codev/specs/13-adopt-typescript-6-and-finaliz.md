# Specification 13: Adopt TypeScript 6 and Finalize the Supported ESLint 9 Flat Config

## Summary

Move the language toolchain from the current `typescript@~5.7.3` baseline to
TypeScript **6.0.3** (exact) — the report's bounded supported language target —
and finalize the supported **ESLint 9** flat config, without conflating the two
blocked adjacent majors (TypeScript 7 and ESLint 10). This is
[Stage 4 — language and lint](../research/architecture-dependency-modernization.md#stage-4--language-and-lint)
of the architecture/dependency modernization roadmap (tracked under #6; depends
on #12 — Next 16 Active LTS, shipped as PR #26).

The intended package actions are:

| Package | Checked-in version | Intended target | Dependency group | Action |
| --- | ---: | ---: | --- | --- |
| `typescript` | `~5.7.3` | exact `6.0.3` | `devDependencies` | Upgrade; pin exactly |
| `typescript-eslint` | `~8.64.0` | `~8.64.0` (unchanged) | `devDependencies` | Retain the researched supported line (peers TS `<6.1`) |
| `eslint` / `@eslint/js` | `~9.39.5` | `~9.39.5` (unchanged) | `devDependencies` | Retain ESLint 9 (string-equal) |
| `eslint-plugin-react` | `~7.37.5` | `~7.37.5` (unchanged) | `devDependencies` | Retain |
| `eslint-plugin-react-hooks` | `7.1.1` | `7.1.1` (unchanged) | `devDependencies` | Retain (native flat config) |
| `globals` | `~17.7.0` | `~17.7.0` (unchanged) | `devDependencies` | Retain |

The single **version** change is `typescript`. Everything else in this stage is
*configuration finalization*: reverify that the established supported lint stack
accepts TypeScript 6.0.3 cleanly (no unsupported-version warning, no suppression),
resolve or explicitly bound any TypeScript 6 deprecation diagnostics, and
intentionally modernize `eslint.config.mjs` — adopt the current React/Hooks
flat-config surfaces, scope browser versus Node/CommonJS globals appropriately,
and preserve the deliberate JS/TypeScript/React/Hooks/Next rule coverage
established in #10. `@eslint/compat` was already removed in #10 and stays absent.

TypeScript 7 (now the registry `latest`) and ESLint 10 are **out of scope and
explicitly deferred**: TypeScript 7 is blocked by `typescript-eslint` parser
support (`<6.1.0`), and ESLint 10 remains a separate peer-compatibility
experiment. This stage must not adopt either, must not use forced installs or
peer-bypass flags, and must not suppress the parser version warning.

The whole change — manifest, lockfile, `tsconfig`/`eslint.config.mjs`, any TS
source edits the deprecation pass requires, contract tests, and docs — is one
rollback unit; a single revert returns to the `typescript@~5.7.3` baseline.
Because this is a language/lint change with no runtime dependency movement, the
established two-engine behavioral qualification from #11/#12 is **reused** to
prove the app still builds and runs, not re-authored.

## Problem Analysis

### Current state

- `typescript@~5.7.3` is the checked-in language version. It is two minors behind
  the bounded supported target (`6.0.3`) the roadmap's Stage 4 fixes, and three
  majors of dist-tag movement behind the registry `latest` (`7.0.2`, TypeScript 7
  GA). Staying on 5.7 leaves the language target unfinalized and blocks Stage 4's
  "go gate" (no unsupported peer/parser-version warning; lint coverage
  intentionally equivalent or improved; build/typecheck unchanged).
- The lint stack is already the supported ESLint 9 stack established in #10 and
  carried through #11/#12: `typescript-eslint@~8.64.0`, `eslint`/`@eslint/js`
  `~9.39.5` (string-equal, enforced by `tests/toolchain.test.mjs`),
  `eslint-plugin-react@~7.37.5`, `eslint-plugin-react-hooks@7.1.1` (native
  flat-config), `globals@~17.7.0`. `@eslint/compat` was removed in #10 and is
  absent from the manifest.
- `eslint.config.mjs` (established in #10) carries three not-yet-modernized
  idioms that Stage 4 is meant to finalize:
  1. **React** is wired via the legacy eslintrc-shaped shared config
     `eslint-plugin-react/configs/recommended.js`, imported directly into flat
     config, rather than the plugin's native flat surface (`configs.flat.recommended`).
  2. **Hooks** coverage is pinned explicitly to the pre-#10 effective set
     (`react-hooks/rules-of-hooks: error`, `react-hooks/exhaustive-deps: warn`)
     because #10's issue forbade the *silent* coverage expansion that spreading
     `eslint-plugin-react-hooks@7`'s ~16-rule `recommended` would cause. #13 is
     the deliberate, reviewed moment to decide the Hooks coverage question and
     express it through the current flat-config surface.
  3. **Globals** are applied as a single un-scoped `globals.commonjs` block
     (`globals.browser` is present only as a commented-out fragment). Browser
     source (`app/**` client island: `window`, `document`, WebGL, RAF) and
     Node/CommonJS files (config, scripts, tests) are not scoped to their
     respective global sets.
- Deliberate rule decisions that must be preserved: `react/react-in-jsx-scope:
  off`, `react/jsx-uses-react: off` (React 19 automatic JSX runtime),
  `@typescript-eslint/no-explicit-any: off`, and the direct
  `@next/eslint-plugin-next` wiring (`recommended` + `core-web-vitals`).
- `tsconfig.json` uses `target: "es6"`, `module: "esnext"`, `moduleResolution:
  "bundler"`, `strict: true`, `skipLibCheck: true`, `incremental: true`, the
  `next` TS plugin, and the `@/*` path alias. Under a probe with TypeScript 6.0.3,
  these compiler options produce **no** option-deprecation diagnostics (see
  Confirmed Decisions #3); this must be reconfirmed against the full checked-in
  `tsconfig.json` and source at implementation time.
- `tests/toolchain.test.mjs` pins the Node/npm/lockfile-v3 invariants, the
  Next/React/Three baselines, and asserts `eslint`/`@eslint/js` are string-equal
  on the `~9.` line — but it does **not** currently pin the `typescript` version.
  `README.md` mentions TypeScript without a version number.
- Browser validation is the two-engine Playwright suite qualified in #11 and
  reused in #12: Chromium (SwiftShader) is the required CI gate
  (`E2E_ENGINES=chromium`); Firefox is a documented local qualification gate.
- Post-#12 audit evidence is the current baseline; existing advisories are tracked
  evidence, not a zero-findings gate. The lockfile carries a Next-owned nested
  `postcss@8.4.31` (out of scope to change here).

### Desired state

- `typescript` at exactly `6.0.3` in `devDependencies`; the supported ESLint 9
  lint stack unchanged in version; a clean supported peer tree; a regenerated
  lockfile (v3) a fresh `npm ci` reproduces without mutating manifest or lock and
  without `--force` / `--legacy-peer-deps` / parser-warning suppression.
- `tsc --noEmit` runs clean under TypeScript 6.0.3; any TypeScript 6 deprecation
  diagnostic is either resolved in-place or explicitly bounded with a removal plan
  tied to the (deferred) TypeScript 7 stage. `skipLibCheck` is retained (its
  tightening is a separate issue).
- `eslint .` runs clean under TypeScript 6.0.3 with **no** `typescript-eslint`
  "unsupported TypeScript version" warning and no suppression — because
  `@typescript-eslint/typescript-estree@8.64.0`'s supported range admits `6.0.3`
  (Confirmed Decisions #2).
- `eslint.config.mjs` is intentionally modernized: React on the native flat
  config surface, Hooks expressed through the current flat-config surface with a
  deliberate (print-config-verified) coverage decision, browser vs Node/CommonJS
  globals scoped by file group, and the deliberate JS/TS/React/Hooks/Next coverage
  preserved. `@eslint/compat` stays absent.
- Lint, typecheck, unit/contract tests, the (Turbopack) build, production start,
  full and production audits, the automated browser smoke, and the complete graph
  interaction matrix all pass, per the #11/#12 CI/local split.
- Contract tests pin `typescript` at exactly `6.0.3` and continue to enforce the
  ESLint-9 string-equality and the flat-config ignore invariants; docs stay
  truthful. TypeScript 7 and ESLint 10 are explicitly recorded as deferred.

### Stakeholders

- **Site visitors** — the 3D graph is the page's entire interactive surface. A
  language/lint change must not regress canvas bring-up, camera/pointer behavior,
  or bundle loading; this stage proves that via the reused matrix rather than
  asserting it.
- **Maintainers** — need the language target finalized on the bounded supported
  TypeScript 6 line with a clean, modern, intentionally-scoped ESLint 9 flat
  config and no peer-bypass debt.
- **Later roadmap stages** (#6) — a stable TypeScript 6 / ESLint 9 base is the
  precondition for the deferred TypeScript 7 adoption (pending `typescript-eslint`
  support), the ESLint 10 peer experiment, and the separate `skipLibCheck`
  tightening after the 3D/type alignment stabilizes.

## Confirmed Decisions

Registry and behavioral facts verified 2026-07-20 under the repository toolchain
(Node `22.23.1` / npm `10.9.8`); these are re-verified at implementation time per
FR1 and do not replace that verification:

1. **TypeScript 6.0.3 is the bounded supported target; TypeScript 7 is the drift
   tripwire, not the target.** `typescript@6.0.3` exists; the registry dist-tags
   are `latest = 7.0.2` (TypeScript 7 GA), `beta = 6.0.0-beta`. TypeScript 7 is
   explicitly **not** adopted here (blocked by `typescript-eslint` parser support,
   Decision #2). If, at implementation time, a newer supported **6.0.x** patch has
   superseded `6.0.3`, that is a reverification finding to escalate (FR1), not a
   silent retarget; chasing `latest` (TS 7) is forbidden.
2. **`typescript-eslint@8.64.0` accepts TypeScript 6.0.3 cleanly — no warning, no
   suppression.** `typescript-eslint@8.64.0` peers `eslint ^8.57.0 || ^9.0.0 ||
   ^10.0.0` and `typescript >=4.8.4 <6.1.0`. Decisively, its
   `@typescript-eslint/typescript-estree@8.64.0` internal
   `SUPPORTED_TYPESCRIPT_VERSIONS = '>=4.8.4 <6.1.0'`, which **admits `6.0.3`** —
   so no "unsupported TypeScript version" warning is emitted and no
   `warnOnUnsupportedTypeScriptVersion:false` (or any parser-warning suppression)
   is needed. This is the fact the entire issue turns on; it is verified, not
   assumed. `typescript-eslint@8.65.0` (current `latest` on the 8.x line) carries
   the **same** `<6.1.0` TS range — a patch, not a range extension — so retaining
   `8.64.0` (the researched target) loses no TypeScript support (Decision #7 is
   the veto point on whether to take the 8.65.0 patch).
3. **TypeScript 6.0.3 emits no option deprecations on this repo's compiler
   options.** A scratchpad probe running `tsc@6.0.3 --noEmit` against the repo's
   `compilerOptions` (`target: es6`, `lib`, `allowJs`, `skipLibCheck`, `strict`,
   `esModuleInterop`, `module: esnext`, `moduleResolution: bundler`,
   `resolveJsonModule`, `isolatedModules`, `jsx: react-jsx`, `incremental`) exited
   0 with **no** deprecation diagnostics. The implementation must reconfirm this
   against the *full* checked-in `tsconfig.json` (including `paths`, the `next`
   plugin, and the real source graph) and resolve or bound anything that surfaces
   (FR3). Expectation: little or nothing to fix; the AC is satisfied by evidence
   of absence plus a bounded plan for anything found.
4. **ESLint 9 is retained; ESLint 10 is a separate deferred experiment.**
   `eslint`/`@eslint/js` stay on `~9.39.5` (string-equal). The registry `latest`
   is `eslint@10.7.0`; adopting it is out of scope (`eslint-plugin-react` peer
   support and the ESLint-10 peer experiment are tracked separately). No ESLint 10
   here.
5. **`@eslint/compat` stays absent.** It was removed in #10 once
   `eslint-plugin-react-hooks@7.1.1` shipped native flat-config support; it is not
   in the manifest and is not reintroduced. The React modernization uses the
   plugin's native flat surface, not a compat shim.
6. **`globals@17.7.0` provides the needed scoping sets.** It exposes `browser`,
   `node`, `commonjs`, and `worker` global sets — sufficient to scope app/client
   browser globals separately from Node/CommonJS config/script/test globals (FR5).
7. **Retain `typescript-eslint@8.64.0` and the exact/equal ESLint-9 pins (house
   style).** The researched supported line is `8.64.0`; taking the `8.65.0` patch
   is a no-TS-support-change election available at the spec gate. `eslint` and
   `@eslint/js` stay string-equal (contract-enforced). `typescript` is pinned
   exactly (like `next`/`react`/`three`) so the language version cannot drift.

The issue body contains **no** "Baked Decisions" section; the decisions above are
derived from the issue's fixed scope / acceptance-criteria text (treated as fixed)
and direct verification. Decisions #1's target, #7's pin retention, and the Hooks
coverage election (FR6) are the spec's elections — approving the spec gate
confirms them, and the architect may override any at that gate.

## Scope

### In scope

- Upgrading `typescript` (→ exact `6.0.3`, `devDependencies`) in one atomic
  manifest + lockfile + config + (any) source + test change under the exact Node
  `22.23.1` / npm `10.9.8` / lockfile-v3 / `npm ci` contract.
- Reverifying that the retained supported lint stack (`typescript-eslint@8.64.0`,
  ESLint 9, React/Hooks/globals) accepts TypeScript 6.0.3 with no
  unsupported-version warning and no suppression.
- Running `tsc --noEmit` under TypeScript 6.0.3 and resolving or explicitly
  bounding (with a removal plan) any TypeScript 6 deprecation diagnostics; keeping
  `skipLibCheck`.
- Intentionally modernizing `eslint.config.mjs`:
  - migrating React from the legacy `configs/recommended.js` to the native flat
    `configs.flat.recommended` surface,
  - expressing Hooks through the current flat-config surface with a deliberate,
    print-config-verified coverage decision,
  - scoping browser globals (app/client source) versus Node/CommonJS globals
    (config, scripts, tests),
  - preserving the deliberate JS/TypeScript/React/Hooks/Next rule coverage and the
    explicit rule offs from #10.
- Confirming `@eslint/compat` remains absent (no reintroduction, no compat shim).
- Regenerating/reviewing the lockfile and the full/production audit delta, and
  carrying forward the residual Next-owned nested PostCSS state as a documented,
  non-app-controllable residual.
- Re-running the two-engine automated smoke and the complete graph interaction
  matrix (Chromium required CI gate + Firefox local qualification, per #11/#12).
- Updating `tests/toolchain.test.mjs` (add an exact `typescript@6.0.3` pin and a
  `typescript-eslint` supported-line assertion; keep the ESLint-9 equality and the
  flat-config ignore invariants) and any README/doc/test enumerations affected,
  truthfully.

### Out of scope (non-goals)

- **No TypeScript 7 adoption** — blocked by `typescript-eslint` parser support
  (`<6.1.0`); explicitly deferred (FR13).
- **No ESLint 10 adoption** — separate peer-compatibility experiment; ESLint stays
  on the 9.39.5 line.
- No forced installs, `--legacy-peer-deps`, `--force`, or parser-warning
  suppression (`warnOnUnsupportedTypeScriptVersion:false` or equivalent) of any
  kind.
- **No removal of `skipLibCheck`** — that tightening is a separate issue after the
  3D/type alignment stabilizes.
- No runtime dependency changes (`next`, `react`, `react-dom`, `three`,
  `react-force-graph-3d`, Vercel packages, Tailwind/PostCSS/autoprefixer) and no
  reclassification changes — this stage is language + lint only.
- No new application routes, features, or test-only application surface; all
  qualification is driven from outside the app (Playwright/CDP against the
  unmodified production page), consistent with #11/#12.
- No zero-findings audit gate; pre-existing advisories remain separately tracked
  evidence. No change to the Next-owned nested PostCSS pin (not app-controlled).
- No change to the #11/#12 CI/local engine split (Chromium required in CI, Firefox
  local qualification).

## Constraints and Invariants

From the issue (fixed):

- Reverify the TypeScript target and `typescript-eslint`/parser support range at
  implementation time.
- `typescript` → exact `6.0.3`.
- Retain a supported `typescript-eslint` line (`8.64.0`, peers TS `<6.1`); retain
  ESLint 9 with the supported React, Hooks, Next, JS, globals, and compat packages
  from the earlier hygiene stage (#10).
- Fix TypeScript 6 deprecations and diagnostics rather than suppressing them
  indefinitely (resolve, or bound with a removal plan).
- Modernize the flat config intentionally: current Hooks flat configuration where
  possible; scope browser versus Node/CommonJS globals appropriately; preserve
  deliberate Next/React/TypeScript rule coverage.
- Remove `@eslint/compat` only if the final supported plugins/config no longer need
  it (already removed in #10 — confirm it stays absent; do not reintroduce).
- No `--force`, `--legacy-peer-deps`, or parser-warning suppression; clean
  supported peer tree.
- Do not remove `skipLibCheck` in this change.
- TypeScript 7 remains explicitly deferred pending `typescript-eslint` support;
  ESLint 10 is a separate experiment.

Repository invariants (fixed):

- Exact Node `22.23.1` / npm `10.9.8`, lockfile v3, clean `npm ci`; no dependency
  regeneration under any other toolchain; the lockfile is regenerated only via npm
  under the pinned toolchain.
- `npm run validate` (lint → typecheck → build+smoke) is the green gate; full and
  production audits are separately validated evidence, and existing advisories are
  not a zero-findings gate.
- Never `git add -A` / `git add .`; commit messages follow
  `[Spec 13][Phase: name] type: Description`.
- `typescript` and the lint stack stay in `devDependencies`.
- A local-only lint/gate failure caused solely by an untracked builder-harness
  file (e.g. `.claude/hooks/*`, absent from clean checkouts) is environment noise,
  proven on a clean checkout — never suppressed in committed config.

## Solution Exploration

### Approach A: Bump `typescript` only; leave `eslint.config.mjs` as-is

Change the manifest to `typescript@6.0.3`, run the gates, ship.

- **Pros**: smallest possible diff; the lint stack already accepts TS 6.0.3.
- **Cons**: fails the issue — it explicitly requires *finalizing* and
  *intentionally modernizing* the flat config (current Hooks flat config, scoped
  globals, preserved deliberate coverage) and confirming the `@eslint/compat`
  disposition. Leaving the legacy React `configs/recommended.js` path and the
  un-scoped `globals.commonjs` block leaves Stage 4's config work undone.
- **Risk**: low technically, but does not satisfy the acceptance criteria.
  **Rejected.**

### Approach B: Adopt whatever TypeScript/ESLint is latest at merge time

Chase `typescript@latest` (7.x) and/or `eslint@latest` (10.x) on merge day.

- **Pros**: never behind on merge day.
- **Cons**: directly violates the issue — TypeScript 7 is parser-blocked
  (`typescript-eslint <6.1.0`) and ESLint 10 is a separate experiment. Adopting
  either would require a forced install / peer bypass, all forbidden. Abandons the
  researched, reviewable bounded target.
- **Risk**: high (unsupported peer tree; forbidden bypass). **Rejected** — drift
  discovered at implementation time escalates to the architect (FR1), it does not
  retarget silently.

### Approach C: Exact TypeScript 6.0.3 adoption + intentional ESLint 9 flat-config finalization, retained supported lint stack, two-engine behavioral re-qualification (selected)

Pin `typescript` exactly to `6.0.3`; retain the supported lint stack
(`typescript-eslint@8.64.0`, ESLint 9, React/Hooks/globals); reconfirm the clean
TS-6.0.3 acceptance (no parser warning, no suppression) and the absence of option
deprecations; resolve or bound anything the deprecation pass surfaces; modernize
`eslint.config.mjs` intentionally (native React flat config, current Hooks
flat-config surface with a print-config-verified coverage decision, scoped
browser/Node/CommonJS globals, preserved deliberate coverage); confirm
`@eslint/compat` stays absent; re-run the two-engine matrix (Chromium CI + Firefox
local); land manifest, lockfile, config, tests, and docs as one rollback unit to
the `~5.7.3` baseline; explicitly defer TypeScript 7 and ESLint 10.

- **Pros**: satisfies every acceptance criterion; finalizes the language + lint
  target on the bounded supported line; makes every coverage change deliberate and
  print-config-verified rather than silent; reuses #11/#12's durable two-engine
  qualification bar; single revert restores the prior baseline.
- **Cons**: the flat-config modernization is real surface (mitigated by
  before/after `eslint --print-config` evidence and the existing matrix + smoke).
- **Risk**: low–medium, actively mitigated. **Selected.**

**On the Hooks coverage election (crux)**: #10 deliberately pinned the Hooks
effective set to two rules to avoid the *silent* coverage expansion that spreading
`eslint-plugin-react-hooks@7`'s ~16-rule `recommended` causes. #13's "use current
Hooks flat configuration where possible … preserve deliberate … rule coverage"
reads as: modernize the config's *shape* to the current flat-config surface while
keeping any coverage change *deliberate*. This spec's default (FR6) is
**coverage-preserving**: express Hooks through the current flat-config surface but
keep the effective rule set equal to the #10 baseline (rules-of-hooks: error,
exhaustive-deps: warn), proven by a before/after `eslint --print-config` rule
diff. Deliberately adopting the full `recommended` set (a real coverage increase)
is an explicit, reviewable alternative at the spec gate — never absorbed silently.

## Functional Requirements

### FR1 — Implementation-time target and support reverification

Before any manifest edit, reverify against the npm registry under the repository
toolchain: (a) `typescript@6.0.3` still exists and remains the intended bounded
target, and whether a newer supported **6.0.x** patch has superseded it; (b)
`typescript-eslint@8.64.0` still peers `typescript >=4.8.4 <6.1.0` and its
`@typescript-eslint/typescript-estree` `SUPPORTED_TYPESCRIPT_VERSIONS` still admits
`6.0.3` (so no unsupported-version warning); (c) `typescript-eslint`, ESLint 9,
`eslint-plugin-react`, `eslint-plugin-react-hooks`, and `globals` remain on their
current supported lines with no new *required* peer; (d) TypeScript 7 remains
parser-blocked (`typescript-eslint` still `<6.1.0` for its latest 8.x). If
reverification contradicts the target (e.g. `typescript-estree` narrows below
`6.0.3`, a superseding 6.0.x patch, or a new required peer), **stop and escalate to
the architect via `afx send`** rather than silently retargeting or bypassing.
Record the verification date and findings in the review.

### FR2 — Atomic manifest and lockfile update

Set `devDependencies.typescript` to exactly `6.0.3` and regenerate
`package-lock.json` only via npm under Node `22.23.1` / npm `10.9.8`. Retain
`typescript-eslint@~8.64.0`, `eslint`/`@eslint/js@~9.39.5` (string-equal),
`eslint-plugin-react@~7.37.5`, `eslint-plugin-react-hooks@7.1.1`, and
`globals@~17.7.0` unchanged; make no runtime-dependency changes. Lockfile stays v3;
a subsequent clean `npm ci` must succeed without mutating `package.json` or
`package-lock.json` and without peer-dependency warnings/errors and without
`--force` / `--legacy-peer-deps`. Manifest, lockfile, config, any source, test,
and doc changes land as one unit (single PR; phase commits within it).

### FR3 — TypeScript 6 diagnostics and deprecations resolved or bounded

Run `npm run typecheck` (`tsc --noEmit`) under TypeScript 6.0.3 against the full
checked-in `tsconfig.json` and source. It must exit 0. Capture any TypeScript 6
deprecation diagnostics (compiler-option or code-level). Each surfaced deprecation
is either **resolved in place** (e.g. replace a deprecated option with its
non-deprecated equivalent) or **explicitly bounded with a removal plan** tied to
the deferred TypeScript 7 stage and recorded in the review — never suppressed
indefinitely and never silenced by disabling the diagnostic. `skipLibCheck` is
retained unchanged. Record the exact `tsc` invocation and its (deprecation-free or
resolved) output in the review. (Probe expectation per Confirmed Decisions #3: no
option deprecations on the current options; reconfirm against the full config.)

### FR4 — No unsupported-version warning and no suppression under TypeScript 6.0.3

`npm run lint` (`eslint .`) runs under TypeScript 6.0.3 with **no**
`typescript-eslint` / `@typescript-eslint/typescript-estree` "unsupported
TypeScript version" warning in its output, achieved **without** any suppression
(no `warnOnUnsupportedTypeScriptVersion:false`, no parser-warning filter, no
`--force`/`--legacy-peer-deps`). The mechanism is the supported range admitting
`6.0.3` (Confirmed Decisions #2), reverified in FR1. The review records the actual
lint output demonstrating the absence of the warning.

### FR5 — Scoped browser versus Node/CommonJS globals

`eslint.config.mjs` scopes global sets by file group instead of applying a single
un-scoped `globals.commonjs` block:

- **Browser globals** (`globals.browser`) for the app/client source that runs in
  the browser (`app/**/*.{ts,tsx}`, notably the client island
  `app/components/FocusGraph*.tsx` and `focusGraphResources.ts`, which use
  `window`/`document`/WebGL/`requestAnimationFrame`).
- **Node/CommonJS globals** (`globals.node`, plus `globals.commonjs` /
  `sourceType: "commonjs"` for the `module.exports` config files) for the
  toolchain files: `eslint.config.mjs`, `playwright.config.ts`, `next.config.js`,
  `postcss.config.js`, `tailwind.config.ts`, `scripts/**`, and `tests/**`
  (`*.test.mjs` node-test files, `tests/e2e/*.spec.ts` / `graph-handle.ts`).
- The mixed Node-runner-plus-`page.evaluate`-browser context of the e2e specs is
  handled explicitly (e.g. Node globals for the test module with browser globals
  available where in-page callbacks reference them), documented in the review.

The scoping must be **behavior-preserving for diagnostics**: before/after `eslint
--print-config` on representative files (a client `.tsx`, a Node config `.mjs`, a
CommonJS config `.js`, a test `.mjs`) shows the intended globals present and no
legitimate global newly flagged (`no-undef`) and no new unused-globals noise. Any
change in effective globals is intentional and recorded.

### FR6 — Modernized React/Hooks flat-config surfaces with preserved deliberate coverage

`eslint.config.mjs` is modernized to current flat-config idioms while preserving
the deliberate rule coverage established in #10:

- **React**: replace the legacy `eslint-plugin-react/configs/recommended.js`
  import with the plugin's native flat surface (`configs.flat.recommended`),
  keeping the `settings.react.version: "detect"` and the deliberate offs
  (`react/react-in-jsx-scope: off`, `react/jsx-uses-react: off`).
- **Hooks**: express `eslint-plugin-react-hooks@7`'s coverage through its current
  flat-config surface. **Default (this spec's election): coverage-preserving** —
  the effective Hooks rules remain `react-hooks/rules-of-hooks: error` and
  `react-hooks/exhaustive-deps: warn`, equal to the #10 baseline. A deliberate
  adoption of the full `recommended` rule set is permitted **only** if elected at
  the spec gate and then documented as an intentional coverage increase.
- **TypeScript / JS**: preserve `@eslint/js` recommended, `typescript-eslint`
  recommended, and `@typescript-eslint/no-explicit-any: off`.
- **Next**: preserve the direct `@next/eslint-plugin-next` wiring (`recommended` +
  `core-web-vitals`).

Coverage is proven with before/after `eslint --print-config` on a representative
app file (e.g. `app/page.tsx`) and, where relevant, a client component: the
effective rule set for JS/TypeScript/React/Hooks/Next is equivalent (or an
explicitly-elected, documented delta), with **no silent** coverage change. Any
rule-id/option delta attributable to the config restructure (not a version bump)
is listed and explained in the review.

### FR7 — `@eslint/compat` disposition confirmed

Confirm `@eslint/compat` remains absent from `package.json` and the lockfile and
is not reintroduced (no `fixupConfigRules`/`fixupPluginRules` shims). The final
config uses only native flat-config surfaces. The review states the confirmation
(carried forward from #10's removal, per FR5's constraint text).

### FR8 — Automated validation gates

All of the following pass at the final commit: `npm run lint` (clean, no parser
warning — FR4), `npm run typecheck` (clean under TS 6.0.3 — FR3), `npm test`
(including updated contract tests), `npm run build`, a direct production
`npm run start` serving the root page HTTP 200, `npm run test:smoke`, aggregate
`npm run validate`, and the audit evidence pipeline (`npm run audit:full` /
`audit:production` through `scripts/validate-audit-report.mjs` semantics,
preserving original exit codes).

### FR9 — Browser smoke and complete interaction matrix (reused)

The automated smoke and the complete graph interaction matrix — the canonical
committed suites reused from #11/#12: `tests/e2e/matrix.spec.ts` (13-item matrix),
`tests/e2e/smoke.spec.ts` (canvas/WebGL readiness + controls + strict error
budget), the shared `tests/e2e/graph-handle.ts` imperative-handle helper, and the
`tests/focus-graph-lifecycle.test.mjs` unit suite — pass against the production
build. This stage **re-runs** them (a language/lint change must not alter runtime
behavior), it does not re-author them. The #11/#12 CI/local engine split is reused
unchanged: Chromium (SwiftShader) is the required gate (`E2E_ENGINES=chromium`)
locally and in CI; Firefox remains the documented local qualification gate.
Verification stays numeric via the react-force-graph imperative handle, driven from
outside the app; no test-only application surface is added. Any behavioral
difference from the pre-change baseline is replayed against the rollback baseline
before being attributed to this change (expected: none, since no runtime dependency
moves).

### FR10 — Lockfile and audit delta review

Record before/after resolved versions for `typescript` and every transitive entry
the upgrade moves (expected: minimal — `typescript` is a leaf devDependency with no
dependencies of its own). Provide before/after full (`npm audit`) and production
(`npm audit --omit=dev`) comparisons, path-by-path, preserving original exit codes
per the validate-audit-report methodology; identify which advisory paths this
change resolves, introduces, or leaves unchanged. Confirm the residual
**Next-owned** nested `postcss@8.4.31` is unchanged and carry it forward as a
documented, non-app-controllable build-time residual (not a new or closed finding).
Raw JSON stays local/CI evidence; the review carries the comparison tables.

### FR11 — Supply-chain verification of changed lockfile entries

For every lockfile entry changed by this upgrade: (a) `resolved` URLs point only at
the public npm registry (`registry.npmjs.org`) — no git, tarball-URL, or
alternate-registry sources; (b) no changed entry introduces an install script
(`hasInstallScript`/`preinstall`/`install`/`postinstall`) its previous version
lacked (each *newly introduced* install script is individually called out and
explained; *pre-existing, unchanged* install scripts need only be confirmed as such
— no exhaustive re-enumeration, consistent with #11/#12); (c) `npm ci` output shows
no unexpected package-manager behavior. Findings go in the review's lockfile
section.

### FR12 — Contract-test and docs updates

`tests/toolchain.test.mjs` gains an assertion pinning
`devDependencies.typescript === "6.0.3"` (exact, matching `/^\d+\.\d+\.\d+$/` and
the lockfile) and an assertion that `typescript-eslint` is on a supported line
whose declared `typescript` peer admits `6.0.3` and excludes `6.1.0`+ (documenting
the TS-7 block); it continues to enforce the Node/npm/lockfile-v3 invariants, the
`eslint`/`@eslint/js` `~9.` string-equality, and the flat-config global-ignore
invariant (which must still hold after the `files`-scoped blocks are added — the
config must still contain exactly one global-ignore block with no `files`).
`README.md` and any doc/test enumerations affected by the config restructure are
updated to stay truthful. TypeScript 7 / ESLint 10 deferral is noted where
toolchain versions are documented. All doc/test enumerations updated in the same
rollback unit.

### FR13 — TypeScript 7 / ESLint 10 deferral, rollback unit, and blocking semantics

The review explicitly records that TypeScript 7 is deferred pending
`typescript-eslint` parser support (`<6.1.0`) and that ESLint 10 is a separate peer
experiment — neither is adopted here. The manifest, lockfile, `tsconfig`,
`eslint.config.mjs`, any source edits, contract tests, and docs are one revertible
unit: a single revert restores the `typescript@~5.7.3` baseline and green. If any
validation gate or matrix item fails under TypeScript 6.0.3 / the modernized config
and baseline replay attributes it to this change, the stage is **blocked**
(escalate with evidence); do not ship partial workarounds (e.g. suppressing the
parser warning, forcing installs, downgrading a lint plugin, or silently dropping
deliberate rule coverage).

## Non-Functional Requirements

### Reproducibility

Everything under the exact Node `22.23.1` / npm `10.9.8` / lockfile-v3 / `npm ci`
contract; no toolchain drift; the lockfile regenerated only via npm under the
pinned toolchain; lockfile provenance stays the public registry.

### Behavior preservation

The user-visible contract of the page — timing, camera/pointer semantics, control
buttons, canvas bring-up — is identical before and after. This stage changes only
the language version and lint configuration, with no runtime dependency movement;
the matrix proves runtime behavior is unchanged rather than merely asserting it.

### Evidence honesty

Every claim in the review states the tool and version (`tsc@6.0.3`,
`eslint@9.39.5` + `typescript-eslint@8.64.0`), the exact command, and the result.
The `eslint --print-config` before/after diffs are recorded so coverage
equivalence (or a deliberate delta) is provable, not asserted. Environment-limited
results (e.g. Firefox WebGL on CI) are recorded as such, consistent with #11/#12.

### Supply-chain integrity

The change introduces no new install scripts, no non-registry sources, and no
unexpected package-manager behavior (FR11); audit evidence is compared path-by-path
with original exit codes preserved (FR10).

### Maintainability

The language target is finalized on the bounded supported TypeScript 6 line with a
clean, modern, intentionally-scoped ESLint 9 flat config and no peer-bypass debt,
keeping the deferred stages (TypeScript 7, ESLint 10, `skipLibCheck` tightening)
cleanly unblocked and the reproducibility/qualification bars unchanged.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| `typescript-eslint@8.64.0`'s `typescript-estree` narrows its supported range below `6.0.3` in a newer patch, or the checked-in resolution warns | Parser warning → tempting to suppress (forbidden) | FR1 reverifies the `SUPPORTED_TYPESCRIPT_VERSIONS` constant admits `6.0.3` (verified `>=4.8.4 <6.1.0`); if it ever narrows, escalate — never suppress (FR4) |
| TypeScript 6.0.3 surfaces option/code deprecation diagnostics on the full config | Unresolved diagnostics / silenced warnings | FR3 requires resolving in place or bounding with a documented removal plan; probe shows none on current options, reconfirm against full config |
| Modernizing React to `configs.flat.recommended` or the Hooks flat surface silently changes effective rule coverage | Lint coverage regression or unreviewed expansion | FR6 requires before/after `eslint --print-config` proving equivalence (or an explicitly-elected, documented delta); default is coverage-preserving |
| Globals rescoping flags a legitimate global (`no-undef`) or adds unused-globals noise, especially in mixed Node+browser e2e specs | Lint failure / noise | FR5 requires print-config evidence per file group and explicit handling of the e2e Node+`page.evaluate` context |
| TypeScript 7 (registry `latest`) or ESLint 10 gets pulled in by a range or "chase latest" instinct | Unsupported peer tree / forbidden bypass | Exact `typescript@6.0.3` pin (FR2); ESLint stays `~9.`; FR13 records the deferral; FR1 escalates drift instead of retargeting |
| A newer supported 6.0.x patch supersedes `6.0.3` at implementation time | Unreviewed target ships | FR1 reverification with escalation, not silent retarget |
| Local `eslint .` failure from the untracked `.claude/hooks/*` harness file (absent from clean checkouts) misread as a project failure | False blocker | Per lessons-critical: prove the gate on a clean checkout (`git worktree add --detach HEAD` + real `npm ci`); never suppress in committed config |
| Residual Next-owned nested PostCSS misread as a new/closed finding | Misleading audit story | FR10 carries it forward as a documented, non-app-controllable residual |

## Acceptance Scenarios

### Scenario 1 — Verified supported target group
`npm ci` on the updated manifest under the exact toolchain completes with a
supported peer tree, lockfile v3, no manifest mutation, exactly `typescript@6.0.3`,
and the ESLint-9 lint stack unchanged (no `--force`/`--legacy-peer-deps`).

### Scenario 2 — Clean typecheck under TypeScript 6.0.3
`npm run typecheck` exits 0 under `tsc@6.0.3`; any deprecation diagnostic is
resolved in place or bounded with a documented removal plan; `skipLibCheck` is
retained.

### Scenario 3 — No unsupported-version warning, no suppression
`npm run lint` runs clean under TypeScript 6.0.3 with no `typescript-eslint`
unsupported-version warning and no suppression flag/config anywhere.

### Scenario 4 — Intentionally modernized, coverage-preserving flat config
`eslint.config.mjs` uses the native React flat config and the current Hooks
flat-config surface, scopes browser vs Node/CommonJS globals by file group, keeps
`@eslint/compat` absent, and preserves the deliberate JS/TypeScript/React/Hooks/Next
coverage — proven by before/after `eslint --print-config` diffs (equivalent, or an
explicitly-elected documented delta).

### Scenario 5 — Static and automated gates
Lint, typecheck, `npm test` (with updated contract tests), build, direct production
start (root HTTP 200), the Chromium-required smoke, and aggregate `validate` all
exit 0 at the final commit.

### Scenario 6 — Interaction matrix unchanged
The complete graph interaction matrix passes (Chromium required gate + Firefox local
qualification) with zero unexpected page/console/hydration/timer/WebGL-context/GPU
errors, per #11/#12 semantics — demonstrating the language/lint change did not alter
runtime behavior.

### Scenario 7 — Honest lockfile and audit story
The review documents the `typescript` before/after versions and any transitive
delta, the full/production audit deltas path-by-path (exit codes preserved), and the
unchanged residual Next-owned nested `postcss@8.4.31`.

### Scenario 8 — Deferral recorded
The review and docs explicitly record TypeScript 7 as deferred pending
`typescript-eslint` support (`<6.1.0`) and ESLint 10 as a separate experiment;
neither is adopted; `skipLibCheck` is untouched.

### Scenario 9 — Atomic rollback
A single revert of the unit restores the `typescript@~5.7.3` baseline; no follow-up
fixes are required to return to green.

### Scenario 10 — Blocking honored
If any gate or interaction fails under TypeScript 6.0.3 / the modernized config and
baseline replay attributes it to this change, the stage stops with evidence and
escalation — no parser-warning suppression, no forced install, no lint-plugin
downgrade, no silent coverage drop.

## Open Questions

### Critical

- None. Verification (2026-07-20) confirmed `typescript@6.0.3` exists, that
  `@typescript-eslint/typescript-estree@8.64.0`'s `SUPPORTED_TYPESCRIPT_VERSIONS`
  (`>=4.8.4 <6.1.0`) admits `6.0.3` (no parser warning, no suppression), and that
  TypeScript 6.0.3 emits no option deprecations on the repo's compiler options.

### Important

- **Hooks coverage election** (settled decision, overridable only at the
  spec-approval gate): the default is coverage-preserving (Hooks effective set
  equal to the #10 baseline, expressed through the current flat-config surface),
  with adopting the full `recommended` set available as an explicit, documented
  election at the gate (FR6, Solution Exploration).
- **`typescript-eslint` patch election** (settled, gate-overridable): retain
  `8.64.0` (researched target) versus take the `8.65.0` patch, which carries the
  same `<6.1.0` TS range and thus no TypeScript-support change (Confirmed
  Decisions #7).

### Nice-to-know

- Whether TypeScript 6.0.3 changes any effective typecheck result for the app's
  source versus 5.7.3 (expected: none, given `strict`/`skipLibCheck` unchanged) —
  worth a note in the review, not a gate.
- Whether the modernized flat config changes lint runtime/output ordering versus
  the legacy React config path — cosmetic, recorded if observed.

## References

- Issue #13; roadmap issue #6; research:
  `codev/research/architecture-dependency-modernization.md` (Stage 4 — language and
  lint).
- Direct dependency: spec/plan/review 12 (Next 16 Active LTS, merged PR #26) —
  source of the reused two-engine matrix, the CI/local engine split, the
  exact-pin/contract-test discipline, and the audit/lockfile methodology.
- ESLint-hygiene source: spec/review 10 (patch and reclassify CSS/build) —
  established the ESLint 9 flat config, removed `@eslint/compat`, bumped
  `eslint-plugin-react-hooks` 5→7 with the rule set pinned to avoid silent coverage
  expansion, and set the `eslint .` CLI path from #7. #13 finalizes that config.
- Prior stages: spec/review 11 (3D/WebGL two-engine qualification, matrix), 9
  (Next 15/React 19), 7 (reproducible Node toolchain), bugfix 8 (FocusGraph
  lifecycle hardening).
- `codev/resources/arch.md` / `arch-critical.md` (Validation Baseline; Framework
  and Bundler Baseline; reproducibility contract),
  `codev/resources/lessons-learned.md` / `lessons-critical.md` (Validation
  Evidence; Toolchain and Worktree Hygiene).
- Registry + behavioral verification 2026-07-20: `npm view typescript dist-tags`
  (`latest 7.0.2`, `beta 6.0.0-beta`; `6.0.3` exists);
  `npm view typescript-eslint@8.64.0 peerDependencies` (`typescript >=4.8.4
  <6.1.0`, `eslint ^8.57.0 || ^9.0.0 || ^10.0.0`); `npm view typescript-eslint@latest`
  (`8.65.0`, same TS range); inspection of
  `@typescript-eslint/typescript-estree@8.64.0`'s
  `SUPPORTED_TYPESCRIPT_VERSIONS = '>=4.8.4 <6.1.0'` (admits `6.0.3`); scratchpad
  `tsc@6.0.3 --noEmit` probe on the repo `compilerOptions` (exit 0, no
  deprecations); `npm view eslint dist-tags.latest` (`10.7.0`); `globals@17.7.0`
  exposes `browser`/`node`/`commonjs`/`worker`.
- [TypeScript releases](https://www.typescriptlang.org/docs/handbook/release-notes/overview.html),
  [typescript-eslint releases](https://github.com/typescript-eslint/typescript-eslint/releases),
  [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files).

## Consultation Log

_Pending — porch runs the 3-way consultation (Gemini, Codex, Claude) at the verify
step of the Specify phase; feedback and resulting changes will be appended here.
A second consultation is appended if the spec is revised at the spec-approval gate._
