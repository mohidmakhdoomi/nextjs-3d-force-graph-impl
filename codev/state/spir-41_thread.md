# spir-41 thread — Parallelize local e2e runs scaled to hardware

Strict-mode SPIR builder. Issue #41: local Playwright e2e gets hardware-scaled
parallel workers; CI (`validation.yml` 4-shard matrix, per-shard `workers: 1`)
stays byte-for-byte unchanged, guarded by `CI`→`workers: 1`.

## Specify phase

- Spec pre-existed (architect commit `10251b1`). Read it fully; it is
  comprehensive (8 confirmed decisions, 11 FRs, 6 acceptance scenarios).
- Verified its factual claims against the codebase — all accurate:
  - `playwright.config.ts`: `fullyParallel: true` (104), `workers: 1` (105),
    `retries: process.env.CI ? 2 : 0` (113), "Do NOT raise workers" comment
    block (~96-113).
  - `tests/automation.test.mjs`: source-text asserts `/workers: 1/` (90) and
    the retries regex (93) — these are the consumers that must migrate.
  - GPU lane present: `scripts/e2e-gpu-lane.mjs`, `tests/gpu-lane.test.mjs`;
    scripts `test:smoke`, `test:e2e:gpu`, `validate` all present.
- No factual corrections needed. Signaled specify build complete → porch ran
  the 3-way consultation (Gemini/Codex/Claude).
- Consult iter1 verdicts: **Gemini APPROVE**, **Claude APPROVE**, **Codex
  REQUEST_CHANGES**. Codex's material point was a real contradiction: FR1 /
  Scenario 1 / Summary stated the local parallel default *unconditionally*, but
  Decision 4 / Scenario 5 made it *evidence-gated* with a serial fallback.
- Fix: made Decision 4 the single canonical rule for the local default; FR1,
  Scenario 1, Summary now defer to it; clarified FR8's default-scaled assertion
  (≥1 Playwright floor; token-vs-integer form deferred to plan). Wrote rebuttal
  (`41-specify-iter1-rebuttals.md`). Committed as `a40a0c9` "[Spec 41]
  Specification with multi-agent review".
- `porch done` → advanced to **spec-approval GATE**. `porch gate 41` requested.
  **STOPPED — waiting for human approval.** Not calling `porch approve` (human
  only). Architect notified.
- **spec-approval APPROVED by architect.** Advanced to Plan phase.

## Plan phase

Recon before drafting (verified against code):
- `playwright.config.ts`: `workers: 1` (105), comment block (96-103), `retries:
  process.env.CI ? 2 : 0` (113), `E2E_ENGINES` fail-closed guard (68-85) — the
  model to mirror for `E2E_WORKERS`.
- Module format: `node --test tests/*.test.mjs` runs plain ESM (no TS). Helper
  must be `.mjs` (mirrors `scripts/e2e-gpu-lane.mjs` ⇐ `tests/gpu-lane.test.mjs`).
  tsconfig `include` covers `playwright.config.ts`; `checkJs` off ⇒ importing the
  `.mjs` adds no typecheck errors (JSDoc for clean inferred signature).
- GPU lane (`suiteEnvFor`) never sets workers ⇒ inherits config default; FR7 = no
  lane code change, just verify + doc.
- No new `package.json` script (`E2E_WORKERS` is an env var) ⇒ automation.test
  script-list assertion stays green. `npm test` runs in CI `quality` job ⇒ new
  helper unit test is CI-gated.
- automation.test.mjs consumer to migrate: line 90 `/workers: 1/` (retries
  assertion 93 stays — retries unchanged).
- README FR11 spots: 70-72 (scripts), 178 (lane "same workers: 1"), 284-285
  ("#41 sequenced after"), 222-228 (env table → add E2E_WORKERS).
- **Risk flagged for implement**: builder is WSL2; GPU lane (`E2E_GPU_REQUIRE=1`)
  may not verify hardware here. Plan carries the Decision-4 evidence-gated
  branch: GPU-lane primary; if unavailable, SwiftShader-parallel qualifies the
  `validate` default; if unstable ⇒ serial default + opt-in parallel, documented.

Planned phases: (1) pure helper + unit tests; (2) wire into config + migrate
consumer + comment; (3) qualify parallel, finalize default, document.

- Plan drafted, checks pass (plan_exists/has_phases_json/min_two_phases=3),
  committed `e063feb` "[Spec 41] Initial implementation plan".
