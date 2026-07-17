# Plan: Reproducible Node 22 Modernization Baseline

## Metadata

- **ID**: plan-2026-07-17-node-22-baseline
- **Status**: draft
- **Specification**:
  [`codev/specs/7-establish-a-reproducible-node-.md`](../specs/7-establish-a-reproducible-node-.md)
- **Created**: 2026-07-17
- **Delivery**: Three atomic implementation commits in one pull request

## Executive Summary

Implement the specification's selected package-scripts, Playwright, and GitHub
Actions approach in three dependency-ordered phases:

1. establish the exact Node/npm contract and direct non-browser commands;
2. add a real production-server Chromium smoke and unified validation command;
3. automate the same path in GitHub Actions, retain audit/browser artifacts, and
   document local usage.

The phases intentionally avoid application source changes and all existing
dependency migrations. The only new dependency is the exact current stable
`@playwright/test` development version selected and recorded during Phase 2.
All observed baseline outcomes, audit paths, and dispositions are captured for
the final review document rather than weakening a gate.

## Success Metrics

- [ ] Node `22.23.1`, npm `10.9.8`, `.nvmrc`, manifest metadata, and lockfile v3
      agree.
- [ ] A clean `npm ci` under the exact toolchain leaves `package.json` and
      `package-lock.json` unchanged.
- [ ] `npm run lint` invokes `eslint .` over source/config/test files while
      excluding only generated output.
- [ ] `npm run typecheck` invokes `tsc --noEmit`.
- [ ] `npm run build` and `npm run start` produce and serve the production app.
- [ ] After `npm run browser:install`, `npm run test:smoke` builds, starts the
      production server, observes the initialized WebGL canvas, exercises
      axes/reset/rotation, and fails on unexpected console/page errors.
- [ ] `npm run validate` runs the complete fail-fast green gate.
- [ ] Full and production audit JSON plus original exit codes are captured; all
      advisories have root-to-package paths ready for the review document.
- [ ] GitHub Actions runs validation on pull requests and pushes to `main` and
      uploads stable audit and Playwright artifacts.
- [ ] No `app/**` file or existing application dependency version changes.
- [ ] README setup/command documentation matches the executable scripts.

## Phases (Machine Readable)

<!-- REQUIRED: porch uses this JSON to track phase progress. -->

```json
{
  "phases": [
    {"id": "toolchain_commands", "title": "Pin Toolchain and Direct Commands"},
    {"id": "browser_smoke", "title": "Add Production WebGL Browser Smoke"},
    {"id": "ci_documentation", "title": "Automate and Document the Baseline"}
  ]
}
```

## Phase Status

| Phase | Status | Commit |
| --- | --- | --- |
| Pin Toolchain and Direct Commands | completed | `[Spec 7][Phase: toolchain-commands] chore: Pin Node and npm baseline` |
| Add Production WebGL Browser Smoke | pending | — |
| Automate and Document the Baseline | pending | — |

## Phase Breakdown

### Phase 1: Pin Toolchain and Direct Commands

**Status**: completed
**Dependencies**: Approved specification  
**Planned commit**:
`[Spec 7][Phase: toolchain-commands] chore: Pin Node and npm baseline`

#### Objectives

- Make the Node/npm/lockfile contract explicit and locally discoverable.
- Replace the deprecated framework lint wrapper with the direct ESLint CLI.
- Add direct typecheck and evidence-only audit entry points without changing the
  application dependency graph.

#### Deliverables

- [x] `.nvmrc` containing `22.23.1`.
- [x] `package.json` with `engines.node: "22.23.1"` and
      `packageManager: "npm@10.9.8"`.
- [x] Direct `lint`, `typecheck`, `audit:full`, and `audit:production` scripts.
- [x] ESLint flat-config global ignores limited to `.next/**`,
      `playwright-report/**`, and `test-results/**`.
- [x] Lockfile v3 root metadata refreshed by npm `10.9.8`.
- [x] Baseline command output recorded for phase evaluation.

#### Files

- Create `.nvmrc`.
- Modify `package.json`.
- Modify `package-lock.json`.
- Modify `eslint.config.mjs`.
- Update this plan and `codev/state/spir-7_thread.md` only for protocol tracking.

#### Implementation Details

1. Activate/install Node `22.23.1` and confirm its bundled npm reports `10.9.8`.
   Do not regenerate dependency metadata under the builder's original
   Node `22.22.2` / npm `10.9.7`.
