# Architecture

This document evolves as the project grows. Update it during the review phase
of any work that introduces or changes architectural patterns.

## Validation Baseline

The repository's reproducibility contract is Node.js `22.23.1`, npm `10.9.8`,
lockfile v3, and clean `npm ci`. `npm run validate` is the single-command local
green gate, whose real production-server two-engine (Chromium and Firefox) smoke
checks WebGL and the core controls in both engines. GitHub Actions does **not**
run that one command; it runs a **contract-equivalent decomposition** of it,
parallelized to cut wall clock (~15 min → ~5–6 min): a `quality` job (lint +
typecheck + `npm test` + audit evidence) and an `e2e` matrix that builds and
runs the FULL Playwright suite split at the test level across four Chromium
shards (`playwright.config.ts` sets `fullyParallel: true` while keeping
`workers: 1`, so each shard is strictly serial). The decomposition drops no
check: lint, typecheck, build, and every e2e test still run, the Chromium engine
gate is pinned via `E2E_ENGINES=chromium`, and a `gate` job gives a single
required status. Do not raise `workers` or trim the qualified per-test waits —
the SwiftShader timing environment (one test at a time) is what the decomposition
preserves. Full and production npm audits are separate evidence: CI validates
their JSON/original status and uploads them without turning existing advisory
totals into a zero-findings gate. Contributor commands and artifact names live in
`README.md`; implementation details live in `.github/workflows/validation.yml`,
`playwright.config.ts`, and `scripts/validate-audit-report.mjs`.

