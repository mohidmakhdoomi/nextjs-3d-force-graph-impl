# spir-12 thread — Migrate the application to Next 16 Active LTS

Builder for Issue #12 (Stage 3 of the dependency-modernization roadmap #6).
Strict-mode SPIR. Depends on #11 (Next 15 baseline, merged as PR #25).

## Specify phase

Started specify. No pre-existing spec — authoring from the issue + Stage 3 research.

### Grounding done before drafting (2026-07-20)
- Current baseline (post-#11): `next@15.5.20`, `@next/eslint-plugin-next@15.5.20`
  (devDep), `react`/`react-dom` `19.2.7`, Node `22.23.1`/npm `10.9.8`, lockfile v3.
- Registry reverification (`npm view`):
  - `next` latest = `16.2.10`; `@next/eslint-plugin-next` latest = `16.2.10`.
  - `backport` dist-tag = `15.5.20` (our rollback baseline — never `15.1.11`).
  - `next@16.2.10` engines `node >=20.9.0` (22.23.1 satisfies); peers
    react/react-dom `^18.2.0 || ^19.0.0` (19.2.7 satisfies). All other peers
    (`sass`, `@playwright/test`, `@opentelemetry/api`,
    `babel-plugin-react-compiler`) are `peerDependenciesMeta.optional`.
- Migration surface confirmed minimal: no middleware, no dynamic request APIs
  (cookies/headers/params/searchParams) in `app/`, empty `next.config.js`,
  `app/page.tsx` is a static async server component rendering the client island.
- `next lint` already gone: `lint` script is `eslint .` (#7); flat config wires
  `@next/eslint-plugin-next` directly. Only obsolete flag left = `--turbopack`
  on the `dev` script. `automation.test.mjs` does NOT pin `dev`, so dropping it
  is contract-safe.
- Nested PostCSS: `node_modules/next/node_modules/postcss@8.4.31` is pinned by
  `next` itself — `next@16.2.10` bundles `postcss@8.4.31` exactly as 15.5.20
  does. Next-owned build-time residual; persists across the upgrade → explicit
  disposition, not a fixable finding here.
- Contract test to update: `tests/toolchain.test.mjs` pins next/plugin to
  `15.5.20` and asserts `next === @next/eslint-plugin-next`.

No "Baked Decisions" heading in the issue; scope/acceptance-criteria text
treated as fixed. Elections (Turbopack-by-default, exact pins) flagged in the
spec's Confirmed Decisions, overridable at the spec gate.

### Specify iteration 1 — 3-way consult (2026-07-20)
Gemini APPROVE (high), Claude APPROVE (high), Codex COMMENT (high). No
REQUEST_CHANGES. Incorporated all feedback (minor/clarifying):
- FR5: explicit repo-local evidence method for the no-Node-import check
  (scan `.next/static/` emitted client assets) + `npm ls three`.
- FR9: named the exact #11 suites (matrix.spec.ts, smoke.spec.ts,
  graph-handle.ts, focus-graph-lifecycle.test.mjs) + review 11 §FR9.
- FR11: install-script listing scope (new ones called out; pre-existing
  unchanged only confirmed).
- FR2: `next.config.js` → `.ts`/ESM noted as a reviewed codemod surface.
Committed as "Specification with multi-agent review". Next: porch drives to the
spec-approval GATE → notify architect and STOP for human approval.