2. Add exact manifest fields:

   ```json
   {
     "engines": {"node": "22.23.1"},
     "packageManager": "npm@10.9.8"
   }
   ```

3. Preserve existing `dev`, `build`, and `start`; set:

   ```json
   {
     "lint": "eslint .",
     "typecheck": "tsc --noEmit",
     "audit:full": "npm audit",
     "audit:production": "npm audit --omit=dev"
   }
   ```

4. Add one leading flat-config ignore object so generated output cannot be
   matched by later config entries. Do not exclude `app/**`, `tests/**`, root
   configuration, or the future Playwright configuration.
5. Refresh only lockfile root metadata using exact npm `10.9.8`. Compare all
   pre-existing `packages` entries before/after; resolved application package
   versions must remain unchanged.

#### Acceptance Criteria

- [x] `node --version` prints `v22.23.1`.
- [x] `npm --version` prints `10.9.8`.
- [x] `package-lock.json` reports lockfile version 3.
- [x] `npm ci` completes under the pinned toolchain.
- [x] A second clean `npm ci` causes no tracked manifest/lockfile diff.
- [x] `npm run lint` invokes direct ESLint and reports its true outcome.
- [x] `npm run typecheck` invokes `tsc --noEmit` and reports its true outcome.
- [x] Both audit scripts run without mutating the dependency graph; advisory
      exits are recorded rather than treated as Phase 1 validation failures.
- [x] A package-tree comparison shows no existing dependency version drift.

#### Test Plan

- **Configuration checks**:
  - parse `package.json` and `package-lock.json`;
  - assert exact runtime/package-manager strings and lockfile version;
  - compare resolved package/version maps before and after refresh.
- **Integration checks**:
  - remove installed dependencies through the normal clean-install test setup;
  - run `npm ci`, lint, typecheck, build, and both audits;
  - rerun `npm ci` and verify tracked dependency files remain unchanged.
- **Manual review**:
  - inspect ESLint ignores and confirm they cover generated directories only;
  - classify every failure as in-scope configuration work or a documented
    pre-existing result.

#### Rollback Strategy

Revert the complete Phase 1 commit so `.nvmrc`, manifest, lockfile, scripts, and
lint configuration return together. Never restore `package.json` without its
matching lockfile.

#### Risks

- **Risk**: npm refreshes unrelated resolved packages.
  - **Mitigation**: snapshot package/version maps, use exact npm, and reject any
    unexplained drift before commit.
- **Risk**: direct ESLint exposes existing failures or scans generated output.
  - **Mitigation**: ignore only generated directories, retain source findings,
    and disposition genuine pre-existing failures without rule changes.

#### Evaluation Gate

- Present command results, dependency-map comparison, failures/dispositions,
  and 3-way phase consultation.
- Mark the phase completed in this plan and create the single planned commit
  only after porch verification permits it.

#### Evaluation Results

- Exact runtime: Node `22.23.1`, npm `10.9.8`.
- Clean install, direct ESLint, typecheck, production build, and 4/4 Node
  contract tests passed.
- All 428 pre-existing lockfile package entries retained identical
  version/resolved/integrity metadata.
- Full audit: 14 findings (2 low, 6 moderate, 5 high, 1 critical).
- Production audit: 9 findings (4 moderate, 4 high, 1 critical).
- Audit exits remained nonzero evidence, not green-gate failures.
- Consultation iteration 1: Gemini/Claude approved; Codex requested that the
  untracked `.nvmrc` be included in the canonical diff.
- Consultation iteration 2 after explicit file inclusion: Gemini, Codex, and
  Claude unanimously approved.
- **Plan deviation**: Added `tests/toolchain.test.mjs` and a minimal Node `test`
  script because porch requires automated tests for every implementation phase.
  During re-iteration, porch committed the explicitly staged new `.nvmrc` and
  test file in its state-transition commit; the named phase commit contains the
  remaining manifest, lockfile, ESLint, plan, and thread changes.

---

### Phase 2: Add Production WebGL Browser Smoke

**Status**: pending  
**Dependencies**: Phase 1 committed  
**Planned commit**:
`[Spec 7][Phase: browser-smoke] test: Add production WebGL smoke validation`

#### Objectives

