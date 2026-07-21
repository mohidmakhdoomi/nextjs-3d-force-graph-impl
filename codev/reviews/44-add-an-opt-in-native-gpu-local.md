# Review 44: Add an Opt-In Native-GPU Local E2E Lane

## Metadata
- **ID**: review-2026-07-21-add-an-opt-in-native-gpu-local
- **Status**: complete
- **Specification**: [codev/specs/44-add-an-opt-in-native-gpu-local.md](../specs/44-add-an-opt-in-native-gpu-local.md)
- **Plan**: [codev/plans/44-add-an-opt-in-native-gpu-local.md](../plans/44-add-an-opt-in-native-gpu-local.md)

## Summary

Productized the PR #43 / experiment-42 hardware-WebGL evidence into
`npm run test:e2e:gpu` (`scripts/e2e-gpu-lane.mjs`): an opt-in lane that
probes the host, verifies `UNMASKED_RENDERER_WEBGL` through the repo's own
Playwright Chromium before trusting anything, runs the full Chromium e2e
suite on the verified hardware recipe, and falls back loudly to SwiftShader
when no adapter is usable. Headline results:

- **Hardware suite ≈ 97 s vs 594 s SwiftShader** (6.1× faster), 5/5
  full-suite passes at `retries: 0`, zero flakes, per-test spread ≤ 1 s.
- **Headless works** — the FR5 matrix showed the WSL2 Mesa d3d12 path needs
  no display (all 4 cells hardware), so the lane defaults to headless and
  runs on display-less WSL2 hosts; headed WSLg is one `--mode=headed` away.
- **Canonical gate provably untouched** — comment-only config diff, env-unset
  config-load equality, gate files absent from the diff, clean-checkout
  `npm run validate` exit 0.
- Delivered: wrapper (795 lines incl. docs-comments), 29 GPU-free unit tests
  riding the existing `npm test` glob, README section, this evidence record.
  `package.json` delta is one script line; no dependency/lockfile movement.

## Spec Compliance

- FR1 one-command lane ✓ (`test:e2e:gpu`; default-inert proven). FR2
  probe-and-select with data-driven candidates + `E2E_GPU_FORCE_FALLBACK` /
  `E2E_GPU_REQUIRE` ✓. FR3 deterministic lifecycle with mandatory deny-list
  verification ✓. FR4 full suite, workers 1, retries 0, nothing trimmed ✓.
  FR5 bounded matrix, conclusive positive, recorded below ✓. FR6 gate proof
  below ✓. FR7 committed tests GPU-free (unit suite passes with no
  GPU/browser/lane env) ✓. FR8 3+ consecutive qualified runs below ✓. FR9
  README ✓. FR10 greppable report ✓. FR11 per-candidate diagnostics with
  cause + remedy + transcript path ✓.
- Confirmed Decisions 1–10 honored; notably 7/8: no canonical wait retuned,
  no lane-only accommodation was even needed, `workers: 1` everywhere.

## Deviations from Plan

- None material. The only mid-flight additions came from CMAP feedback:
  probe-transcript log destination named up front, fallback env scrub made
  explicit (both were plan-review comments folded in before implementation),
  and the probe timeout-cleanup fix + injectability (impl-review catch).
- The review artifact was created in phase 3 rather than phase 4 — a
  phase-review correction (the plan's phase-3 deliverable required FR5
  evidence in this artifact, not the builder thread).

## Lessons Learned

- **Probe before designing around an assumed limitation.** "Hardware WebGL
  needs headed WSLg" was received wisdom from PR #43; a four-probe matrix
  falsified it in minutes and made the shipped tool strictly better
  (headless default, no display dependency).
- **Silent SwiftShader fallback is the central failure mode** of any GPU
  lane; the deny-list renderer probe before the suite plus the
  `E2E_GPU_REQUIRE=1` strict switch turned "we think it ran on hardware"
  into an asserted, logged fact on every run.
- **Dependency-injected side effects paid off immediately**: making the
  probe's launcher/timeouts/transcript-writer injectable let the
  orphaned-browser-on-timeout defect (a real CMAP catch) get deterministic
  regression tests instead of an untestable fix.
- **The evidence-accumulator review file should exist from the first
  evidence-producing phase** — creating it lazily cost one review iteration.
- Hardware timing did not break a single qualified SwiftShader wait — the
  risk table's top concern never materialized (the waits are floors/polls,
  not ceilings, so faster frames only tightened them).

## Technical Debt

