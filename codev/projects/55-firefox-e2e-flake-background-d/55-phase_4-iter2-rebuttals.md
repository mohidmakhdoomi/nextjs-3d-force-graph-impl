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