- Add a minimal, real Chromium user-path test against `next start`.
- Make the direct smoke command self-contained and compose it into the unified
  fail-fast validation gate.

#### Deliverables

- [ ] Exact stable `@playwright/test` development dependency and corresponding
      lockfile entries.
- [ ] `playwright.config.ts` with deterministic production server lifecycle,
      Chromium project, base URL, timeout, and failure diagnostics.
- [ ] `tests/e2e/smoke.spec.ts` covering page, WebGL, axes, reset, rotation, and
      error collection.
- [ ] `browser:install`, `test:smoke`, and `validate` scripts.
- [ ] Generated Playwright output ignored by Git and ESLint.
- [ ] Passing production browser smoke under the pinned toolchain.

#### Files

- Modify `package.json`.
- Modify `package-lock.json`.
- Create `playwright.config.ts`.
- Create `tests/e2e/smoke.spec.ts`.
- Modify `.gitignore`.
- Update this plan and `codev/state/spir-7_thread.md` only for protocol tracking.

#### Implementation Details

1. Verify the current stable Playwright 1.x release from the official package
   source at implementation time, then install it as an exact dev dependency
   with Node `22.23.1` / npm `10.9.8`. Record the selected version in evaluation
   evidence.
2. Configure Playwright:
   - `testDir: "./tests/e2e"`;
   - `baseURL: "http://127.0.0.1:3000"`;
   - one Chromium project;
   - Playwright-managed `webServer` running `npm run start` on the explicit host
     and port, with bounded readiness timeout and no CI server reuse;
   - trace, screenshot, and video retained on failure;
   - a stable HTML report plus `test-results/`.
3. If the bundled Chromium needs explicit software-rendering launch arguments
   on Linux CI, use only the documented Chromium/Playwright flags necessary to
   provide WebGL. Do not suppress browser console errors.
4. Define `browser:install` as the local, package-version-bound
   `playwright install chromium` entry point. Browser binaries are intentionally
   a separate prerequisite because `npm ci` installs the test runner but not its
   Chromium binary. CI uses `playwright install --with-deps chromium` to add
   Linux system dependencies as well.
5. Define `test:smoke` to build then invoke Playwright, so it works without a
   pre-existing `.next` build after `npm ci` plus `npm run browser:install`.
   Define `validate` as a sequential `&&` chain:

   ```text
   lint → typecheck → test:smoke (build → production server → browser test)
   ```

   This satisfies the required build gate without performing two builds.
6. In the smoke:
   - register `pageerror` and `console` listeners before navigation;
   - require a successful root response;
   - locate the three buttons by accessible role/name;
   - wait for those buttons plus a visible canvas with nonzero CSS/backing-store
     dimensions;
   - inspect the already initialized WebGL context in the page and require
     nonzero drawing-buffer dimensions;
   - click `Show Axes`, observe `Hide Axes`, then restore `Show Axes`;
   - click `Reset Camera` and confirm the canvas remains ready;
   - click `Pause Auto Rotation`, observe `Resume Auto Rotation`, then restore
     `Pause Auto Rotation`;
   - fail at the end with collected messages if any uncaught page error or
     `console.error` occurred.
7. Do not mock the graph, Three.js, WebGL, timers, or application modules. Do not
   change `app/**` to facilitate testing.

#### Acceptance Criteria

- [ ] `npm run test:smoke` works after clean dependency install plus the
      documented `npm run browser:install`, without a pre-existing `.next`
      build.
- [ ] The production server is started and stopped by Playwright without an
      orphan process.
- [ ] The smoke proves visible/nonzero canvas and WebGL drawing-buffer state.
- [ ] Axes and rotation labels transition in both directions.
- [ ] Reset executes and the rendered canvas remains ready.
- [ ] Synthetic console/page-error checks demonstrate that either channel fails
      the test, without committing synthetic failures.
- [ ] `npm run validate` runs lint, typecheck, build, start, and smoke in the
      specified fail-fast order.
- [ ] No application source changes are present.

#### Test Plan

- **Browser integration**: run the complete Playwright smoke in headless
  Chromium against the production server after exercising the documented
  browser-install command.
- **Failure-path validation**:
  - locally confirm missing browser/build/server failures are diagnostic;
  - use a temporary, uncommitted error injection or focused listener test to
    verify page/console error collection, then restore the tree.
- **Process validation**: verify port 3000 is free after normal pass and failed
  smoke runs.