- None added to the product. Lane-adjacent notes: the FR5 `--channel`
  new-headless knowledge is probe-only (the suite cannot switch channel
  through `PW_CHROMIUM_ARGS`); if a future need arises it requires its own
  env-gated, default-inert config surface with fresh inertness proof.

## Consultation Feedback

- Spec iter-1: Gemini/Claude APPROVE, Codex REQUEST_CHANGES ×4 (fallback
  determinism, fallback testability on GPU hosts, FR5 bounding, operator
  UX) — all accepted, spec amended (FR2 controls, FR3 lifecycle, FR5 matrix,
  FR11).
- Plan iter-1: Gemini/Claude APPROVE, Codex COMMENT ×2 (probe-log
  destination, fallback env scrub) — folded into the plan pre-implementation.
- Impl lane_wrapper_core: Codex caught the watchdog/late-launch browser leak
  (fixed + 3 focused tests); phase-scoped re-review 3× APPROVE.
- Impl full_lane_and_inertness_proof: 3× APPROVE.
- Impl headless_investigation: Codex process catch (evidence belongs in this
  artifact) — fixed; iter-2 passed.
- Impl qualification_evidence_and_docs: 3× APPROVE.

## Architecture Updates

Routed to the **cold** `codev/resources/arch.md` (reference detail; the hot
`arch-critical.md` cap and map are untouched — "`npm run validate` is the
green gate" already carries the invariant this lane must respect):

- **Validation Baseline** gained a paragraph recording the opt-in native-GPU
  lane: command, probe→verify→inject flow over the `PW_CHROMIUM_ARGS` hook,
  headless default, 6× measured speedup, fallback/strict env controls,
  never-the-gate status, and the #41 `workers: 1` sequencing.

## Lessons Learned Updates

Routed to the **cold** `codev/resources/lessons-learned.md` under the
existing **Validation Evidence** section (no new top-level section, so the
hot map in `lessons-critical.md` stays accurate; hot tier untouched):

- Renderer-probe-before-suite + strict-switch pattern for hardware evidence
  (silent SwiftShader fallback is the failure mode to design against).
- Probe capability claims before designing around their absence (the 4-cell
  matrix that falsified "needs headed WSLg").
- Capture-outside-the-race + bounded reap + DI for timeout-racing browser
  launches, so cleanup paths get deterministic tests.

All renderer strings below are verbatim.

## FR5 — Headless-vs-headed investigation (plan phase: headless_investigation)

**Question**: can headless Chromium + ANGLE reach hardware GL on this host
(WSL2, RTX 3080, Mesa d3d12), or is the proven headed-WSLg config required?

**Method**: the spec's bounded matrix — one FR3 renderer probe per cell, via
`node scripts/e2e-gpu-lane.mjs --probe-only --mode=headless
--candidate=<id> [--channel=chromium]`. At the pinned `@playwright/test`
1.61.1 the two headless modes ARE distinguishable and both binaries are
installed by `playwright install chromium`:
- default `headless: true` → **Chrome Headless Shell 149.0.7827.55**
  (`chromium_headless_shell-1228`);
- `channel: "chromium"` → **Chrome for Testing 149.0.7827.55** full binary in
  new-headless mode (`chromium-1228`).

**Result: conclusive POSITIVE — all 4 cells reach hardware** (2026-07-21,
this host; probe transcripts in `gpu-lane-logs/probe-*.log` per cell):

| Cell | Headless binary | ANGLE backend | UNMASKED_RENDERER_WEBGL (verbatim) |
|---|---|---|---|
| A | headless shell (default) | `--use-angle=gl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` |
| B | headless shell (default) | `--use-angle=gl-egl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL ES 3.1)` |
| C | new headless (`--channel=chromium`) | `--use-angle=gl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` |
| D | new headless (`--channel=chromium`) | `--use-angle=gl-egl` | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL ES 3.1)` |

The Mesa d3d12 path does **not** need a display: the matrix cells run with the
same recipe env (`GALLIUM_DRIVER=d3d12`, `LD_LIBRARY_PATH=/usr/lib/wsl/lib`)
and no WSLg window.

**Full-suite headless validation run** (before flipping the default):
`node scripts/e2e-gpu-lane.mjs --mode=headless` → **11/11 passed**, suite
97 s, total 108 s (build 10 s), renderer `ANGLE (Microsoft Corporation, D3D12
(NVIDIA GeForce RTX 3080), OpenGL 4.6)`, exit 0 — timing identical to the
headed run (97 s suite).

**Decision**: the lane default is **headless** (headless shell path — the
suite's own default headless, reachable with zero config surface). Headed
remains one flag away (`--mode=headed`, DISPLAY/WSLg prereq applies only
there) and is documented as the historically-proven alternative. The
`--channel=chromium` new-headless result is probe-only knowledge: the suite
cannot switch Playwright channel through `PW_CHROMIUM_ARGS`, and no config
surface was added for it (default-inert discipline; the wrapper refuses
`--channel` without `--probe-only` for exactly this honesty reason).

## FR6 — Canonical gate provably untouched (plan phase: full_lane_and_inertness_proof)

Collected 2026-07-21 on commit `d78194b` (unchanged since):

1. `git diff main -- playwright.config.ts` — **comment-only** (the
   `PW_CHROMIUM_ARGS` hook's OPT-IN paragraph now describes the shipped lane;
   every changed line is a `//` comment, no code token differs).
