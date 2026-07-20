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

## Spec-approval gate — APPROVED (2026-07-20)
Architect approved the spec, verified factual claims against main, and confirmed
both elections (default-Turbopack + exact string-equal next/plugin pins). Told me
to continue to Plan. Architect ran `porch approve` themselves (`porch pending`
empty; `porch next 12` returned plan-phase tasks). Per porch skill, builders
NEVER call `porch approve` — the human runs it.

## Plan phase
Drafted `codev/plans/12-migrate-the-application-to-nex.md`. Three phases (one
rollback unit, phase commits within one PR):
1. framework_upgrade — reverify (FR1), run/review codemod (FR2), manifest+lock →
   16.2.10 (FR3), drop `--turbopack` dev flag + confirm no `next lint` (FR4),
   re-pin toolchain.test.mjs (FR12). Static-green target.
2. turbopack_behavioral_qualification — full two-engine matrix + smoke vs the
   Turbopack build (FR9), client-bundle integrity: no Node imports + single Three
   runtime (FR5), preserved semantics (FR6), Node/browser policy (FR7), validate
   green (FR8), error budget (FR11).
3. evidence_disposition_and_docs — audit/lockfile delta + PostCSS disposition
   (FR10), supply-chain verify (FR11), docs/enumeration truthfulness (FR12).
Design note: no infra-first phase (unlike plan 11) — the matrix/Firefox infra
already exists from #11; this reuses it unchanged. Porch plan checks pass
(plan_exists, has_phases_json, min_two_phases=3). Committed initial plan draft.

### Plan iteration 1 — 3-way consult (2026-07-20)
Gemini APPROVE (high), Claude APPROVE (high), Codex COMMENT (high). No
REQUEST_CHANGES. Applied all feedback:
- Fixed Phase 2 error-budget label FR11 → FR9 (FR11 = supply-chain, stays Phase 3).
- Phase 3 FR12: explicit refresh of stale README line 6 ("React 19 and Next 15").
- Phase 1 FR4: named the exact eslint plugin config accesses to re-verify under
  16.x (`nextPlugin.configs.recommended.rules`, `configs['core-web-vitals'].rules`).
Committed "Plan with multi-agent review". Next: porch → plan-approval GATE →
notify architect and STOP.

## Plan-approval gate — APPROVED (2026-07-20)
Architect approved the plan (3 phases, one rollback unit), restarted me fresh, and
told me to resume via porch into Implement. `porch next 12` transitioned to
implement / plan_phase=framework_upgrade (iter 1).

## Implement Phase 1 — framework_upgrade (2026-07-20)
Scope: FR1, FR2, FR3, FR4, FR12 (+ FR13 rollback unit). Fresh worktree =
node_modules ABSENT at start; lockfile baseline correctly locks next@15.5.20 /
react@19.2.7 / plugin@15.5.20.

**FR1 reverify (registry, under pinned toolchain):** PASS, no escalation.
- `next` + `@next/eslint-plugin-next` `latest` = 16.2.10 (both). No superseding
  stable 16.x (16.3.0 only preview/canary). `backport` = 15.5.20 (rollback tgt).
- next@16.2.10 `engines.node >=20.9.0` admits 22.23.1; React peer `^19.0.0` admits
  19.2.7; all non-React peers (sass, @playwright/test ^1.51.1, @opentelemetry/api,
  babel-plugin-react-compiler) are peerDependenciesMeta.optional → no NEW required
  peer. Playwright 1.61.1 satisfies the new optional peer.

**FR2 codemod — run & curated.** `@next/codemod upgrade 16.2.10` orchestrator is a
TTY multi-select (can't complete under builder non-TTY stdin; also self-installs,
bypassing the pinned single-`npm install`). Recommended 5 codemods; reviewed each:
- 4 jscodeshift transforms (remove-experimental-ppr, remove-unstable-prefix,
  middleware-to-proxy, next-experimental-turbo-to-turbopack) → dry-run over whole
  tree = 0 modified / 13 unmodified. Zero source changes (matches minimal surface).