- **Regression checks**: rerun lint, typecheck, build, and clean install.
- **Overmocking check**: confirm the critical path uses the real built app,
  browser, WebGL renderer, and controls with zero mocks.

#### Rollback Strategy

Revert the complete Phase 2 commit, including the Playwright manifest and
lockfile entries, test/configuration, scripts, and generated-output ignores.
Phase 3 must also be reverted first if it already depends on these commands.

#### Risks

- **Risk**: Chromium software WebGL is unavailable or emits an error.
  - **Mitigation**: use supported Playwright installation and documented
    software-rendering flags, assert the real context, and retain artifacts.
- **Risk**: fixed sleeps make the graph test flaky.
  - **Mitigation**: use locator assertions and polling against observable canvas,
    WebGL, and label state with bounded timeouts.
- **Risk**: obtaining a second context disturbs the renderer.
  - **Mitigation**: request the already selected WebGL context type and only read
    dimensions/status; never replace, lose, or mutate it.

#### Evaluation Gate

- Present the real browser path, validation output, artifact samples,
  process-cleanup proof, overmocking assessment, and 3-way phase consultation.
- Mark the phase completed and create the single planned commit only after porch
  verification permits it.

---

### Phase 3: Automate and Document the Baseline

**Status**: pending  
**Dependencies**: Phase 2 committed  
**Planned commit**:
`[Spec 7][Phase: ci-documentation] ci: Automate and document validation baseline`

#### Objectives

- Run the exact local green gate automatically on GitHub.
- Capture valid full/production audit reports and browser diagnostics without
  turning advisory totals into a zero-findings gate.
- Document the reproducible setup and direct command surface.

#### Deliverables

- [ ] `.github/workflows/validation.yml` for pull requests and pushes to `main`.
- [ ] Read-only workflow permissions and npm cache.
- [ ] Exact Node setup, `npm ci`, Chromium/system dependency install, and
      `npm run validate`.
- [ ] Always-run audit capture that distinguishes valid advisory reports from
      registry/tool failures.
- [ ] Stable `audit-full`, `audit-production`, `playwright-report`, and
      `playwright-test-results` artifacts as applicable.
- [ ] README toolchain, clean-install, direct-command, unified-validation, audit,
      and CI documentation.
- [ ] Final clean baseline evidence collected for the review phase.

#### Files

- Create `.github/workflows/validation.yml`.
- Modify `README.md`.
- Modify `.gitignore` only if local audit evidence needs an ignored
  `audit-results/` directory.
- Update this plan and `codev/state/spir-7_thread.md` only for protocol tracking.

#### Implementation Details

1. Configure workflow triggers for `pull_request` and pushes to `main`, with
   minimal `contents: read` permissions.
2. Use the exact Node `22.23.1`, npm caching keyed by `package-lock.json`, and
   verify both runtime versions in workflow output.
3. Run:
   - `npm ci`;
   - the local Playwright CLI's Chromium installation with required Linux
     dependencies (`npx playwright install --with-deps chromium`);
   - `npm run validate`.
4. Ensure later evidence/artifact steps use `if: always()` so they run even when
   a green gate fails; never apply `continue-on-error` to validation.
5. For each audit view:
   - write JSON to `audit-results/`;
   - record the original npm exit code beside it;
   - parse the JSON and require a real audit report with vulnerability metadata;
   - return success for a valid report even if advisories caused npm's original
     nonzero exit;
   - fail for invalid JSON, missing audit metadata, registry errors, or tool
     execution failures.
6. Upload full and production audit directories separately under the exact
   stable artifact names. Upload Playwright HTML/test-result output with
   `if: always()` and stable names; tolerate an absent failure-only directory
   only when the test did not produce it.
7. Document in README:
   - `nvm install` / `nvm use` and exact version verification;
   - `npm ci`, local `npm run browser:install`, and the CI-specific
     `--with-deps` variant;
   - every direct command from FR2;
   - `npm run validate` semantics;
   - audit evidence-only semantics and dependency-path follow-up with
     `npm explain <package>` or equivalent installed-tree evidence;
   - GitHub Actions parity and artifact names.
8. Run the complete command matrix again from a clean install. Preserve raw
   audit outputs outside committed source (CI artifacts or ignored local
   evidence) and prepare a path/disposition table for the Review phase's
   `Audit Baseline` section.