2. `.github/workflows/validation.yml`, `.nvmrc`, `package-lock.json` — absent
   from `git diff main --stat` entirely. `package.json`'s only delta is the
   added `"test:e2e:gpu"` script line.
3. Config-load check with all lane env unset (`node
   --experimental-strip-types`, real `playwright.config.ts`):
   - chromium `launchOptions.args` =
     `["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]` (exact)
   - projects `[chromium, firefox]`, `workers: 1`, `retries: 0` (non-CI),
     `timeout: 120000` (non-CI), reporter `[list, html]`, webServer command/
     `reuseExistingServer: false` unchanged.
   - Hook sanity: with `PW_CHROMIUM_ARGS="--use-gl=angle --use-angle=gl"` the
     resolved args are exactly the injected pair (the lane's injection point
     works; env unset ⇒ SwiftShader defaults).
4. PR CI green under SwiftShader — pending, recorded at the Review phase.

## FR8 — Repeat-run stability evidence (accumulating; completed in plan phase: qualification_evidence_and_docs)

Host: WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2), NVIDIA GeForce RTX
3080, Mesa d3d12 Gallium; Node 22.23.1 / npm 10.9.8; `workers: 1`,
`retries: 0` (config local defaults, untouched); full 11-test Chromium suite.

| Run | Date | Mode | Renderer (verbatim) | Result | Suite | Total |
|---|---|---|---|---|---|---|
| HW-1 (headed) | 2026-07-21 | hardware, headed WSLg | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` | 11/11 pass | 97 s | 108 s |
| HW-2 (headless validation) | 2026-07-21 | hardware, headless | `ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)` | 11/11 pass | 97 s | 108 s |
| FB-1 (forced fallback / baseline) | 2026-07-21 | software-fallback (`E2E_GPU_FORCE_FALLBACK=1`) | not probed — default SwiftShader args | 11/11 pass | 594 s | 604 s |

Baseline comparison: hardware suite 97 s vs contemporaneous SwiftShader
serial baseline 594 s ⇒ **6.1× faster** (historical context: bugfix-22's
chromium suite measured 9.7 m under SwiftShader). Zero flakes at
`retries: 0` in all hardware runs so far. The FB-1 run also qualifies the
fallback path (Scenario 2) on this host: loud banner at start and before the
report, `mode: software-fallback`, suite exit semantics preserved.

### Qualification runs (plan phase: qualification_evidence_and_docs)

Three **consecutive** full-suite lane runs, 2026-07-21, on the final shipped
configuration (headless default, `wsl2-d3d12-angle-gl` candidate), each under
`E2E_GPU_REQUIRE=1` so an unnoticed fallback was impossible. Retries policy:
`retries: 0` (config local default, untouched). Renderer, asserted and logged
identically in all three runs:
`ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`.

| Run | Result | Suite | Total | Lane exit |
|---|---|---|---|---|
| Q-1 | 11/11 pass | 94 s | 104 s (build 10 s) | 0 |
| Q-2 | 11/11 pass | 95 s | 105 s (build 9 s) | 0 |
| Q-3 | 11/11 pass | 95 s | 105 s (build 9 s) | 0 |

Per-test durations across Q-1/Q-2/Q-3 (all pass; seconds):

| Test | Q-1 | Q-2 | Q-3 |
|---|---|---|---|
| matrix: settles an initial force layout | 2.3 | 2.2 | 2.2 |
| matrix: rotates automatically until paused, then resumes | 7.7 | 7.6 | 7.7 |
| matrix: pointer inert until enable delay | 7.0 | 6.9 | 6.9 |
| matrix: zooms out with the wheel | 8.6 | 8.5 | 8.6 |
| matrix: zooms in + background-drag rotate | 13.3 | 13.7 | 13.9 |
| matrix: click-to-focus + reset | 17.6 | 17.7 | 17.4 |
| matrix: AxesHelper toggle | 3.6 | 4.6 | 4.5 |
| matrix: canvas consistent across resize | 4.3 | 4.0 | 4.0 |
| matrix: remounts fresh canvas on re-navigation | 2.9 | 2.9 | 2.9 |
| right-click-release: releases fx/fy/fz | 17.9 | 17.8 | 17.8 |
| smoke: renders graph + core controls | 7.0 | 6.9 | 6.9 |

**Findings**: no instability observed — per-test wall-clock spread across the
three runs is ≤ 1.0 s on every test; zero flakes at `retries: 0`; no
timing-incompatible test; no lane-only accommodation was needed and none was
added; canonical waits untouched (spec Decision 7 discipline had nothing to
absorb). Including the phase-2/3 runs, the lane is 5-for-5 full-suite
hardware passes (HW-1 headed, HW-2 headless, Q-1..Q-3 headless).

**FR8 verdict**: satisfied — 3+ consecutive hardware runs with asserted
renderer, per-test results, wall-clocks, and retries policy recorded, plus
the contemporaneous SwiftShader serial baseline (FB-1, 594 s suite) for the
6.1× comparison and the forced-fallback qualification of Scenario 2.

## Canonical gate proof on a clean checkout

The worktree's `npm run lint` is polluted by an untracked builder-harness
file (`.claude/hooks/worktree-write-guard.cjs` — 21 errors, absent from clean
checkouts), so per the hot lesson the gate was proven on a detached clean
worktree (`git worktree add --detach <dir> HEAD` + real `npm ci`, commit
`dab9e49`):

- **Run 1**: lint ✓, typecheck ✓, build ✓, e2e **21/22** — one failure:
  `[firefox] matrix.spec.ts:224 "zooms in with the wheel and rotates with a
  background drag"`, assertion "a background drag should rotate the camera"
  received azimuth delta `0.0038` (< floor 1) — the synthetic background drag
  did not register within the 5 s predicate window. Exit 1. Evidence
  preserved verbatim (see Flaky Tests below).
