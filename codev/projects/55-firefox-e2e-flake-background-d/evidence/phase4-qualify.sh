#!/usr/bin/env bash
# Phase 4 qualification (issue #55): prove the H1 background-drag fix under
# volume on both engines and both rendering paths at retries:0, recorded
# verbatim. The historical flake reproduced on the SwiftShader serial baseline
# AND the native-GPU parallel lane, so both paths are qualified here.
#
#   Step 1  targeted firefox :224 x60      (SwiftShader, serial, retries:0)
#   Step 2  clean-checkout validate        (git worktree + npm ci + validate —
#                                           lint+typecheck+full serial smoke #1)
#   Step 3  npm run test:smoke x2          (full two-engine serial smoke #2,#3)
#   Step 4  npm run test:e2e:gpu x3        (full two-engine native-GPU lane)
#   Step 5  phase4b-gpu-targeted.sh        (targeted firefox :224 x60 on the
#                                           native-GPU HARDWARE recipe)
#
# Step 1 GATES the rest (a below-floor drag means the fix is incomplete → stop,
# do not mask). Steps 2-5 accumulate into `overall`; the script EXITS NON-ZERO
# if ANY step fails, so it is a reliable gate, not a logger.
#
# The FR5 matrix qualifies the targeted >=60 :224 repetition on BOTH rendering
# paths: SwiftShader (step 1) and native-GPU hardware (step 5, via the lane's own
# firefox recipe in companion phase4b-gpu-targeted.sh, probe-bracketed). Step 2
# runs `npm run validate` on a CLEAN detached-HEAD worktree (real npm ci) — the
# lessons-critical clean-checkout proof: an in-worktree `eslint .` fails only on
# the UNTRACKED .claude/hooks/*.cjs builder-harness file (absent from clean
# checkouts), so the gate is proven green where that noise cannot intrude, not
# suppressed in committed config. This one driver reproduces the entire final
# qualified matrix end to end and enforces it.
set -u
cd "$(dirname "$0")/../../../.." || exit 3
D=codev/projects/55-firefox-e2e-flake-background-d/evidence
RUN="env -u npm_config_user_agent"
overall=0

sep() { printf '\n========== %s ==========\n' "$1"; }
track() { # $1=label $2=exit-code — record non-zero into `overall`
    echo "$1 exit=$2"
    if [ "$2" -ne 0 ]; then overall=1; fi
    return 0
}

sep "STEP 1: targeted [firefox] :224 x60 (SwiftShader serial, retries:0)"
$RUN npx playwright test tests/e2e/matrix.spec.ts -g "background drag" \
    --project=firefox --repeat-each=60 2>&1 | tee "$D/phase4-1-ff224-swift-x60.log"
s1=${PIPESTATUS[0]}
echo "STEP 1 exit=$s1"
if [ "$s1" -ne 0 ]; then
    echo "STEP 1 FAILED — fix incomplete; stopping qualification (do not mask)."
    exit 1
fi

sep "STEP 2: clean-checkout validate (worktree + npm ci + npm run validate)"
CLEAN="${TMPDIR:-/tmp}/phase4-clean-$$"
git worktree add --detach "$CLEAN" HEAD > "$D/phase4-5-clean-validate.log" 2>&1
{
    echo "### clean-checkout validate — lessons-critical clean-checkout proof"
    echo "worktree HEAD: $(git -C "$CLEAN" rev-parse --short HEAD)"
    echo "untracked hooks in clean tree: $(ls "$CLEAN/.claude/hooks" 2>&1 | head -1)"
    echo "### npm ci"
    ( cd "$CLEAN" && $RUN npm ci 2>&1 | tail -4 )
    echo "### npm run validate (lint + typecheck + test:smoke)"
    ( cd "$CLEAN" && $RUN npm run validate 2>&1 )
} >> "$D/phase4-5-clean-validate.log" 2>&1
v=$?
echo "### CLEAN VALIDATE EXIT: $v" >> "$D/phase4-5-clean-validate.log"
git worktree remove --force "$CLEAN" >> "$D/phase4-5-clean-validate.log" 2>&1 || true
track "STEP 2 (clean validate)" "$v"

sep "STEP 3: npm run test:smoke x2 (full two-engine serial SwiftShader #2,#3)"
for i in 2 3; do
    printf '\n--- smoke run %s ---\n' "$i"
    $RUN npm run test:smoke 2>&1 | tee "$D/phase4-3-smoke-run$i.log"
    track "smoke run $i" "${PIPESTATUS[0]}"
done

sep "STEP 4: npm run test:e2e:gpu x3 (full two-engine native-GPU lane, hardware)"
for i in 1 2 3; do
    printf '\n--- gpu run %s ---\n' "$i"
    $RUN npm run test:e2e:gpu 2>&1 | tee "$D/phase4-4-gpu-run$i.log"
    track "gpu run $i" "${PIPESTATUS[0]}"
done

sep "STEP 5: targeted [firefox] :224 x60 on the native-GPU HARDWARE recipe"
bash "$D/phase4b-gpu-targeted.sh"
track "STEP 5 (hardware targeted)" "$?"

sep "PHASE 4 SUMMARY"
for f in "$D"/phase4-*.log "$D"/phase4b-*.log; do
    printf '%-34s %s\n' "$(basename "$f"):" \
        "$(grep -oE '[0-9]+ (passed|failed|flaky)' "$f" | tail -3 | tr '\n' ' ')"
done
echo "renderer evidence (GPU lane + hardware targeted probes):"
grep -rhoE "renderer[^,]*(RTX|D3D12|NVIDIA|ANGLE|Generic Renderer|llvmpipe|SwiftShader)[^\"]*" \
    "$D"/phase4-4-gpu-run*.log "$D"/phase4b-*probe*.log 2>/dev/null | sort -u | head
echo "OVERALL exit=$overall (0 = all steps green)"
exit "$overall"
