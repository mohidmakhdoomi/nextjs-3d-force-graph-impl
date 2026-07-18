# Specification 7: Reproducible Node 22 Modernization Baseline

## Summary

Establish a pinned, automated, and observable baseline for the repository before
any framework or rendering dependency modernization. A fresh checkout must use
Node.js `22.23.1` (Maintenance LTS, verified 2026-07-17) and npm `10.9.8`,
install the existing dependency graph from lockfile v3, run direct lint,
typecheck, build, production-start, and browser-smoke workflows, and retain
complete audit evidence without treating pre-existing advisories as newly
introduced failures.

This work is a measurement and reproducibility layer. It must expose failures
accurately rather than changing product behavior or weakening checks to produce
a green result.

## Problem Analysis

### Current state

- `package.json` does not declare a Node engine or package-manager version.
- The lockfile is version 3, but the npm version responsible for generating it
  is not declared.
- The only lint script uses the framework wrapper (`next lint`); there is no
  direct ESLint CLI script.
- There is no direct `tsc --noEmit` script and no single validation command.
- Build and start scripts exist, but the production server and rendered user
  path are not exercised automatically.
- There is no browser test for the WebGL canvas or the graph controls.
- There is no CI workflow.
- Full-tree and production-only audit results are not preserved with dependency
  paths.

Consequently, later upgrades cannot reliably distinguish a regression from a
pre-existing install, type, lint, build, runtime, browser, or security finding.

### Desired state

A contributor or CI runner starts from the same exact Node/npm toolchain,
installs strictly from the committed lockfile, and can invoke every baseline
check directly. One documented validation command exercises static checks, the
production build, production serving, and the Chromium user path. GitHub
Actions runs that path on every relevant change. Audit results are collected as
diagnostic evidence, including affected dependency paths, even when the audit
command exits nonzero.

### Stakeholders

- **Maintainers modernizing dependencies** need a trustworthy before/after
  comparison.
- **Contributors** need one documented local setup and validation path.
- **Reviewers** need CI evidence and explicit disposition of existing failures.
- **Users** need assurance that the graph still renders and its core controls
  remain operable.

## Confirmed Decisions

The architect confirmed on 2026-07-17:

1. Pin an exact, currently verified Node 22 LTS patch and the exact npm version
   used to generate lockfile v3.
2. Use GitHub Actions rather than a documentation-only automation path.
3. Treat full and `--omit=dev` audits as evidence snapshots. Document findings
   and dependency paths; do not suppress them and do not require zero findings
   for the validation gate.
4. Do not add dependency-major migrations or a `FocusGraph` lifecycle refactor.
5. Preserve browser coverage of the rendered WebGL canvas plus axes, reset, and
   rotation controls.

The selected toolchain is:

- Node.js `22.23.1`, the latest Node 22 Maintenance LTS patch published at the
  time of verification.
- npm `10.9.8`, the npm version bundled with that Node release and the version
  used to refresh the lockfile v3 metadata.

## Scope

### In scope

- Declare the exact Node and npm baseline in package metadata.
- Add `.nvmrc` containing the exact Node version for local version managers.
- Refresh lockfile v3 with the declared npm version without intentionally
  upgrading the existing application dependency graph.
- Add direct commands for ESLint, TypeScript checking, production build,
  production start, Chromium browser smoke, full audit, and production audit.
- Add and document one aggregate validation command.
- Add only the development tooling and configuration required for the minimal
  Playwright smoke.
- Exercise the built application through a real production server.
- Add GitHub Actions automation using the exact declared Node patch and npm.
- Capture and disposition all baseline failures and both audit views in the
  final review/PR, including root-to-affected-package paths.
- Update contributor-facing documentation for setup and validation.

### Out of scope

- Next.js, React, Three.js, force-graph, Tailwind, TypeScript-major, or
  ESLint-major migration.
- Product features, UI changes, or visual redesign.
- `FocusGraph` timer cleanup, idempotent initialization, closure changes, ambient
  Three.js declaration removal, or any other lifecycle/type refactor.
- Remediation of existing advisories through unrelated dependency upgrades.
- Broadening browser coverage beyond the minimal Chromium baseline.
- Treating audit totals alone as sufficient evidence.

## Constraints and Invariants

- Runtime and CI must use Node `22.23.1`; package metadata must declare that
  exact supported baseline rather than an unbounded `>=22` policy.
- `packageManager` must identify npm `10.9.8`.
- The manifest fields and `.nvmrc` are the repository's declared toolchain
  contract. This spec does not require enabling Corepack or adding
  `engine-strict`; exact versions are verified explicitly in documentation and
  CI.
- `npm ci` must remain the clean-install command; CI must not substitute
  `npm install`.
- The committed lockfile must remain lockfile v3.
- Existing application dependency versions must not be intentionally migrated.
  Any incidental lockfile change must be explained.
