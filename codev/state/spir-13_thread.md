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