- `next-lint-to-eslint-cli` is an orchestrator that IGNORES --dry: it added
  eslint-config-next@^15.5.20 (out-of-scope new dep, 15.x) + rewrote
  eslint.config.mjs to `[...next, ...nextCoreWebVitals, ...nextTypescript]`
  (broadens rule surface). **REVERTED entirely** — not applicable (repo already on
  the #7 `eslint .` path w/ direct @next/eslint-plugin-next wiring). Curated out
  per FR2/FR4. Net accepted codemod source/config change: NONE.
Version bump + lockfile settle done by hand-reconciliation per the plan's toolchain
discipline (not the orchestrator's self-install).

**FR3 manifest+lockfile.** package.json next→16.2.10 (deps), plugin→16.2.10
(devDeps); one `npm install` under Node 22.23.1/npm 10.9.8. Verified: lockfile v3;
resolved next/plugin=16.2.10 (string-equal); react/react-dom unchanged 19.2.7;
single three@0.185.1 (deduped, no nested); root deps/devDeps mirror manifest; NO
peer warnings. `npm ci` = perfect no-op (lockfile md5 identical before/after 2nd
ci). Nested next-owned postcss@8.4.31 persists (expected; FR10 disposition = Ph3).

**FR4 obsolete idioms.** dev → `next dev` (dropped --turbopack). No `next lint` in
scripts/CI(.github/workflows/validation.yml)/anywhere; lint stays `eslint .`.
Plugin 16.2.10 `configs.recommended.rules` (21) & `configs['core-web-vitals'].rules`
(21) resolve as spreadable objects → flat-config export-shape intact under 16.x.

**FR12 contract tests.** toolchain.test.mjs expectedDependencyBaseline next+plugin
15.5.20→16.2.10 (string-equality + lockfile-v3/Node assertions preserved).

**DEVIATION (documented, FR6): tsconfig.json.** `next build` (Next 16) makes a
mandatory tsconfig change: `jsx: "preserve"` → `"react-jsx"` (React automatic
runtime) + suggested include `.next/dev/types/**/*.ts` (Turbopack dev types).
Behavior-preserving (tsc is noEmit; jsx only affects type-check handling — typecheck
passes both ways). Committed the minimal semantic form (2 edits, original
formatting); verified BUILD-STABLE (2nd build leaves tsconfig untouched, no
reconfigure msg). Not in the plan's expected file list but strictly forced by the
Next 16 build → belongs in this rollback unit.

**Environmental notes (NOT project issues, NOT committed):**
- `npm run lint` in-worktree flags only the untracked harness file
  `.claude/hooks/worktree-write-guard.cjs` (not in HEAD, not gitignored, absent in
  clean CI checkouts). Project source lints CLEAN under 16.x plugin
  (`eslint . --ignore-pattern .claude/**` = exit 0). Did NOT touch eslint.config.mjs
  (out-of-scope + FR4 forbids new suppressions).
- `next build` warns about multiple lockfiles (parent main-checkout + nested
  worktree) and infers parent as turbopack root — artifact of nested-worktree
  topology; absent in clean CI. Not silenced (would need an out-of-scope
  `turbopack.root` path in config; spec keeps config effectively empty).

**Phase 1 gates:** lint (project source exit 0) ✓ · typecheck exit 0 ✓ · npm test
21/21 ✓ · Turbopack build exit 0 ✓ · next start root `/` HTTP 200 ✓ · npm ci no-op ✓.
Files changed: package.json, package-lock.json (48/48 framework-only delta,
registry URLs), tests/toolchain.test.mjs, tsconfig.json. Committed aae97b8;
`porch done 12` checks passed (build ✓ tests ✓).

### Phase 1 iter1 — 3-way consult
Gemini APPROVE (high), Codex APPROVE (high), Claude REQUEST_CHANGES (high).
Claude's finding is VALID: my worktree `npm install` rewrote package-lock.json
top-level `"name": "primary"` → `"spir-12"` (npm derives it from the containing
dir since package.json has no `name`). Canonical baseline (parent, merge-base,
main) is all `"primary"`; the change was worktree contamination, not a framework
delta. (My first self-check was fooled by diffing working-tree-vs-own-commit;
diffing my commit vs its parent confirmed the change.) FIXED: restored line 2 to
`"name": "primary"`. Verified npm ci exit 0 keeps name=primary (ci never rewrites
the lock), no name delta vs parent, build ✓, tests 21/21 ✓.

Delivery of the fix: I first tried to fold it into the phase commit via amend +
restructure, but the remote enforces a **no-force-push rule** on builder branches
(GH013 repo rule), so rewriting the already-pushed `aae97b8` is impossible. Per
the SPIR guidance ("if changes are needed after commit, create a new commit with
fixes"), the fix lands as a **follow-up content commit on top of `aae97b8`**
(`[Spec 12][Phase: framework_upgrade] fix: restore lockfile name …`). The
cumulative branch content is correct (name=primary); the eventual PR diff (branch
vs main) is clean. Re-consult next.

### Phase 1 iter2 — 3-way consult → UNANIMOUS APPROVE
Gemini APPROVE (high), Codex APPROVE (high), Claude APPROVE (high). Claude
re-verified the lockfile name=primary fix, all 458 resolved URLs =
registry.npmjs.org, no app/config/eslint changes, tsconfig deviation justified.
No issues. porch advanced framework_upgrade → COMPLETE and moved to Phase 2
(turbopack_behavioral_qualification, iter1).

**Phase 1 done.** Branch commits on origin: aae97b8 (upgrade) + 114cc66 (name fix)
+ porch state commits. Lesson recorded for Ph2/Ph3: commit content BEFORE the
consult cycle; NEVER rewrite pushed history (remote blocks force-push on builder
branches, GH013) — post-consult fixes go as follow-up commits.

## Implement Phase 2 — turbopack_behavioral_qualification (STARTING)
Scope: FR5 (client-bundle integrity: single three + no Node-only imports in
.next/static), FR6 (preserved semantics), FR7 (Node/browser policy), FR8
(aggregate validate gate), FR9 (full two-engine matrix+smoke vs Turbopack build,
error budget). This is the large browser-qualification phase (Playwright
Chromium+Firefox). Known environmental watch-items entering Ph2:
- `npm run validate` includes `npm run lint`, which fails ONLY on the untracked
  harness file `.claude/hooks/worktree-write-guard.cjs` (absent in CI). Need an
  honest strategy so the gate reflects project source, not the harness artifact.
- Playwright browser availability / GPU (Firefox WebGL) in this worktree TBD —
  #11 split is Chromium-required (SwiftShader) + Firefox local qualification.
Per porch's own guidance ("Run /compact before starting each new phase") + the
size of Ph2, this is a natural checkpoint.

## Implement Phase 2 — turbopack_behavioral_qualification (QUALIFICATION COMPLETE)
Pure qualification phase: re-run the #11 suites UNCHANGED against the now-default
Turbopack production build, scan the shipped client bundle, verify Node/browser
policy. **Zero source/test/config changes** — the correct outcome (plan: "Files:
expected none in app/"). Environment: Node 22.23.1 / npm 10.9.8, next+plugin
16.2.10, lockfile name=`primary`. All commands run in-worktree.

**FR5 client-bundle integrity — PASS.**
- Single Three runtime: `npm ls three` → one `three@0.185.1` (deduped across
  react-force-graph-3d → 3d-force-graph → three-forcegraph/three-render-objects,
  all `deduped`); no nested `node_modules/**/node_modules/three`. Also enforced by
  the FR12 contract test.
- No Node-only imports in shipped client chunks. After a clean `rm -rf .next &&
  next build` (Turbopack), scanned `.next/static/` (14 files, 11 `.js`):
  - `node:` scheme scan (fs/path/crypto/os/stream/util/process/module/
    child_process/net/tls/http/https/zlib/events/buffer/assert/url/querystring/
    worker_threads/dns/readline/vm/perf_hooks) → **0 matches**.
  - Bare-builtin **import/require-form** scan (`(require\(|from|import)…"builtin"`)
    → **0 matches** (authoritative proof).
  - Broad quoted-token scan surfaced only 3 innocuous NON-import usages, each
    inspected: `"path"` = SVG `<path>` tag + cookie `Path=` attr; `"module"` =
    `type:"module"` script attr; `"process"` = `"process"===E(i.process)` runtime
    env-sniff (`typeof process` isomorphic detection). None are Node-builtin
    imports. Client bundle clean.

**FR6 preserved semantics — PASS.** `git status`/`git diff --stat` after build:
zero tracked source changes. No graph prop/handler/timer/camera/control edit;
`app/` diff = none. Build is BUILD-STABLE (unlike Ph1, `next build` did NOT
re-touch tsconfig — the react-jsx/dev-types change landed in Ph1 and holds). `.next`
is gitignored (confirmed). Only uncommitted tracked file = this thread.

**FR7 Node/browser policy — PASS (no declaration required).**
- Node floor: `next@16.2.10` declares `engines.node: ">=20.9.0"`; repo pins
  `22.23.1` (`.nvmrc` + `engines.node`, CI/contract-enforced) → satisfied with a
  full-major margin. Matches spec §2. No Node change permitted/needed.
- Browser policy (reverified from the official Next 16.2.10 doc
  `nextjs.org/docs/architecture/supported-browsers`, lastUpdated 2025-10-01):
  **Chrome 111+ / Edge 111+ / Firefox 111+ / Safari 16.4+**, zero-config. Next's
  default browserslist = `["chrome 111","edge 111","firefox 111","safari 16.4"]`.
  All four floor browsers ship WebGL2 (Safari since 15.0; others long before 111),
  so the Next 16 floor is compatible with the app's WebGL2 requirement. Next works
  zero-config and does NOT require an app-level `browserslist` → **none added**
  (spec FR7: "otherwise record that no declaration is required"). Adding one would
  be out-of-scope noise. `package.json` has no `browserslist` (unchanged).

**FR8 aggregate gate — PASS (honest env-artifact caveat).**
- `npm run typecheck` (tsc --noEmit) → exit 0.
- `npm run lint` (`eslint .`) → exit 1, but ALL 18 errors are in ONE file:
  the untracked builder-harness artifact `.claude/hooks/worktree-write-guard.cjs`
  (not tracked, NOT in HEAD, absent from any clean CI `actions/checkout`). Project
  source lints CLEAN: `eslint . --ignore-pattern ".claude/**"` → exit 0. Did NOT
  edit `eslint.config.mjs` (FR4 forbids new suppressions; out-of-scope env noise).
  In CI (`E2E_ENGINES=chromium npm run validate` over the committed tree) the lint
  stage is green because the artifact isn't checked out.
- `npm run test:smoke` (build + Playwright) → see FR9.
- Audit pipeline intact + exit codes preserved (delta/disposition is Ph3/FR10):
  full = {mod 7, high 4, total 11} exit 1; production = {mod 5, high 0, total 5}
  exit 1. Existing advisories are not a zero-findings gate (arch-critical).

**FR9 behavioral qualification + error budget — PASS.** `npm test`
(node --test, incl. `focus-graph-lifecycle.test.mjs`) = **21/21**. Full two-engine
Playwright matrix+smoke against the Turbopack `next start` = **20/20** (11.9m):
- Chromium (SwiftShader, the required CI gate `E2E_ENGINES=chromium`): 10/10.
- Firefox (local qualification gate): 10/10.
- Covered: initial force layout, auto-rotate pause/resume, delayed pointer enable,
  wheel zoom-out, wheel zoom-in + background-drag rotate, click-to-focus + camera
  animate + reset, axes toggle, resize consistency, unmount/remount, and smoke
  (canvas/WebGL2 readiness + core controls + STRICT error budget). Smoke green in
  BOTH engines ⇒ zero unexpected page/console/hydration/timer/WebGL-context/GPU
  errors. Re-run, not re-authored (#11 suites unchanged).

**FR13 regression semantics:** no baseline divergence observed ⇒ no baseline
replay needed; nothing to escalate.

**Env-only warnings (NOT project issues, NOT silenced):** `next build`/`next start`
warn about "multiple lockfiles / inferred workspace root" (parent main-checkout +
nested worktree) — nested-worktree topology artifact, absent in clean CI. Did NOT
add `turbopack.root`/`outputFileTracingRoot` (spec keeps config empty; out of
scope). Same disposition as Ph1.

**Phase 2 commit contents:** thread evidence only (zero source diff is the correct,
plan-anticipated outcome for a qualify-existing-behavior phase). Consult next.