- Lint must invoke the existing ESLint 9 flat configuration through the ESLint
  CLI, not `next lint`.
- ESLint flat configuration must globally ignore generated/tool-owned output
  such as `.next/`, Playwright reports, and Playwright test results. Ignoring
  generated output is not permission to exclude application or test source.
- Typecheck must invoke `tsc --noEmit` directly.
- Browser smoke must use the production build and production server, not the
  development server.
- The smoke must not mock the graph, WebGL canvas, browser, or internal
  application modules.
- Unexpected `pageerror` events and browser `console.error` messages are test
  failures. Existing informational/debug output is not silently reclassified as
  an error.
- Audit evidence must always be produced. A nonzero audit exit caused by
  reported vulnerabilities is recorded and dispositioned, not hidden; audit
  cleanliness is intentionally not part of the green validation gate.
- No command may add ignore flags, blanket disables, skipped assertions, or
  other bypasses merely to make the baseline pass.

## Solution Exploration

### Approach A: Documentation-only local baseline

Document a Node/npm pair and local command sequence without adding browser
automation or CI.

**Advantages**

- Minimal repository change.
- No CI or browser-test maintenance.

**Disadvantages**

- Results still depend on a contributor executing every step correctly.
- No durable proof that the production user path works.
- Does not satisfy the confirmed GitHub Actions decision or required smoke
  coverage.

**Complexity:** low.  
**Risk:** high risk of drift and unobserved regressions.  
**Disposition:** rejected.

### Approach B: Shell-script validation with ad hoc browser probing

Pin the toolchain, combine commands in a shell script, and probe the running
server with HTTP or a custom headless-browser script.

**Advantages**

- Can provide a single entry point.
- Potentially fewer test-runner dependencies.

**Disadvantages**

- HTTP readiness does not prove WebGL rendering or control behavior.
- Custom process lifecycle and browser error collection are less portable.
- Cross-platform shell behavior adds avoidable variability.

**Complexity:** medium.  
**Risk:** medium-to-high, especially around production-server cleanup and false
confidence in canvas rendering.  
**Disposition:** rejected.

### Approach C: Package scripts, Playwright, and GitHub Actions

Pin Node/npm in package metadata and a local runtime file; expose direct npm
scripts; use Playwright's production `webServer` lifecycle for a Chromium smoke;
compose static, build, and smoke checks into one validation script; run the
same commands in GitHub Actions; collect audits separately as evidence
artifacts.

**Advantages**

- Local and CI execution share the same entry points.
- Playwright tests an actual browser and production server without application
  mocking.
- Browser/page errors, rendered canvas state, and controls are directly
  observable.
- Audit evidence remains visible without conflating known advisories with
  regression gates.

**Disadvantages**

- Adds Playwright development tooling and a Chromium installation step.
- Headless WebGL requires a CI environment with working software rendering.
- Production-server readiness and teardown need deterministic configuration.

**Complexity:** medium.  
**Risk:** manageable with an exact toolchain, Playwright-managed server, explicit
timeouts, and a focused single-browser test.  
**Disposition:** selected.

## Functional Requirements

### FR1 — Toolchain policy

- `package.json` MUST declare `engines.node` as exactly `22.23.1`.
- `package.json` MUST declare `packageManager` as `npm@10.9.8`.
- `.nvmrc` MUST contain `22.23.1`.
- Documentation MUST show commands that verify both `node --version` and
  `npm --version`.
- The lockfile MUST be generated/refreshed with npm `10.9.8` and MUST remain
  lockfile v3.

### FR2 — Direct commands

The package scripts and documentation MUST provide these direct commands:

- clean install (`npm ci`);
- lint (`npm run lint`) using `eslint .`;
- typecheck (`npm run typecheck`) using `tsc --noEmit`;
- production build (`npm run build`);
- production start (`npm run start`);
- Playwright browser smoke (`npm run test:smoke`);
- full dependency audit (`npm run audit:full`); and
- production dependency audit (`npm run audit:production`) using `--omit=dev`.

Command names MUST be unambiguous and stable enough for CI and later
modernization stages to reuse.

### FR3 — Unified validation

- A single documented `npm run validate` command MUST run lint, typecheck,
  production build, and the browser smoke.
- `validate` MUST run sequentially and fail fast on the first failing green-gate
  command. Complete baseline evidence is obtained by also running and recording
  each direct command independently; validation does not need a custom
  run-all/aggregate-result wrapper.
- The smoke MUST start and stop the production server deterministically.
- Validation MUST return nonzero when any included check fails.
- Audits MUST remain separate evidence commands, as confirmed by the architect.

### FR4 — Browser smoke

Using a real headless Chromium browser against the built production application,
the smoke MUST:

1. load the root page successfully;
2. wait for the graph UI to become ready, defined as all three required controls
   being visible together with a visible canvas whose CSS and backing-store
   dimensions are nonzero;
