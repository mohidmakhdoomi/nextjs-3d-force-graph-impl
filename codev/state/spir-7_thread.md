# Project 7 builder thread

- Entered SPIR `specify` iteration 1 in strict mode.
- The requested spec did not exist in the spawned worktree. Porch therefore requires initial stakeholder clarification before drafting.
- The issue contains no `Baked Decisions` section. Its fixed scope is a Node 22/npm reproducibility baseline, direct validation commands, Playwright smoke coverage, audit evidence, and an automated execution path without dependency/framework modernization.
- Architect confirmed the exact-patch policy, GitHub Actions, evidence-only audits, scope boundaries, and required canvas/control coverage.
- Verified the current Node 22 Maintenance LTS baseline from official Node.js sources as Node `22.23.1` with bundled npm `10.9.8`; drafted the initial specification around that exact toolchain.
- Specify iteration 1 consultation completed after waiting for the mandatory Claude quota reset: Gemini APPROVE, Codex REQUEST_CHANGES, Claude COMMENT.
- Incorporated all feedback: `main` CI trigger, `.nvmrc`, stable audit artifacts plus durable review format, explicit UI readiness/WebGL evidence, generated-output lint ignores, named scripts, advisory-only Corepack/engine policy, and fail-fast validation semantics.
- Architect approved the specification; entered SPIR `plan` iteration 1.
- Drafted three implementation phases for (1) exact toolchain/direct commands, (2) production Playwright WebGL smoke/unified validation, and (3) GitHub Actions/audit artifacts/documentation. All phases are atomic commits in one PR.
- Plan iteration 1 consultation: Gemini APPROVE, Codex REQUEST_CHANGES, Claude APPROVE.
- Accepted Codex's browser-install correction: `npm ci` installs Playwright tooling but not Chromium, so Phase 2 now includes `browser:install` as an explicit local prerequisite and CI uses the `--with-deps` variant.
- Architect approved the plan; entered implementation phase `toolchain_commands`.
- Installed/activated exact Node `22.23.1` with bundled npm `10.9.8`. Pre-change baseline passed build, legacy `next lint`, and direct `tsc --noEmit`; audits reported 14 full findings (2 low, 6 moderate, 5 high, 1 critical) and 9 production findings (4 moderate, 4 high, 1 critical).
- Implemented `.nvmrc`, exact manifest metadata, direct lint/typecheck/audit scripts, generated-output ESLint ignores, lockfile-v3 root engine metadata, and a Node test covering the toolchain/config contract. Added the minimal `test` script required by porch for this configuration-only phase.
- Phase 1 validation: clean `npm ci`, 4/4 Node tests, direct ESLint, typecheck, and production build pass; all 428 pre-existing lock package entries are byte-equivalent in version/resolved/integrity metadata. Audit advisory exit status remains 1 by design and totals are unchanged.
- Phase 1 consultation: Gemini APPROVE, Codex REQUEST_CHANGES, Claude APPROVE. Codex correctly noted `.nvmrc` was untracked and therefore outside the canonical review diff; explicitly added `.nvmrc` and the new contract test to the Git index for re-verification.
- Phase 1 iteration 2 received unanimous Gemini/Codex/Claude approval. Porch advanced to `browser_smoke`; recorded Phase 1 as completed with its command, audit, dependency-integrity, consultation, and small test-infrastructure deviation evidence.
