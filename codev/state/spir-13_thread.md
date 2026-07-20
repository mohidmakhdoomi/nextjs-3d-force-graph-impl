# spir-13 — Adopt TypeScript 6 and finalize the supported ESLint 9 flat config

Strict SPIR. Issue #13, Stage 4 (language + lint) of the modernization roadmap (#6).
Depends on #12 (Next 16, merged PR #26).

## Specify phase — context gathered (2026-07-20)

Read spec/plan/review 12 (format template) and review 10 (the ESLint-hygiene
source: it established the ESLint 9 flat config, removed `@eslint/compat`, bumped
hooks 5→7 with the rule set *pinned* to avoid silent coverage expansion, and set
the `eslint .` CLI path from #7).

### Current toolchain state (worktree manifest)
- `typescript: ~5.7.3` → target exact `6.0.3`
- `typescript-eslint: ~8.64.0` (already the researched target) — RETAIN
- `eslint: ~9.39.5` / `@eslint/js: ~9.39.5` (string-equal, ESLint 9) — RETAIN
- `eslint-plugin-react: ~7.37.5`, `eslint-plugin-react-hooks: 7.1.1`, `globals: ~17.7.0` — RETAIN
- `@eslint/compat` — ALREADY removed in #10 (absent from manifest). Confirm it stays absent.

### Registry + behavioral reverification (authoritative; worktree has NO node_modules,
so `require()` in-tree resolves the parent checkout's STALE copies — used `npm view`
+ scratchpad probes instead):
- `typescript@6.0.3` exists. `latest = 7.0.2` (TS 7 is **GA** now — the drift tripwire; do NOT adopt), `beta = 6.0.0-beta`.
- `typescript-eslint@8.64.0` peers `eslint ^8.57 || ^9 || ^10`, `typescript >=4.8.4 <6.1.0`.
  Its `@typescript-eslint/typescript-estree@8.64.0` `SUPPORTED_TYPESCRIPT_VERSIONS = '>=4.8.4 <6.1.0'`
  → **6.0.3 satisfies it → NO unsupported-version warning, zero suppression needed.** (decisive)
  `typescript-eslint@8.65.0` (latest 8.x) has the SAME TS range — a patch, not a range extension.
- **TS 6.0.3 probe on the repo compilerOptions: NO option-deprecation diagnostics, exit 0.**
  (`target: es6`, `module: esnext`, `moduleResolution: bundler`, `incremental` all clean.)
- `globals@17.7.0` exposes `browser`/`node`/`commonjs`/`worker` keys.

### Config modernization surface (eslint.config.mjs, from #10)
- React uses legacy `eslint-plugin-react/configs/recommended.js` (eslintrc shape) → modern `configs.flat.recommended`.
- Hooks pinned explicitly (rules-of-hooks:error, exhaustive-deps:warn) — #10 forbade spreading v7's expanded ~16-rule recommended. #13 revisits this as a *deliberate, print-config-verified* decision.
- Globals: only `globals.commonjs` applied globally; `globals.browser` commented out → scope browser (app) vs node/commonjs (config/scripts/tests).
- Deliberate offs to preserve: react/react-in-jsx-scope, jsx-uses-react, @typescript-eslint/no-explicit-any; Next recommended + core-web-vitals.

Issue #13 has NO `## Baked Decisions` section → constraints derived from the issue's
fixed scope/AC text (like spec 12).

Writing the spec now.

## Specify — 3-way consultation (iter 1) complete

- Gemini: APPROVE (HIGH) — after `agy` first returned no output (tooling skip); re-run on request → APPROVE.
- Codex: COMMENT (HIGH) — 3 clarity nits (start HTTP200 evidence, e2e globals pattern, docs exact-vs-line). All addressed.
- Claude: APPROVE (HIGH) — 4 non-blocking. Key one: challenged "~16 rules" hooks claim.
  RE-VERIFIED against a real install: hooks 7.1.1 = 29 rules total, recommended=16, recommended-latest=17.
  Reviewer hit the no-node_modules-in-worktree trap (bare require → parent's stale 5.1.0 = 2 rules).
  Added Confirmed Decisions #8 codifying the trap. Softened app browser-globals wording (only globalThis
  is a direct ref), added tailwind.config.ts .ts+CJS note, clarified hooks flat-config surface.

