# Phase 5 — #41 GPU-lane parallel re-qualification & caveat (issue #55, FR6)

Re-run issue #41's GPU-lane **parallel** qualification with the H1 fix in place,
then retire-or-re-point its "Known Firefox flake" opt-in-parallel caveat per the
outcome. The regime is **exactly** #41's opt-in-parallel path and this project's
Phase-2 Tier 3: `E2E_WORKERS=50% npm run test:e2e:gpu` at `retries: 0` on the
native-GPU hardware lane. On the **unfixed** tree this reproduced the flake in
**2 of 3** runs (Phase-2 T3 — received `0.001966…` / `0.002458…`, digit-for-digit
the issue's number). The driver `evidence/phase5-gpu-parallel-requal.sh` runs it
×3, brackets the set with lane `--probe-only` hardware verification, and prints a
green-count verdict.

## Result — GREEN 3/3

| Run | Regime | Workers | Result | `[firefox] :225` background drag | Log |
|---|---|---|---|---|---|
| 1/3 | `E2E_WORKERS=50%` GPU lane, `retries: 0` | **10** | **22/22 passed** | ✓ 19.0s | `phase5-gpu-parallel-run1.log` |
| 2/3 | `E2E_WORKERS=50%` GPU lane, `retries: 0` | **10** | **22/22 passed** | ✓ 18.3s | `phase5-gpu-parallel-run2.log` |
| 3/3 | `E2E_WORKERS=50%` GPU lane, `retries: 0` | **10** | **22/22 passed** | ✓ 18.8s | `phase5-gpu-parallel-run3.log` |

- All three runs banner `Running 22 tests using 10 workers` — genuine parallel
  (`E2E_WORKERS=50%` → 10 workers on this 20-core host), the historical
  highest-recurrence regime. **Zero failed, zero retries, zero flaky** across all
  three (`retries: 0` is untouched, so any recurrence would have surfaced).
- The `[firefox] matrix.spec.ts:225` background-drag test (the flake) is green
  every run, at a steady ~18–19 s — the same stability the fix produces serially.
- **Chromium green throughout** (no regression from the shared harness change).

## Renderer evidence — verified hardware (bracketed)

Lane `--probe-only` **before and after** the 3-run set verified both engines
reached the discrete GPU, and every run's own `E2E GPU LANE REPORT` footer
re-confirms it (`phase5-probe-before.log`, `phase5-probe-after.log`,
`phase5-gpu-parallel-run{1,2,3}.log`):

- `renderer.chromium: ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 3080), OpenGL 4.6)`
- `renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)`
- `mode: hardware`

This is the same hardware control arm on which the flake originally survived
(#44/#52) and on which #41's opt-in-parallel qualification hit its lone failure
(1 of 3). It is now **green 3/3** on the fixed tree.

## Disposition — retire the caveat (FR6)

Green 3/3 ⇒ the FR6 "on green 3/3" branch:

- **`README.md`** — the opt-in-parallel "Known Firefox flake" caveat is
  **retired** (rewritten to record the fix + this now-green re-qualification),
  citing #55.
- **`codev/reviews/41-parallelize-local-e2e-runs.md`** — a dated addendum under
  "Qualification Evidence" records the now-green opt-in re-run.

Scope guard: this phase touches **only** the opt-in-parallel caveat. It does
**not** change the serial default (`DEFAULT_LOCAL_WORKERS`) or the serial gate
contract — that necessary-but-not-sufficient distinction (the deterministic
Chromium SwiftShader parallel-contention blocker is untouched by this fix) is
FR7, handled in Phase 6. The residual `#33` reference-mentions elsewhere in the
README + `playwright.config.ts` + reviews/specs are corrected in Phase 6 (FR8).
