# Plan: Adopt TypeScript 6 and Finalize the Supported ESLint 9 Flat Config

## Metadata
- **ID**: plan-2026-07-20-adopt-typescript-6-and-finaliz
- **Status**: draft
- **Specification**: [codev/specs/13-adopt-typescript-6-and-finaliz.md](../specs/13-adopt-typescript-6-and-finaliz.md)
- **Created**: 2026-07-20

## Executive Summary

Implements the spec's selected **Approach C**: pin `typescript` exactly to `6.0.3`
(the bounded supported target), retain the supported ESLint 9 lint stack
(`typescript-eslint@8.64.0`, `eslint`/`@eslint/js@9.39.5`, React/Hooks/globals),
and intentionally finalize `eslint.config.mjs` — all as one revertible unit, with
TypeScript 7 and ESLint 10 explicitly deferred.

The work splits into three phases that isolate the two distinct change-units from
the evidence-gathering, so each commit is small, independently testable, and
independently revertible:

1. **`typescript6_adoption`** — a pure manifest/lockfile/contract-test change:
   move `typescript` to exact `6.0.3`, prove `tsc` runs clean (resolve or bound
   any TS 6 deprecation), prove `eslint .` emits no `typescript-eslint`
   unsupported-version warning **with the config shape unchanged**, and pin the
   version in the contract test. This isolates "did TS 6 change anything?" from any
   config edit.
2. **`eslint9_config_finalization`** — a pure `eslint.config.mjs` refactor (no
   version change): migrate React to the native flat config, scope browser vs
   Node/CommonJS globals by file group, keep Hooks coverage-preserving via the
   existing flat-native registration (architect-confirmed default — **not** the
   16/17-rule preset), confirm `@eslint/compat` stays absent, and prove coverage
   equivalence with before/after `eslint --print-config`.
3. **`qualification_evidence_docs`** — end-to-end qualification of the combined
   state: full gate set + direct production start, the reused two-engine
   interaction matrix, the lockfile/audit delta + supply-chain review, docs, and
   the TS7/ESLint10 deferral record.

The architect approved the spec (2026-07-20) and confirmed both elections at their
defaults: **(1)** Hooks coverage-preserving (keep the #10 two-rule effective set
via the existing flat-native registration; the 16/17-rule preset stays a future
deliberate change); **(2)** retain `typescript-eslint@8.64.0` (the `8.65.0` patch
carries the same `<6.1.0` TS range, no benefit). This plan encodes both.

## Success Metrics

Copied from the spec's acceptance scenarios and made implementation-checkable:

- [ ] Target/support reverified at implementation time against a real install, not
      a bare `require` (FR1, Confirmed Decisions #8); drift escalated, not silently
      retargeted.
- [ ] `typescript` pinned to exactly `6.0.3` in `devDependencies`; the ESLint 9
      lint stack unchanged; lockfile v3; clean `npm ci` with no manifest/lock
      mutation, no peer warnings, no `--force`/`--legacy-peer-deps` (FR2).
- [ ] `npm run typecheck` (`tsc@6.0.3`) exits 0; any TS 6 deprecation resolved in
      place or bounded with a documented removal plan; `skipLibCheck` retained (FR3).
- [ ] `npm run lint` runs clean under TS 6.0.3 with **no** `typescript-eslint`
      unsupported-version warning and **no** suppression (FR4).
- [ ] Globals scoped by file group (browser for `app/**`; Node/CommonJS for
      config/scripts/tests; e2e gets both), proven by `eslint --print-config` (FR5).
- [ ] React on the native flat config; Hooks coverage-preserving via the
      flat-native registration; deliberate JS/TS/React/Hooks/Next coverage and the
      explicit offs preserved — proven by before/after `eslint --print-config`
      equivalence (FR6).
- [ ] `@eslint/compat` confirmed absent from manifest + lockfile; no fixup shims (FR7).
- [ ] `lint`, `typecheck`, `npm test` (incl. updated contract tests), `build`,
      `test:smoke`, aggregate `validate`, and the audit evidence pipeline pass at
      the final commit; a direct production `npm run start` serves the root page
      HTTP 200 as a separate recorded step (FR8).
- [ ] Complete interaction matrix + smoke pass (Chromium required gate + Firefox
      local), zero unexpected errors; runtime behavior unchanged from baseline (FR9).
- [ ] Lockfile/audit delta documented path-by-path (exit codes preserved); nested
      Next-owned `postcss@8.4.31` carried forward unchanged (FR10).
- [ ] Supply-chain verification of every changed lockfile entry (registry-only
      `resolved`, install-script delta) recorded (FR11).
- [ ] `tests/toolchain.test.mjs` pins `typescript@6.0.3` exactly and asserts the
      `typescript-eslint` supported line; README references the "TypeScript 6"
      line; TS7/ESLint10 deferral noted (FR12).
- [ ] Single-revert rollback to the `~5.7.3` baseline holds; blocking semantics
      honored; TS7 deferred pending `typescript-eslint` support (FR13).

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "typescript6_adoption", "title": "Adopt TypeScript 6.0.3, Resolve/Bound Diagnostics, and Pin It (Contract Tests)"},
    {"id": "eslint9_config_finalization", "title": "Finalize the ESLint 9 Flat Config (Native React Flat Config, Scoped Globals, Coverage-Preserving)"},
    {"id": "qualification_evidence_docs", "title": "End-to-End Qualification, Lockfile/Audit Delta, Supply-Chain, Docs, and Deferral"}
  ]
}
```

## Phase Status

| Phase | Status |
|-------|--------|
| typescript6_adoption | pending |
| eslint9_config_finalization | pending |
| qualification_evidence_docs | pending |

## Phase Breakdown

### Phase 1: Adopt TypeScript 6.0.3, Resolve/Bound Diagnostics, and Pin It (Contract Tests)
**Dependencies**: None
**Implements**: FR1, FR2, FR3, FR4, FR12 (the `typescript` pin + `typescript-eslint`
support assertion); establishes the FR13 rollback unit.

#### Objectives
- Reach a statically-green TypeScript 6.0.3 baseline **without touching the config
  shape**: `typescript@6.0.3` exact, a clean `tsc` (deprecations resolved or
  bounded), a clean `eslint .` (no parser warning, no suppression), and the version
  pinned in the contract test.
- Isolate the language bump so any later lint-coverage change is attributable to
  the Phase 2 config refactor, not to TS 6.

#### Deliverables
- [ ] **FR1 reverification** recorded (scratch notes → carried to the review),
      performed against a real `npm ci`/isolated install (NOT a bare `require`, per
      Confirmed Decisions #8): (a) `typescript@6.0.3` still exists and is the
      bounded target, and no newer supported **6.0.x** patch supersedes it;
      (b) `typescript-eslint@8.64.0` still peers `typescript >=4.8.4 <6.1.0` and its
      `@typescript-eslint/typescript-estree` `SUPPORTED_TYPESCRIPT_VERSIONS` still
      admits `6.0.3`; (c) no new *required* peer; (d) TS 7 still parser-blocked
      (`typescript-eslint` latest 8.x still `<6.1.0`). On any contradiction (range
      narrows below `6.0.3`, a superseding patch, a new required peer), **STOP and
      `afx send architect`** rather than retarget or bypass.
- [ ] **FR2 manifest + lockfile**: set `devDependencies.typescript` to exactly
      `"6.0.3"`; retain `typescript-eslint@~8.64.0` (no `8.65.0` bump — architect
      confirmed), `eslint`/`@eslint/js@~9.39.5` (string-equal),
      `eslint-plugin-react@~7.37.5`, `eslint-plugin-react-hooks@7.1.1`,
      `globals@~17.7.0`; make no runtime-dependency change. Regenerate
      `package-lock.json` via npm only under Node `22.23.1`/npm `10.9.8`; lockfile
      stays v3; verify a subsequent `npm ci` is a no-op on manifest/lock and emits
      no peer warnings; no `--force`/`--legacy-peer-deps`.
- [ ] **FR3 typecheck diagnostics**: run `npm run typecheck` (`tsc --noEmit`) under
      `6.0.3` against the full checked-in `tsconfig.json` + source → exit 0. Capture
      any TS 6 deprecation diagnostic (compiler-option or code-level); **resolve it
      in place** (non-deprecated equivalent) or **bound it** with a documented
      removal plan tied to the deferred TS 7 stage — never silence the diagnostic.
      Keep `skipLibCheck` unchanged. Probe expectation (Confirmed Decisions #3): no
      option deprecations on the current options; reconfirm against the full config.
- [ ] **FR4 no parser warning, no suppression**: run `npm run lint` (`eslint .`)
      under `6.0.3` **with the config unchanged** and confirm the output contains no
      `typescript-eslint`/`typescript-estree` "unsupported TypeScript version"
      warning, achieved with **no** `warnOnUnsupportedTypeScriptVersion:false`, no
      warning filter, no forced install. Capture the lint output for the review.
- [ ] **FR12 contract-test pin**: extend `tests/toolchain.test.mjs` to assert
      `packageJson.devDependencies.typescript === "6.0.3"` (exact; matches
      `/^\d+\.\d+\.\d+$/`; equals the lockfiled version at
      `node_modules/typescript`), and that the resolved `typescript-eslint` declares
      a `typescript` peer that admits `6.0.3` and excludes `6.1.0`+ (read
      `packageLock.packages["node_modules/typescript-eslint"].peerDependencies.typescript`
      and assert its upper bound is `<6.1.0` via a string/range check that adds no
      new test dependency) — documenting the TS-7 block. Preserve the existing
      Node/npm/lockfile-v3 and `eslint`/`@eslint/js` `~9.` equality assertions.
- [ ] Phase commit: `[Spec 13][Phase: typescript6_adoption] chore: Adopt TypeScript 6.0.3 and pin it`.

#### Implementation Details
- Files: `package.json`, `package-lock.json`, `tests/toolchain.test.mjs`, and —
  **only if FR3 surfaces a deprecation to resolve** — `tsconfig.json` and/or the
  affected source file. Expected `tsconfig`/source churn: none (per the probe).
- Toolchain discipline: edit `package.json`, run `npm install` once to settle the
  lockfile, verify a subsequent `npm ci` is a no-op. Never regenerate under another
  Node/npm. Because the worktree ships without `node_modules`, run a real `npm ci`
  (or an isolated version-exact probe) before asserting any installed-package
  behavior (Confirmed Decisions #8).
- Do not stage byproducts (`.next/`, `node_modules/`, editor files); stage
  explicitly per the no-`git add -A` rule.

#### Acceptance Criteria
- [ ] `npm ci` completes clean, lockfile v3, no manifest/lock mutation, no peer
      warnings.
- [ ] `npm run typecheck` exits 0 under `tsc@6.0.3`; deprecations resolved or
      bounded; `skipLibCheck` retained.
- [ ] `npm run lint` exits 0 with no unsupported-version warning and no suppression
      (config shape still the #10 baseline in this phase).
- [ ] `npm test` passes, including the new `typescript` pin + `typescript-eslint`
      support assertions.
- [ ] Reverification + any deprecation-disposition notes captured for the review.

#### Test Plan
- **Unit/contract**: `npm test` — the `typescript@6.0.3` pin and
  `typescript-eslint` support assertions pass; existing toolchain/automation/audit
  suites stay green.
- **Static**: `npm run typecheck` (TS 6.0.3) + `npm run lint` (no parser warning).
- **Reproducibility**: fresh `npm ci` no-op on manifest/lock.

#### Rollback Strategy
Revert the phase commit → back to `typescript@~5.7.3`. Manifest, lockfile, and
contract test move together in this commit, so the revert is atomic.

#### Risks
- **`typescript-estree` range narrows below `6.0.3` in the resolved patch** → FR1
  reverification catches it; **STOP + escalate**, never suppress (FR4).
- **`tsc@6.0.3` surfaces an unexpected deprecation** → resolve in place or bound
  with a removal plan (FR3); do not silence.
- **Instinct to take the `8.65.0` patch or chase `typescript@latest` (7.x)** →
  forbidden; retain `8.64.0`, pin `6.0.3` exactly; escalate drift (FR1).

---

### Phase 2: Finalize the ESLint 9 Flat Config (Native React Flat Config, Scoped Globals, Coverage-Preserving)
**Dependencies**: Phase 1 (typescript6_adoption)
**Implements**: FR5, FR6, FR7, FR12 (the flat-config global-ignore invariant).

#### Objectives
- Intentionally modernize `eslint.config.mjs` while **preserving** the deliberate
  JS/TypeScript/React/Hooks/Next rule coverage from #10 — proven by before/after
  `eslint --print-config`, never a silent change.

#### Deliverables
- [ ] **FR6 React native flat config**: replace the legacy
      `import pluginReactConfig from "eslint-plugin-react/configs/recommended.js"`
      with the plugin's native flat surface (`eslint-plugin-react`'s
      `configs.flat.recommended`), keeping `settings.react.version: "detect"` and
      the deliberate offs `react/react-in-jsx-scope: off`,
      `react/jsx-uses-react: off`.
- [ ] **FR6 Hooks coverage-preserving (architect-confirmed default)**: keep the
      existing flat-native registration — `plugins: { 'react-hooks': hooksPlugin }`
      plus the two explicit rules `react-hooks/rules-of-hooks: error` and
      `react-hooks/exhaustive-deps: warn`. Do **not** spread
      `configs.recommended`/`configs['recommended-latest']` (16/17 rules — a real
      coverage increase reserved for a future deliberate change).
- [ ] **FR6 preserved JS/TS/Next coverage**: keep `@eslint/js` `recommended`,
      `typescript-eslint` `recommended`, `@typescript-eslint/no-explicit-any: off`,
      and the direct `@next/eslint-plugin-next` wiring (`recommended` +
      `core-web-vitals`).
- [ ] **FR5 scoped globals**: replace the single un-scoped `globals.commonjs` block
      with `files`-scoped `languageOptions.globals`, in three explicit groups (do
      **not** apply `globals.commonjs`/`sourceType: "commonjs"` to ESM files):
      - **Browser** — `app/**/*.{ts,tsx}` → `globals.browser`.
      - **Node/ESM** (module scope, node globals only) — `eslint.config.mjs`,
        `playwright.config.ts`, `scripts/**`, and `tests/**/*.mjs` → `globals.node`.
        These are ES modules; they get `globals.node` **without** the CJS globals.
      - **Node/CommonJS** (the `module.exports` files) — `next.config.js`,
        `postcss.config.js`, and the `.ts`-but-CJS `tailwind.config.ts` →
        `globals.node` **plus** `globals.commonjs` / `sourceType: "commonjs"`.
        Selected by explicit glob (including `tailwind.config.ts` by name), **not**
        by a `.ts=ESM` / `.js=CJS` extension heuristic.
      - **e2e (mixed)** — `tests/e2e/**` → **both** `globals.node` and
        `globals.browser` (Node runner + in-page `page.evaluate` bodies), since flat
        config cannot split globals at the `page.evaluate` boundary.
- [ ] **FR7 `@eslint/compat` confirmation**: grep `package.json` + `package-lock.json`
      to confirm `@eslint/compat` is absent and not reintroduced; no
      `fixupConfigRules`/`fixupPluginRules` shims anywhere.
- [ ] **Coverage-equivalence evidence (FR5 + FR6)**: capture before/after
      `eslint --print-config` on representative files — an app server file
      (`app/page.tsx`), a client component (`app/components/FocusGraph.tsx`), a Node
      config (`eslint.config.mjs`), a CJS config (`postcss.config.js`), and an e2e
      spec (`tests/e2e/matrix.spec.ts`). Confirm: the effective JS/TS/React/Hooks/Next
      rule set is equivalent (the default is zero coverage delta), the intended
      globals are present per file group, and no legitimate global is newly flagged
      (`no-undef`). Any rule-id/option delta attributable to the restructure (not a
      version bump) is listed and explained. Evidence captured for the review.
- [ ] **FR12 global-ignore invariant**: after adding `files`-scoped blocks, confirm
      `tests/toolchain.test.mjs`'s "exactly one global-ignore block (has `ignores`,
      no `files`)" assertion still holds — the generated-output ignore block stays
      the single `files`-less entry; the new blocks all carry `files`. Adjust the
      config (not the invariant) if needed.
- [ ] Phase commit: `[Spec 13][Phase: eslint9_config_finalization] refactor: Modernize the ESLint 9 flat config (native React flat config, scoped globals)`.

#### Implementation Details
- Files: `eslint.config.mjs` (primary); `tests/toolchain.test.mjs` only if the
  global-ignore assertion needs a companion assertion for the new scoped blocks
  (kept minimal — do not weaken the existing invariant).
- No version changes in this phase (pure config refactor), so any lint-behavior
  delta is attributable solely to the config restructure and provable via
  print-config.
- Watch the config-array ordering: `files`-scoped `languageOptions` blocks must
  layer correctly over the shared `pluginJs`/`tseslint`/React/Next blocks so the
  intended globals win per file group without disturbing rule coverage.
- Fold the existing standalone `{files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"]}` entry and
  the existing global `languageOptions` block (`parserOptions.ecmaFeatures.jsx` +
  `globals.commonjs`) into the new scoped structure rather than leaving a redundant
  bare `files` entry — the JSX `parserOptions` stays applied where needed and the
  old un-scoped `globals.commonjs` is removed once the three groups above cover
  every file. Keep the generated-output ignore block as the single `files`-less
  entry so the FR12 invariant holds.

#### Acceptance Criteria
- [ ] `npm run lint` exits 0 (still no parser warning) with the modernized config.
- [ ] `npm run typecheck` still exits 0 (unaffected, but re-run as a guard).
- [ ] `npm test` green, including the still-holding global-ignore invariant.
- [ ] Before/after `eslint --print-config` proves coverage equivalence (or an
      explicitly-documented, gate-approved delta — none by default) and correct
      per-file globals.

#### Test Plan
- **Static**: `npm run lint` (clean) + `eslint --print-config` before/after diffs
  on the five representative files.
- **Unit/contract**: `npm test` — global-ignore invariant + all prior assertions.
- **Manual**: eyeball the print-config diff for any unexpected rule-id/severity
  change; confirm none is silent.

#### Rollback Strategy
Revert the phase commit → back to the #10 `eslint.config.mjs`. Independent of Phase
1 (no version overlap), so it reverts cleanly on its own.

#### Risks
- **Native React `configs.flat.recommended` differs in effective rules from the
  legacy `configs/recommended.js`** → print-config before/after catches any delta;
  reconcile to equivalence or document a gate-approved delta (FR6).
- **Globals rescoping flags a legitimate global or adds unused-globals noise
  (esp. mixed e2e)** → the `tests/e2e/**` both-sets pattern + per-file
  print-config evidence (FR5).
- **New `files`-scoped blocks accidentally create a second global-ignore block** →
  keep every new block `files`-scoped; the contract test guards the invariant (FR12).

---

### Phase 3: End-to-End Qualification, Lockfile/Audit Delta, Supply-Chain, Docs, and Deferral
**Dependencies**: Phase 2 (eslint9_config_finalization)
**Implements**: FR8, FR9, FR10, FR11, FR12 (docs), FR13.

#### Objectives
- Prove the **combined** TS 6.0.3 + finalized-config state passes every gate and
  does not alter runtime behavior; finalize the lockfile/audit evidence, docs, and
  the TS7/ESLint10 deferral record.

#### Deliverables
- [ ] **FR8 automated gates** at the final commit: `npm run lint` (clean, no parser
      warning), `npm run typecheck` (clean under TS 6.0.3), `npm test` (incl.
      updated contract tests), `npm run build`, `npm run test:smoke`, aggregate
      `npm run validate`, and the audit pipeline (`npm run audit:full` /
      `audit:production` through `scripts/validate-audit-report.mjs` semantics,
      exit codes preserved). **Separately**, run a direct production `npm run start`
      and record root-page **HTTP 200** + clean shutdown (validate does not itself
      prove this). Each gate's command + result recorded individually.
- [ ] **FR9 behavioral qualification (reused)**: `tests/e2e/smoke.spec.ts` +
      `tests/e2e/matrix.spec.ts` (via `tests/e2e/graph-handle.ts`) and
      `tests/focus-graph-lifecycle.test.mjs` pass against the production build.
      Local run exercises **both** engines (Chromium + Firefox local qualification);
      `E2E_ENGINES=chromium` is the required CI gate (reused from #11/#12,
      unchanged). Zero unexpected page/console/hydration/timer/WebGL-context/GPU
      errors. Since no runtime dependency moves, expected behavioral delta = none;
      any observed diff is replayed against the pre-change baseline before being
      attributed to this change.
- [ ] **FR10 lockfile/audit delta**: record before/after resolved versions for
      `typescript` and every transitive entry the change moves (expected minimal —
      `typescript` is a leaf devDependency with no runtime deps). Provide before/after
      full (`npm audit`) and production (`npm audit --omit=dev`) comparisons
      path-by-path, exit codes preserved; identify resolved/introduced/unchanged
      advisory paths. Confirm the Next-owned nested `postcss@8.4.31` is unchanged and
      carry it forward as a documented, non-app-controllable residual.
- [ ] **FR11 supply-chain**: for every changed lockfile entry — `resolved` points
      only at `registry.npmjs.org`; no entry gains an install script its prior
      version lacked (newly-introduced ones individually called out; pre-existing
      unchanged ones confirmed, not re-enumerated); `npm ci` shows no unexpected
      package-manager behavior.
- [ ] **FR12 docs**: update `README.md` and any doc/test enumeration affected by the
      config restructure to stay truthful; README references the **"TypeScript 6"
      line** (authoritative exact pin lives in manifest + contract test — no patch
      hard-coding in prose). Note the TS7/ESLint10 deferral where toolchain versions
      are documented.
- [ ] **FR13 deferral + rollback**: the review explicitly records TS 7 as deferred
      pending `typescript-eslint` support (`<6.1.0`) and ESLint 10 as a separate
      experiment; confirm the whole change is a single revertible unit restoring the
      `~5.7.3` baseline; honor blocking semantics (escalate with evidence, no
      partial workarounds).
- [ ] Phase commit: `[Spec 13][Phase: qualification_evidence_docs] test: Qualify TS6/ESLint9 end-to-end, review lockfile/audit, update docs`.

#### Implementation Details
- Files: `README.md`; any doc/test enumeration that names the toolchain. No `app/`
  source changes expected.
- Evidence discipline (spec Evidence-honesty NFR): every claim states the tool +
  version (`tsc@6.0.3`, `eslint@9.39.5` + `typescript-eslint@8.64.0`), the exact
  command, engine/renderer where applicable, and the result. Raw audit JSON stays
  local/CI evidence; the review carries the comparison tables and the print-config
  diffs from Phase 2.
- Harness-file caveat (lessons-critical): if `eslint .`/`validate` fails only on the
  untracked `.claude/hooks/*` file, prove the gate on a clean checkout
  (`git worktree add --detach HEAD` + real `npm ci`); never suppress in committed
  config.

#### Acceptance Criteria
- [ ] Every FR8 gate exits 0 at the final commit; direct `npm run start` → root
      HTTP 200 recorded.
- [ ] FR9 matrix + smoke pass (Chromium required + Firefox local), zero unexpected
      errors; runtime behavior unchanged vs. baseline.
- [ ] FR10 audit/lockfile tables + FR11 supply-chain findings captured; nested
      PostCSS residual noted.
- [ ] Docs truthful; deferral recorded; single-revert rollback verified conceptually
      (the three phase commits revert cleanly as a unit).

#### Test Plan
- **Aggregate**: `npm run validate` end-to-end (both engines locally).
- **Behavioral**: `npm run test:smoke` + the 13-item matrix + lifecycle unit.
- **Security/audit**: `npm run audit:full` / `audit:production` via the
  validate-audit-report semantics; supply-chain scan of changed lockfile entries.
- **Docs**: manual review that README/enumerations match the manifest.

#### Rollback Strategy
This phase adds evidence + docs, no behavior. Reverting it leaves Phases 1–2 intact;
reverting all three restores the `~5.7.3` baseline atomically.

#### Risks
- **Some gate/matrix item fails under the combined state and baseline replay
  attributes it to this change** → **blocked**: escalate with evidence; no parser
  suppression, no forced install, no lint-plugin downgrade, no silent coverage drop
  (FR13).
- **Audit delta misreads the Next-owned nested PostCSS as new/closed** → confirm it
  is unchanged and carry it forward as a documented residual (FR10).

## Dependency Map
```
Phase 1 (typescript6_adoption) ──→ Phase 2 (eslint9_config_finalization) ──→ Phase 3 (qualification_evidence_docs)
```
Strictly sequential: Phase 2's print-config coverage proof must run against the TS
6.0.3 baseline from Phase 1; Phase 3 qualifies the combined result.

## Resource Requirements
### Development Resources
- Single builder in the worktree under the pinned Node `22.23.1` / npm `10.9.8`
  toolchain. No special expertise beyond the ESLint flat-config / TypeScript compiler
  options surface.
### Infrastructure
- None. No services, databases, or config beyond the repo. CI reuses the existing
  Validation workflow and the #11/#12 engine split.

## Integration Points
### External Systems
- **npm registry** (`registry.npmjs.org`) — sole dependency source; verified in FR11.
### Internal Systems
- The existing Playwright two-engine suite and `scripts/validate-audit-report.mjs`
  audit pipeline — reused unchanged.

## Risk Analysis
### Technical Risks
| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| `typescript-estree@8.64.0` range narrows below `6.0.3` in the resolved patch | L | H | FR1 reverify the `SUPPORTED_TYPESCRIPT_VERSIONS` constant admits `6.0.3`; escalate, never suppress | builder |
| TS 6.0.3 surfaces a deprecation on the full config | L | M | FR3 resolve in place or bound with a removal plan | builder |
| Native React flat config / globals rescoping silently changes coverage | M | M | Before/after `eslint --print-config` on 5 representative files (FR5/FR6) | builder |
| TS 7 / ESLint 10 pulled in by instinct or a range | L | H | Exact `typescript@6.0.3` pin; ESLint stays `~9.`; FR13 deferral; FR1 escalates drift | builder |
| Local gate fails only on untracked `.claude/hooks/*` | M | L | Prove on a clean checkout; never suppress in committed config (lessons-critical) | builder |
### Schedule Risks
| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| Gate at spec/plan/PR blocks progress | L | L | Strict-mode gates are expected; notify architect and wait | builder |

## Validation Checkpoints
1. **After Phase 1**: `tsc@6.0.3` clean, `eslint .` clean (no parser warning),
   contract-test pin green, clean `npm ci` no-op.
2. **After Phase 2**: `eslint --print-config` before/after proves coverage
   equivalence + correct per-file globals; global-ignore invariant holds.
3. **Before PR (after Phase 3)**: full `validate` + direct start HTTP 200 + two-engine
   matrix green; audit/lockfile/supply-chain evidence captured; docs truthful;
   deferral recorded.

## Monitoring and Observability
- N/A for a language/lint change — no runtime metrics, logging, or alerting surface
  is added. The observable signal is the green gate set + the interaction matrix,
  captured as review evidence.

## Documentation Updates Required
- [ ] `README.md` — reference the "TypeScript 6" line; keep script/toolchain prose
      truthful; note TS7/ESLint10 deferral.
- [ ] `codev/reviews/13-adopt-typescript-6-and-finaliz.md` — created in the Review
      phase (lockfile/audit tables, print-config diffs, deprecation disposition,
      deferral record).
- [ ] Arch/lessons docs — evaluate in Review via the `update-arch-docs` skill (e.g.
      the no-`node_modules`-in-worktree verification trap from Confirmed Decisions #8
      may be a lessons candidate); route by tier, do not force.

## Post-Implementation Tasks
- [ ] Verify phase after merge: pull the integration branch, confirm the toolchain
      is green in the integrated codebase, then `porch done 13` (or `porch verify 13
      --skip` if unneeded).
- [ ] Leave TS 7 adoption, ESLint 10, and the `skipLibCheck` tightening as tracked
      follow-ups (out of scope here).

## Consultation Log

### Iteration 1 — initial three-way review (2026-07-20)

Unanimous approval; two non-blocking clarity points from Claude incorporated.

- **Gemini: APPROVE (high confidence).** Endorsed the phase isolation (TS bump in
  Phase 1 vs. config refactor in Phase 2 lets any lint-behavior delta be isolated),
  the strict spec adherence (global-ignore invariant, `tsc` deprecation bounding,
  `page.evaluate` globals scoping), and the atomic single-PR/independent-commit
  rollback structure. No issues. *(Gemini's `agy` lane returned no output on the
  first automated pass — a tooling skip — and was re-run on request; the re-run
  produced this APPROVE.)*
- **Codex: APPROVE (high confidence).** Plan tightly aligned to the approved spec,
  maps cleanly onto the actual repo structure, clear/testable sequence with good
  rollback and evidence discipline. No issues.
- **Claude: APPROVE (high confidence).** Independently verified every plan claim
  against the codebase (the legacy React import, the un-scoped `globals.commonjs`,
  the already-flat-native Hooks registration, `tailwind.config.ts` as `.ts`+CJS,
  the CJS/ESM config formats, the `page.evaluate` browser-globals pattern, the
  single `globalThis` app reference, the `~5.7.3` pin, the global-ignore
  invariant). Confirmed full FR1–FR13 coverage with no orphaned requirement and no
  scope creep. Two non-blocking clarity points, both incorporated:
  1. The Phase 2 FR5 globals grouping buried which files get CJS vs Node-only
     treatment (`eslint.config.mjs`/`playwright.config.ts` are ESM → node globals
     only, **not** commonjs). → FR5 now splits the Node group into explicit
     **Node/ESM** and **Node/CommonJS** subgroups with a "do not apply commonjs to
     ESM files" caveat.
  2. The existing standalone `{files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"]}` + global
     `languageOptions` block needed a disposition. → Phase 2 Implementation Details
     now direct folding both into the scoped structure (preserving the JSX
     `parserOptions`, removing the old un-scoped `globals.commonjs`) while keeping
     the generated-output ignore block as the single `files`-less entry.

_Second consultation (after human/gate feedback) to be appended if the plan is
revised at the plan-approval gate._

## Approval
- [ ] Expert AI Consultation Complete (3-way)
- [ ] Architect approval at the `plan-approval` gate

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-20 | Initial implementation plan | Spec 13 approved; both elections confirmed at defaults | builder spir-13 |

## Notes
- Both spec elections are baked at their architect-confirmed defaults: Hooks
  coverage-preserving (Phase 2), retain `typescript-eslint@8.64.0` (Phase 1).
- The three phases ship as **git commits within a single PR** (per the issue's PR
  strategy), not separate PRs; the PR opens during/after Phase 3 with all three
  phase commits on the branch.
- All installed-package verification runs against a real `npm ci` (or an isolated
  version-exact probe), never a bare `require` in the `node_modules`-less worktree
  (Confirmed Decisions #8).