- **Run 2** (same clean worktree, no changes): lint ✓, typecheck ✓, build ✓,
  e2e **22/22**, `VALIDATE EXIT: 0`. Both engines green.

## Flaky Tests

- `[firefox] tests/e2e/matrix.spec.ts:224 "zooms in with the wheel and
  rotates with a background drag"` — failed once (1 of 2 clean-checkout
  validate runs; passed on the immediate re-run and in the same run's
  Chromium arm). **Pre-existing class, not introduced by this branch**: the
  branch contains zero `tests/e2e/**` or `app/**` changes
  (`git log main..HEAD -- tests/e2e/ app/` is empty), and the failure mode —
  a synthetic drag losing the race against slow software-rendered frames on
  the Firefox local arm — is the documented software-WebGL input-race family
  (issue #11 measured drags registering intermittently under software
  rendering; issue #33 documented the Firefox local-arm timing tail; this
  class is exactly what the hardware lane exists to sidestep, and this test
  passed in all 5 hardware/fallback Chromium lane runs). **Not skipped**: the
  spec (Decision 7/FR6) forbids modifying the canonical suite as part of this
  lane work; left for a dedicated follow-up if it recurs (tracking suggestion
  filed with the architect at PR time).

## Follow-up Items

- **#41 (local e2e parallelization)**: this lane removes the
  SwiftShader-contention rationale for `workers: 1` locally; #41 should
  qualify `workers > 1` **on this lane** using the FR8 methodology
  (`E2E_GPU_REQUIRE=1`, 3+ consecutive runs, per-test results) and cite this
  review's tables as the serial-hardware baseline (94–97 s suite).
- The Firefox background-drag flake (above): if it recurs on future local
  qualification runs, file a dedicated issue in the #33 family rather than
  retuning inside unrelated work.
- Recipe drift watch: the evidence is dated 2026-07 (Mesa 26.0.3, NVIDIA
  driver 581.29, Playwright 1.61.1/Chromium 149). The lane probes rather than
  assumes, so drift degrades to a loud fallback, not a wrong claim — but if
  fallback starts appearing on this host, re-run `--probe-only` per candidate
  and compare transcripts against this review.
