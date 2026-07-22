# Review 52: Add Firefox Hardware WebGL to the Native-GPU Local E2E Lane

## Metadata
- **Spec**: [codev/specs/52-firefox-hardware-webgl-gpu-lane.md](../specs/52-firefox-hardware-webgl-gpu-lane.md)
- **Plan**: [codev/plans/52-firefox-hardware-webgl-gpu-lane.md](../plans/52-firefox-hardware-webgl-gpu-lane.md)
- **Status**: draft (accumulating through the implement phases; FR8 evidence, flake
  disposition, and lessons completed in plan phase `qualification_evidence_and_docs`)
- **Follows**: [Review 44](./44-add-an-opt-in-native-gpu-local.md) (the Chromium-only lane this generalizes)

## Summary

Generalizes the opt-in native-GPU local e2e lane (`npm run test:e2e:gpu`,
`scripts/e2e-gpu-lane.mjs`) from Chromium-only to a two-engine Chromium+Firefox
lane. The engine dimension is expressed as **data** (the Chromium `CANDIDATES`
matrix + a single `FIREFOX_PROBE_RECIPE`) with per-engine launcher dispatch, not
scattered `if (engine === "firefox")` branches. The lane probes and independently
verifies a hardware renderer for each requested engine, then runs one combined
`E2E_ENGINES=chromium,firefox` Playwright suite (one build, one invocation,
`workers: 1`, `retries: 0`) and ends with a per-engine machine-greppable report.

The one genuinely new element is **Firefox renderer verification**: Firefox
privacy-sanitizes the unmasked renderer to `Generic Renderer`, so the raw
renderer is read through an ephemeral, probe-only preference
(`webgl.sanitize-unmasked-renderer: false`) that never touches the
application-suite Firefox profile. A sanitized string is classified
`unverifiable` (never hardware).

The lane is additional tooling, **never** the green gate: `npm run validate`,
`.github/workflows/validation.yml`, `test:smoke`, Playwright browser defaults,
`workers`, `retries`, and every committed test's timing/assertions are unchanged.
CI stays `E2E_ENGINES=chromium` SwiftShader-only.

## Firefox renderer sanitization — the load-bearing contrast

Collected 2026-07-21 on the qualification host (WSL2, NVIDIA GeForce RTX 3080,
Mesa d3d12). Same Firefox binary, same Mesa env, prefs the only difference:

| Firefox probe prefs | Raw `UNMASKED_RENDERER_WEBGL` | classifyRenderer |
|---|---|---|
| `webgl.force-enabled: true` only (sanitize left at Firefox default) | `Generic Renderer` | `unverifiable` |
| `+ webgl.sanitize-unmasked-renderer: false` (probe recipe) | `D3D12 (NVIDIA GeForce RTX 3080)` | `hardware` |

This is exactly why Chromium's deny-list alone is too weak for Firefox:
`Generic Renderer` matches no software marker, so without the explicit
`unverifiable` verdict it would **false-pass as hardware**. The probe-only pref
is what makes an honest Firefox hardware verdict possible.

## FR6 — Canonical gate provably untouched (plan phase: two_engine_suite_and_inertness)

Collected 2026-07-21 against `main`:

1. `git diff main -- playwright.config.ts` — **empty** (byte-identical to `main`;
   the Firefox arm needs no new config hook — Decision 9). The `firefox` project's
   committed prefs remain `webgl.force-enabled: true` only; the probe-only
   sanitize pref lives solely in the wrapper's `FIREFOX_PROBE_RECIPE`.
2. `.github/workflows/validation.yml`, `package.json`, `package-lock.json`,
   `.nvmrc` — absent from `git diff main --stat` entirely. No dependency,
   lockfile, or `validate`/`test:smoke`/`test:e2e:gpu` script delta. The only
   code files changed are `scripts/e2e-gpu-lane.mjs` and `tests/gpu-lane.test.mjs`.
3. Config-load with all lane env unset (`E2E_ENGINES`, `PW_CHROMIUM_ARGS`,
   `E2E_GPU_*` unset), via `npx playwright test --list`:
   - Projects resolved: `[chromium]` and `[firefox]` (both present).
   - 22 tests listed (11 per engine) — the default two-engine matrix is intact.
   - Because `playwright.config.ts` is byte-identical to `main` (item 1), every
     other default-behavior assertion (chromium SwiftShader args,
     `workers: 1`, `retries: 0` non-CI, timeout, reporter, webServer) holds by
     construction — there is no changed line to perturb them.
4. PR CI green under `E2E_ENGINES=chromium` SwiftShader — pending, recorded at the
   Review phase.

## Phase 2 verification — two-engine suite wiring, honest fallback, empty-set skip