3. observe a visible canvas with nonzero rendered dimensions and evidence of an
   initialized WebGL rendering context whose drawing buffer dimensions are
   nonzero;
4. exercise the axes control and observe its label/state transition;
5. exercise Reset Camera;
6. exercise the auto-rotation control and observe its label/state transition;
7. collect unexpected browser `console.error` messages and uncaught page errors
   throughout page load and all interactions; and
8. fail with useful diagnostics if any required element, state transition, page
   error, or console error is observed.

Selectors SHOULD prefer accessible roles/names. The smoke MAY use stable
existing IDs where a control has no better observable contract. Playwright MAY
execute JavaScript in the page to inspect the canvas WebGL context and drawing
buffer.

### FR5 — GitHub Actions

- A workflow MUST run for pull requests and pushes to `main`.
- It MUST use Node `22.23.1`, run `npm ci`, install the required Playwright
  Chromium browser/system dependencies, and invoke the same unified validation
  command documented for contributors.
- It MUST collect full and production-only audit snapshots even when advisories
  cause npm to exit nonzero.
- Audit output MUST be uploaded under stable `audit-full` and
  `audit-production` artifact names. Browser failure output MUST be uploaded
  under stable Playwright report/test-result artifact names.
- Audit evidence handling MUST NOT mask failures from lint, typecheck, build, or
  browser smoke.

### FR6 — Audit evidence and disposition

- Run `npm audit` and `npm audit --omit=dev` under the declared toolchain.
- Preserve machine-readable output for both views.
- Raw machine-readable audit outputs MUST be CI artifacts rather than committed
  volatile snapshots. Durable findings and dispositions MUST be committed in an
  `Audit Baseline` section of
  `codev/reviews/7-establish-a-reproducible-node-.md`.
- For every reported advisory, that review section MUST identify:
  - affected package and severity;
  - advisory identifier or URL where available;
  - whether the package is in the production or development graph;
  - at least one dependency path from the project root to the affected package,
    obtained from the installed dependency tree rather than inferred from totals;
  - whether the finding is pre-existing; and
  - its disposition (deferred modernization issue, no supported in-scope fix, or
    other explicit rationale).
- If either audit reports no findings, the review MUST record the zero result and
  command/toolchain rather than inventing paths.

### FR7 — Baseline failure policy

- Every required command MUST be executed from a clean install under the pinned
  toolchain.
- Any pre-existing failure MUST be reproduced, recorded with command and
  relevant output, and explicitly dispositioned.
- In-scope configuration or test defects MAY be corrected without weakening a
  gate.
- Failures requiring an out-of-scope dependency migration or lifecycle refactor
  MUST remain documented rather than being silently fixed here.

## Non-Functional Requirements

### Reproducibility

- Fresh checkout results depend only on the declared toolchain, committed
  manifest/lockfile, and documented browser installation.
- Local and CI validation use the same npm scripts.
- Test server ports, readiness, base URL, and teardown are deterministic.

### Reliability

- Browser assertions wait on observable readiness rather than fixed sleeps where
  possible.
- Failures include enough context to distinguish server startup, missing WebGL,
  missing UI, interaction, console, and page exceptions.
- No test is marked skipped to accommodate deterministic failures.

### Security and integrity

- CI installs from the lockfile with `npm ci`.
- Audit snapshots are retained without mutating dependencies or using
  force-fix/override behavior.
- The workflow uses only the permissions required to check out and validate the
  repository.

### Maintainability

- The smoke remains minimal: one critical root-page path and the three required
  control behaviors.
- Configuration and documentation explain why audit is evidence rather than a
  zero-vulnerability gate.
- No application internals are exposed solely to support the test.

## Acceptance Scenarios

### Scenario 1: Fresh checkout

Given a fresh checkout and Node `22.23.1` with npm `10.9.8`, when a contributor
runs `npm ci`, then installation completes from lockfile v3 without modifying
the manifest or lockfile.

### Scenario 2: Direct static and build checks

Given the clean install, when lint, typecheck, and build are invoked
individually, each runs its named underlying CLI/build operation and reports its
true exit status.

### Scenario 3: Production start

Given a successful production build, when the documented start command runs,
the root page becomes reachable from the production Next.js server and the
process can be terminated cleanly.

### Scenario 4: WebGL and controls

Given the production server, when the Playwright smoke loads the root page, then
it observes the initialized rendered canvas, toggles axes, resets the camera,
toggles auto-rotation, observes required label/state changes, and finishes with
no unexpected page or console errors.

### Scenario 5: Unified local validation

Given the declared toolchain, browser installation, and clean dependencies, when
`npm run validate` runs, then lint, typecheck, build, production serving, and
browser smoke execute in a deterministic sequence and any included failure
produces a nonzero result.

