### Iteration 1 Reviews
- gemini: REQUEST_CHANGES — Targeted repetition on the native-GPU lane was skipped, reducing hardware qualification volume from ≥60 to 3.
- codex: REQUEST_CHANGES — Phase 4 has strong serial/GPU evidence, but it does not complete the planned Firefox targeted-repeat qualification on the native-GPU lane.
- claude: APPROVE — Phase 4 delivers a thorough, well-documented qualification: 66/66 green `:224` executions across both engines and both rendering paths at retries:0, with clean-checkout validate proof and verified hardware renderer evidence — all invariants preserved.

### Builder Response to Iteration 1
# Phase 4 — iteration 1 consultation rebuttals

3-way review of the phase_4 fix qualification.

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Claude | APPROVE | HIGH |
| Gemini | REQUEST_CHANGES | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Claude approved the qualification as thorough. Gemini and Codex raised the **same**
blocking gap — the ≥60 targeted Firefox `:224` repetition was run on the
SwiftShader path but **not** on the native-GPU (hardware) lane, dropping the
hardware `:224` volume to 3 (the full-suite GPU runs). **Accepted and addressed.**

## Gemini + Codex — targeted repeat missing on the native-GPU lane

> (Gemini) Targeted repetition on the native-GPU lane was skipped, reducing
> hardware qualification volume from ≥60 to 3.
> (Codex) Phase 4 … does not complete the planned Firefox targeted-repeat
> qualification on the native-GPU lane.

**Accepted.** The plan's FR5 wants the targeted ≥60 repeat on the SwiftShader path
**and** the native-GPU lane; I had only delivered the 3 full-suite GPU runs for
the hardware arm. Now delivered.

### What was run (`evidence/phase4b-gpu-targeted.sh`)

The `gpu-lane` wrapper rejects unknown Playwright arguments (`parseArgs` throws
`LaneUsageError`), so it cannot forward `-g`/`--repeat-each`. Rather than modify
the shared lane tool, the hardware targeted repeat runs the fixed test under the
lane's **own** Firefox hardware recipe, read verbatim from
`scripts/e2e-gpu-lane.mjs` `FIREFOX_PROBE_RECIPE`:

- `env: GALLIUM_DRIVER=d3d12`
- `envPrepend: LD_LIBRARY_PATH=/usr/lib/wsl/lib`
- committed `firefox` Playwright project pref `webgl.force-enabled=true`

Firefox privacy-sanitizes the suite's in-page renderer string, so — exactly as
the lane does internally (probe → suite) — hardware is proven by the lane's own
`--probe-only` run (with the ephemeral `webgl.sanitize-unmasked-renderer=false`),
executed **before and after** the 60 targeted executions to bracket them:

- **probe before**: `candidate wsl2-d3d12-firefox VERIFIED hardware renderer:
  "D3D12 (NVIDIA GeForce RTX 3080)"` (`phase4b-1-probe-before.log`)
- **targeted `[firefox] :224` × 60 on `GALLIUM_DRIVER=d3d12`: 60/60 passed**,
  `retries: 0` (`phase4b-2-ff224-gpu-x60.log`)
- **probe after**: `D3D12 (NVIDIA GeForce RTX 3080)` (`phase4b-3-probe-after.log`)

No lane code changed; `MOTION_FLOOR`, the canonical assertion, `retries: 0`, and
`.github/workflows/validation.yml` remain untouched.

### Updated qualification totals

Targeted `:224` ≥60 now green on **both** paths: **60/60 SwiftShader** +
**60/60 native-GPU hardware**. Combined `:224` executions this phase: 60 + 60 + 3
(serial-suite) + 3 (GPU-suite) = **126 green, 0 below floor**. `phase4-summary.md`
updated accordingly.


### Iteration 2 Reviews
- gemini: APPROVE — Phase 4 deliverables meet all plan requirements with thorough and well-documented evidence, completely addressing the gap in native-GPU lane repetition raised in Iteration 1.
- codex: REQUEST_CHANGES — Phase 4’s evidence is strong, but the checked-in qualification driver/docs still describe and execute the pre-rebuttal matrix, not the final FR5-qualified one.
- claude: APPROVE — Phase 4 delivers comprehensive qualification — 126/126 green `:224` executions across both engines and both rendering paths at retries:0, with the iteration 1 gap (native-GPU targeted repeat) now fully closed by 60/60 hardware-bracketed runs.

### Builder Response to Iteration 2
# Phase 4 — iteration 2 consultation rebuttals

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Gemini | APPROVE | HIGH |
| Claude | APPROVE | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Gemini and Claude approved: the iter-1 gap (native-GPU targeted repeat) is fully
closed by the 60/60 hardware-bracketed run. Codex raised two **documentation-
consistency** points — the checked-in driver/summary still described the
pre-rebuttal matrix. **Both accepted and fixed** (doc/comment-only; no test
re-execution — the committed evidence already reflects the final matrix).

## Codex #1 — driver describes/executes the pre-rebuttal matrix

> `evidence/phase4-qualify.sh:7-18` still says the hardware `:224` arm is covered
> only by the 3 full GPU-suite runs and does not run the added ≥60 native-GPU
> targeted repetition … the driver cannot reproduce it.

**Fixed.** `phase4-qualify.sh` now:
- header (Steps list + rationale) describes the FR5 matrix as targeted ≥60 on
  **both** paths — SwiftShader (step 1) and native-GPU hardware (**new step 5**);
  the stale "hardware arm = 3 full GPU runs" reasoning is removed.
- **new Step 5** invokes the companion `phase4b-gpu-targeted.sh`, so the single
  driver reproduces the **entire** final qualified matrix end to end.
- the SUMMARY now scans `phase4-*.log` **and** `phase4b-*.log` and reports the
  hardware-targeted probe renderers.

`bash -n` clean on both scripts; step-5 path resolves (`$D/phase4b-gpu-targeted.sh`).

## Codex #2 — summary points only at `phase4-*.log` / `phase4-qualify.sh`

> `evidence/phase4-summary.md:6-8` says "All runs" are in `phase4-*.log` and
> points to `phase4-qualify.sh`, but the final hardware targeted evidence lives
> in `phase4b-*` and is launched separately.

**Fixed.** The summary intro now cites `phase4-*.log` **and** `phase4b-*.log`, and
states that `phase4-qualify.sh` reproduces the full matrix end to end (steps 1–4
then step 5 → `phase4b-gpu-targeted.sh`). Audits/reruns are no longer misled.

No re-execution was needed: the qualification evidence (incl.
`phase4b-2-ff224-gpu-x60.log` = 60/60, probe-bracketed D3D12 RTX 3080) is already
committed and unchanged; these are doc/comment corrections so the driver and
summary match the real, final workflow.


### IMPORTANT: Stateful Review Context
This is NOT the first review iteration. Previous reviewers raised concerns and the builder has responded.
Before re-raising a previous concern:
1. Check if the builder has already addressed it in code
2. If the builder disputes a concern with evidence, verify the claim against actual project files before insisting
3. Do not re-raise concerns that have been explained as false positives with valid justification
4. Check package.json and config files for version numbers before flagging missing configuration
