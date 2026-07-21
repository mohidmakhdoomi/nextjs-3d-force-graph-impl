# Experiment 14: Clean, supported ESLint 10 migration

**Status**: Complete — **Disposition: DEFER** (hypothesis confirmed)

**Date**: 2026-07-20

Driving issue: [#14 — Experiment with a clean, supported ESLint 10 migration](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/14).
Depends on merged #13 (TypeScript 6.0.3 + finalized ESLint 9 flat config). Tracked under #6.
Protocol: EXPERIMENT (soft mode). A documented **defer** is a valid successful outcome.

## Goal

**Question (from #14):** Can this repository adopt a current ESLint 10 release with a
*clean, supported peer tree* and *equivalent intentional lint coverage* — or must it
wait for React-plugin support / approve a rule-set replacement?

**Hypothesis (falsifiable):** ESLint 10 cannot be adopted today with a clean supported
peer tree while keeping `eslint-plugin-react`, because that plugin's newest published
peer range still ends at ESLint 9. Adoption therefore requires either (a) waiting for
`eslint-plugin-react` to publish ESLint 10 support, or (b) an approved removal/replacement
of its rule set.

**Success / decision criteria (defined upfront):**
- **ADOPT** — only if `eslint`→10.x installs with **no `--force` / `--legacy-peer-deps` /
  overrides**, no unsupported-peer or parser warnings, and lint coverage is intentionally
  equivalent or improved, with build/typecheck unchanged.
- **REPLACE (with approval)** — if a clean ESLint 10 tree is only achievable by removing
  `eslint-plugin-react` and either dropping or substituting its 19 active rules; this is a
  deliberate coverage change requiring architect approval.
- **DEFER** — if a clean supported tree with equivalent coverage is not achievable within
  the timebox without a rule-set change; record the single blocker and precise unblock
  condition.

**Stop conditions (from #14, honored):** no `--force`, `--legacy-peer-deps`, unsupported
peer combinations, or package-manager overrides to manufacture success. Production
dependencies are **not** changed merely to satisfy the experiment.

## Effort

**Approximate time spent**: ~2 hours (registry investigation, isolated install trials,
rule-coverage diff, write-up).

## Approach

1. **Registry-only support matrix** — query current published versions, `eslint` peer
   ranges, and Node `engines` for the whole lint stack. No install needed; this is the
   crux evidence.
2. **Baseline (ESLint 9)** — `npm ci` the committed tree; confirm `lint`/`typecheck` clean
   on tracked source; enumerate the effective `react/*` rule coverage that
   `eslint-plugin-react` contributes (the coverage a removal would cost).
3. **Trial A — clean-install ESLint 10 (isolation, no flags)** — in a clean detached
   worktree, bump `eslint`→10.7.0 / `@eslint/js`→10.0.1, run `npm install` with **no**
   peer-override flags; capture the resolver outcome.
4. **Trial B — viable "replace" config** — remove `eslint-plugin-react`, adjust the flat
   config, install ESLint 10 cleanly, and record the rule-coverage delta plus
   lint/typecheck/build/smoke. Establishes whether the replace path is technically real,
   so a defer is a *choice* with a defined unblock condition, not a dead end.

**Why a clean detached worktree as sandbox:** the builder worktree carries an untracked
`.claude/hooks/worktree-write-guard.cjs` (harness file, absent from clean checkouts) that
`eslint .` flags — documented environment noise (`lessons-critical.md`). A
`git worktree add --detach HEAD` checkout has no such file, so it gives both a
noise-free baseline and an isolation boundary that never touches the committed
`package.json` / lockfile / contract tests.

## Environment & Reproduction

**Toolchain (reproducibility contract):** Node `22.23.1`, npm `10.9.8`, lockfile v3, `npm ci`.

**Baseline install (committed ESLint 9 tree):**
```bash
npm ci
# tracked-source lint is clean; .claude/** is harness noise, excluded:
npx eslint . --ignore-pattern ".claude/**"   # exit 0
npm run typecheck                             # exit 0
```

**Isolated ESLint 10 trials (never mutates the committed tree):**
```bash
git worktree add --detach "$SANDBOX" HEAD
cd "$SANDBOX" && npm ci
# Trial A — clean install, NO flags:
npm pkg set devDependencies.eslint=10.7.0 devDependencies.@eslint/js=10.0.1
npm install            # expect ERESOLVE from eslint-plugin-react (peer caps at ^9.7)
```

## Support matrix (current published, queried 2026-07-20)

Registry `npm view` results for the lint stack:

| Package | Manifest (main) | Latest published | Declared `eslint` peer | Admits ESLint 10? |
|---|---|---|---|---|
| `eslint` | `~9.39.5` | **10.7.0** | — (Node `engines`: `^20.19.0 \|\| ^22.13.0 \|\| >=24`) | Node 22.23.1 satisfies ✓ |
| `@eslint/js` | `~9.39.5` | **10.0.1** | — | 10.x line exists ✓ |
| **`eslint-plugin-react`** | `~7.37.5` | **7.37.5** (unchanged) | `^3 \|\| … \|\| ^8 \|\| ^9.7` | **NO — caps at `^9.7`** ✗ |
| `eslint-plugin-react` `next` tag | — | `7.8.0-rc.0` (ancient/stale) | — | no prerelease adds 10 ✗ |
| `eslint-plugin-react-hooks` | `7.1.1` | `7.1.1` | `… \|\| ^9.0.0 \|\| ^10.0.0` | yes ✓ |
| `typescript-eslint` | `~8.64.0` | `8.65.0` | `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` (locked 8.64.0 too) | yes ✓ |
| `@next/eslint-plugin-next` | `16.2.10` | — | (no `eslint` peer declared) | unconstrained ✓ |
| `globals` | `~17.7.0` | `17.7.0` | — | unconstrained ✓ |
| `@eslint-react/eslint-plugin` (alt) | — | `5.17.3` | `eslint: '*'` | yes — replacement candidate ✓ |

**Single blocker = `eslint-plugin-react`.** Every other stack member already admits
ESLint 10; the currently-locked `typescript-eslint@8.64.0` does too (no bump required).
The `eslint-plugin-react` `next` dist-tag points at an ancient `7.8.0-rc.0`, so there is
no forthcoming ESLint 10 support even in prerelease.

## Baseline results (ESLint 9, committed tree)

- `lint` (tracked source, `.claude/**` excluded): **clean, exit 0**.
- `typecheck`: **clean, exit 0**.
- Effective `react/*` coverage from `eslint-plugin-react` flat.recommended on `app/page.tsx`:
  **22 rules present, 19 active (error)**. The three non-active are the deliberate JSX-transform
  offs (`react/react-in-jsx-scope`, `react/jsx-uses-react`) plus one recommended default.
  These **19 active rules are exactly what a removal of `eslint-plugin-react` would drop.**

Active `react/*` rules that removal would cost:
`display-name, jsx-key, jsx-no-comment-textnodes, jsx-no-duplicate-props,
jsx-no-target-blank, jsx-no-undef, jsx-uses-vars, no-children-prop,
no-danger-with-children, no-deprecated, no-direct-mutation-state, no-find-dom-node,
no-is-mounted, no-render-return-value, no-string-refs, no-unescaped-entities,
no-unknown-property, prop-types, require-render-return`.

## Trial A — clean-install ESLint 10 (isolation, no flags)

**Method:** in the clean detached worktree, bump `eslint`→10.7.0 / `@eslint/js`→10.0.1,
then a **fresh resolve from the manifest** (`rm -rf node_modules package-lock.json && npm install`)
with **no** `--force` / `--legacy-peer-deps` / overrides.

> A fresh resolve (not an in-place bump on top of the ESLint 9 lockfile) is the honest
> test: an in-place `npm install` first surfaces a *stale-lockfile* artifact (old
> `eslint@9.39.5` subtree vs new `@eslint/js@10.0.1`), which masks the real constraint.

**Result: `npm error code ERESOLVE` (exit 1).** The sole binding conflict:

```
Could not resolve dependency:
peer eslint@"^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7" from eslint-plugin-react@7.37.5
node_modules/eslint-plugin-react
  dev eslint-plugin-react@"~7.37.5" from the root project
```

No other package conflicts. This confirms the hypothesis: **ESLint 10 cannot be installed
with `eslint-plugin-react` present without a forbidden override flag.**

## Trial B — viable "replace" config (ESLint 10 minus eslint-plugin-react)

**Method:** remove `eslint-plugin-react` from the manifest and from the flat config (its
import, `pluginReact.configs.flat.recommended`, the `react` settings block, and the two now-orphan
`react/*` off-rules), keeping `eslint`@10.7.0 / `@eslint/js`@10.0.1 and the rest of the stack;
fresh install with **no** flags.

**Result — a clean, working ESLint 10 tree:**

| Check | Result |
|---|---|
| `npm install` (no flags) | **exit 0** — clean resolve |
| `npm ls eslint` | every consumer dedupes to `eslint@10.7.0`; no `invalid`/non-optional `UNMET` (only benign `peerOptional` svelte/vue/remix/fsevents) |
| `eslint .` (lint) | **exit 0** — flat config loads on ESLint 10; tracked source clean |
| `tsc --noEmit` (typecheck) | **exit 0** |
| `next build` | **exit 0** — compiled + TS in ~5s, static pages generated |
| Chromium e2e smoke | **10/10 passed** — incl. timing-sensitive auto-rotate & pointer-inert-delay tests (runtime is unaffected by lint tooling; app code byte-identical to main) |

**Effective rule-coverage delta (`--print-config app/page.tsx`, ESLint 9 baseline vs ESLint 10 replace path):**

| | ESLint 9 (with react plugin) | ESLint 10 (replace path) |
|---|---|---|
| Active rules | **107** | **91** |
| React rules (`react/*`) | 19 | **0 (−19)** |
| Non-react rules lost | — | **0** |
| New from 9→10 `@eslint/js` recommended | — | **+3**: `no-unassigned-vars`, `no-useless-assignment`, `preserve-caught-error` |
| Severity changes on shared rules | — | **0** |

Removing `eslint-plugin-react` costs **exactly its 19 React rules and nothing else**; ESLint
10's own recommended set is **purely additive** (adds 3 core rules, removes/downgrades none).
`react-hooks` (2), `@typescript-eslint` (19), and `@next` (21) coverage is fully retained on ESLint 10.

## Decision: **DEFER** (with an approval-gated REPLACE alternative)

**Keep ESLint `9.39.5` + full `eslint-plugin-react` coverage for now.** Do not change any
production dependency or config as a result of this experiment.

**Rationale**
1. **ESLint 10 itself is ready and desirable.** Node 22.23.1 satisfies its engines; `@eslint/js@10`,
   `typescript-eslint` (even the *currently-locked* 8.64.0), `eslint-plugin-react-hooks@7.1.1`, and
   `@next/eslint-plugin-next` all already admit `^10`. The 9→10 recommended change is purely additive
   (+3 rules, 0 removed, 0 downgraded).
2. **The sole blocker is `eslint-plugin-react`.** Its newest published release is still 7.37.5 with an
   `eslint` peer capped at `^9.7`; the `next` dist-tag is an ancient `7.8.0-rc.0`, so no ESLint 10
   support exists even in prerelease. A fresh, flagless resolve ERESOLVEs on exactly this (Trial A).
3. **Adopting with *equivalent* coverage — the issue's ADOPT bar — is impossible today** without
   `--force` / `--legacy-peer-deps`, which the stop conditions forbid.
4. **The only clean ESLint 10 tree is the REPLACE path** (Trial B): drop `eslint-plugin-react`, which
   deletes 19 intentional React rules. That is technically viable and fully green, but it is a
   deliberate coverage *reduction* requiring architect approval — an ADOPT it is not.
5. Per the EXPERIMENT protocol and issue #14, **a documented defer is a valid successful outcome**.

**Unblock conditions (adopt cleanly when *any* one holds):**
- **[Preferred] `eslint-plugin-react` publishes a release whose `eslint` peer includes `^10`.** Then
  ADOPT directly: bump `eslint` + `@eslint/js` to 10.x, keep the plugin, re-run this experiment's
  clean-install + coverage diff, then `validate`.
- **OR the architect approves a REPLACE:** either (a) **remove** `eslint-plugin-react` and accept the
  −19 React rules (Hooks + typescript-eslint + Next coverage retained), or (b) **substitute**
  `@eslint-react/eslint-plugin@^5` (peer `eslint: '*'`), restoring React linting under a different,
  modern rule set/IDs — which then needs its own coverage qualification.

**Follow-on implementation scope (whenever adoption is triggered):**
- Update `tests/toolchain.test.mjs` — the `"aligns eslint and @eslint/js on the same ESLint 9 line"`
  contract asserts `/^~9\./`; adoption must move that pin to the 10.x line intentionally.
- Reconcile `eslint.config.mjs` and `.gitignore` against post-#32 `main` (blob-report ignores) and
  re-satisfy `automation.test.mjs` (workflow + `playwright.config` contracts).
- Re-run the full gate (lint + typecheck + build + e2e) under the new 4-shard CI shape.

## Reconciliation with post-#32 `main` (CI sharding)

This experiment was finalized after PR #32 (CI e2e sharding) merged to `main` (`a693dc79`).
`main` was merged into this branch and reconciled:
- **No production change from this experiment** (disposition is DEFER), so #32's `eslint.config.mjs`
  edit created **no conflict**. The merge simply adopted #32's added `"blob-report/**"` global-ignore.
- That added ignore is a *file-selection* pattern, **not a rule**, so it does **not** affect the
  107↔91 effective rule-coverage comparison above (which is measured via `--print-config`, i.e. the
  resolved rule set, independent of ignore globs).
- **Post-merge gate re-confirmed against the new `main`:** `eslint . --ignore-pattern ".claude/**"`
  exit 0; `tsc --noEmit` exit 0; `npm test` **30/30 pass** (includes #32's new
  `automation.test.mjs` workflow + `playwright.config` contract assertions — untouched by this
  experiment). `.claude/**` is excluded as documented untracked-harness noise.
- Follow-on scope for a future adoption is unchanged and already lists the `tests/toolchain.test.mjs`
  `~9.` pin and the #32 `automation.test.mjs`/`playwright.config` contracts to reconcile.

## Status update

**Status → Complete (Disposition: DEFER).** Hypothesis **confirmed**: a clean, supported ESLint 10
peer tree with equivalent React coverage is not achievable today; the single blocker and its precise
unblock condition are recorded above.

## References

- Issue #14; research doc Stage 4 (`codev/research/architecture-dependency-modernization.md`).
- `lessons-critical.md` — untracked-harness lint noise; clean-checkout gate proof.
- `tests/toolchain.test.mjs` — contract pinning `eslint`/`@eslint/js` to the `~9.` line.
