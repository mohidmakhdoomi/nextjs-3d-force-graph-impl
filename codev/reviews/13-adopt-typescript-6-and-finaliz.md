# Review: adopt-typescript-6-and-finaliz

## Summary

Moved the language toolchain from `typescript@~5.7.3` to exactly **`6.0.3`** (the
bounded supported TypeScript 6 target) and finalized the supported **ESLint 9** flat
config, without adopting the two blocked adjacent majors (TypeScript 7, ESLint 10).
The single version change is `typescript`; everything else is configuration
finalization. Delivered as one revertible unit across three git commits within a
single PR:

1. **`typescript6_adoption`** (`d642094`) — `typescript` → exact `6.0.3`, lockfile
   regenerated, `tsc` clean, `eslint .` clean with no parser warning (config
   unchanged), contract-test pin added.
2. **`eslint9_config_finalization`** (`a3f375d`) — pure `eslint.config.mjs` refactor:
   React on the native flat surface, globals scoped by file group, Hooks
   coverage-preserving, `@eslint/compat` still absent.
3. **`qualification_evidence_docs`** (`bda79f2`, `b400853`) — end-to-end
   qualification (full gates, direct production start HTTP 200, two-engine matrix,
   lockfile/audit/supply-chain review), README docs, TS7/ESLint10 deferral.

Reverification date: **2026-07-20** (Node `22.23.1` / npm `10.9.8`).

## Spec Compliance

- [x] **FR1** — Target/support reverified at implementation time against a **real
  install** (not a bare `require`): `typescript@6.0.3` is the latest stable 6.0.x
  (only `6.0.2`/`6.0.3` stable); `typescript-eslint@8.64.0` peers `typescript
  >=4.8.4 <6.1.0` and its `typescript-estree@8.64.0`
  `SUPPORTED_TYPESCRIPT_VERSIONS = '>=4.8.4 <6.1.0'` admits `6.0.3`;
  `typescript-eslint@latest 8.65.0` carries the same range (no TS-support gain → 8.64.0
  retained); TS7 (`7.0.2`) still parser-blocked. No contradiction → no escalation.
- [x] **FR2** — `devDependencies.typescript` = exact `"6.0.3"`; lockfile regenerated
  via npm (v3); net lockfile delta is **only** the `typescript` entry; `npm ci`
  reproduces clean with no peer warnings and no `--force`/`--legacy-peer-deps`.
- [x] **FR3** — `tsc@6.0.3 --noEmit` exits 0 with **zero** diagnostics/deprecations on
  the full `tsconfig.json` + source; `skipLibCheck` retained.
- [x] **FR4** — `eslint .` runs with **no** `typescript-eslint` unsupported-version
  warning and **no** suppression (proven on a clean checkout; see Deviations for the
  harness-file note).
- [x] **FR5** — Globals scoped by file group (browser `app/**`; Node/ESM; Node/CommonJS
  `+sourceType:"commonjs"` by explicit glob; both for `tests/e2e/**`), proven by
  before/after `eslint --print-config`.
- [x] **FR6** — React migrated to native `configs.flat.recommended` (rule-identical, 22
  rules); Hooks coverage-preserving via the flat-native 2-rule registration (not the
  16/17-rule preset); JS/TS/Next coverage + the deliberate offs preserved. Zero rule
  diffs on 5 representative files.
- [x] **FR7** — `@eslint/compat` absent from manifest + lockfile; no `fixup*` shims.
- [x] **FR8** — lint=0, typecheck=0, `npm test`=0, build=0, `test:smoke`=0,
  `validate`=0; `audit:full`/`audit:production` exit 1 (evidence, not a gate); direct
  `npm run start` → root **HTTP 200** (251588 bytes) + clean shutdown. Each recorded
  separately.
- [x] **FR9** — Reused #11/#12 suites: **20 Playwright tests passed (12.0m)** — 10
  Chromium (SwiftShader, required CI gate) + 10 Firefox (local qualification). Zero
  unexpected errors; runtime behavior unchanged.
- [x] **FR10** — Audit delta path-by-path **identical** before→after (FULL 11 pkgs,
  PROD 5 pkgs, zero diffs); `typescript` in no advisory path; Next-owned nested
  `postcss@8.4.31` unchanged.
- [x] **FR11** — Sole changed lockfile entry (`typescript`) resolves from
  `registry.npmjs.org`, `hasInstallScript: false`, no new install script.
