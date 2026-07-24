#!/usr/bin/env bash
# Phase 4 addendum (issue #55): the ≥60 targeted [firefox] :224 repetition on the
# NATIVE-GPU (hardware) lane that the phase-4 iter1 review (Gemini/Codex) asked
# for. The gpu-lane wrapper rejects unknown Playwright args, so this runs the
# fixed test under the lane's OWN firefox hardware recipe read straight from
# scripts/e2e-gpu-lane.mjs FIREFOX_PROBE_RECIPE:
#     env: GALLIUM_DRIVER=d3d12 ; envPrepend: LD_LIBRARY_PATH=/usr/lib/wsl/lib
#     committed `firefox` project pref: webgl.force-enabled=true
# Hardware is proven by the lane's own probe (webgl.sanitize-unmasked-renderer
# =false reads the raw renderer) BEFORE and AFTER the targeted run, bracketing
# the 60 executions with D3D12 (RTX 3080) verification. The suite itself reads a
# privacy-sanitized renderer, so the probe — not the suite — is the hardware
# evidence, exactly as the lane operates internally (probe -> suite).
set -u
cd "$(dirname "$0")/../../../.." || exit 3
D=codev/projects/55-firefox-e2e-flake-background-d/evidence
RUN="env -u npm_config_user_agent"
RECIPE_ENV="GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib:${LD_LIBRARY_PATH:-}"

sep() { printf '\n========== %s ==========\n' "$1"; }

sep "PROBE BEFORE: firefox hardware recipe (lane --probe-only)"
$RUN npm run test:e2e:gpu -- --engine=firefox --probe-only 2>&1 \
    | tee "$D/phase4b-1-probe-before.log" | grep -iE "renderer|verdict|hardware|verified|D3D12|RTX|firefox"

sep "TARGETED: [firefox] :224 x60 on the d3d12 hardware recipe (retries:0)"
env -u npm_config_user_agent GALLIUM_DRIVER=d3d12 \
    LD_LIBRARY_PATH="/usr/lib/wsl/lib:${LD_LIBRARY_PATH:-}" \
    npx playwright test tests/e2e/matrix.spec.ts -g "background drag" \
    --project=firefox --repeat-each=60 2>&1 | tee "$D/phase4b-2-ff224-gpu-x60.log"
s=${PIPESTATUS[0]}
echo "TARGETED exit=$s"

sep "PROBE AFTER: firefox hardware recipe (lane --probe-only)"
$RUN npm run test:e2e:gpu -- --engine=firefox --probe-only 2>&1 \
    | tee "$D/phase4b-3-probe-after.log" | grep -iE "renderer|verdict|hardware|verified|D3D12|RTX|firefox"

sep "PHASE 4b SUMMARY"
echo "targeted result: $(grep -oE '[0-9]+ (passed|failed)' "$D/phase4b-2-ff224-gpu-x60.log" | tail -1)"
echo "probe-before renderer: $(grep -oiE 'D3D12[^\"]*RTX 3080[^\")]*' "$D/phase4b-1-probe-before.log" | head -1)"
echo "probe-after  renderer: $(grep -oiE 'D3D12[^\"]*RTX 3080[^\")]*' "$D/phase4b-3-probe-after.log" | head -1)"
echo "TARGETED exit=$s"
