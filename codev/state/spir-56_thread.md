# spir-56 thread — GPU lane parallel default

- Spawned in strict mode for issue #56 (native-GPU e2e lane defaults to parallel workers; SwiftShader gate stays serial).
- Spec already existed on branch (868fcdb) and is thorough — blocker #55 is resolved (green 3/3 parallel re-qual), so the lane default is realizable. Signaled `porch done` for specify build.
- Running iter1 3-way spec consultation (gemini/codex/claude) in background.
- Iter1 spec consultation: unanimous APPROVE (gemini/codex/claude). Reached `spec-approval` gate; architect notified. Waiting for human approval.
- Spec approved by architect. Drafted 3-phase plan (mechanism+tests / worker visibility / docs+re-qual evidence), committed.
- Iter1 plan consultation: gemini APPROVE, codex COMMENT (minor test/doc scoping — folded into plan), claude APPROVE. At `plan-approval` gate; architect notified.

## Implement phase_1 — lane hardware-mode worker default (2026-07-24)

- plan-approval gate approved by architect; armed the context-threshold monitor as instructed.
- Implemented spec 56 phase_1 in `scripts/e2e-gpu-lane.mjs`: exported `LANE_DEFAULT_WORKERS = "50%"` and `operatorWorkersSet(baseEnv)` (set = present and not whitespace-only, mirroring resolveWorkers). `suiteEnvFor` injects `E2E_WORKERS=50%` in both hardware arms only when the operator hasn't set it; software-fallback branch and guard throw untouched; baseEnv never mutated.
- Added the full FR7 unit-test matrix to `tests/gpu-lane.test.mjs` (9 new tests): default injection (two-engine + Firefox-only), operator pass-through (4/1/banana), whitespace-as-unset, fallback non-injection, base-env immutability, constant export.
- Environment note: the builder shell inherits pnpm `npm_config_*` vars from the afx harness, which makes `tests/toolchain.test.mjs` user-agent assertion fail under a bare `npm test`. Stripping `npm_*`/`pnpm_*`/`PNPM_*` env vars gives a clean run — 130/130 pass, `npm run build` green. This is environment noise (see lessons-critical), not a project failure.

## Implement phase_2 — worker visibility (2026-07-24)

- Phase 1 got unanimous APPROVE from the 3-way consultation; porch committed and advanced to phase_2.
- Added `workerDecisionFor(plan, baseEnv)` ({value, provenance}: operator override / lane default / config serial default) and an additive trailing `workers:` report line in `formatReport` — appended last so every pre-existing line keeps its position (existing tests index lines[0..6] and pass unmodified). Suite-running paths (success, build-failure, fallback) pass the decision; probe-only and skip-empty read `workers: n/a (no suite run)`. A `log()` line states the decision before the suite stage.
- 8 new unit tests (decision matrix + all five report call paths). 138/138 pass, build green, `--probe-only` output eyeballed on real hardware (RTX 3080 verified both engines).

## Implement phase_3 — docs + re-qualification evidence (2026-07-24)

- Phase 2 unanimous APPROVE; porch advanced to phase_3.
- README updated: "Local test parallelism" note, lane step 3, report snippet (new `workers:` line), env-table `E2E_WORKERS` row, #41-evidence paragraph, and "Status and sequencing" bullet — the lane is parallel-by-default (`50%`) on verified hardware, serial on fallback/global/CI. `codev/reviews/41-parallelize-local-e2e-runs.md` "Revisiting the serial default" got a dated spec-56 correction (lane-scoped default delivered; global stays serial). Lane header comment now notes the E2E_WORKERS consultation.
- FR8 qualification on the qualified host (20-core WSL2 + RTX 3080, Mesa d3d12), all `mode: hardware`, both engines verified, 22/22 pass each run:
  - serial baseline `E2E_WORKERS=1`: pass, wall-clock 212s (build 10s, suite 200s), `workers: 1 (operator override)`;
  - plain runs 1–3 (no E2E_WORKERS): pass, 54s/57s/59s (suite 43s/45s/47s), each `workers: 50% (lane default)`, 10 workers — 3/3 consecutive green, ~3.8× faster than serial.
  - Scenario 3 spot check: `E2E_WORKERS=banana` exits 1 with loud `WorkerConfigError`; report honestly shows `workers: banana (operator override)`.
  - Full logs preserved in the session scratchpad (`qual/*.log`) for the Review-phase evidence appendix.
- Scenario 5 diff audit clean: diff vs main touches only README, lane script, lane tests, #41 review, plan/status/thread — no frozen files (`validation.yml`, `e2e-workers.mjs`, `playwright.config.ts`, lockfile untouched).
- Final gate: in-worktree `npm run validate` failed only on 21 lint errors in the untracked builder-harness hook `.claude/hooks/worktree-write-guard.cjs` (the documented environment-noise case). Proved the gate per lessons-critical on a clean detached checkout (`git worktree add --detach HEAD` + working-tree files copied in + real `npm ci`): lint + typecheck + test:smoke all green, 22/22 passed serially — CLEAN_VALIDATE_EXIT=0.

## Verify phase (2026-07-24)

- PR #59 merged into main (regular merge, all CI checks green — quality + 4 serial Chromium shards, proving the lane default does not leak into CI). Merged main pulled into the worktree.
- Post-merge verification: plain `npm run test:e2e:gpu` from the integrated tree — `mode: hardware`, both engines verified, `suite: pass`, `workers: 50% (lane default)`, wall-clock 59s. Exit 0.
- Per architect: porch-state commits made after the merge will land via a small follow-up PR once porch reaches protocol complete.
