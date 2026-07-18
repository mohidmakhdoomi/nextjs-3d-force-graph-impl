# Review: Reproducible Node 22 Modernization Baseline

## Summary

Project 7 established the measurement layer required before dependency
modernization:

- exact Node.js `22.23.1` and npm `10.9.8` declarations;
- lockfile-v3 clean-install integrity;
- direct lint, typecheck, build, start, audit, browser, and unified validation
  commands;
- a real production-server Chromium smoke for the WebGL canvas and axes, reset,
  and rotation controls;
- GitHub Actions parity with stable audit and browser-diagnostic artifacts; and
- durable full/production audit findings with installed dependency paths.

The implementation changed no `app/**` source and performed no framework,
rendering, TypeScript-major, ESLint-major, product, or `FocusGraph` lifecycle
migration.

## Delivered Commits

- `2770613` — `[Spec 7][Phase: toolchain-commands] chore: Pin Node and npm baseline`
- `223241d` — `[Spec 7][Phase: browser-smoke] test: Add production WebGL smoke validation`
- `85b6ccb` — `[Spec 7][Phase: ci-documentation] ci: Automate and document validation baseline`

Porch state-transition commits are interleaved with these named phase commits.
During the Phase 1 re-review, porch included the explicitly staged `.nvmrc` and
initial contract test in a state-transition commit; all deliverables remain in
the final branch.

## Spec Compliance

- [x] **FR1 — Toolchain policy:** `.nvmrc`, `engines.node`, and
      `packageManager` declare Node `22.23.1` / npm `10.9.8`; lockfile version 3
      remains synchronized.
- [x] **FR2 — Direct commands:** clean install, lint, typecheck, build, start,
      smoke, and both audit views have direct documented commands.
- [x] **FR3 — Unified validation:** `npm run validate` is sequential and
      fail-fast across lint, typecheck, production build/start, and the browser
      smoke. Audits remain separate evidence.
- [x] **FR4 — Browser smoke:** the test uses the built application and
      `next start`, observes a visible sized canvas and nonzero WebGL drawing
      buffer, exercises axes/reset/rotation, and fails on application
      `console.error` or `pageerror`.
- [x] **FR5 — GitHub Actions:** pull requests and pushes to `main` use the exact
      runtime, `npm ci`, package-local Chromium installation with Linux
      dependencies, contract tests, and the shared validation command.
- [x] **FR6 — Audit evidence:** CI retains JSON and original status under
      `audit-full` and `audit-production`; the table below records every
      affected package, available advisory IDs, graph classification, installed
      path, pre-existing status, and disposition.
- [x] **FR7 — Failure policy:** no gate is skipped or weakened. Static, build,
      production, and browser gates pass; known audit findings remain visible
      and explicitly deferred.

## Validation Evidence

All final local commands used Node `22.23.1` and npm `10.9.8`.

| Check | Result |
| --- | --- |
| `npm ci` | Passed; 408 packages installed. `package.json` and `package-lock.json` hashes unchanged. |
| `npm test -- --exclude='**/e2e/**'` | Passed, 12/12. |
| `npm run lint` | Passed using `eslint .`. |
| `npm run typecheck` | Passed using `tsc --noEmit`. |
| `npm run build` | Passed. |
| `npm run start` | Production server became reachable at `127.0.0.1:3000`; Playwright stopped it cleanly. |
| `npm run test:smoke` | Passed against production Chromium/WebGL. |
| `npm run validate` | Passed end to end. |
| Full `npm audit --json` | Valid report, original exit 1, 14 affected packages. |
| Production `npm audit --omit=dev --json` | Valid report, original exit 1, 9 affected packages. |

The Phase 1 lock comparison showed all 428 pre-existing lock entries retained
identical version/resolved/integrity metadata. The Phase 2 delta added only
`@playwright/test` `1.61.1`, Playwright, Playwright Core, and Playwright's
platform-optional `fsevents`.

An uncommitted synthetic browser probe verified that both `console.error` and
`pageerror` event channels are captured. Generated reports and temporary audit
JSON were not committed.

## Audit Baseline