An **opt-in native-GPU local lane** (`npm run test:e2e:gpu`,
`scripts/e2e-gpu-lane.mjs`, specs 44 + 52) sits beside this gate, never inside
it: it probes the host **per engine** and verifies the effective
`UNMASKED_RENDERER_WEBGL` against a software deny-list (SwiftShader, llvmpipe,
softpipe, lavapipe, swrast, software, Microsoft Basic) BEFORE trusting a run,
then runs the full **two-engine (Chromium + Firefox)** suite
(`E2E_ENGINES=chromium,firefox`) in one invocation. Chromium injects verified
ANGLE flags through the config's env-gated `PW_CHROMIUM_ARGS` hook (env unset ⇒
byte-identical SwiftShader defaults); Firefox uses the **same** WSL2 Mesa d3d12
env with **no ANGLE flags** and inherits it from the suite process, so it needs
no `playwright.config.ts` change. Because Firefox privacy-sanitizes the unmasked
renderer to `Generic Renderer`, the lane reads Firefox's raw renderer through an
ephemeral **probe-only** `webgl.sanitize-unmasked-renderer:false` preference (the
committed `firefox` project keeps `webgl.force-enabled:true` only); a sanitized
string classifies as *unverifiable*, never hardware. Headless by default (the
d3d12 path needs no display; headed WSLg via `--mode=headed`),
`--engine=chromium|firefox|all` selects the engine set, and the two-engine
hardware suite runs ~6× faster per test than the SwiftShader baseline (qualified
2026-07 on WSL2/RTX 3080: 4 fully-green two-engine runs at `retries: 0`). Honest
fallback: no usable adapter ⇒ Chromium runs under SwiftShader with a loud banner
while Firefox is **skipped** (no portable software equivalent — never an llvmpipe
masquerade); `E2E_GPU_REQUIRE=1` hard-fails if any requested engine is
unverified, `E2E_GPU_FORCE_FALLBACK=1` exercises the fallback deterministically.
CI stays `E2E_ENGINES=chromium` SwiftShader-only; the lane keeps `workers: 1`
(parallelizing on top is issue #41's qualification, sequenced after). Recipe and
evidence: `README.md` ("Opt-in native-GPU e2e lane") and
`codev/reviews/44-add-an-opt-in-native-gpu-local.md` +
`codev/reviews/52-firefox-hardware-webgl-gpu-lane.md`.

## Dependency Classification and Lint Config

Build-time and type-only packages are `devDependencies`: `postcss`,
`tailwindcss`, `autoprefixer` (the PostCSS/Tailwind build pipeline) and
`@types/three` (typecheck/bundler only). The runtime `three` package stays in
`dependencies`. This keeps `npm audit --omit=dev` a meaningful runtime baseline;
the deploy/CI environment must install dev dependencies (CI runs plain `npm ci`
and the production build).

The Three.js/force-graph unit is behaviorally qualified and **exact-pinned**:
`three` and `@types/three` are pinned to the same qualified version (currently
`0.185.1`) and kept string-equal so the runtime and its community types cannot
de-align; `react-force-graph-3d` is pinned exactly (`1.29.1`). `three` resolves
as a single deduped runtime (no nested `node_modules/**/node_modules/three`),
and TrackballControls is imported from the documented
`three/addons/controls/TrackballControls.js` path. `tests/toolchain.test.mjs`
enforces all four properties (both pins, single runtime, type alignment, exact
`react-force-graph-3d`) so a later dependency bump cannot silently split the
runtime or de-align the types. Any such upgrade is one atomic rollback unit
(manifest + lockfile + code + contract tests) and must be re-qualified against
the two-engine interaction matrix, not just install/build success.

The language target is TypeScript **6** — `typescript` is exact-pinned on the 6.x
line (currently `6.0.3`); `tests/toolchain.test.mjs` enforces the exact pin and
asserts the resolved `typescript-eslint` parser peer admits it and excludes
`6.1.0`+. TypeScript 7 is deferred pending `typescript-eslint` parser support (its
TS peer stops `<6.1.0`); ESLint 10 is a separate peer experiment — the lint stack
stays on ESLint 9.

The ESLint 9 flat config (`eslint.config.mjs`) is finalized on native flat-config
surfaces (no `@eslint/compat`/`fixupPluginRules`): React via `eslint-plugin-react`'s
`configs.flat.recommended` (replacing the legacy `configs/recommended.js` eslintrc
shim; rule-identical), and `eslint-plugin-react-hooks` v7's native registration with
the intended Hooks rule set pinned explicitly (`react-hooks/rules-of-hooks`,
`react-hooks/exhaustive-deps`) rather than spreading `configs.recommended`/
`recommended-latest`, whose v7 forms bundle 16/17 rules — spreading would silently
expand coverage. Globals are scoped by file group instead of one un-scoped block:
`globals.browser` for the `app/**` client island; `globals.node` for the Node/ESM
toolchain files; `globals.node`+`globals.commonjs`/`sourceType:"commonjs"` for the
`module.exports` config files (selected by explicit glob, including the `.ts`-but-
CommonJS `tailwind.config.ts` — not a `.ts`=ESM heuristic); and both sets for the
mixed `tests/e2e/**` (Node runner + in-page `page.evaluate` bodies). Coverage
equivalence across a config restructure is proven with before/after
`eslint --print-config`, and `tests/toolchain.test.mjs` still enforces exactly one
`files`-less global-ignore block (generated output only).

## Framework and Bundler Baseline

The app runs on Next.js 16 (Active LTS) with React 19 (`react`/`react-dom`
exact-pinned at `19.2.7`). Turbopack is the Next 16 default bundler for **both**
`dev` (`next dev`) and `build` (`next build`); the scripts rely on that default
rather than pinning `--turbopack`/`--webpack`, and the production Turbopack build is
behaviorally qualified against the two-engine interaction matrix (not just build
success). The `next lint` command is gone; linting is the explicit `eslint .` CLI
path with `@next/eslint-plugin-next` wired directly in `eslint.config.mjs` and
exact-pinned string-equal to `next`. The Node floor is `>=20.9.0` (the repo pins
`22.23.1`); the supported-browser floor is Chrome/Edge/Firefox 111 and Safari 16.4
(Next's zero-config default, all WebGL2-capable), so the app declares no
`browserslist`.

`next` bundles its own nested `postcss` (`node_modules/next/node_modules/postcss`,
currently `8.4.31`) that the app cannot control in this stage. It is a documented,
Next-owned build-time residual (audit-neutral and un-fixable from the app — npm
offers only a bogus major downgrade), independent of the app's own top-level
`postcss` (kept patched). Treat it as carried-forward, not a new or closed finding.
