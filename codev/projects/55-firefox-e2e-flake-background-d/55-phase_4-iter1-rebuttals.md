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