- Plan 3-way consult: **Gemini APPROVE**, **Claude APPROVE**, **Codex COMMENT**.
  Codex's point (legit): `playwright test --list` proves the config loads but
  does NOT print the resolved worker count. Fixed Phase 2 to assert Playwright's
  "using M worker(s)" run banner under default(M>1)/CI=1(M=1)/E2E_WORKERS=4(M=4);
  `--list` kept only as the .mjs-import load check. Committed `2b78e93` "[Spec 41]
  Plan with multi-agent review". Both APPROVE reviewers independently verified
  file refs + confirmed GPU lane never sets workers (FR7 no-code-change holds).
- `porch next` → passing consensus (no rebuttal). `porch gate 41` → **plan-approval
  GATE**. **STOPPED — waiting for human approval.** Architect notified.

## Implement phase — Phase 1 (pure worker-resolution helper + tests)

- plan-approval GATE **APPROVED by architect** (mid-turn). `porch next` → advanced
  to implement/phase_1.
- Scope: ONLY phase_1 — new `scripts/e2e-workers.mjs` (pure `resolveWorkers(env)`,
  `DEFAULT_LOCAL_WORKERS='50%'`, `WorkerConfigError`) + `tests/e2e-workers.test.mjs`
  (full FR8 matrix). Mirror `scripts/e2e-gpu-lane.mjs` conventions (LaneUsageError
  class pattern, 4-space, double-quote, JSDoc, pure/no-I/O exports).