### Scenario 6: CI parity

Given a pull request, when GitHub Actions runs, then it installs the exact
toolchain/dependency/browser baseline and invokes the same unified validation
entry point as local contributors.

### Scenario 7: Audit findings

Given an audit that exits nonzero because vulnerabilities exist, when CI and the
final review collect evidence, then both full and production views remain
visible with dependency paths and explicit dispositions, while unrelated
validation failures still fail the workflow.

### Scenario 8: No scope leakage

When the baseline diff is reviewed, then no application dependency major,
product UI, graph lifecycle, or rendering implementation change is present.

## Success Criteria

- A fresh checkout under Node `22.23.1` / npm `10.9.8` completes `npm ci` and
  leaves tracked dependency files unchanged.
- Direct documented commands exist and have been executed for lint, typecheck,
  build, production start, browser smoke, full audit, and production audit.
- `npm run validate` covers all green gates and passes, or any genuine
  pre-existing failure is accurately reproduced and dispositioned without a
  bypass.
- The Playwright smoke observes the rendered WebGL canvas, exercises axes/reset/
  rotation controls, and detects unexpected page and console errors.
- GitHub Actions automatically reproduces the declared validation path.
- The final review/PR contains both audit snapshots and dependency paths, not
  only aggregate severity totals.
- Dependency and application changes remain within the baseline scope.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Headless CI lacks usable WebGL | False smoke failures or untested rendering | Install supported Chromium dependencies, require nonzero canvas/drawing-buffer dimensions from an initialized context, and retain Playwright artifacts |
| Playwright server lifecycle races | Flaky readiness or orphan processes | Use Playwright-managed `webServer`, an explicit URL, bounded timeout, and deterministic teardown |
| Lockfile refresh changes resolved packages | Accidental dependency modernization | Compare lockfile package entries, explain every change, and reject unrelated version drift |
| Existing console errors surface | Baseline cannot be green | Reproduce and disposition; fix only if in scope, never ignore the error |
| Audit exits nonzero | Evidence step appears to break CI | Separate evidence collection from green validation while retaining exit/result metadata and output artifacts |
| Aggregate audits obscure transitive origin | Reviewers cannot plan remediation | Pair each advisory with installed-tree path evidence |
| Exact runtime becomes stale | Future contributors use an older maintenance patch | Treat this as a deliberate Stage 0 snapshot; update only through a reviewed follow-up baseline change |

## Open Questions

### Critical

None. The architect resolved the toolchain, CI, audit, scope, and browser-smoke
decisions required to proceed.

### Important

- Exact pre-existing lint, typecheck, build, runtime, browser, and audit outcomes
  remain to be measured during implementation under the pinned toolchain.
- The lockfile diff must confirm whether adding Playwright is the only resolved
  graph change beyond root metadata.

### Nice-to-know

- Broader browser coverage may be added in a later rendering modernization
  stage; it is not required for this baseline.

## References

- Issue #7, “Establish a reproducible Node 22 modernization baseline.”
- `codev/research/architecture-dependency-modernization.md`, Stage 0.
- [Node.js `22.23.1` release notes](https://nodejs.org/en/blog/release/v22.23.1/)
  and [release archive](https://nodejs.org/en/download/archive/v22.23.1),
  verified 2026-07-17.
- [Node.js release schedule](https://github.com/nodejs/Release): Node 22 “Jod”
  is in Maintenance LTS through 2027-04-30.

## Consultation Log

### Iteration 1

- **Gemini — APPROVE (high confidence):** confirmed the current-state analysis,
  control availability, and Playwright feasibility. It noted that direct
  `eslint .` requires generated-output ignores; the spec now requires global
  ignores for `.next/` and Playwright output while explicitly prohibiting source
  exclusions.
- **Codex — REQUEST_CHANGES (high confidence):** requested an explicit CI branch,
  named runtime file, durable audit-evidence contract, and concrete UI-ready
  condition. The spec now names `main`, `.nvmrc`, stable CI artifact names plus
  the review document's `Audit Baseline` section, and readiness based on all
  controls plus nonzero canvas/backing-store dimensions.
- **Claude — COMMENT (high confidence):** found no blocking feasibility issue
  and requested clarity on toolchain enforcement and validation error behavior.
  The spec now states that Corepack/`engine-strict` activation is not required,
  exact versions are explicitly verified in docs/CI, and `validate` is
  sequential/fail-fast while direct commands provide complete baseline evidence.
  It also suggested stable script names and in-page WebGL inspection; both are
  now explicit.

All material feedback has been incorporated; no reviewer recommendation was
rejected.

## Implementation Status

Implemented. All functional requirements and success criteria are accounted for
in `codev/reviews/7-establish-a-reproducible-node-.md`, including the clean
validation matrix, browser evidence, audit paths/dispositions, and documented
deviations.