Spec updated + Consultation Log written. Committing "Specification with multi-agent review",
then `porch next 13` to advance toward the spec-approval gate.

## GATE REACHED: `spec-approval` (STOP — human approval required)
`porch next 13` → `gate_pending`. All reviewers approved (gemini APPROVE, codex
COMMENT [non-blocking], claude APPROVE). Porch advanced to the `spec-approval`
gate and is WAITING FOR HUMAN APPROVAL. Per strict mode I STOP here and do NOT run
`porch approve` — only the architect approves gates. Architect notified via afx send.

Open elections for the architect at this gate (overridable here, else confirmed):
1. Hooks coverage: DEFAULT = coverage-preserving (2 effective rules via the existing
   flat-native explicit registration) vs. adopt the 16/17-rule recommended preset.
2. typescript-eslint: retain 8.64.0 (researched) vs. take 8.65.0 patch (same TS <6.1 range).

On approval: `porch approve 13 spec-approval --a-human-explicitly-approved-this`
(architect-run), then `porch next 13` → Plan phase.

## Plan phase — draft written

spec-approval gate APPROVED by architect (both elections confirmed at defaults:
hooks coverage-preserving; retain typescript-eslint 8.64.0). Porch advanced to plan.

Plan 13 drafted — 3 sequential phases:
1. typescript6_adoption — manifest/lockfile/contract-test only: TS→6.0.3 exact,
   tsc clean (resolve/bound deprecations), eslint clean (no parser warning) with
   config UNCHANGED, pin in toolchain test. (FR1-4, FR12 pin)
2. eslint9_config_finalization — pure eslint.config.mjs refactor: React native flat
   config, scoped globals (browser=app/**, node/cjs=config/scripts/tests, e2e=both),
   hooks coverage-preserving via existing flat-native registration (NOT the 16/17-rule
   preset), @eslint/compat stays absent, before/after print-config proof. (FR5-7, FR12 invariant)
3. qualification_evidence_docs — full gates + start HTTP200 + two-engine matrix +
   lockfile/audit delta + supply-chain + docs + TS7/ESLint10 deferral. (FR8-13)

Phase separation isolates "did TS6 change anything" (P1) from "did config refactor
change coverage" (P2). All three ship as commits within ONE PR (per issue PR strategy).
Local plan checks pass (plan_exists, has_phases_json, min_two_phases=3).
Committing draft, then porch done 13 → 3-way plan consultation.

## Plan — 3-way consultation (iter 1): UNANIMOUS APPROVE
- Gemini: APPROVE (HIGH) — after agy retry (first pass skipped, tooling).
- Codex: APPROVE (HIGH) — no issues.
- Claude: APPROVE (HIGH) — verified all FR1-13 coverage + codebase claims; 2 non-blocking clarity
  points incorporated: (1) split Phase-2 globals into explicit Node/ESM vs Node/CJS subgroups
  (don't apply commonjs to ESM files); (2) fold the standalone files-only block + old un-scoped
  globals block into the scoped structure, keep the single files-less ignore block.
Plan updated + Consultation Log written. Committing "Plan with multi-agent review", then
porch next 13 → plan-approval gate (STOP for human).

## GATE REACHED: `plan-approval` (STOP — human approval required)
`porch next 13` → gate_pending, unanimous APPROVE (gemini/codex/claude all HIGH).
Porch advanced to plan-approval and is WAITING FOR HUMAN APPROVAL. Strict mode: I STOP,
do NOT run porch approve. Architect notified.
On approval: architect runs `porch approve 13 plan-approval --a-human-explicitly-approved-this`,
then `porch next 13` → Implement phase, Phase 1 (typescript6_adoption).
