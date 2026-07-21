# experiment-14 thread — Clean ESLint 10 migration experiment (issue #14)

Protocol: EXPERIMENT (soft mode). Porch project `14`. Driving issue: #14
"Experiment with a clean, supported ESLint 10 migration". Depends on merged #13
(TS 6.0.3 + finalized ESLint 9 flat config). Track under #6.

## Architect context (2026-07-20)
- Baseline before/after on `main` post-#13: typescript 6.0.3, native React flat
  config, scoped globals, coverage-preserving Hooks.
- MID-FLIGHT CI CHANGE: PR #32 (another architect's builder) replaces the single
  `validation` job with a 4-shard e2e matrix + quality/gate jobs;
  `automation.test.mjs` will assert the new workflow structure. If my outcome is
  "adopt" with config changes, rebase/re-verify against the new CI shape. Architect
  will ping before #32 merges.
- Hard rules: EXPERIMENT protocol, documented defer is a valid success; never
  `--force`/`--legacy-peer-deps`/overrides; production deps must not change merely
  to satisfy the experiment.

## Hypothesis phase (started 2026-07-20)
Question (from #14): can the repo adopt a current ESLint 10 release with a clean
supported peer tree and equivalent intentional lint coverage, or must it wait for
React-plugin support / approve a rule-set replacement?

## Registry evidence gathered (no install needed) — the crux
Current published support matrix (queried 2026-07-20):

| Package | Installed | Latest | eslint peer | Admits ESLint 10? |
|---|---|---|---|---|
| eslint | ~9.39.5 | 10.7.0 | (self); node `^20.19.0 \|\| ^22.13.0 \|\| >=24` | Node 22.23.1 OK |
| @eslint/js | ~9.39.5 | 10.0.1 | — | yes (10.x line exists) |
| **eslint-plugin-react** | ~7.37.5 | **7.37.5** | `^3..^8 \|\| ^9.7` | **NO — caps at ^9.7** |
| eslint-plugin-react (next tag) | — | 7.8.0-rc.0 (stale/ancient) | — | no prerelease adds 10 |
| eslint-plugin-react-hooks | 7.1.1 | 7.1.1 | `...^9.0.0 \|\| ^10.0.0` | yes |
| typescript-eslint | ~8.64.0 | 8.65.0 | `^8.57 \|\| ^9 \|\| ^10` (locked 8.64.0 too) | yes |
| @next/eslint-plugin-next | 16.2.10 | — | (no eslint peer) | no constraint |
| globals | ~17.7.0 | 17.7.0 | — | no constraint |
| @eslint-react/eslint-plugin (alt) | — | 5.17.3 | `eslint: *` | yes (replacement candidate) |

**Single blocker = `eslint-plugin-react`.** Everything else already admits ESLint 10.
This confirms the issue's premise; the clean-install trial should ERESOLVE solely on
eslint-plugin-react. Decision is trending toward DEFER (or replace-with-approval),
pending the clean-install proof + rule-coverage delta + viability of the replace path.

## Execute + Analyze phases — DONE (2026-07-21)
Sandbox = clean detached worktree (`git worktree add --detach HEAD`) in scratchpad —
no `.claude/hooks`, never touches committed package.json/lockfile/tests.

- **Baseline (ESLint 9):** tracked-source lint exit 0, typecheck exit 0. eslint-plugin-react
  flat.recommended = 22 rules present / **19 active**.
- **Trial A (clean-install eslint→10, fresh resolve, NO flags):** `ERESOLVE`, sole blocker
  `eslint-plugin-react@7.37.5` peer `…^9.7` vs `eslint@10.7.0`. Hypothesis confirmed.
- **Trial B (ESLint 10 minus eslint-plugin-react, NO flags):** install exit 0, clean peer tree
  (all dedupe to eslint@10.7.0), lint 0, typecheck 0, build 0, chromium e2e 10/10.
  Coverage 107→91: −19 react rules (0 non-react lost), **+3 new core rules** from 9→10
  recommended (no-unassigned-vars, no-useless-assignment, preserve-caught-error), 0 severity changes.

## DECISION: DEFER (approval-gated REPLACE alternative documented)
Keep ESLint 9.39.5 + full eslint-plugin-react coverage. No production dep/config change.
- ADOPT-with-equivalent-coverage is impossible today without forbidden --force/--legacy-peer-deps.
- REPLACE (remove plugin → −19 rules, or substitute @eslint-react/eslint-plugin) is viable+green
  but a deliberate coverage change requiring architect approval.
- Unblock: eslint-plugin-react ships an `^10` peer → then straight ADOPT (re-run this experiment).
- Follow-on if adopting: update tests/toolchain.test.mjs `~9.` pin; reconcile eslint.config.mjs/
  .gitignore + automation.test.mjs against post-#32 main; re-run full 4-shard gate.

## CI / PR #32 interplay
Architect (00:23Z): #32 (CI sharding) merging to main now — quality + 4-shard e2e matrix +
merge-reports + hardened Validation-gate job; automation.test.mjs now asserts workflow structure +
playwright.config contracts (fullyParallel:true, workers:1, retries CI?2:0); eslint.config.mjs +
.gitignore gained blob-report ignores; new flakes #33 (Firefox pointer-inert), #34 (SwiftShader
click-to-focus). Instruction: merge main into branch before further qualification.
→ Because outcome is DEFER, I make NO production config change, so the flagged eslint.config.mjs
  conflict does not arise. Only deliverable = experiments/14_eslint10_migration/ + this thread.
  Will merge main once architect confirms #32 landed, re-confirm baseline lint/typecheck against
  new main, then open the experiment PR (Refs #14 — defer, not Closes).