Behavioral confirmation on the qualification host (2026-07-21), before the FR8
qualification set:

- **Two-engine hardware run** (`E2E_GPU_REQUIRE=1 npm run test:e2e:gpu`): both
  engines verified (`renderer.chromium: ANGLE (Microsoft Corporation, D3D12
  (NVIDIA GeForce RTX 3080), OpenGL 4.6)`, `renderer.firefox: D3D12 (NVIDIA
  GeForce RTX 3080)`); full 22-test suite in one Playwright invocation;
  `mode: hardware`, `suite: pass`, `wall-clock: 208s (build 10s, suite 196s)`,
  lane exit 0. (Recorded as HW-1 in the FR8 table below.)
- **Forced fallback** (`E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu`): loud
  SOFTWARE-FALLBACK banner at start and before the report; report shows
  `mode: software-fallback`, `renderer.chromium: (software-fallback —
  SwiftShader)`, `renderer.firefox: skipped (unverified — forced fallback,
  Firefox has no software equivalent)`. The suite ran `[chromium]` tests only
  (`E2E_ENGINES=chromium`; Firefox excluded, never an llvmpipe masquerade) —
  confirmed via the per-test `[chromium]` lines. A completed forced-fallback run
  is recorded as FB-1 below.
- **REQUIRE abort** (`E2E_GPU_REQUIRE=1`, a requested engine forced to miss via
  `--engine=chromium --candidate=native-linux-angle-gl`, skipped on WSL2): the
  lane logged `not every requested engine verified hardware (unverified:
  chromium); exiting non-zero before build/suite`, lane exit 1, no build/suite —
  Decision 5.
- **Empty-set skip / Scenario 7** (`E2E_GPU_FORCE_FALLBACK=1 npm run test:e2e:gpu
  -- --engine=firefox`): no Playwright invoked (no empty `E2E_ENGINES` crash),
  report `renderer.firefox: skipped (unverified — forced fallback, Firefox has no
  software equivalent)` + `suite: skipped (no verified engine)`, lane exit 0.

## FR8 — Firefox-inclusive repeat-run stability evidence (accumulating; completed in plan phase: qualification_evidence_and_docs)

Host: WSL2 (kernel 6.6.87.2-microsoft-standard-WSL2), NVIDIA GeForce RTX 3080,
Mesa d3d12 Gallium; Node 22.23.1 / npm 10.9.8; `workers: 1`, `retries: 0` (config
local defaults, untouched); full 22-test two-engine suite unless noted.

| Run | Date | Mode | renderer.chromium / renderer.firefox | Result | Suite | Total |
|---|---|---|---|---|---|---|
| HW-1 | 2026-07-21 | hardware (`E2E_GPU_REQUIRE=1`) | `ANGLE (… D3D12 (NVIDIA GeForce RTX 3080) …)` / `D3D12 (NVIDIA GeForce RTX 3080)` | 22/22 pass | 196 s | 208 s (build 10 s) |

_FB-1 (forced-fallback baseline) and the ≥3-consecutive two-engine qualification
set (with per-test durations and the Firefox background-drag flake disposition)
are completed in plan phase `qualification_evidence_and_docs`._

## Flaky Tests

_Disposition of the known `[firefox] tests/e2e/matrix.spec.ts:224` background-drag
synthetic-input flake is recorded in plan phase `qualification_evidence_and_docs`
(Decision 10: fix/qualify separately or explicitly accept+document; never masked
with retries, canonical assertion never weakened). No flake observed in HW-1._

## Consultation Feedback

- **Plan phase `engine_aware_core`** (impl consult, iteration 1): Gemini APPROVE,
  Codex APPROVE, Claude APPROVE — unanimous, KEY_ISSUES: None. Reviewers confirmed
  the four-verdict `classifyRenderer`, the expanded deny-list, the `unverifiable`
  safety catch, the FR11 sanitized-renderer diagnostic (probe-pref hint, not the
  Mesa hint), the engine-as-data model, probe isolation (the sanitize pref never
  in the committed config), and correct phase scoping (no Phase 2/3 work pulled
  forward).

## Follow-up Items

- **#41 (local e2e parallelization)**: may consume this two-engine lane and its
  FR8 evidence to qualify `workers > 1`; out of scope here (`workers: 1`
  everywhere).
- Recipe drift watch: the evidence is dated 2026-07 (Mesa d3d12, NVIDIA RTX 3080,
  WSL2); the recipe is documented as evidence-dated, not guaranteed across
  host/driver changes.

_This review is completed in plan phase `qualification_evidence_and_docs` (FR8
qualification set, flake disposition, lessons learned, and the clean-checkout
`npm run validate` proof)._
