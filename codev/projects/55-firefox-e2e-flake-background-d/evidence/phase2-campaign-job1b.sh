#!/usr/bin/env bash
# Phase 2 campaign — JOB 1b (Firefox-dominance comparison).
#
# Runs the drag diagnostic on BOTH engines, SERIAL (no contention, so any occHit
# reflects pure raycast geometry, not the separate Chromium SwiftShader
# parallel-contention artifact), on both rendering paths. The #55DATA record now
# carries cameraDistance (post-zoom, pre-drag), so the aggregation shows directly
# that Firefox's wheel(0,-240) zooms CLOSER than Chromium's (larger node
# projections at the fixed (150,450)) → a higher H1 occHit rate. This is the
# FR3 "Firefox dominance" evidence.
set -u
set +e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 1
EVID="codev/projects/55-firefox-e2e-flake-background-d/evidence"
DIAG="tests/diagnostics/55-drag/playwright.diag.config.ts"
GPU_ENV=(env GALLIUM_DRIVER=d3d12 "LD_LIBRARY_PATH=/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}")

echo "=== Phase 2 campaign JOB 1b starting $(date -u +%FT%TZ) ===" | tee "$EVID/phase2-job1b-summary.log"

run() {
    local label="$1"; shift
    local logf="$1"; shift
    echo "--- [$label] START $(date -u +%FT%TZ) ---" | tee -a "$EVID/phase2-job1b-summary.log"
    echo "CMD: $*" | tee "$EVID/$logf"
    "$@" >>"$EVID/$logf" 2>&1
    local rc=$?
    local repro; repro=$(grep -c "#55 REPRODUCED" "$EVID/$logf")
    local total; total=$(grep -c "#55DATA" "$EVID/$logf")
    echo "--- [$label] END rc=$rc reps=$total reproduced=$repro ---" | tee -a "$EVID/phase2-job1b-summary.log"
}

# F1 — SwiftShader, BOTH engines, serial. Chromium vs Firefox occHit + zoom depth.
run "F1-swift-both-serial" "phase2-F1-swift-both-serial.log" \
    env npx playwright test --config "$DIAG" --repeat-each=20

# F2 — GPU lane, BOTH engines, serial (hardware comparison).
run "F2-gpu-both-serial" "phase2-F2-gpu-both-serial.log" \
    "${GPU_ENV[@]}" npx playwright test --config "$DIAG" --repeat-each=12

echo "=== Phase 2 campaign JOB 1b done $(date -u +%FT%TZ) ===" | tee -a "$EVID/phase2-job1b-summary.log"
