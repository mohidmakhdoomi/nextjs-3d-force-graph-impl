#!/usr/bin/env bash
# Phase 2 reproduction campaign — JOB 1 (diagnostic segments).
#
# Runs the issue-#55 out-of-tree drag diagnostic (which DUMPS discriminators on
# a below-floor drag AND emits a `#55DATA {json}` record on EVERY rep) across
# both rendering paths, serial and parallel-contended, Firefox-focused (the
# flake's engine). Every rep doubles as (a) a reproduction attempt and (b) a
# Decision-5 statistical H1 occupancy sample. All output is teed verbatim to the
# evidence dir; a Playwright non-zero exit (a reproduced failure) must NOT abort
# the campaign, so `set +e` and per-segment exit-code capture.
#
# GPU-lane arm = the verified WSL2 Mesa d3d12 hardware recipe (RTX 3080),
# bracketed by --probe-only reports for renderer evidence. SwiftShader arm =
# the canonical serial-gate default (no GPU env), the flake's software path.
set -u
set +e

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 1
EVID="codev/projects/55-firefox-e2e-flake-background-d/evidence"
DIAG="tests/diagnostics/55-drag/playwright.diag.config.ts"
GPU_ENV=(env GALLIUM_DRIVER=d3d12 "LD_LIBRARY_PATH=/usr/lib/wsl/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}")

echo "=== Phase 2 campaign JOB 1 starting $(date -u +%FT%TZ) ===" | tee "$EVID/phase2-job1-summary.log"

run() {  # run <label> <logfile> <command...>
    local label="$1"; shift
    local logf="$1"; shift
    echo "--- [$label] START $(date -u +%FT%TZ) ---" | tee -a "$EVID/phase2-job1-summary.log"
    echo "CMD: $*" | tee "$EVID/$logf"
    "$@" >>"$EVID/$logf" 2>&1
    local rc=$?
    local repro; repro=$(grep -c "#55 REPRODUCED" "$EVID/$logf")
    local total; total=$(grep -c "#55DATA" "$EVID/$logf")
    echo "--- [$label] END rc=$rc reps=$total reproduced=$repro ---" | tee -a "$EVID/phase2-job1-summary.log"
}

# Renderer-evidence bracket (pre).
run "probe-pre" "phase2-probe-pre.log" \
    env -u npm_config_user_agent npm run test:e2e:gpu -- --probe-only

# A — SwiftShader, Firefox, PARALLEL contention (repro + occupancy).
run "A-swift-parallel" "phase2-A-swift-parallel.log" \
    env E2E_ENGINES=firefox E2E_WORKERS=50% \
    npx playwright test --config "$DIAG" --repeat-each=25

# D — GPU lane, Firefox, PARALLEL contention (highest-recurrence isolated arm).
run "D-gpu-parallel" "phase2-D-gpu-parallel.log" \
    "${GPU_ENV[@]}" E2E_ENGINES=firefox E2E_WORKERS=50% \
    npx playwright test --config "$DIAG" --repeat-each=25

# B — SwiftShader, Firefox, SERIAL (repeat-alone baseline + occupancy).
run "B-swift-serial" "phase2-B-swift-serial.log" \
    env E2E_ENGINES=firefox \
    npx playwright test --config "$DIAG" --repeat-each=15

# E — GPU lane, Firefox, SERIAL (hardware occupancy baseline).
run "E-gpu-serial" "phase2-E-gpu-serial.log" \
    "${GPU_ENV[@]}" E2E_ENGINES=firefox \
    npx playwright test --config "$DIAG" --repeat-each=15

# Renderer-evidence bracket (post).
run "probe-post" "phase2-probe-post.log" \
    env -u npm_config_user_agent npm run test:e2e:gpu -- --probe-only

echo "=== Phase 2 campaign JOB 1 done $(date -u +%FT%TZ) ===" | tee -a "$EVID/phase2-job1-summary.log"