- [x] **FR12** — `tests/toolchain.test.mjs` pins `typescript@6.0.3` exactly (== lockfile)
  and asserts the supported parser range; README references the "TypeScript 6" line
  (not the patch) and records the deferral.
- [x] **FR13** — Whole change is one revertible unit back to `~5.7.3`; TS7 deferred
  pending `typescript-eslint` support; ESLint 10 a separate experiment; blocking
  semantics honored (no suppression/forced install/coverage drop).

## Deviations from Plan

- **None substantive.** The only surprises were two known worktree-environment
  artifacts, both handled per `lessons-critical` rather than by changing committed
  config:
  1. `npm install` rewrote the lockfile's top-level `name` `"primary"` → `"spir-13"`
     (worktree basename; `package.json` has no `name`). Reset to `"primary"`.
  2. `eslint .` in the worktree flags the **untracked** `.claude/hooks/worktree-write-guard.cjs`
     (absent from clean checkouts). Not suppressed in committed config; the clean lint
     was proven on a detached clean checkout (`git worktree add --detach` + real `npm ci`).
- `tsconfig.json` and app source were untouched — the FR3 probe expectation (no
  deprecations) held on the full config, so no source edits were required.

## Lessons Learned

### What Went Well
- **Phase isolation paid off.** Bumping TypeScript in Phase 1 with the config shape
  frozen, then refactoring the config in Phase 2, made every lint-coverage question
  attributable to exactly one commit. Reviewers repeatedly called this out.
- **Print-config as proof, not assertion.** before/after `eslint --print-config` on 5
  representative files (rule sets + globals) plus a linted-file-set diff turned
  "coverage-preserving" from a claim into evidence — zero rule diffs, identical 19-file
  set.
- **Clean-checkout discipline** neutralized the untracked-harness-file noise cleanly
  and also doubled as reproducibility proof (real `npm ci` no-op on manifest/lock).