- Contract confirmed vs spec FR2/FR8 + plan: CI truthy⇒number 1 (first, matches
  config's `process.env.CI ? …` idiom); E2E_WORKERS undefined/empty⇒default;
  `/^[1-9][0-9]*%$/`⇒string; `/^[1-9][0-9]*$/`⇒Number; else throw
  WorkerConfigError; default⇒'50%'. Leading-zero/1e2/1.5/%/12x/0/0%/-1 all throw
  (locked with explicit negative test rows per plan risk).

- Built `scripts/e2e-workers.mjs` (pure `resolveWorkers`, `DEFAULT_LOCAL_WORKERS`,
  `WorkerConfigError`, JSDoc) + `tests/e2e-workers.test.mjs` (24 tests: full FR8
  matrix + 13 negative rows locking leading-zero/1e2/1.5/%/hex/whitespace-pct).
- Checks GREEN: `node --test` 24/24; full `npm test` 121/121; `npm run typecheck`
  clean; `npm run build` clean; `npx eslint` on the two NEW files clean.
- KNOWN NOISE: `npm run lint` (`eslint .`) reports 21 errors, ALL in the untracked
  builder-harness file `.claude/hooks/worktree-write-guard.cjs` (git `?? .claude/hooks/`),
  absent from clean checkouts. Per lessons-critical: environment noise, NOT suppressed
  in committed config; full-gate clean-checkout proof deferred to PR (Phase 3).
- Staged the 2 deliverables (explicit add, no -A) so the 3-way consult diff sees them.
  Signaling `porch done 41` → triggers Gemini/Codex/Claude review of phase_1.

## Phase 2 — wire helper into config, migrate consumer, update comment

- phase_1 APPROVED unanimously (Gemini/Codex/Claude, HIGH, zero issues) → porch
  committed (a104583) and advanced to phase_2.
- Edits: `playwright.config.ts` — added `import {resolveWorkers} from
  "./scripts/e2e-workers.mjs"`; replaced `workers: 1` → `workers:
  resolveWorkers(process.env)`; rewrote the ~96-103 comment block to the new
  contract (CI hard-pinned 1 via guard-returns-first; local '50%' default /
  E2E_WORKERS override; retries:0 preserved; qualification rationale). "Do NOT
  raise workers" text removed.
- `tests/automation.test.mjs` — migrated line-90 assertion `/workers: 1/` →
  `/workers: resolveWorkers\(process\.env\)/` (delegation, not re-testing the FR8
  matrix — that lives in e2e-workers.test.mjs); updated adjacent comment.
  fullyParallel + retries assertions untouched.
- ACCEPTANCE PROOFS (real run banners, 20-core host, chromium arm = 11 tests):
  - default (no CI/no override) ⇒ `Running 11 tests using 10 workers` (50%→10, M>1)
  - `CI=1` ⇒ `Running 11 tests using 1 worker` (M=1, guard)
  - `E2E_WORKERS=4` ⇒ `Running 11 tests using 4 workers` (M=4)
  - `E2E_WORKERS=50%` ⇒ `Running 11 tests using 10 workers` (hardware-relative)
  - `E2E_WORKERS=abc` ⇒ loud `WorkerConfigError` at config LOAD, exit 1, NO run
  - `E2E_ENGINES=chromium --list` loads config (novel .mjs-from-.ts import path OK)
  (banner capture via `timeout … | grep -m1`; cleaned orphaned webServer/workers
   after; port 3000 free, 0 stray procs.)
- Checks GREEN: typecheck (mjs import resolves), npm test 121/121, build clean,
  validation.yml NOT in `git diff` (CI byte-for-byte unchanged). Staging config +
  automation test; signaling `porch done 41` → 3-way review of phase_2.

- Phase 2 iter1 consult: **Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES**
  (all HIGH). Codex point (legit, ACCEPTED): config comment said parallel default
  "is qualified by…" — present-tense/complete, but qualification is Phase 3's job.
  Reworded to "is being qualified by … that evidence, not this wiring, decides
  whether it remains the default or reverts to serial." Comment-only; workers line
  untouched ⇒ automation assertion still matches; npm test 121/121, typecheck clean.
  Wrote 41-phase_2-iter1-rebuttals.md. Signaling `porch done 41` for re-verification.

- Phase 2 iter2 consult: **UNANIMOUS APPROVE** (Gemini/Codex/Claude, HIGH). Codex
  verified the comment fix applied. Advancing porch → should commit phase_2 and
  move to phase_3 (qualify parallel default, finalize, document).

## Phase 3 — qualify parallel, finalize default, document

- Phase 2 UNANIMOUS APPROVE → committed (e93855f) → advanced to phase_3.
- Step A: probe the native-GPU lane to pick the qualification path (GPU-hardware
  primary vs SwiftShader-validate contingency). This is WSL2 — hardware may not verify.

- **GPU lane VERIFIES HARDWARE** on this builder: NVIDIA RTX 3080 via WSL2 d3d12
  (Chromium: "ANGLE (…D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)"; Firefox:
  "D3D12 (NVIDIA GeForce RTX 3080)"). Primary contention-free path AVAILABLE
  (Decision 3, best case) — no contingency needed.
- FR7 CONFIRMED: GPU lane run banner = `Running 22 tests using 10 workers` — the
  lane inherits the scaled parallel default with NO code change to e2e-gpu-lane.mjs.
- **GPU parallel run 1/3: PASS** — 22/22 (both engines) under 10 workers, retries:0.
  Report: mode=hardware, suite=pass, wall-clock 57s (build 10s, suite 46s). The
  pre-existing Firefox flake matrix.spec.ts:224 PASSED (19.0s). ~4x faster than the
  ~196s serial two-engine baseline.
- Batched GPU runs 2, 3 + serial baseline (E2E_WORKERS=1) in background.

### Qualification evidence — parallel is NOT green as a retries:0 default

GPU HARDWARE (RTX 3080, contention-free WebGL), retries:0:
- parallel run1 (10w): 22/22 PASS, suite 46s
- parallel run2 (10w): 22/22 PASS, suite 45s
- parallel run3 (10w): **1 FAILED**, 21 passed, suite 48s
  - FAIL = `[firefox] matrix.spec.ts:224 "zooms in … rotates with a background
    drag"`: "a background drag should rotate the camera" — motion 0.00196 < floor 1
    (Timeout 5000ms on predicate). This is the KNOWN OPEN flake **#33** (Firefox
    synthetic-input-delivery nondeterminism; README already documents it "survives
    on hardware"). Issue #41 explicitly warned parallel contention may amplify #33.
- serial baseline (1w): 22/22 PASS, suite 196s (3.2m).

READ: parallel amplified the known #33 flake to 1/3 even on contention-free
hardware. A retries:0 LOCAL GATE cannot be intermittently red. Per spec Decision 4
(canonical rule, evidence-gated) + acceptance criterion 2 ("or the parallel path is
clearly separated from the qualified serial gate with the trade-off documented"),
the evidence points to the **serial-default + opt-in-parallel** branch (Scenario 5),
NOT the parallel-default branch. Decisive confirmation pending: SwiftShader parallel
(the actual `validate` gate path) ×3 — expected to be worse (CPU contention). Running.
NOT masking with retries; NOT weakening the assertion.

### Phase 3 finalized — serial default + opt-in parallel (ARCHITECT ENDORSED)

SwiftShader parallel (the actual `validate` gate path), 10 workers, retries:0:
- run1: 4 failed / 18 passed (3.2m); run2: 4 failed / 18 passed (3.3m);
  run3: 5 failed / 17 passed (3.3m). ALL failures = Chromium timing-sensitive
  matrix.spec (:194 wheel-zoom-out, :224 drag-rotate, :527 remount, smoke:78
  core-controls; :134 pointer-inert 1/3) — the exact class the old "Do NOT raise
  workers" comment named. NO speedup (~3.3m vs 196s serial). Parallel-default =
  broken gate. Conclusive.

Architect ENDORSED serial-default + opt-in-parallel (Decision 4 / Scenario 5 /
criterion 2b). Guardrails all honored:
- DEFAULT_LOCAL_WORKERS flipped '50%' → 1 (serial) in scripts/e2e-workers.mjs
  (+ header/JSDoc rationale). Opt-in via E2E_WORKERS (int+%) intact; invalid still
  loud WorkerConfigError; CI→1 guard intact.
- Unit tests updated (default⇒1, empty/whitespace⇒1, empty-CI⇒1); 24/24 pass.
- Config comment (FR10) rewritten to the finalized contract.
- README (FR11): new "Local test parallelism" note (serial default, E2E_WORKERS
  int+% opt-in, CI workers:1, retries:0 preserved, trade-off + ~4x GPU-lane); lane
  "same workers:1" line, timing para, #33 note, env table (+E2E_WORKERS row), and
  "#41 sequenced after" status note all updated. Full suite 121/121, typecheck clean.
- FR7 CONFIRMED (GPU lane inherits workers, banner `22 tests using 10 workers`,
  ZERO lane code change).
- CI-untouched: `git diff main` shows validation.yml UNCHANGED (zero-diff). No app
  code / no lockfile delta.
- Review written: codev/reviews/41-parallelize-local-e2e-runs.md with VERBATIM
  evidence (both SwiftShader 4-5/22 AND GPU ~4x + #33 1/3) + FR8-vs-Decision-4
  deviation + #33 disposition (accept+document, not masked).
- Confirming serial-default gate green end-to-end via `npm run test:smoke` (running;
  banner already shows `22 tests using 1 worker`). Clean-checkout full `npm run
  validate` proof deferred to pre-PR (after phase_3 commit) per lessons-critical
  (local `eslint .` noise is the untracked .claude/hooks/ harness file only).

### Honesty corrections after serial-default confirmation run

- Serial-default `npm run test:smoke` (banner `22 tests using 1 worker`): 21 passed,
  **1 FAILED** = the SAME known flake **#33** (`[firefox] matrix.spec.ts:224`, motion
  0.0038 < floor 1), real exit 1. Two corrections:
  1. **#33 flakes even SERIALLY** at retries:0 — it's a pre-existing OPEN flake
     (like #34), NOT introduced by #41 and not purely parallelism. #41 preserves the
     serial gate (status quo) → NO regression; parallel AMPLIFIES #33 (hence opt-in).
  2. **"No speedup" was WRONG** — I'd compared parallel-SwiftShader (3.3m) to serial-
     HARDWARE (196s). Correct baseline: serial-SwiftShader = **11.7m**. So parallel-
     SwiftShader is ~3.5x FASTER but breaks 4-5/22 timing tests. The disqualifier is
     DESTABILIZATION, not slowness. Corrected in review, config comment, helper
     header+const, and README (all "no speedup" claims removed/reframed).
- Re-verified: unit 24/24, suite 121/121, typecheck clean, helper lint clean, no
  lingering "no speedup" text anywhere.

- Phase 3 iter1 consult: **Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES**
  (all HIGH). Both Codex points ACCEPTED (consistency residue from the honesty
  correction): (1) review acceptance bullet still said "no SwiftShader speedup" →
  fixed to "faster but breaks the gate"; (2) helper inline comment still said
  "Scaled default" → fixed to "Serial default". Broad speedup-audit now clean.
  Wrote 41-phase_3-iter1-rebuttals.md. Signaling porch done → re-verification.

- Phase 3 iter2 consult: **Gemini APPROVE, Claude APPROVE, Codex REQUEST_CHANGES**
  (HIGH). Both Codex points ACCEPTED: (1) FR9 wanted full per-test pass/fail →
  appended "Appendix — Per-test results (verbatim, FR9)" to the review with all
  8×22 ✓/✘ verdicts (3 GPU parallel + GPU serial + 3 SwiftShader parallel +
  SwiftShader serial default); (2) automation.test.mjs comment "local runs scale to
  hardware" stale → fixed to serial-default + E2E_WORKERS opt-in. suite 121/121,
  lint clean. Wrote 41-phase_3-iter2-rebuttals.md. Signaling porch done.
