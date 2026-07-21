# experiment-42 thread

Builder for **issue #42** — "Explore kaggle-action to speed up GitHub workflow runs with free Kaggle GPU compute". Soft-mode EXPERIMENT protocol.

## 2026-07-21 — Startup / orientation

- Confirmed the driving artifact: GitHub issue #42 (open, `enhancement`). experiment-42 ↔ #42.
- Architect note received: `KAGGLE_API_TOKEN` already exists in this repo's GitHub secrets; do not ask for credentials.
- Hypothesis (from issue): offloading the e2e suite (or a GPU-qualification arm) to a `Frederisk/kaggle-action` Kaggle GPU kernel could (a) give real hardware WebGL — killing the SwiftShader flake class at its source and unlocking #22-style native-GPU evidence, and (b) cut wall clock vs the current ~5–6m sharded software run.
- Hard constraints from the issue's acceptance criteria:
  - `npm run validate` and existing **required** gates stay intact during any trial.
  - Likely positioning: an *additional* non-required GPU-qualification lane, not a replacement for the reproducible SwiftShader gate (arch validation rule).
  - **Security review of the third-party action is mandatory**: our code + `KAGGLE_API_TOKEN` flow through it → pin by SHA, audit what it uploads/downloads. Audit BEFORE running with the real secret.
- Planned phases: Hypothesis → Design (incl. security audit of the action + feasibility of Node/Playwright/Chromium-on-GPU in a Python-first Kaggle kernel + Kaggle ToS/quota) → Execute (prototype or conclusively-failed run) → Analyze (adopt/defer/reject recommendation).
- Open risk to weigh before any live run: Kaggle ToS on using kernels as general CI GPU compute, and account-flagging risk (outward-facing / hard-to-reverse). Will surface to architect before burning a live run if the design reaches viability.

## 2026-07-21 — Design + security audit complete

**Artifacts committed** under `experiments/42_kaggle_gpu_ci/`: `notes.md` (main deliverable), `kaggle_webgl_probe.py` (Stage-1 make-or-break WebGL probe), `kaggle_e2e_runner.py` (Stage-2 reference, not wired), `kaggle-gpu-spike.yml` (SHA-pinned `workflow_dispatch`-only prototype, kept INERT outside `.github/workflows/` — zero blast radius on required CI).

**Security audit of `Frederisk/kaggle-action` (mandatory per #42):** pinned `@e6bafb6bf66da87116cca560a7636422213cf354` (= v2.0.0/HEAD, MIT, 9★). It's a **composite** action (pure pwsh, NO bundled dist blob → fully auditable). Token → `~/.kaggle/access_token` chmod 600, never echoed. Uploads **only the single `code_file`** we name (not the repo). Egress = PyPI + kaggle.com only; no exfil patterns. **Residual risk:** unpinned `pip install --upgrade kaggle` runs with the token on disk. Verdict: safe for a pinned, non-required spike.

**Feasibility (reasoned, high confidence) — multiple independent priors already point AWAY from adoption for the required gate:**
- Kaggle kernels are Python-first → must install Node 22.23.1 in-kernel ⇒ different toolchain/OS ⇒ **can only ever be an additive NON-REQUIRED lane** (reproducibility contract), never the required gate.
- Async **batch + queue + cold clone/npm ci/browser** every run ⇒ wall clock likely **worse** than the 5-6 min target.
- Reporting is **crude** (status string; action dumps kernel log only on *error*, discards on success) — regression vs Playwright blob/HTML + GH artifacts.
- **Kaggle ToS**: using free GPU as CI infra plausibly violates AUP (cf. Colab's explicit CI ban) → **account-suspension risk** (outward-facing, hard-to-reverse).

**The ONE open decider needs a live run:** does headless Chromium get **hardware** WebGL on Kaggle GPU (`UNMASKED_RENDERER_WEBGL` ∉ {SwiftShader,llvmpipe})? Strong prior = software fallback (display-less CUDA box; the action's own test only checks `nvidia-smi`, never WebGL). This flips DEFER↔narrow-ADOPT / DEFER↔REJECT.

**Why I did NOT self-trigger the live run:** (1) `workflow_dispatch` isn't dispatchable from a feature branch until the workflow is on `main` (default branch) → needs a merge or architect trigger; (2) outward-facing + real credential + ToS-ambiguous ⇒ architect's call. **Sent architect a go/no-go** (approve minimal probe? confirm token format access-token-vs-legacy-kaggle.json? accept one-off ToS risk?).

**Better alternative flagged in notes:** sibling issues **#41** (parallel local e2e) and **#44** (opt-in native-GPU local lane) chase the same native-GPU goal WITHOUT a third-party service/credential/ToS exposure — likely the superior path.

Preliminary disposition: **DEFER (leaning REJECT for required-CI framing)**, pending the single probe.
