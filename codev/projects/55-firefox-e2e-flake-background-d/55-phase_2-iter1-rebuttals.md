# Phase 2 — iteration 1 consultation rebuttals

3-way review of the phase_2 root-cause work (reproduction campaign + FR3
mechanism write-up).

| Reviewer | Verdict | Confidence |
| --- | --- | --- |
| Gemini | APPROVE | HIGH |
| Claude | APPROVE | HIGH |
| Codex | REQUEST_CHANGES | HIGH |

Gemini and Claude approved with no blocking issues (Claude's 3 notes —
cameraDistance added between jobs, Firefox "Generic Renderer" expected, status
still in_progress — are all correct and non-actionable). Codex raised two
blocking points; **both accepted and addressed**.

## Codex #1 — Reproduction campaign incomplete against the approved plan

> The plan requires targeted reps **plus** "≥ 3 instrumented full two-engine
> suite runs" and "≥ 3 `E2E_WORKERS`-parallel GPU-lane runs" … the implementation
> explicitly stops after the targeted tiers … update the plan first; otherwise
> Phase 2 is not yet complete.

**Accepted — ran the higher tiers** rather than amend the plan (Gemini and Claude
read the tier-1 stop as within the Decision-5 budget rules, but running the tiers
is unambiguous and adds real corroboration). Job 2
(`evidence/phase2-campaign-job2.sh`):

- **Tier 2 — 3× full two-engine SERIAL** (canonical config, SwiftShader gate
  env): 3/3 green, `[firefox] :224` ✓ each run (13.4-13.6 s), 22/22 per run.
- **Tier 3 — 3× `E2E_WORKERS=50%` parallel native-GPU lane** (RTX 3080):
  **2 of 3 reproduced the canonical `[firefox] :224` failure** on verified
  hardware, with the verbatim historical signature (`Received:
  0.001966449673699226` / `0.002458062429124783` vs the issue's reported
  `0.001966449662569139`; `mode: hardware`, `renderer.firefox: D3D12 (NVIDIA
  GeForce RTX 3080)`).

This is stronger than the original submission: the flake now reproduces in the
**unmodified canonical suite** (not just the diagnostic replica), on hardware, in
the exact #41 highest-recurrence regime — proving the diagnostic reproduction is
not a harness artifact. Write-up §2 updated with both tiers; §4 amplification
point refined (full-suite parallel contention raises the per-run rate, a second
effect beyond "more trials").

## Codex #2 — Write-up overstated the correlation as "airtight / perfect"

> the raw evidence includes at least one passing rep with `occHit=true`,
> `withinDisk=true`, `fixedAfter=0`, and a large successful drag delta … That
> discrepancy needs to be explained/corrected.

**Accepted — corrected** (write-up §3 and §5). The cited rep
(`phase2-A-swift-parallel.log`, stepped/firefox: `occHit=true, withinDisk=true,
nearestPx=2.59, fixedAfter=0, up=1, delta=3439`) is real: 17 probe-hits produced
16 captures. The correction distinguishes two correlations:

- **Ground truth, 1:1 exact:** `reproduced ⟺ node captured (fixedAfter=1) ⟺
  mid-drag controls.enabled=false`. No reproduction ever had `fixedAfter=0`; no
  capture ever left the camera free (16 ⟺ 16).
- **`occHit` probe = strong predictor, ~94% precision (17→16).** The one
  false-positive is a timing gap: `nodeOccupancyAtPoint` raycasts a few frames
  before the actual `mouse.down()`, and the still-micro-settling force layout can
  drift a node off (or onto) the exact pixel in between.

This is not merely a softened claim — it **constrains the Phase-3 fix**: a
background-verification probe must verify node-free with a **pixel margin** (and
ideally re-verify at gesture time), not a bare single-point test, precisely
because the layout drifts between measurement and gesture.

## Net

Both blocking points resolved with additional evidence and a corrected,
more-precise mechanism write-up. Re-submitting for iter-2 3-way review.
