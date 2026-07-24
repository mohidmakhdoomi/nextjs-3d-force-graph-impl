#!/usr/bin/env bash
# Phase 5 (issue #55, FR6): re-run issue #41's GPU-lane PARALLEL qualification
# with the H1 fix now in place, to retire-or-re-point the "Known Firefox flake"
# opt-in-parallel caveat.
#
# Regime = exactly #41's GPU-lane opt-in-parallel path and Phase-2 Tier 3:
#     E2E_WORKERS=50% npm run test:e2e:gpu   (retries:0, native-GPU hardware lane)
# On the UNFIXED tree this reproduced :224 in 2 of 3 runs (Phase-2 T3, received
# 0.001966… / 0.002458…, digit-for-digit the issue's number). This job proves
# the fixed tree is GREEN 3/3 on the same regime. Each lane run self-documents
# renderer evidence (VERIFIED hardware lines + the E2E GPU LANE REPORT footer:
# renderer.chromium / renderer.firefox = D3D12 RTX 3080, mode: hardware). A
# --probe-only bracket before/after re-verifies the hardware renderer independent
# of the suite's privacy-sanitized value.
#
# retries:0 is the canonical local config (playwright.config.ts); CI is NOT set,
# so E2E_WORKERS=50% resolves to parallel workers (Phase-2 T3: "10 workers").
# The serial gate contract and DEFAULT_LOCAL_WORKERS are untouched (that is FR7).
set -u
set +e
cd "$(dirname "$0")/../../../.." || exit 3
D=codev/projects/55-firefox-e2e-flake-background-d/evidence
RUN="env -u npm_config_user_agent"
SUM="$D/phase5-summary.log"

sep() { printf '\n========== %s ==========\n' "$1" | tee -a "$SUM"; }

# Extract the firefox background-drag result + counts + renderer + mode from a lane log.
report_run() {  # report_run <logfile> <label> <rc>
    local logf="$1"; local label="$2"; local rc="$3"
    local ffline passed failed suite rchr rffx mode
    ffline=$(grep -E "\[firefox\].*background drag" "$logf" 2>/dev/null | grep -E "✓|✘|passed|failed" | head -1 | sed 's/^[[:space:]]*//')
    passed=$(grep -Eo "[0-9]+ passed" "$logf" | tail -1)
    failed=$(grep -Eo "[0-9]+ failed" "$logf" | tail -1)
    suite=$(grep -E "^suite:" "$logf" | tail -1)
    mode=$(grep -E "^mode:" "$logf" | tail -1)
    rchr=$(grep -E "^renderer.chromium:" "$logf" | tail -1)
    rffx=$(grep -E "^renderer.firefox:" "$logf" | tail -1)
    {
      echo "--- [$label] rc=$rc"
      echo "    result : ${passed:-?} ${failed:+/ $failed}"
      echo "    :ff-bg : ${ffline:-(no firefox background-drag line found)}"
      echo "    $suite | $mode"
      echo "    $rchr"
      echo "    $rffx"
    } | tee -a "$SUM"
}

echo "=== Phase 5 GPU-lane PARALLEL re-qualification (FR6) — E2E_WORKERS=50% x3, retries:0 ===" | tee "$SUM"

sep "PROBE BEFORE: native-GPU hardware renderer (lane --probe-only, both engines)"
$RUN npm run test:e2e:gpu -- --probe-only 2>&1 \
    | tee "$D/phase5-probe-before.log" \
    | grep -iE "renderer|verified|hardware|D3D12|RTX|verdict" || true

pass_count=0
for i in 1 2 3; do
    label="run$i"
    logf="$D/phase5-gpu-parallel-run$i.log"
    sep "RUN $i/3: E2E_WORKERS=50% npm run test:e2e:gpu (retries:0)"
    $RUN E2E_WORKERS=50% npm run test:e2e:gpu >"$logf" 2>&1
    rc=$?
    report_run "$logf" "$label" "$rc"
    if [ "$rc" -eq 0 ]; then pass_count=$((pass_count+1)); fi
done

sep "PROBE AFTER: native-GPU hardware renderer (lane --probe-only, both engines)"
$RUN npm run test:e2e:gpu -- --probe-only 2>&1 \
    | tee "$D/phase5-probe-after.log" \
    | grep -iE "renderer|verified|hardware|D3D12|RTX|verdict" || true

sep "PHASE 5 VERDICT"
echo "green runs: $pass_count / 3" | tee -a "$SUM"
if [ "$pass_count" -eq 3 ]; then
    echo "OUTCOME: GREEN 3/3 -> retire README opt-in-parallel caveat + append review-41 addendum" | tee -a "$SUM"
else
    echo "OUTCOME: NOT 3/3 ($pass_count green) -> honest disposition, re-point caveat (do NOT retire)" | tee -a "$SUM"
fi
echo "=== Phase 5 done ===" | tee -a "$SUM"
