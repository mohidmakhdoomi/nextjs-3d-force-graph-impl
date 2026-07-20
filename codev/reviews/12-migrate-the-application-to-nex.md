# Review: migrate-the-application-to-nex

Issue #12 — Migrate the application to Next 16 Active LTS. Strict SPIR, high-risk
integration review. Depends on #11; tracked under #6.

## Summary

Moved the framework from the qualified Next 15.5.20 baseline to **Next 16.2.10
(Active LTS)** as a single revertible unit, on the already-qualified React 19.2.7
line. The migration:

- Pinned `next` and `@next/eslint-plugin-next` to exact `16.2.10`; re-pinned the
  contract test; removed the now-redundant `--turbopack` dev flag; kept `build` as
  bare `next build` (Turbopack is the Next 16 default).
- Reviewed the official Next upgrade codemods and **curated out all out-of-scope
  drift** (the `next-lint-to-eslint-cli` orchestrator would have added a 15.x
  `eslint-config-next` dep and broadened the flat config — reverted entirely; the
  repo already uses the explicit `eslint .` path from #7). Net accepted codemod
  source/config change: none.
- **Behaviorally qualified the now-default Turbopack production build** across the
  two-engine interaction matrix (Chromium SwiftShader + Firefox), confirmed the
  client bundle ships no Node-only imports and a single Three runtime, verified the
  Node/browser policy, and produced the honest audit/lockfile/supply-chain delta
  with the Next-owned nested PostCSS residual explicitly dispositioned.

Three plan phases, all on branch `builder/spir-12`, all unanimously approved by the
3-way CMAP review (Gemini/Codex/Claude). The framework work touches only
`package.json`, `package-lock.json`, `tests/toolchain.test.mjs`, `tsconfig.json`,
and `README.md` — zero `app/` source changes.

## Spec Compliance

| FR | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| FR1 | Reverify target (16.2.10, support, migration guide, peers) | ✅ | dist-tag `latest`=16.2.10; Node floor `>=20.9.0`; React peer satisfied by 19.2.7; new optional peers only (`@playwright/test ^1.51.1` satisfied by pinned 1.61.1). No new required peer. |
| FR2 | Run/review codemod, curate drift | ✅ | 4 jscodeshift transforms dry-ran = 0 modified; `next-lint-to-eslint-cli` orchestrator reverted (out-of-scope dep + config broadening). Net accepted source/config change: none. |
| FR3 | Manifest + lockfile pin | ✅ | `next`/plugin → 16.2.10 (deps/devDeps); one `npm install`; lockfile v3; single `three@0.185.1`; no peer warnings; `npm ci` no-op. |
| FR4 | Remove obsolete next-lint/turbopack idioms | ✅ | `dev` → `next dev` (flag dropped); no `next lint` in scripts/CI/anywhere; `lint` stays `eslint .`; plugin 16.2.10 `configs.recommended`/`core-web-vitals` rule objects resolve spreadable. |
| FR5 | Qualify Turbopack build + client bundle | ✅ | `next build` (Turbopack) OK; `.next/static/` scan: 0 `node:` scheme, 0 bare-builtin import specifiers; single `three@0.185.1` deduped; `dynamic(...,{ssr:false})` island preserved. |
| FR6 | Preserved client boundary + interaction semantics | ✅ | Zero `app/` diff; all timers/camera/control values intact; build-stable. |
| FR7 | Node + browser policy | ✅ | `22.23.1` ≥ `>=20.9.0`; browser floor Chrome/Edge/Firefox 111 + Safari 16.4 (zero-config, WebGL2-compatible); no `browserslist` required. |
| FR8 | Automated validation gates | ✅ | typecheck 0; lint 0 on committed tree (clean-worktree proof); `npm test` 21/21; Turbopack build 0; `next start` root 200; `test:smoke`/`validate` green; audit pipeline preserves exit codes. |
| FR9 | Browser smoke + interaction matrix | ✅ | Two-engine Playwright 20/20 (Chromium 10 + Firefox 10) vs the Turbopack `next start`; `focus-graph-lifecycle` unit green; strict error budget clean in both engines. |
| FR10 | Lockfile/audit delta + PostCSS disposition | ✅ | 11 changed lockfile entries, all Next-owned, 15.5.20→16.2.10; audit byte-identical before/after (0 resolved / 0 introduced / all unchanged); nested `postcss@8.4.31` dispositioned as Next-owned residual. |
| FR11 | Supply-chain verification | ✅ | All 11 changed entries → `registry.npmjs.org`; no install-script deltas; `npm ci` clean no-op. One dev→prod scope promotion: `baseline-browser-mapping@2.10.43` (now a direct `next@16.2.10` dep) — same version, registry-resolved, Apache-2.0, no advisory, audit-neutral. |
| FR12 | Contract-test + docs updates | ✅ | `toolchain.test.mjs` pins moved to 16.2.10 (string-equal); README line 6 → Next 16 Active LTS + Turbopack note; `automation.test.mjs` enumerations green. |
| FR13 | Rollback unit + blocking semantics | ✅ | Manifest+lock+config+contract tests+docs = one revert unit restoring `next@15.5.20` (never `15.1.11`); no genuine regression → nothing blocked/escalated. |

### Issue acceptance criteria
- [x] Next 16 target/support/migration/peers reverified (FR1)
- [x] No obsolete `next lint` or redundant Turbopack dev flag (FR4)
- [x] Node/browser policy satisfies the release (FR7)
- [x] Lint, typecheck, Turbopack build, production start, audits, browser smoke, full graph UX matrix pass (FR8/FR9)
- [x] Client bundle has no Node-only imports; one Three runtime via the client-only island (FR5)
- [x] Lockfile/audit changes explained; residual nested PostCSS dispositioned (FR10/FR11)
- [x] Rollback returns to the patched Next 15 baseline, never `15.1.11` (FR13)

## Deviations from Plan

- **Phase 1 — forced `tsconfig.json` change (documented).** Next 16's `next build`
  makes a mandatory tsconfig change: `jsx: "preserve"` → `"react-jsx"` plus a
  suggested `include` of `.next/dev/types/**/*.ts`. Behavior-preserving (typecheck
  passes both ways); committed as part of the rollback unit though not in the plan's
  expected file list, because the Next 16 build strictly forces it.
- **Phase 1 — lockfile `name` fix as a follow-up commit.** A worktree `npm install`
  rewrote the lockfile top-level `name` (`primary` → `spir-12`); caught by CMAP
  (Claude, iter1) and corrected. Because the remote blocks force-push on builder
  branches (GH013), the fix landed as a follow-up content commit rather than an
  amend. Cumulative branch content is correct; the PR diff is clean.
- No other deviations. Phases 2 and 3 matched the plan exactly (Phase 2 was a
  zero-source-diff qualification, as anticipated).

## Lessons Learned

### What Went Well
- **Codemod curation held the line.** Dry-running every transform and reverting the
  self-installing `next-lint-to-eslint-cli` orchestrator kept the diff to an exact,
  minimal framework delta — no out-of-scope deps or config broadening.
- **Evidence-first qualification.** The two-engine matrix + client-bundle scan +
  before/after audit gave a fully-substantiated "audit-neutral, behavior-preserving"
  story rather than an "it built" assertion.
- **Honest environment separation.** The `.claude/hooks` lint artifact and the
  nested-worktree lockfile warning were documented as environment noise and proven
  clean on a real checkout, instead of being silenced in committed config.

### Challenges Encountered
- **Local `npm run validate` was red on an untracked harness file.** `eslint .`
  lints `.claude/hooks/worktree-write-guard.cjs` (a builder-harness artifact absent
  from any clone/CI checkout). Resolved by proving the gate on a clean detached
  worktree (`git worktree add --detach HEAD` + `npm ci` + `npm run validate` → exit
  0), **not** by editing `eslint.config.mjs` (FR4 forbids new suppressions). Codex
  raised this at Phase 2 iter1; the clean-tree evidence flipped it to APPROVE.
- **Turbopack rejects a symlinked `node_modules`** ("symlink points out of the
  filesystem root") — the first clean-tree reproduction used a symlink and panicked;
  redone with a real `npm ci`.
- **Worktree lockfile `name` contamination** (see Deviations) — a recurring trap
  when `package.json` has no `name`.

### What Would Be Done Differently
- Reset the lockfile `name` immediately after the first worktree `npm install`
  rather than discovering the contamination via review — it is now a hot lesson.
- Reach for the clean detached-worktree gate proof at the first sign of an
  environment-only failure, instead of arguing it in prose first.

### Methodology Improvements
- The strict-SPIR "commit content before `porch done`/consult" rule proved its worth
  again: reviewers verified real diffs each round. No protocol change proposed.
- CMAP caught a real contamination bug (lockfile `name`) that self-review missed
  because self-diffing working-tree-vs-own-commit hid it; diffing commit-vs-parent
  is the reliable check. Worth internalizing, not a protocol change.

## Technical Debt
- **Next-owned nested `postcss@8.4.31`** (`node_modules/next/node_modules/postcss`)
  carries the moderate `GHSA-qx2v-qp2m-jg93` advisory (via the `next` and `postcss`
  audit paths). It is not app-fixable in this stage (npm offers only a bogus
  `next@9.3.3` major downgrade) and is unchanged from the pre-upgrade baseline. Not
  new debt introduced here — a carried-forward, documented build-time residual to
  revisit if/when a future Next release re-vendors PostCSS.

## Consultation Feedback

### Specify Phase (Round 1)
#### Gemini — APPROVE
- No blocking concerns. "Exceptionally thorough" spec aligning with existing
  validation/contract-test constraints.
#### Codex — COMMENT
- **Concern**: minor evidence-method clarifications would improve builder guidance.
  - **Addressed**: the spec's FR5/FR9 evidence methods (explicit scan commands,
    engine split) were tightened so builders can't invent inconsistent proofs.
#### Claude — reviewed (detailed, no blocking change)
- Confirmed scope, rollback target, and validation alignment.

### Plan Phase (Round 1)
#### Gemini — APPROVE
- Plan "perfectly translates the spec into three coherent, executable phases,"
  honoring constraints and rollback.
#### Codex — COMMENT
- **Concern**: a minor doc-truthfulness clarification was missing.
  - **Addressed**: Phase 3 FR12 now explicitly calls out refreshing the stale
    README line-6 version statement; the Phase 2 error-budget label was corrected
    FR11→FR9; Phase 1 FR4 names the exact ESLint plugin config accesses to verify.
#### Claude — reviewed (detailed, no blocking change)

### Phase 1 — framework_upgrade (Round 1)
#### Gemini — APPROVE · #### Codex — APPROVE
#### Claude — REQUEST_CHANGES
- **Concern**: `package-lock.json` top-level `name` was `spir-12` (worktree
  contamination) instead of the canonical `primary`.
  - **Addressed**: restored to `primary`; verified `npm ci` keeps it; delivered as a
    follow-up commit (remote blocks force-push).

### Phase 1 — framework_upgrade (Round 2)
#### Gemini / Codex / Claude — APPROVE (unanimous). Lockfile-name fix verified; no
further concerns.

### Phase 2 — turbopack_behavioral_qualification (Round 1)
#### Gemini — APPROVE · #### Claude — APPROVE
#### Codex — REQUEST_CHANGES
- **Concern 1**: `npm run validate` isn't green locally because `npm run lint`
  exits 1.
  - **Rebutted (with evidence)**: the failure is solely the untracked
    `.claude/hooks/worktree-write-guard.cjs` harness artifact (not in HEAD, absent
    from clean checkouts). Demonstrated the literal `npm run validate` → exit 0 on a
    clean detached-worktree `npm ci` checkout, both engines. Editing
    `eslint.config.mjs` would violate FR4.
- **Concern 2**: `status.yaml` shows the phase `in_progress`, not `complete`.
  - **Rebutted**: this is the correct porch strict-mode review-cycle state
    (`build_complete: true`, awaiting unanimous approval); porch owns the file and
    the builder is forbidden to edit it.

### Phase 2 — turbopack_behavioral_qualification (Round 2)
#### Gemini / Codex / Claude — APPROVE (unanimous). Codex flipped to APPROVE: "the
prior validate concern is credibly rebutted against the actual worktree state."

### Phase 3 — evidence_disposition_and_docs (Round 1)
#### Gemini / Codex / Claude — APPROVE (unanimous, first iteration). No concerns;
all four acceptance criteria verified (audit exit codes + path-by-path delta;
PostCSS disposition; supply-chain + `npm ci` no-op; README truthful + `npm test`
21/21).

### PR Review — `--type pr` (Round 1)
#### Gemini — APPROVE (high). No issues.
#### Claude — APPROVE (high)
- **Observation** (non-blocking): `baseline-browser-mapping@2.10.43` was promoted
  from dev-only to production scope because `next@16.2.10` declares it as a direct
  dependency; the "0 added, 0 removed" framing covered version changes but not this
  scope flip.
  - **Addressed**: verified (it is the only dev→prod flip; same version, registry,
    Apache-2.0, no advisory, production audit unchanged at 5) and documented in the
    FR11 row above.
#### Codex — COMMENT (high), two non-blocking nits:
- **Nit 1**: the checked-in plan looked stale (`Status: draft`, unchecked success
  metrics, phase statuses `pending`) vs `status.yaml`.
  - **Addressed**: updated the plan's Status, Phase Status table (→ complete), and
    the 13 Success Metrics checkboxes to reflect completion.
- **Nit 2**: many `chore(porch): …` commits don't match the `[Spec N][Phase]`
  convention; worth squashing if strict history matters.
  - **Rebutted / N/A**: those are machine-generated porch state-transition commits,
    not builder commits; the builder cannot rewrite them (remote blocks force-push,
    GH013), and integration/merge (incl. any squash) is the architect's call. The
    builder-authored commits follow the `[Spec 12]…` convention.

## Architecture Updates

Routed by tier (Spec 987):
- **COLD `codev/resources/arch.md`** — added a "Framework and Bundler Baseline"
  section (current state): Next 16 Active LTS on React 19; Turbopack as the default
  bundler for `dev` and `build` (relied on by default, qualified against the
  two-engine matrix); `next lint` removed in favor of the explicit `eslint .` path;
  Node floor `>=20.9.0` (repo pins 22.23.1); browser floor Chrome/Edge/Firefox 111 +
  Safari 16.4 (no `browserslist`); the Next-owned nested `postcss@8.4.31` build-time
  residual.
- **HOT `codev/resources/arch-critical.md`** — added one map line pointing to the
  new cold section (map now 2 topics, within cap). No new hot *fact*: the
  reproducibility-contract and `npm run validate`-gate facts already cover the
  behavior-changers; the Next-16/Turbopack detail is reference material for the cold
  archive.

## Lessons Learned Updates

Routed by tier (Spec 987):
- **COLD `codev/resources/lessons-learned.md`** — added a "Toolchain and Worktree
  Hygiene" section with two durable gotchas: (1) a local gate failure caused only by
  an untracked builder-harness file is environment noise — prove the gate on a clean
  detached-worktree `npm ci` (Turbopack rejects a symlinked `node_modules`), don't
  suppress it in committed config; (2) `npm install` in a worktree rewrites the
  lockfile top-level `name` to the dir basename when `package.json` has no `name` —
  reset it before committing.
- **HOT `codev/resources/lessons-critical.md`** — promoted the env-artifact-vs-gate
  lesson to one capped hot line (behavior-changing and cross-cutting for every
  builder in this worktree model; 5 lessons total, within cap) and added the
  matching cold-doc map line (2 map topics). The lockfile-name gotcha stays cold
  (narrower reference recipe).

## Flaky Tests
No flaky tests encountered. All suites (`node --test` 21/21; Playwright 20/20 both
engines) passed deterministically across repeated runs; nothing skipped.

## Follow-up Items
- Revisit the nested `postcss@8.4.31` residual if a future Next release re-vendors
  PostCSS (would resolve `GHSA-qx2v-qp2m-jg93` at the framework level).
- Next roadmap stages (tracked under #6) continue from this Next 16 Active-LTS base;
  no Tailwind 4 / TS-major / ESLint 10 / React Compiler / 3D-stack upgrade was in
  scope here.