#### Acceptance Criteria

- [ ] Workflow syntax is valid and triggers only as specified.
- [ ] Workflow green-gate steps use the same scripts as README/local usage.
- [ ] Workflow validation cannot be made green by audit evidence handling.
- [ ] A valid audit with advisories is preserved without failing the green gate.
- [ ] An invalid/non-report audit result fails the evidence collection step.
- [ ] Full and production audit artifacts include JSON and original exit code.
- [ ] Playwright reports/test results upload on relevant runs.
- [ ] README direct commands exactly match `package.json`.
- [ ] Clean local validation and production start succeed, or any genuine
      pre-existing failure is fully reproduced and dispositioned.
- [ ] Every audit finding has installed dependency-path evidence ready for the
      final review document.

#### Test Plan

- **Workflow static review**: inspect YAML, triggers, permissions, `if: always()`
  behavior, artifact paths/names, and absence of validation bypasses.
- **Local CI-command rehearsal**: execute exact setup-dependent commands that do
  not require the GitHub runner context.
- **Audit-path tests**:
  - confirm advisory JSON passes report validation while retaining its nonzero
    original status;
  - confirm malformed/missing-metadata JSON fails using a temporary,
    uncommitted fixture or shell input;
  - obtain `npm explain`/tree paths for each full and production finding.
- **End-to-end validation**: clean install, lint, typecheck, build, explicit
  production start/readiness, smoke, validate, full audit, production audit.
- **Repository integrity**: confirm no generated artifacts, raw audit snapshots,
  application source changes, or unexplained dependency drift are committed.

#### Rollback Strategy

Revert the Phase 3 commit to remove CI automation and documentation together.
If the feature is rolled back entirely, then revert Phase 2 and Phase 1 in
reverse dependency order, keeping each manifest paired with its lockfile.

#### Risks

- **Risk**: `continue-on-error` or shell status handling hides a real CI failure.
  - **Mitigation**: never relax validation; explicitly parse audit reports and
    only normalize the advisory exit after proving valid metadata exists.
- **Risk**: evidence steps do not run after a validation failure.
  - **Mitigation**: apply `if: always()` to evidence generation and upload steps,
    while leaving the job's validation failure intact.
- **Risk**: docs and package scripts diverge.
  - **Mitigation**: compare every documented command to the final manifest during
    evaluation.

#### Evaluation Gate

- Present workflow review, local command rehearsal, full command matrix, audit
  reports/paths/dispositions, documentation diff, and final 3-way phase
  consultation.
- Mark the phase completed and create the planned commit only after porch
  verification permits it.

## Dependency Map

```text
Approved spec
    │
    ▼
Phase 1: Toolchain + direct commands
    │
    ▼
Phase 2: Production Playwright smoke + validate
    │
    ▼
Phase 3: GitHub Actions + audit artifacts + documentation
    │
    ▼
Review document + single PR
```

Each phase is committed before the next begins. All three phase commits ship in
one pull request unless the architect explicitly requests otherwise.

## Resource Requirements

### Development Resources

- Node version manager or official Node `22.23.1` distribution.
- npm `10.9.8`.
- Chromium version installed by the selected exact Playwright package.
- Linux libraries installed by Playwright for CI parity.
- Ability to bind `127.0.0.1:3000`.

### Infrastructure

- GitHub Actions hosted Linux runner.
- npm registry access for clean install and audits.
- GitHub Actions artifact storage.
- No database, service, deployment, or application monitoring changes.

## Integration Points

### External Systems

- **Node.js distribution**
  - **Use**: exact runtime/npm baseline.
  - **Fallback**: verify official archive checksums and install the archived
    release if a version manager does not list it.
- **npm registry audit endpoint**
  - **Use**: full and production audit reports.
  - **Fallback**: fail evidence collection on registry/tool errors; do not
    misreport them as zero findings.
- **GitHub Actions**
  - **Use**: automated validation and artifact retention.
  - **Fallback**: local command rehearsal supports development, but the phase is
    not complete until workflow configuration is committed.

### Internal Systems

- Existing ESLint 9 flat configuration.
- Existing TypeScript project configuration.
- Existing Next.js build/start scripts.
- Existing `FocusGraph` DOM controls and Three.js-created canvas; tested without
  modifying their implementation.

## Risk Analysis

