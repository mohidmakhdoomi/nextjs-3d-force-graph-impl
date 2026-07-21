# Builder thread — aspir-44 (issue #44: opt-in native-GPU local e2e lane)

## Specify

- Spawned in ASPIR strict mode. Spec was pre-written and committed by the architect
  (`b3d50c3`, `codev/specs/44-add-an-opt-in-native-gpu-local.md`). Issue #44 has no
  Baked Decisions section; the spec's "Confirmed Decisions" already pin the
  architecture (wrapper-script lane over the existing `PW_CHROMIUM_ARGS` hook,
  Approach C).
- Verified the spec's factual premises against the tree: `PW_CHROMIUM_ARGS` hook is
  live in `playwright.config.ts` (default-inert, comment block explicitly reserves it
  for #44), `experiments/42_kaggle_gpu_ci/` evidence artifacts present, `scripts/`
  exists for the wrapper.
- Reviewed the spec per the specify prompt: complete against all issue acceptance
  criteria and constraints. No edits needed. Signaling `porch done 44` to trigger the
  3-way spec consultation.