### Snapshot summary

- **Full graph:** 14 affected packages — 2 low, 6 moderate, 5 high,
  1 critical; original exit `1`.
- **Production graph (`--omit=dev`):** 9 affected packages — 4 moderate,
  4 high, 1 critical; original exit `1`.
- Both JSON reports passed `scripts/validate-audit-report.mjs`. The validator
  checks report structure, nonnegative severity counts, count totals, affected
  package records, and consistency with the original npm exit.
- All findings existed before Project 7. Adding Playwright introduced no audit
  finding.

`Repository` at the start of each path means the installed project root.
Paths were obtained from `npm explain` under the pinned clean install.

| Package | Severity / graph | Advisory IDs or URLs | Installed dependency path | Pre-existing / disposition |
| --- | --- | --- | --- | --- |
| `@babel/runtime@7.26.0` | moderate; full + production | [GHSA-968p-4wvh-cqc8](https://github.com/advisories/GHSA-968p-4wvh-cqc8) | Repository → `react-force-graph-3d@1.26.0` → `3d-force-graph@1.76.0` → `three-render-objects@1.37.0` → `polished@4.3.1` → `@babel/runtime@7.26.0` | Yes — dependency remediation deferred to the modernization work tracked by #6. |
| `@eslint/plugin-kit@0.2.5` | low; full/dev only | [GHSA-xffm-g5w8-qvg7](https://github.com/advisories/GHSA-xffm-g5w8-qvg7) | Repository → `eslint@9.18.0` → `@eslint/plugin-kit@0.2.5` | Yes — ESLint-major migration is out of scope; defer to #6/follow-up modernization. |
| `ajv@6.12.6` | moderate; full/dev only | [GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6) | Repository → `eslint@9.18.0` → `@eslint/eslintrc@3.2.0` → `ajv@6.12.6` | Yes — transitive ESLint remediation deferred to #6/follow-up modernization. |
| `brace-expansion@2.0.1` | moderate; full + production | [GHSA-v6h2-p8h4-qcjw](https://github.com/advisories/GHSA-v6h2-p8h4-qcjw), [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v) | Repository → `tailwindcss@3.4.17` → `sucrase@3.35.0` → `glob@10.4.5` → `minimatch@9.0.5` → `brace-expansion@2.0.1` | Yes — Tailwind/dependency migration is out of scope; defer to #6. |
| `eslint@9.18.0` | low; full/dev only | Aggregate is via vulnerable `@eslint/plugin-kit`; see [GHSA-xffm-g5w8-qvg7](https://github.com/advisories/GHSA-xffm-g5w8-qvg7). npm supplied no separate URL on this aggregate record. | Repository → `eslint@9.18.0` | Yes — ESLint-major migration is explicitly out of scope; defer to #6/follow-up modernization. |
| `flatted@3.3.1` | high; full/dev only | [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f), [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) | Repository → `eslint@9.18.0` → `file-entry-cache@8.0.0` → `flat-cache@4.0.1` → `flatted@3.3.1` | Yes — transitive ESLint remediation deferred to #6/follow-up modernization. |
| `glob@10.4.5` | high; full + production | [GHSA-5j98-mcp5-4vw2](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | Repository → `tailwindcss@3.4.17` → `sucrase@3.35.0` → `glob@10.4.5` | Yes — Tailwind/dependency migration is out of scope; defer to #6. |
| `js-yaml@4.1.0` | moderate; full/dev only | [GHSA-mh29-5h37-fv8m](https://github.com/advisories/GHSA-mh29-5h37-fv8m), [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68) | Repository → `eslint@9.18.0` → `@eslint/eslintrc@3.2.0` → `js-yaml@4.1.0` | Yes — transitive ESLint remediation deferred to #6/follow-up modernization. |
| `lodash-es@4.17.21` | high; full + production | [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc), [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh), [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) | Repository → `react-force-graph-3d@1.26.0` → `3d-force-graph@1.76.0` → `kapsule@1.16.0` → `lodash-es@4.17.21` | Yes — rendering dependency migration is out of scope; defer to #6. |
| `minimatch@9.0.5` | high; full + production | [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | Repository → `tailwindcss@3.4.17` → `sucrase@3.35.0` → `glob@10.4.5` → `minimatch@9.0.5` | Yes — Tailwind/dependency migration is out of scope; defer to #6. |
| `next@15.1.11` | critical; full + production | [GHSA-3h52-269p-cp9r](https://github.com/advisories/GHSA-3h52-269p-cp9r), [GHSA-g5qg-72qw-gw5v](https://github.com/advisories/GHSA-g5qg-72qw-gw5v), [GHSA-xv57-4mr9-wg8v](https://github.com/advisories/GHSA-xv57-4mr9-wg8v), [GHSA-4342-x723-ch2f](https://github.com/advisories/GHSA-4342-x723-ch2f), [GHSA-9g9p-9gw9-jx7f](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f), [GHSA-h25m-26qc-wcjf](https://github.com/advisories/GHSA-h25m-26qc-wcjf), [GHSA-f82v-jwr5-mffw](https://github.com/advisories/GHSA-f82v-jwr5-mffw), [GHSA-ggv3-7p47-pfv8](https://github.com/advisories/GHSA-ggv3-7p47-pfv8), [GHSA-3x4c-7xq6-9pq8](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8), [GHSA-q4gf-8mx6-v5v3](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3), [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj), [GHSA-3g8h-86w9-wvmq](https://github.com/advisories/GHSA-3g8h-86w9-wvmq), [GHSA-ffhc-5mcf-pf4q](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q), [GHSA-vfv6-92ff-j949](https://github.com/advisories/GHSA-vfv6-92ff-j949), [GHSA-gx5p-jg67-6x7h](https://github.com/advisories/GHSA-gx5p-jg67-6x7h), [GHSA-mg66-mrh9-m8jx](https://github.com/advisories/GHSA-mg66-mrh9-m8jx), [GHSA-h64f-5h5j-jqjh](https://github.com/advisories/GHSA-h64f-5h5j-jqjh), [GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r), [GHSA-wfc6-r584-vfw7](https://github.com/advisories/GHSA-wfc6-r584-vfw7), [GHSA-36qx-fr4f-26g5](https://github.com/advisories/GHSA-36qx-fr4f-26g5) | Repository → `next@15.1.11` | Yes — Next migration is an explicit non-goal of #7; defer remediation to #6's staged dependency modernization. |
| `picomatch@2.3.1` | high; full + production | [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p), [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | Repository → `tailwindcss@3.4.17` → `chokidar@3.6.0` → `anymatch@3.1.3` → `picomatch@2.3.1` | Yes — Tailwind/dependency migration is out of scope; defer to #6. |
| `postcss@8.5.1` (also nested `8.4.31`) | moderate; full + production | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | Repository → `postcss@8.5.1` | Yes — dependency remediation is excluded from this measurement baseline; defer to #6. |
| `yaml@2.4.5` | moderate; full + production | [GHSA-48c2-rrv3-qjmp](https://github.com/advisories/GHSA-48c2-rrv3-qjmp) | Repository → `tailwindcss@3.4.17` → `postcss-load-config@4.0.2` → `yaml@2.4.5` | Yes — Tailwind/dependency migration is out of scope; defer to #6. |

No supported remediation was applied because #7 explicitly prohibits the
dependency-major modernization and rendering/lifecycle work that this baseline
exists to measure. The critical Next finding is therefore visible rather than
silently fixed or suppressed.

## Existing Failures and Disposition

- Lint, typecheck, build, production start, contract tests, and browser smoke
  have no remaining failure under the declared toolchain.
- Both audits exit 1 because of the pre-existing findings above. This is
  reproducible diagnostic evidence, not a green-gate failure.
- Early smoke development exposed deterministic local Vercel instrumentation
  404s and software-rendering actionability delays. The final test isolates only
  the two unavailable external script routes and retains strict application
  errors. It proves pointer reception before the sole forced initial pause
  click; all later interactions use ordinary clicks.

## Deviations from Plan

- **Phase 1 — contract tests:** added `tests/toolchain.test.mjs` and the minimal
  `test` script because every porch implementation phase requires tests.
- **Phase 2 — interaction order:** pause rotation before axes/reset work so the
  software-rendered path remains deterministic. The initial forced click has a
  center-point hit-test; later clicks retain normal actionability.
- **Phase 2 — external instrumentation:** fulfill only
  `/_vercel/speed-insights/script.js` and `/_vercel/insights/script.js` locally.
  This avoids treating unavailable external instrumentation as application
  console errors without ignoring any application error.
- **Phase 3 — audit validation:** moved report validation into
  `scripts/validate-audit-report.mjs` with focused tests instead of opaque
  inline shell. CI also runs the additive `npm test` contract gate before the
  unchanged `npm run validate`.

## Overmocking Assessment

The critical browser path uses the real built Next.js application, production
server, Chromium browser, Three.js renderer, WebGL context, timers, canvas, and
controls. No internal module is mocked. The only network substitution is the
two exact Vercel external instrumentation scripts described above.

## Lessons Learned

### What Went Well

- Exact toolchain activation before touching the lockfile prevented accidental
  metadata drift.
- Contract tests made package metadata, lockfile, workflow, audit, and README
  requirements executable rather than review-only.
- Real production WebGL validation caught interaction constraints that static
  checks and build success could not reveal.
- Preserving audit JSON and original exit status cleanly separated findings
  from registry/tool failure.

### Challenges Encountered

- **Canonical review scope:** a correct but untracked `.nvmrc` was invisible to
  the first Phase 1 consultation. Explicit inclusion fixed the gap.
- **Software WebGL actionability:** continuous animation made normal initial
  clicks impractically slow. Pausing first, proving center-point pointer
  reception, and using normal later clicks preserved user-path evidence.
- **External Vercel scripts:** local production does not host their endpoints.
  Exact route isolation prevented external-service noise from weakening strict
  application error checks.
- **Claude quota:** mandatory reviews paused until reset; completed consultation
  outputs were preserved and only the missing review was retried.

### What Would Be Done Differently

- Mark all new files intent-to-add before the first consultation so the
  canonical diff is complete without staging content for an unintended porch
  commit.
- Establish the pause-first WebGL interaction order before the first smoke run,
  while still testing ordinary actionability wherever possible.
- Build the audit report validator before the workflow so success/error
  semantics are executable from the start.

### Methodology Improvements

- Consultation tooling should warn when untracked files named by the current
  plan are absent from its canonical review diff.
- Phase evidence should distinguish environment/tool failures from expected
  diagnostic nonzero exits as an explicit template item.
- Quota retry instructions should preserve completed model outputs and name
  only missing consultations, as porch did here.

## Systematic Issues

- New-file visibility is a protocol-wide risk whenever consultation derives its
  scope from Git rather than the filesystem.
- Diagnostic tools that overload exit 1 for valid findings need schema/status
  validation; `continue-on-error` alone cannot distinguish useful evidence from
  execution failure.
- Browser tests for continuous rendering need both visual/rendering evidence
  and pointer actionability evidence; canvas presence alone is insufficient.

## Technical Debt

- The 14 audit findings are intentionally deferred and must be compared against
  the staged modernization in #6.
- The exact Node/npm baseline will age; changes require a reviewed baseline
  update rather than an unbounded engine range.
- Reset Camera has no observable completion signal, so the smoke uses the
  existing 1.2-second bound before rechecking canvas readiness. Monitor CI for
  timing variance before adding application test hooks.

## Consultation Feedback

### Specify Phase — Round 1

#### Gemini

- **Concern:** Direct `eslint .` would scan generated `.next` and Playwright
  output.
  - **Addressed:** The spec and implementation use narrowly scoped global
    generated-output ignores and keep application/test source in scope.

#### Codex

- **Concern:** The integration branch, runtime file, durable audit artifact,
  and graph-ready condition were ambiguous.
  - **Addressed:** The spec names `main`, `.nvmrc`, stable CI audit artifacts
    plus this `Audit Baseline`, and controls/canvas/WebGL readiness conditions.

#### Claude

- **Concern:** Corepack/engine enforcement and fail-fast versus run-all
  validation were unclear; script names and in-page WebGL inspection could be
  more explicit.
  - **Addressed:** The spec makes metadata advisory unless explicitly verified,
    verifies exact versions in CI/docs, defines sequential fail-fast validation
    plus separate evidence runs, names scripts, and permits page evaluation.

### Plan Phase — Round 1

#### Gemini

- No concerns raised — approved.

#### Codex

- **Concern:** `npm ci` installs the Playwright package but not Chromium, so the
  original clean-smoke prerequisite was inconsistent.
  - **Addressed:** Added package-bound `browser:install`, documented clean smoke
    as `npm ci` plus browser installation, and separated CI's `--with-deps`
    variant.

#### Claude

- No concerns raised — approved.

### Implement Phase 1: Toolchain Commands — Round 1

#### Gemini

- No concerns raised — approved.

#### Codex

- **Concern:** `.nvmrc` existed on disk but was untracked and absent from the
  canonical review diff.
  - **Addressed:** Explicitly included `.nvmrc` and the new contract test in the
    review scope without a blanket Git add.

#### Claude

- No concerns raised — approved.

### Implement Phase 1: Toolchain Commands — Round 2

- Gemini, Codex, and Claude raised no concerns and unanimously approved the
  corrected canonical diff.

### Implement Phase 2: Browser Smoke — Round 1

#### Gemini

- No concerns raised — approved the production WebGL/control smoke and exact
  external instrumentation isolation.

#### Codex

- No concerns raised — approved the dependency, configuration, smoke coverage,
  and generated-output handling.

#### Claude

- **Concern:** Non-blocking observations noted the fixed reset wait and asked
  that the Next `--hostname` option be demonstrated.
  - **Addressed:** Repeated production smoke runs demonstrated the option and
    clean teardown. The wait remains bounded because Reset Camera exposes no
    observable completion state, followed by a real canvas-readiness assertion.

#### Architect adjustment

- **Concern:** Forced clicks could bypass receives-events/actionability.
  - **Addressed:** The final tree retains only the initial pause click as
    forced, preceded by a center-point `elementFromPoint` proof; all subsequent
    interactions use ordinary Playwright clicks. Claude reviewed this final
    tree and approved.

### Implement Phase 3: CI and Documentation — Round 1

- Gemini, Codex, and Claude raised no concerns and unanimously approved the
  workflow, audit validation, artifacts, tests, and README.

### Review Phase — Round 1

- Gemini, Codex, and Claude raised no concerns and unanimously approved PR #19
  with high confidence.

### Architect Integration Review

- **Concern:** The always-on hot architecture fact copied volatile Node/npm
  patch numbers instead of referring to the authoritative declarations.
  - **Addressed:** `arch-critical.md` now points to the exact versions declared
    in `package.json` and `.nvmrc`. Exact values remain in configuration,
    README, and cold architecture reference, where baseline details belong.

## Flaky Tests

No flaky tests were encountered or skipped.

## Architecture Updates

- Added the current validation system shape to the cold
  `codev/resources/arch.md`.
- Added two behavior-changing invariants to hot
  `codev/resources/arch-critical.md`: the authoritative install-contract
  references and separation of the green validation gate from audit evidence.
  Volatile patch values remain in configuration, README, and cold architecture
  reference rather than the always-on hot tier.
- Updated the hot file's map to the new cold `Validation Baseline` section.

## Lessons Learned Updates

- Added software-WebGL actionability and diagnostic-evidence validation recipes
  to the cold `codev/resources/lessons-learned.md`.
- Added canonical-review-diff visibility as a cross-cutting hot lesson in
  `codev/resources/lessons-critical.md`.
- Updated the hot map to the cold `Validation Evidence` section. All hot files
  remain below their caps.

## Follow-up Items

- Execute the workflow on the pull request and confirm uploaded artifact names
  and contents.
- Address the recorded dependency findings only through the staged
  modernization tracked by #6 or dedicated follow-up issues.
- Update the pinned Node/npm snapshot only through a reviewed baseline change.