| Risk | Probability | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Exact runtime unavailable through local manager | Low | Medium | Use official archived Node distribution and verify versions | Builder |
| Lockfile dependency drift | Medium | High | Compare package/version maps and keep manifest/lockfile atomic | Builder |
| Pre-existing static/build failure | Medium | Medium | Reproduce and disposition; fix only in-scope configuration | Builder/Architect |
| Headless WebGL failure | Medium | High | Supported Chromium dependencies/flags plus real context assertion | Builder |
| Browser timing flake | Medium | Medium | Observable polling, bounded timeouts, Playwright-managed server | Builder |
| Audit endpoint/tool failure mistaken for advisories | Medium | High | Parse report metadata and retain original exit code | Builder |
| CI artifact upload masks validation | Low | High | `if: always()` for evidence only; validation remains strict | Builder |

## Validation Checkpoints

1. **After Phase 1**: exact toolchain, clean install, direct static commands,
   lockfile integrity, audit command execution.
2. **After Phase 2**: production start, real WebGL/control smoke, error channels,
   process cleanup, unified validation.
3. **After Phase 3**: CI semantics, artifact behavior, README parity, full clean
   command matrix, audit paths and dispositions.
4. **Before PR**: specification traceability, all phase commits present, no
   application source or out-of-scope dependency changes, review document
   complete, 3-way PR consultation approved.

## Monitoring and Observability

### Evidence

- Command exit statuses and relevant output in phase evaluations/final review.
- Playwright traces, screenshots, video, and HTML report on failure.
- Full and production audit JSON plus original exit codes in CI artifacts.
- Durable advisory/path/disposition table in the final review.
- GitHub Actions job result as the automated baseline signal.

### Alerting

- No new runtime alerting is introduced.
- GitHub branch/PR checks surface lint, typecheck, build, server, or browser
  regressions.
- Audit totals remain review evidence and do not become a zero-findings alert.

## Documentation Updates Required

- [ ] README toolchain and setup.
- [ ] README direct commands and unified validation.
- [ ] README audit semantics and CI artifacts.
- [ ] Plan phase status/evaluation notes after each phase.
- [ ] Final review with baseline outcomes, audit paths, dispositions, deviations,
      and lessons learned.
- [ ] Architecture/lessons hot/cold documents only if Review determines a
      durable cross-cutting fact or lesson exists.

No API documentation, architecture diagram, deployment guide, or application
user guide change is required.

## Post-Implementation Tasks

- [ ] Run final clean install and complete validation matrix.
- [ ] Record exact Playwright version and any Chromium launch requirement.
- [ ] Record full and production audit totals, advisories, exit codes, and
      dependency paths.
- [ ] Write `codev/reviews/7-establish-a-reproducible-node-.md`.
- [ ] Run 3-way PR review and address all concerns.
- [ ] Open one PR containing all phase commits.
- [ ] After architect approval, merge and execute the protocol verify phase.

## Expert Review

### Iteration 1 — 2026-07-17

- **Gemini — APPROVE (high confidence):** found the phase ordering, build
  composition, scope controls, and audit evidence handling executable as
  written.
- **Codex — REQUEST_CHANGES (high confidence):** identified that `npm ci`
  installs `@playwright/test` but not its Chromium binary, making the original
  "directly after npm ci" acceptance language incorrect. Phase 2 now adds a
  package-version-bound `browser:install` command, treats it as an explicit local
  prerequisite, and distinguishes CI's `--with-deps` installation.
- **Claude — APPROVE (high confidence):** verified the plan against the current
  scripts, ESLint flat configuration, controls, and console levels, and found
  all specification requirements covered.

All material feedback has been incorporated.

## Approval

- [x] Specification approved by architect (2026-07-17)
- [ ] Expert AI plan consultation complete
- [ ] Technical lead plan approval

## Change Log

| Date | Change | Reason | Author |
| --- | --- | --- | --- |
| 2026-07-17 | Initial implementation plan | Convert approved specification into three atomic phases | Builder |
| 2026-07-17 | Clarify browser installation prerequisite | Address 3-way plan review | Builder |

## Notes

- Audit advisories are evidence, but audit command/tool/registry failures are
  real automation failures.
- Generated-output ignores are not permission to exclude source or tests.
- No implementation phase may begin before the previous phase is committed and
  porch has advanced the state.
- The builder will not autonomously open per-phase pull requests.