### Challenges Encountered
- **The no-`node_modules` worktree trap** (Confirmed Decision #8): verifying plugin
  rule counts needed a real `npm ci` — a bare `require` would have resolved the parent
  checkout's stale versions. Resolved by always verifying against the installed tree.
- **Reviewer bookkeeping loop (Phase 3).** Codex's iter-1 README point was valid and
  fixed immediately; its iter-2 point was purely that the committed thread hadn't yet
  recorded the iter-2 outcome. Resolved by keeping the committed thread current at each
  step; iter-3 was unanimous.

### What Would Be Done Differently
- Update the committed thread with each iteration's *outcome* immediately after the
  consultation returns, not just the intent to re-consult — this would have pre-empted
  the Phase 3 iter-2 bookkeeping request.

### Methodology Improvements
- The porch REQUEST_CHANGES → rebuttal → re-verify loop worked well, but a reviewer
  flagging porch-owned `status.yaml` as "inconsistent" recurred across iterations; a
  short note in the reviewer context that `status.yaml` is porch-managed (builder must
  not edit in strict mode) would avoid re-litigating it.

## Technical Debt
- None introduced. Pre-existing, out-of-scope items remain tracked follow-ups (below).

## Consultation Feedback

### Specify Phase (Round 1)
#### Gemini
- No concerns raised (APPROVE, high). Verified Problem Analysis against the codebase.
#### Codex
- **Concern**: FR8 `npm run start` HTTP 200 evidence, FR5 e2e globals pattern, and
  docs exact-vs-line policy needed sharpening (COMMENT).
  - **Addressed**: spec updated — FR8 marks the direct start as a separate explicit
    step; FR5 specifies the single `tests/e2e/**` both-sets block; FR12 sets the
    "TypeScript 6" line docs policy.
#### Claude
- **Concern**: Hooks rule count (a stale bare-`require` read of "2 rules"), "current
  flat-config surface" ambiguity, overstated app browser-globals wording, `.ts`+CJS
  tailwind (4 non-blocking).
  - **Addressed**: spec now states exact counts (16/17/29) + adds Confirmed Decision #8
    (the no-`node_modules` trap); FR6/FR5 clarified; wording softened.

### Plan Phase (Round 1)
#### Gemini
- No concerns raised (APPROVE, high) — endorsed the phase isolation and rollback shape.
#### Codex
- No concerns raised (APPROVE, high).
#### Claude
- **Concern**: FR5 globals grouping buried the ESM-vs-CJS distinction; the standalone
  `{files:…}` + global `languageOptions` block needed a disposition (2 non-blocking).
  - **Addressed**: plan split the Node group into Node/ESM vs Node/CommonJS and directed
    folding the standalone block into the scoped structure.

### Implement — Phase 1 `typescript6_adoption` (Round 1)
- **Gemini / Codex / Claude**: No concerns raised — unanimous APPROVE (high).

### Implement — Phase 2 `eslint9_config_finalization` (Round 1)
- **Gemini / Codex / Claude**: No concerns raised — unanimous APPROVE (high).

### Implement — Phase 3 `qualification_evidence_docs` (Round 1)
#### Claude
- No concerns raised (APPROVE, high).
#### Codex
- **Concern**: README's `validate` row said "production start", but `validate = lint &&
  typecheck && test:smoke`; the direct `npm run start` HTTP 200 is a separate step and
  the smoke server is Playwright-managed (REQUEST_CHANGES).
  - **Addressed**: `b400853` reworded the table row + prose to point at `test:smoke` and
    call out the separate direct-start check.
- **Concern**: `status.yaml` shows `in_progress`.
  - **Rebutted**: `status.yaml` is porch-managed; correctly `in_progress` until porch
    advances post-approval; strict mode forbids editing it.
#### Gemini
- Lane skipped — `agy` produced no output (non-blocking tooling skip).

### Implement — Phase 3 (Round 2)
#### Gemini
- No concerns raised (APPROVE, high) — lane recovered; README semantics correct.
#### Claude
- No concerns raised (APPROVE, high) — README fix verified against `package.json`.
#### Codex
- **Concern**: committed thread hadn't recorded the iter-2 outcome / post-fix state;
  thread lagged `status.yaml` `iteration: 2` (REQUEST_CHANGES, medium).
  - **Addressed**: `eca2e46` brought the thread current through iteration 2. The
    `status.yaml` framing was rebutted again (porch-managed).

### Implement — Phase 3 (Round 3)
- **Gemini / Codex / Claude**: No concerns raised — unanimous APPROVE (high). All prior
  feedback resolved.

## Architecture Updates

Routed to the **cold** `codev/resources/arch.md` (reference detail; not a new
always-on invariant, so the hot `arch-critical.md` cap is untouched and its
"Framework and Bundler Baseline" map pointer still resolves):

- Updated **"Dependency Classification and Lint Config"** to record the finalized
  state: TypeScript 6 as the exact-pinned language target with the contract-test pin
  and the `<6.1.0` parser-peer bound (TS7/ESLint10 deferred); React on
  `configs.flat.recommended` (replacing the legacy eslintrc shim, rule-identical);
  Hooks coverage-preserving; and globals scoped by file group (browser / Node-ESM /
  Node-CJS-by-glob / e2e-both), with print-config as the equivalence proof and the
  single `files`-less global-ignore invariant retained.

No hot-tier (`arch-critical.md`) change: the exact-pin/reproducibility invariant is
already captured there, and this stage adds reference detail, not a new
behavior-changing cross-cutting fact.

## Lessons Learned Updates

Routed to the **cold** `codev/resources/lessons-learned.md`, section **"Toolchain and
Worktree Hygiene"** (a verification recipe → cold per the tier routing rules; the hot
`lessons-critical.md` map already points here):

- Added the **no-`node_modules` bare-`require` trap**: because the builder worktree
  ships without `node_modules`, verifying an installed package's behavior via bare
  `require('<pkg>')` silently resolves the parent checkout's (possibly stale) versions
  — e.g. `eslint-plugin-react-hooks@5.1.0`'s 2 rules instead of the pinned `7.1.1`'s
  16/17/29. Verify only after a real `npm ci` (or an isolated version-exact probe).

The worktree lockfile-`name` contamination lesson I also hit (`spir-13` → `primary`)
was **already** present in that section from #12 and handled per it — no duplicate
added. No hot-tier (`lessons-critical.md`) change: the always-on worktree-harness
lesson already covers the clean-checkout discipline, and this addition is a narrow
verification recipe.

## Flaky Tests
No flaky tests encountered. All contract/unit suites and the two-engine Playwright
matrix passed deterministically.

## Follow-up Items
- **TypeScript 7** adoption — deferred pending `typescript-eslint` parser support
  (peer stops `<6.1.0`).
- **ESLint 10** — separate peer-compatibility experiment.
- **`skipLibCheck` tightening** — a separate issue after the 3D/type alignment
  stabilizes (explicitly out of scope here; `skipLibCheck` retained).
- **Next-owned nested `postcss@8.4.31`** — carried forward as a non-app-controllable
  build-time residual (not app-fixable in this stage).
