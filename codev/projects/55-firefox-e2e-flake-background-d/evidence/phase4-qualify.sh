#!/usr/bin/env bash
# Phase 4 qualification (issue #55): prove the H1 background-drag fix under
# volume on both engines and both rendering paths at retries:0, recorded
# verbatim. The historical flake reproduced on the SwiftShader serial baseline
# AND the native-GPU parallel lane, so both paths are qualified here.
#
#   Step 1  targeted firefox :224 x60      (SwiftShader, serial, retries:0)
#   Step 2  npm run validate               (lint+typecheck+full serial smoke #1)
#   Step 3  npm run test:smoke x2          (full two-engine serial smoke #2,#3)
#   Step 4  npm run test:e2e:gpu x3        (full two-engine native-GPU lane)
#   Step 5  phase4b-gpu-targeted.sh        (targeted firefox :224 x60 on the
#                                           native-GPU HARDWARE recipe)
#
# Step 1 GATES the rest: a single below-floor drag means the fix is incomplete
# (back to phase 2/3), so we stop rather than burn an hour on the full runs.
# The FR5 matrix qualifies the targeted ≥60 :224 repetition on BOTH rendering
# paths: SwiftShader (step 1) and the native-GPU hardware lane (step 5). The
# gpu-lane wrapper rejects unknown Playwright args, so step 5's targeted repeat
# runs under the lane's own firefox recipe (companion phase4b-gpu-targeted.sh),
# bracketed by lane --probe-only hardware verification; the 3 full GPU-suite runs
# (step 4) additionally exercise :224 on hardware. This one driver reproduces the
# entire final qualified matrix.
set -u
cd "$(dirname "$0")/../../../.." || exit 3
D=codev/projects/55-firefox-e2e-flake-background-d/evidence
RUN="env -u npm_config_user_agent"

sep() { printf '\n========== %s ==========\n' "$1"; }

sep "STEP 1: targeted [firefox] :224 x60 (SwiftShader serial, retries:0)"
$RUN npx playwright test tests/e2e/matrix.spec.ts -g "background drag" \
    --project=firefox --repeat-each=60 2>&1 | tee "$D/phase4-1-ff224-swift-x60.log"
s1=${PIPESTATUS[0]}
echo "STEP 1 exit=$s1"
if [ "$s1" -ne 0 ]; then
    echo "STEP 1 FAILED — fix incomplete; stopping qualification (do not mask)."
    exit 1
fi

sep "STEP 2: npm run validate (lint+typecheck+full serial SwiftShader smoke #1)"
$RUN npm run validate 2>&1 | tee "$D/phase4-2-validate.log"
echo "STEP 2 (validate) exit=${PIPESTATUS[0]}"

sep "STEP 3: npm run test:smoke x2 (full two-engine serial SwiftShader #2,#3)"
for i in 2 3; do
    printf '\n--- smoke run %s ---\n' "$i"
    $RUN npm run test:smoke 2>&1 | tee "$D/phase4-3-smoke-run$i.log"
    echo "smoke run $i exit=${PIPESTATUS[0]}"
done

sep "STEP 4: npm run test:e2e:gpu x3 (full two-engine native-GPU lane, hardware)"
for i in 1 2 3; do
    printf '\n--- gpu run %s ---\n' "$i"
    $RUN npm run test:e2e:gpu 2>&1 | tee "$D/phase4-4-gpu-run$i.log"
    echo "gpu run $i exit=${PIPESTATUS[0]}"
done

sep "STEP 5: targeted [firefox] :224 x60 on the native-GPU HARDWARE recipe"
bash "$D/phase4b-gpu-targeted.sh"
echo "STEP 5 exit=$?"

sep "PHASE 4 SUMMARY"
for f in "$D"/phase4-*.log "$D"/phase4b-*.log; do
    printf '%-34s %s\n' "$(basename "$f"):" \
        "$(grep -oE '[0-9]+ (passed|failed|flaky)' "$f" | tail -3 | tr '\n' ' ')"
done
echo "renderer evidence (GPU lane + hardware targeted probes):"
grep -rhoE "renderer[^,]*(RTX|D3D12|NVIDIA|ANGLE|Generic Renderer|llvmpipe|SwiftShader)[^\"]*" \
    "$D"/phase4-4-gpu-run*.log "$D"/phase4b-*probe*.log 2>/dev/null | sort -u | head
