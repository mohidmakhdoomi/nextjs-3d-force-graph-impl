#!/usr/bin/env bash
# Phase 2 campaign — JOB 2 (higher-cost tiers, per Codex phase_2 iter1 review).
#
# The plan lists three reproduction tiers "in increasing cost order"; Job 1
# reproduced decisively at the cheapest (targeted) tier, but the plan also lists
# the full-suite and parallel-GPU-lane tiers as deliverables. This job runs them
# on the (unfixed) tree as the historical realistic-conditions reproduction
# attempts, recorded verbatim whether or not :224 fails:
#   Tier 2: >=3 full two-engine SERIAL runs on the SwiftShader path (the gate
#           environment, canonical config, workers=1).
#   Tier 3: >=3 E2E_WORKERS-parallel runs on the native-GPU hardware lane
#           (the historical highest-recurrence regime; #41's "1 of 3").
# The canonical :224 test does not dump discriminators, so a reproduction here
# shows as the verbatim assertion failure ("a background drag should rotate the
# camera" / Received ~0.00X) — corroborating the Job-1 diagnostic dumps. Renderer
# evidence for the GPU-lane runs is emitted by the lane's own report.
set -u
set +e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 1
EVID="codev/projects/55-firefox-e2e-flake-background-d/evidence"
SUM="$EVID/phase2-job2-summary.log"

echo "=== Phase 2 campaign JOB 2 starting $(date -u +%FT%TZ) ===" | tee "$SUM"

# Grep the :224 firefox result line out of a canonical-suite log.
report224() {  # report224 <logfile> <label>
    local logf="$1"; local label="$2"
    local rc="$3"
    local line224
    line224=$(grep -E "matrix.spec.ts:224|background drag should rotate" "$logf" 2>/dev/null | head -3 | tr '\n' '|')
    local passed; passed=$(grep -Eo "[0-9]+ passed" "$logf" | tail -1)
    local failed; failed=$(grep -Eo "[0-9]+ failed" "$logf" | tail -1)
    echo "--- [$label] END rc=$rc | $passed ${failed:+/ $failed} | :224 -> ${line224:-(no :224 line found)}" | tee -a "$SUM"
}

# Build once (canonical serial tier reuses it; the GPU lane rebuilds itself).
echo "--- building once for the serial tier ---" | tee -a "$SUM"
npm run build >"$EVID/phase2-job2-build.log" 2>&1
echo "build rc=$? (see phase2-job2-build.log)" | tee -a "$SUM"

# Tier 2 — >=3 full two-engine SERIAL runs (canonical config, SwiftShader gate env).
for i in 1 2 3; do
    label="T2-full-serial-run$i"
    logf="$EVID/phase2-T2-full-serial-run$i.log"
    echo "--- [$label] START $(date -u +%FT%TZ) ---" | tee -a "$SUM"
    npx playwright test >"$logf" 2>&1
    report224 "$logf" "$label" "$?"
done

# Tier 3 — >=3 E2E_WORKERS-parallel native-GPU-lane runs (historical highest rate).
for i in 1 2 3; do
    label="T3-gpu-parallel-run$i"
    logf="$EVID/phase2-T3-gpu-parallel-run$i.log"
    echo "--- [$label] START $(date -u +%FT%TZ) ---" | tee -a "$SUM"
    env -u npm_config_user_agent E2E_WORKERS=50% npm run test:e2e:gpu >"$logf" 2>&1
    report224 "$logf" "$label" "$?"
done

echo "=== Phase 2 campaign JOB 2 done $(date -u +%FT%TZ) ===" | tee -a "$SUM"
