# Plan: Migrate the Application to Next 16 Active LTS

## Metadata
- **ID**: plan-2026-07-20-next-16-active-lts
- **Status**: draft
- **Specification**: [codev/specs/12-migrate-the-application-to-nex.md](../specs/12-migrate-the-application-to-nex.md)
- **Created**: 2026-07-20

## Executive Summary

Implements the spec's selected **Approach C**: a codemod-driven, atomic upgrade
of the framework from the patched Next 15 baseline (`next@15.5.20`) to Next 16
Active LTS (`next@16.2.10`), adopting the now-default Turbopack production
bundler and qualifying it behaviorally against the two-engine interaction matrix
already established in #11.

The migration surface is minimal (no middleware, no dynamic request APIs, empty
`next.config.js`, one static async server component rendering a client-only WebGL
island; React/DOM and the 3D stack stay exactly where #9/#11 qualified them). The
operational changes Next 16 forces here are: run/review the official upgrade
codemod, remove the now-redundant `--turbopack` dev flag, adopt and qualify the
default Turbopack build, verify the Node/browser floors, and re-explain the
lockfile/audit delta including the Next-owned nested PostCSS residual.

The work lands as **one rollback unit** (single PR; phase commits within it),
sequenced so each phase commit is coherent:

1. **`framework_upgrade`** — reverify, run/review codemod, land the Next 16
   manifest + lockfile, remove obsolete idioms, re-pin contract tests; reach a
   statically-green Next 16 (lint/typecheck/unit + a building Turbopack bundle).
2. **`turbopack_behavioral_qualification`** — qualify the Turbopack production
   build and client WebGL bundle behaviorally: full two-engine matrix + smoke
   (Chromium required gate + Firefox local), single-Three-runtime and
   no-Node-only-import evidence, preserved semantics, Node/browser policy.
3. **`evidence_disposition_and_docs`** — lockfile/audit delta path-by-path,
   supply-chain verification of changed entries, explicit nested-PostCSS
   disposition, and doc/enumeration truthfulness; assemble review-ready evidence.

A single revert of the unit returns to the fully-qualified `next@15.5.20`
baseline — **never** `15.1.11`.

## Success Metrics

Copied from the spec's acceptance scenarios and made implementation-checkable:

- [ ] Target reverified at implementation time (FR1); drift escalated, not
      silently retargeted.
- [ ] Official Next 16 codemod run in-branch and its output reviewed/curated;
      final manifest equals the exact target group (FR2).
- [ ] `next@16.2.10` (dependencies) and `@next/eslint-plugin-next@16.2.10`
      (devDependencies) pinned exactly and string-equal; React/DOM unchanged at
      `19.2.7`; lockfile v3; clean `npm ci` with no manifest/lock mutation and no
      framework/3D-chain peer warnings (FR3).
- [ ] `dev` is `next dev` (no `--turbopack`); no `next lint` invocation remains;
      `eslint .` passes under the 16.x plugin (FR4).
- [ ] `next build` (Turbopack) succeeds; production `next start` serves the root
      page HTTP 200; client bundle has no Node-only imports and resolves exactly
      one Three runtime through the client-only island (FR5).
- [ ] No graph prop/handler/timer/camera/control semantic change except any Next
      16 strictly forces, which is called out explicitly (FR6).
- [ ] Node policy (`22.23.1`) satisfies the Next 16 floor; supported-browser
      policy verified and documented, compatible with the WebGL2 requirement (FR7).
- [ ] `lint`, `typecheck`, `npm test`, Turbopack `build`, production `start`,
      `test:smoke`, aggregate `validate`, and the audit evidence pipeline all
      pass at the final commit (FR8).
- [ ] Complete interaction matrix + smoke pass against the Turbopack build
      (Chromium required gate + Firefox local qualification), zero unexpected
      errors, per #11 semantics (FR9, error budget).
- [ ] Lockfile/audit delta documented path-by-path (exit codes preserved);
      nested Next-owned `postcss@8.4.31` explicitly dispositioned (FR10).
- [ ] Supply-chain verification of every changed lockfile entry (registry-only
      `resolved`, install-script delta) recorded (FR11).
- [ ] `tests/toolchain.test.mjs` re-pinned to `16.2.10`; README/`automation.test`
      enumerations stay truthful (FR12).
- [ ] Single-revert rollback to `15.5.20` holds; blocking semantics honored (FR13).

## Phases (Machine Readable)

```json
{
  "phases": [
    {"id": "framework_upgrade", "title": "Reverify, Run/Review Codemod, and Land the Next 16 Manifest + Contract Tests"},
    {"id": "turbopack_behavioral_qualification", "title": "Qualify the Default Turbopack Build and Client WebGL Bundle (Two-Engine Matrix)"},
    {"id": "evidence_disposition_and_docs", "title": "Lockfile/Audit Delta, Supply-Chain, PostCSS Disposition, and Docs"}
  ]
}
```

## Phase Status

| Phase | Status |
|-------|--------|
| framework_upgrade | pending |
| turbopack_behavioral_qualification | pending |
| evidence_disposition_and_docs | pending |

## Phase Breakdown

### Phase 1: Reverify, Run/Review Codemod, and Land the Next 16 Manifest + Contract Tests
**Dependencies**: None
**Implements**: FR1, FR2, FR3, FR4, FR12 (contract-test pins); establishes the
FR13 rollback unit.

#### Objectives
- Reach a statically-green Next 16 baseline: the framework and its lint plugin at
  exactly `16.2.10`, obsolete idioms removed, contract tests re-pinned, and a
  clean `npm ci` under the pinned toolchain.
- Do this via the official codemod with reviewed, curated output — no incidental
  version drift, no scope creep.

#### Deliverables
- [ ] **FR1 reverification** recorded (scratch notes → carried to the review):
      `next@16.2.10` / `@next/eslint-plugin-next@16.2.10` still `latest`;
      `engines.node >=20.9.0` (satisfied by `22.23.1`); React peer admits
      `19.2.7`; no new *required* peer; no superseding 16.x patch. On any
      contradiction (Node floor > `22.23.1`, new required peer, superseding
      patch), **STOP and `afx send architect`** rather than retarget.
- [ ] **FR2 codemod** run in-branch under Node `22.23.1`/npm `10.9.8`
      (`npx @next/codemod@latest upgrade`, or the invocation the reverified
      upgrade guide specifies); every proposed change reviewed. Curate: revert any
      change outside the target group (e.g. React/type bumps, unrelated codemods);
      a `next.config.js` → `next.config.ts`/ESM change is accepted only if Next 16
      actually requires it, else config stays effectively empty. Record what the
      codemod changed / kept / reverted.
- [ ] **FR3 manifest + lockfile**: `package.json` `next` → `16.2.10`
      (`dependencies`), `@next/eslint-plugin-next` → `16.2.10`
      (`devDependencies`); regenerate `package-lock.json` via npm only; lockfile
      stays v3; `next` and plugin string-equal; React/DOM untouched at `19.2.7`.
- [ ] **FR4 obsolete idioms**: remove `--turbopack` from the `dev` script
      (→ `next dev`); confirm (grep) no `next lint` invocation in scripts/CI/docs;
      leave `lint` as `eslint .` and the flat config's direct
      `@next/eslint-plugin-next` wiring intact. Specifically re-verify under the
      16.x plugin that `eslint.config.mjs`'s accesses still resolve —
      `nextPlugin.configs.recommended.rules` and
      `nextPlugin.configs['core-web-vitals'].rules` — since a changed plugin
      export shape would break the config; reconcile explicitly if it moved.
- [ ] **FR12 contract tests**: update `tests/toolchain.test.mjs`
      `expectedDependencyBaseline` (`next` and `@next/eslint-plugin-next`
      `15.5.20` → `16.2.10`), preserving the string-equality and lockfile-v3/Node
      assertions.
- [ ] Phase commit: `[Spec 12][Phase: framework_upgrade] chore: Upgrade Next to 16.2.10 Active LTS`.

#### Implementation Details
- Files: `package.json`, `package-lock.json`, `tests/toolchain.test.mjs`, and
  **only if the codemod strictly requires it** `next.config.js` (or a migrated
  `next.config.ts`) and/or `app/**` source. Expected app/config churn: none.
- Toolchain discipline: run the codemod, then reconcile `package.json` to exactly
  the target group by hand, then `npm install` once to settle the lockfile and
  verify a subsequent `npm ci` is a no-op on the manifest/lock. Never regenerate
  under another Node/npm.
- Do not stage codemod byproducts (`.next/`, backups, editor files); stage
  explicitly per the no-`git add -A` rule.

#### Acceptance Criteria
- [ ] `npm ci` completes clean, lockfile v3, no manifest/lock mutation, no
      framework/3D-chain peer warnings.
- [ ] `npm run lint` (eslint, 16.x plugin), `npm run typecheck`, and `npm test`
      (incl. updated contract tests) pass.
- [ ] `npm run build` (now Turbopack) completes and `npm run start` serves the
      root page HTTP 200 — a build-sanity check; the *full* behavioral matrix is
      Phase 2's gate.
- [ ] Reverification + codemod review notes captured for the review.

#### Test Plan
- **Unit/contract**: `npm test` — `tests/toolchain.test.mjs` re-pin passes;
  `tests/automation.test.mjs` still green (dev not enumerated there).
- **Static**: lint + typecheck under the 16.x plugin.
- **Build sanity**: `npm run build` + a one-shot `npm run start` HTTP 200 probe.

#### Rollback Strategy
Revert the phase commit → back to `next@15.5.20`. Because the manifest/lockfile
move together in this commit, the revert is atomic.

#### Risks
- **Codemod proposes out-of-scope edits** → curate/revert; escalate genuinely
  required but out-of-scope changes (FR2).
- **16.x ESLint plugin changes a rule id/output the flat config relies on** →
  reconcile explicitly in this phase; no silent absorption (FR4).
- **Reverification contradicts target** → STOP + escalate (FR1), do not proceed.

---

### Phase 2: Qualify the Default Turbopack Build and Client WebGL Bundle (Two-Engine Matrix)
**Dependencies**: Phase 1 (framework_upgrade)
**Implements**: FR5, FR6, FR7, FR8, FR9 (matrix + error budget).

#### Objectives
- Prove the now-default Turbopack production build preserves the app's behavior:
  the full interaction matrix + smoke pass against `next start`, the client bundle
  is clean (no Node-only imports, one Three runtime), and semantics/timings are
  unchanged.

#### Deliverables
- [ ] **FR5 client-bundle integrity** evidence:
      - `npm ls three` → single `three@0.185.1`; no nested
        `node_modules/**/node_modules/three` (also covered by the FR12 contract
        test from #11).
      - After `next build`, scan emitted `.next/static/` client assets for the
        `node:` scheme and bare Node-builtin specifiers
        (`grep -RolE "node:(fs|path|crypto|os|stream|util|process|module|child_process)" .next/static/`
        plus the un-prefixed-builtin check) → no matches in shipped client
        chunks. Commands + output captured for the review.
- [ ] **FR9 behavioral qualification**: `npm run test:smoke` (build + Playwright:
      `tests/e2e/smoke.spec.ts` + `tests/e2e/matrix.spec.ts` via
      `tests/e2e/graph-handle.ts`) passes against the Turbopack build. Local run
      exercises **both** engines (Chromium + Firefox) — the local qualification
      gate; `E2E_ENGINES=chromium` is the required CI gate (reused from #11,
      unchanged). `tests/focus-graph-lifecycle.test.mjs` passes under Next 16.
      Class B items (drag/right-click) follow #11 acceptance semantics.
- [ ] **FR6 preserved semantics**: confirm no graph prop/handler/timer/camera/
      control change; expected `app/` diff = none. Any forced change called out.
- [ ] **FR7 Node/browser policy**: confirm `22.23.1` ≥ Next 16 Node floor; verify
      the Next 16 supported-browser policy from the upgrade guide and record it;
      add a minimal `browserslist`/policy declaration only if Next 16 requires
      one, else record that none is required.
- [ ] **FR8 aggregate gate**: `npm run validate` green end-to-end (both engines
      locally).
- [ ] **FR9 error budget**: zero unexpected page/console/hydration/timer/
      WebGL-context/GPU errors across smoke + matrix in both engines (strict
      collection retained from #11). (Supply-chain FR11 is handled in Phase 3.)
- [ ] Phase commit: `[Spec 12][Phase: turbopack_behavioral_qualification] test: Qualify Turbopack build across the two-engine matrix`.

#### Implementation Details
- Files: expected none in `app/`. Any test/CI/config change is limited to what a
  genuine Turbopack/Next 16 difference forces (e.g. a launch-arg or waiter tweak),
  called out explicitly and replayed against the `15.5.20` baseline before
  attribution. A `browserslist` line in `package.json` only if FR7 requires it.
- Evidence-first: if any matrix item diverges from baseline, replay the identical
  input against the rollback baseline before attributing it to the upgrade; a
  genuine regression is **blocking** (FR13) — escalate with evidence.

#### Acceptance Criteria
- [ ] `npm run validate` passes locally in both engines; `E2E_ENGINES=chromium`
      passes (the CI gate).
- [ ] Client-bundle scan shows no Node-only imports; single Three runtime
      confirmed.
- [ ] Node floor and browser policy verified and recorded; WebGL2 compatibility
      confirmed.
- [ ] Zero unexpected errors across all runs (error budget).

#### Test Plan
- **Integration/behavioral**: full Playwright suite (smoke + 13-item matrix) in
  Chromium and Firefox against the Turbopack `next start`.
- **Lifecycle unit**: `tests/focus-graph-lifecycle.test.mjs`.
- **Bundle integrity**: `npm ls three` + `.next/static/` grep scans.

#### Rollback Strategy
Revert this phase commit to drop any qualification-driven test/CI tweaks; Phase 1
(the framework itself) remains independently revertible beneath it.

#### Risks
- **Turbopack chunking/module-resolution differs from webpack, breaking the WebGL
  island** → full numeric matrix + client-bundle scan; baseline replay before
  attribution; blocking on genuine regression (FR13).
- **A Node-only import leaks into a client chunk under Turbopack** → FR5 scan
  catches it pre-commit.
- **Firefox WebGL still unavailable on CI** (unchanged from #11) → reuse the
  Chromium-required / Firefox-local split; not a regression.

---

### Phase 3: Lockfile/Audit Delta, Supply-Chain, PostCSS Disposition, and Docs
**Dependencies**: Phase 2 (turbopack_behavioral_qualification)
**Implements**: FR10, FR11, FR12 (docs/enumerations).

#### Objectives
- Produce the honest lockfile/audit/supply-chain story and disposition the
  Next-owned nested PostCSS residual; keep docs and enumeration contract tests
  truthful after the upgrade.

#### Deliverables
- [ ] **FR10 audit + lockfile delta**: before/after resolved versions for `next`,
      `@next/eslint-plugin-next`, and every transitive entry the upgrade moved;
      before/after `npm audit` (full) and `npm audit --omit=dev` (production)
      comparisons path-by-path through `scripts/validate-audit-report.mjs`
      semantics with original exit codes preserved; identify advisory paths
      resolved/introduced/unchanged with ownership.
- [ ] **Nested PostCSS disposition**: confirm `next@16.2.10` still pins
      `node_modules/next/node_modules/postcss@8.4.31`; state it is Next-owned and
      not app-controllable here; carry forward as a documented build-time residual
      (not a new or closed finding).
- [ ] **FR11 supply-chain**: for every changed lockfile entry, verify
      `resolved` → `registry.npmjs.org` only (no git/tarball/alt-registry); flag
      and explain any *newly introduced* install script; confirm (summary, no
      exhaustive re-enumeration) pre-existing unchanged install scripts; confirm
      clean `npm ci` behavior. Record findings.
- [ ] **FR12 docs/enumerations**: update README for the `--turbopack` dev-flag
      removal and any Turbopack build note; **update the stale version statement
      on README line 6** ("Updated for React 19 and Next 15…") to reflect Next 16
      (it is not asserted by `automation.test.mjs` but would otherwise be false);
      keep `tests/automation.test.mjs` README/script enumerations green (they
      assert required scripts + README command mentions + CI text — verify all
      still hold).
- [ ] Phase commit: `[Spec 12][Phase: evidence_disposition_and_docs] docs: Record Next 16 audit/lockfile delta and update docs`.

#### Implementation Details
- Files: `README.md` (dev-flag/Turbopack note), possibly `tests/automation.test.mjs`
  only if an enumeration genuinely changed, and evidence text destined for the
  review document. Raw audit JSON stays local/CI evidence, not committed source.
- The review document itself is authored in the SPIR **Review** phase (porch
  drives it after Implement); this phase assembles the tables/notes it will carry.

#### Acceptance Criteria
- [ ] Audit evidence pipeline runs with original exit codes preserved; deltas
      documented path-by-path.
- [ ] Nested PostCSS residual explicitly dispositioned.
- [ ] Supply-chain findings recorded; `npm ci` clean.
- [ ] README truthful; `npm test` (incl. `automation.test.mjs`) green.

#### Test Plan
- **Contract/docs**: `npm test` — `automation.test.mjs` enumerations pass.
- **Audit**: `npm run audit:full` / `npm run audit:production` through the
  validate-audit-report script; exit codes preserved.
- **Reproducibility**: a final clean `npm ci` is a no-op on manifest/lock.

#### Rollback Strategy
Docs/evidence-only phase — revert the commit to drop doc changes without touching
the qualified framework or tests beneath it.

#### Risks
- **Audit shows a new production advisory introduced by Next 16** → document
  path-by-path; if it crosses a policy line, escalate (not a silent pass); the
  no-zero-findings-gate invariant still holds for pre-existing advisories.
- **README enumeration drift breaks `automation.test.mjs`** → run `npm test`
  before committing.

---

## Dependency Map
```
Phase 1 (framework_upgrade)
   └─→ Phase 2 (turbopack_behavioral_qualification)
          └─→ Phase 3 (evidence_disposition_and_docs) ─→ PR (one rollback unit)
```

## Resource Requirements
### Development Resources
- **Expertise**: Next.js App Router upgrades, Turbopack build behavior, Playwright
  WebGL qualification, npm lockfile/audit hygiene under a pinned toolchain.
- **Environment**: exact Node `22.23.1` / npm `10.9.8`; a local GPU-capable
  machine for the Firefox arm of the two-engine local qualification (Chromium
  SwiftShader is the deterministic CI/local gate).

### Infrastructure
- No new services. CI unchanged in shape (`.github/workflows/validation.yml`),
  which already provisions Chromium and sets `E2E_ENGINES=chromium`.

## Integration Points
### External Systems
- **npm registry** — the only sanctioned `resolved` source (FR11); target
  reverification and lockfile regeneration hit it.
### Internal Systems
- **Playwright two-engine suite** (from #11) — reused unchanged as the behavioral
  gate; **audit evidence pipeline** (`scripts/validate-audit-report.mjs`) — reused
  for the FR10 delta.

## Risk Analysis
### Technical Risks
| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|------------|-------|
| Turbopack build behaves differently from webpack and breaks the WebGL island | M | H | Full two-engine matrix + client-bundle scan; baseline replay; blocking (Phase 2, FR5/FR9/FR13) | Builder |
| Codemod introduces out-of-scope drift | M | M | Review + curate every change; reconcile manifest to exact target (Phase 1, FR2) | Builder |
| 16.x ESLint plugin changes rules the flat config relies on | L | M | Explicit reconciliation, no silent absorption (Phase 1, FR4) | Builder |
| Node-only import leaks into a client chunk | L | H | `.next/static/` scan before commit (Phase 2, FR5) | Builder |
| Reverification contradicts the researched target | L | M | STOP + escalate, no silent retarget (Phase 1, FR1) | Builder |
| New production advisory from Next 16 | L | M | Path-by-path audit delta; escalate if it crosses policy (Phase 3, FR10) | Builder |

### Schedule Risks
Not tracked — SPIR measures progress by completed phases, not time.

## Validation Checkpoints
1. **After Phase 1**: `npm ci` clean; lint/typecheck/`npm test` green; Turbopack
   build + start sanity; reverification + codemod review captured.
2. **After Phase 2**: `npm run validate` green (both engines locally, Chromium CI
   gate); client-bundle integrity + Node/browser policy confirmed; error budget
   clean.
3. **Before PR (after Phase 3)**: audit/lockfile delta + supply-chain + PostCSS
   disposition recorded; docs truthful; a final clean `npm ci`; single-revert
   rollback to `15.5.20` verified in reasoning.

## Monitoring and Observability
### Metrics to Track
- Playwright suite pass/fail per engine and the strict error budget (0 unexpected
  errors) — the standing behavioral signal.
- Full/production `npm audit` counts before vs. after (evidence, not a gate).
- First-load JS / bundle size for the graph route, webpack vs. Turbopack —
  recorded in the review (nice-to-know, not a gate).
### Logging Requirements
- Playwright HTML report + test-results and audit JSON are CI artifacts
  (unchanged), retained per the existing workflow.
### Alerting
- CI failure on the required Chromium gate is the alert; a genuine matrix
  regression is blocking and escalated via `afx send architect`.

## Documentation Updates Required
- [ ] README: `--turbopack` dev-flag removal; Turbopack production-build note if
      warranted; refresh the stale line-6 "React 19 and Next 15" statement to
      Next 16.
- [ ] `codev/reviews/12-migrate-the-application-to-nex.md` (authored in the Review
      phase) carrying reverification, codemod review, matrix/bundle evidence,
      audit/lockfile/supply-chain tables, PostCSS disposition, and Node/browser
      policy.
- [ ] Arch/lessons docs: routed via the `update-arch-docs` skill in the Review
      phase only if a durable, cross-cutting fact emerged (e.g. "Next build =
      Turbopack default from 16"); otherwise no change.

## Post-Implementation Tasks
- [ ] Full two-engine matrix re-run recorded as the qualification evidence.
- [ ] Audit evidence snapshots captured (full + production).
- [ ] Rollback path (`15.5.20`, never `15.1.11`) reconfirmed.
- [ ] Verify phase after PR merge (per the project's Verify Phase instructions).

## Consultation Log

### Iteration 1 — initial three-way review (2026-07-20)

- **Gemini: APPROVE (high confidence).** "Perfectly translates the spec into
  three highly coherent, executable phases." Endorsed the phase split
  (upgrade → qualification → evidence), the single-PR rollback unit with
  coherent per-phase commits, and the FR5 `npm ls three` + `.next/static/` grep
  evidence method. One note: Phase 2 mislabeled the error budget as FR11 (it is
  FR9).
- **Claude: APPROVE (high confidence).** Traced every FR (FR1–FR13) to a phase
  and verified each factual claim against the codebase (dev script, pins, empty
  config, static page, client island, contract-test pins, `dev` not enumerated
  in `automation.test.mjs`, `E2E_ENGINES`, CI). Full coverage, correct ordering,
  literally-executable acceptance criteria. Notes: same FR11→FR9 mislabel; the
  stale README line-6 statement; and a refinement to name the exact
  `nextPlugin.configs.recommended.rules` / `configs['core-web-vitals'].rules`
  accesses to re-verify under the 16.x plugin.
- **Codex: COMMENT (high confidence).** "Strong, implementation-ready plan with
  good spec coverage." One point: README currently says "Updated for React 19
  and Next 15", which becomes false after the upgrade — call the line out
  explicitly. Otherwise file targets, sequencing, risks, and test strategy align
  with the repo.

**Changes applied (all feedback incorporated):**
1. Corrected the Phase 2 error-budget label from FR11 → FR9 (header, deliverable,
   and risk text); FR11 (supply-chain) remains correctly in Phase 3.
2. Phase 3 FR12 now explicitly calls out refreshing the stale README line-6
   "React 19 and Next 15" statement (also noted in Documentation Updates).
3. Phase 1 FR4 now names the exact ESLint plugin config accesses to re-verify
   under `@next/eslint-plugin-next@16.2.10`
   (`nextPlugin.configs.recommended.rules`,
   `nextPlugin.configs['core-web-vitals'].rules`).

_Second consultation (after human/gate feedback) to be appended if the plan is
revised at the plan-approval gate._

## Approval
- [ ] Expert AI Consultation Complete (3-way)
- [ ] Human plan-approval gate

## Change Log
| Date | Change | Reason | Author |
|------|--------|--------|--------|
| 2026-07-20 | Initial implementation plan | Plan phase draft | Builder (spir-12) |
| 2026-07-20 | FR11→FR9 label fix (Phase 2); explicit README line-6 refresh (Phase 3); named ESLint plugin config accesses (Phase 1) | 3-way plan review | Builder (spir-12) |

## Notes
- No time estimates (SPIR: phases are done/not-done).
- Elections confirmed by the architect at the spec gate: rely on the default
  Turbopack bundler (no explicit `--webpack`/`--turbopack` flag); exact
  string-equal `next`/plugin pins.
- The PR is opened during/after Phase 3 with all phase commits on the branch
  (per the project's PR Strategy: phases are git commits within one PR, not
  separate PRs).
