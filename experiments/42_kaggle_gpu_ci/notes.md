# Experiment 42: kaggle-action for free Kaggle GPU CI compute

**Status**: In Progress — **design + security audit complete; live Stage‑1 probe gated on architect go/no‑go.**
**Preliminary disposition (pre‑probe)**: leaning **DEFER / REJECT for the required‑CI framing**; at most a *non‑required, ToS‑risky GPU‑qualification lane* whose sole benefit (real hardware WebGL) is still **unproven** and rides entirely on the Stage‑1 probe.

**Date**: 2026-07-21

Driving issue: [#42 — Explore kaggle-action to speed up GitHub workflow runs with free Kaggle GPU compute](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/42). Tracked under #6. Related: #30/#32 (sharding baseline), #33/#34 (SwiftShader flake class), #22 (native‑GPU evidence gap), #41/#44 (native‑GPU local lanes).
Protocol: EXPERIMENT (soft mode). A documented **defer/reject with evidence is a valid successful outcome.**

---

## Goal

**Question (from #42):** Can offloading our Playwright e2e suite (or a GPU‑qualification arm of it) to a `Frederisk/kaggle-action` Kaggle GPU kernel (a) give **real hardware WebGL** — eliminating the SwiftShader flake class at its source and unlocking #22‑style native‑GPU evidence as a repeatable CI artifact — and (b) **cut wall clock** vs the current ~5–6 min sharded software run, safely (secret + third‑party action) and within Kaggle's terms?

**Hypothesis (falsifiable):** A Kaggle GPU kernel can run our exact stack (Node 22.23.1, `npm ci`, Next build, Playwright + Chromium) *and* give headless Chromium a hardware WebGL renderer (`UNMASKED_RENDERER_WEBGL` ∉ {SwiftShader, llvmpipe}), end‑to‑end faster and at least as reliably as the current sharded CI, without compromising `KAGGLE_API_TOKEN` or the required gate.

**Decision criteria (defined upfront):**

- **ADOPT (as an additional non‑required lane)** — only if *all* hold: (1) Stage‑1 probe shows a hardware WebGL renderer under a reproducible flag set; (2) the full suite runs green on Kaggle GPU with **no test dropped and no timing trimmed**; (3) end‑to‑end wall clock (incl. queue+boot+clone+`npm ci`+browser+build) is **competitive with ~5–6 min**; (4) the third‑party action passes security review and is pinned by SHA; (5) reporting lands as a usable PR signal; (6) it stays **additive** — the required SwiftShader gate and `npm run validate` are untouched. Kaggle's ToS must permit this use.
- **DEFER** — if the approach is technically plausible but one criterion is unmet/unproven within the timebox (e.g. hardware WebGL works but wall clock is worse, or ToS is ambiguous), with the single blocker + unblock condition recorded.
- **REJECT** — if a foundational premise fails: no hardware WebGL (probe falsified), or Kaggle ToS forbids CI use, or the async batch model makes it structurally slower/less reliable with no path to fix.

**Stop conditions (honored):** the required Chromium/SwiftShader gate and `npm run validate` are **not** modified; the prototype workflow is `workflow_dispatch`‑only and lives outside `.github/workflows/` until deliberately promoted; **no test is dropped or timing trimmed** to manufacture a Kaggle pass; the secret is never echoed; the third‑party action is pinned by commit SHA; no `--force`/quota‑abuse workarounds.

---

## Effort

**Approximate time spent**: ~3 hours (issue+CI reading, full source audit of the action, Kaggle‑kernel feasibility analysis, staged prototype design + artifacts). Live‑run wall clock TBD (gated).

---

## Approach

**Staged, probe‑first** — spend the cheapest possible evidence on the make‑or‑break question before uploading/running anything heavy:

1. **Stage 1 — WebGL probe** (`kaggle_webgl_probe.py`): a ~2‑minute kernel that installs a headless Chromium and reads `UNMASKED_RENDERER_WEBGL` under six candidate GL flag sets. The **entire** value proposition is "real hardware WebGL"; if this returns SwiftShader/llvmpipe (as it does on GPU‑less GitHub runners), the hypothesis is falsified and we never run the full suite on Kaggle.
2. **Stage 2 — full e2e trial** (`kaggle_e2e_runner.py`, reference only): *only if* Stage 1 passes — clone at a ref, install exact Node, `npm ci`, build, run the full Chromium suite with the winning flags, measure wall clock. Deliberately **not** wired into the workflow.

This mirrors the protocol's "keep scope minimal for quick iteration" and minimizes token/quota/ToS exposure.

---

## Security audit of `Frederisk/kaggle-action` (mandatory per #42)

**Pinned target:** `Frederisk/kaggle-action@e6bafb6bf66da87116cca560a7636422213cf354` (= tag `v2.0.0`/`v2`, the current HEAD; MIT; 9★; last pushed 2026‑05‑28). Audited at that SHA on 2026‑07‑21.

**Shape:** a **composite** action — pure PowerShell (`pwsh`) steps in `action.yml`, **no bundled/minified `dist/index.js` blob**. Fully readable; nothing opaque executes. This is a materially better audit surface than a typical JS action.

**What it actually does, step by step:**

| Step | Behavior | Assessment |
|---|---|---|
| Install CLI | `python -m pip install --upgrade kaggle` | ⚠️ **unpinned** install runs with the token about to be on disk — supply‑chain risk on the official kaggle CLI + transitive deps. Only residual concern of note. |
| Setup token | Writes `api_token` → `~/.kaggle/access_token` (`chmod 600`); OR `username`+`key` → `~/.kaggle/kaggle.json`. **Token is never echoed.** | ✅ Standard Kaggle auth; least‑exposure file perms. |
| Resolve slug | Slugifies `title` (python `slugify`, regex fallback). | ✅ Benign. |
| Setup test | `kaggle kernels init`; builds `kernel-metadata.json`; sets `code_file = $GITHUB_WORKSPACE/<code_file>`; `kaggle kernels push`. | ✅ **Uploads only the single `code_file` we name** — not the repo. We control exactly what leaves. Kernel `is_private=true` by default. |
| Check status | Polls `kaggle kernels status`; on `error`/`cancel` runs `kaggle kernels output` and prints the log; on `complete` prints SUCCESS. | ✅ No external egress beyond kaggle.com. ⚠️ **On success the kernel log is discarded** (reporting gap, below). |

**Egress:** PyPI (`pip install kaggle`) and kaggle.com only. **No** curl to third‑party hosts, no `env` dump, no base64‑of‑secret, no write to `$GITHUB_OUTPUT`/artifacts of anything sensitive. The token's blast radius is: the GitHub runner env (standard, secret‑masked) + whatever the kaggle CLI does (auth to kaggle.com) + the unpinned‑CLI supply‑chain window.

**Verdict:** **acceptable for a controlled spike** if (1) pinned by SHA (done), (2) `workflow_dispatch`‑only and non‑required (done), (3) we accept the unpinned‑kaggle‑CLI risk for the duration (could be hardened by pinning `kaggle==<v>` via a fork/patch, out of scope for the spike). Requires `pwsh` on the runner — present on `ubuntu-latest`.

**Open integration unknown (not a vuln):** the `api_token` path writes the secret to `~/.kaggle/access_token` (newer Kaggle token format). If `KAGGLE_API_TOKEN` actually contains legacy `kaggle.json` (`{"username","key"}`), the `api_token` input is the wrong slot and auth will fail — the `username`+`key` inputs would be needed instead. **I did not and will not read the secret to check.** Flagged to the token creator (architect).

---

## Feasibility analysis — the issue's checklist

- [x] **Can a Kaggle kernel run our stack at all?** *Plausible but heavy & non‑reproducible.* Kaggle kernels are **Python‑first**; the base image's Node is not our pinned `22.23.1`, so the kernel must install Node itself (nvm) and `npm ci` against the committed lockfile. Because that runs under a **different base OS/toolchain** than the required gate, this can only ever be an **additional non‑required lane**, never a replacement (arch‑critical reproducibility contract). The README's own "Known Issues" confirm the kernel is a **container, not a real VM** (`cpuset`/cgroup limits; `service docker start` fails) — Playwright's `install --with-deps` (apt) may be fragile. The kernel does **not** get our repo automatically; the script must `git clone` it (fine — repo is public). Every run is **cold**: fresh clone + `npm ci` + browser download, no cross‑run cache.
- [ ] **Does headless Chromium actually get hardware GL?** **UNKNOWN — this is the make‑or‑break, and it needs the live Stage‑1 probe.** Strong prior for *failure*: Kaggle GPU is a **display‑less, CUDA‑focused** NVIDIA box; hardware WebGL headless needs EGL/ANGLE + NVIDIA GL/EGL vendor libs that CUDA‑only images often lack, and Chromium silently falls back to SwiftShader. Notably, **the action's own GPU test only runs `nvidia-smi -L`** — it never verifies WebGL — so there is *no precedent* that browsers get the GPU there. The probe tries 6 flag sets (egl / angle‑gl‑egl / angle‑vulkan / desktop‑gl / …) to settle this empirically.
- [ ] **End‑to‑end wall clock vs ~5–6 min?** **Likely WORSE.** The action is **async batch**: `push` → poll `status`. Inherent costs stack on every run: kernel **queue** latency (seconds→many minutes, load‑dependent), image provisioning, then cold clone+`npm ci`+browser+build *before* a single test runs. Even if GPU execution of the tests is faster, the fixed queue/cold‑start tax plausibly dominates a 5–6 min target. Measurable only in Stage 2.
- [ ] **Reliability / quota / timeouts?** Free tier ≈ **30 GPU‑h/week**, phone‑verified account required, internet must be explicitly enabled. Queue variability is unbounded and outside our control; a required check that depends on Kaggle's scheduler would be a new flake/availability source — the opposite of the goal. Weekly quota caps run frequency.
- [ ] **Reporting back as a PR check?** **Crude.** The action maps kernel `status` → job success/failure by string match, and — critically — **prints the kernel log to the Actions console only on `error`** (discards it on `complete`). Rich artifacts (Playwright traces/HTML report, which test failed) require a separate `kaggle kernels output <slug>` retrieval. This is a clear regression from today's Playwright blob→merged‑HTML + GitHub artifacts. (Our scripts exit non‑zero on failure precisely so the log surfaces.)
- [x] **Security review of the third‑party action.** Done above — auditable composite action, pinned by SHA, token least‑exposed, uploads only the named script. Residual: unpinned kaggle CLI.
- [x] **Positioning.** Confirmed **additive non‑required GPU‑qualification lane only.** It cannot be the required gate: different toolchain/OS (reproducibility contract), Kaggle‑scheduler availability dependency, and ToS risk. `npm run validate` + the SwiftShader gate stay the reproducible baseline.

### Non‑technical blocker: Kaggle Terms of Service

Repurposing free Kaggle Notebook/kernel GPU as a **general‑purpose CI compute farm** for an unrelated web app's browser tests is outside Kaggle's intended data‑science/education use and plausibly violates its Acceptable Use — the same reason Colab explicitly forbids "remote control, chained execution, and CI." The action *markets* "simple CI," but that doesn't make the usage ToS‑compliant. **Risk: the user's Kaggle account could be flagged/suspended** — an outward‑facing, hard‑to‑reverse consequence. This weighs toward REJECT for any *sustained* CI use, independent of the technical result, and is the primary reason the live trigger is a go/no‑go for the architect rather than something I run unilaterally.

---

## Prototype artifacts (this directory)

- [`kaggle_webgl_probe.py`](kaggle_webgl_probe.py) — Stage‑1 make‑or‑break WebGL renderer probe (6 GL flag sets; exits non‑zero unless hardware GL confirmed, so the log surfaces).
- [`kaggle_e2e_runner.py`](kaggle_e2e_runner.py) — Stage‑2 reference full‑suite runner (Node 22.23.1 via nvm → `npm ci` → build → full Chromium e2e with winning flags). **Reference only**, not wired in.
- [`kaggle-gpu-spike.yml`](kaggle-gpu-spike.yml) — SHA‑pinned, `workflow_dispatch`‑only prototype workflow, kept **inert** outside `.github/workflows/` so it cannot touch required CI. Includes promotion instructions.

## Environment & Reproduction

The prototype is **not installed**. To run the live Stage‑1 probe (after go/no‑go):
```bash
# 1. Promote the inert workflow to the default branch (workflow_dispatch is not
#    dispatchable from a feature branch until it exists on the default branch):
cp experiments/42_kaggle_gpu_ci/kaggle-gpu-spike.yml .github/workflows/
#    ...commit, open PR, merge to main.
# 2. Trigger + watch:
gh workflow run kaggle-gpu-spike.yml -f machine_shape=NvidiaTeslaT4
gh run watch "$(gh run list --workflow=kaggle-gpu-spike.yml -L1 --json databaseId -q '.[0].databaseId')"
# 3. On success, the log is discarded by the action — retrieve it directly:
#    kaggle kernels output <username>/nextjs3dfg-webgl-probe
```
**Dependencies:** the workflow needs `secrets.KAGGLE_API_TOKEN` (present, created 2026‑07‑21) and a phone‑verified Kaggle account with GPU+internet enabled. `ubuntu-latest` provides `pwsh`.

---

## Results

### Determined WITHOUT a live run (high confidence)

1. **Security:** the action is auditable (composite, no blob), token least‑exposed, uploads only the named script, egress limited to PyPI+kaggle.com. Safe to pin & spike. Residual: unpinned kaggle CLI.
2. **Positioning:** can only be an *additive non‑required* lane (toolchain/OS differs from the reproducible gate). Required gate + `npm run validate` stay intact.
3. **Wall‑clock prior:** async **batch + queue + cold start** structurally works against the "faster than 5–6 min" goal.
4. **Reliability prior:** a required check gated on Kaggle's scheduler adds an availability/flake source; 30 GPU‑h/week caps frequency.
5. **Reporting:** crude (status string; log only surfaced on error) — a regression from Playwright blob/HTML + GH artifacts.
6. **ToS:** using Kaggle GPU as CI infra is plausibly against Kaggle's terms; account‑suspension risk. Primary REJECT pressure for sustained use.

### Requires the live Stage‑1 probe (the one open decider)

7. **Hardware WebGL on Kaggle GPU** — does `UNMASKED_RENDERER_WEBGL` come back as NVIDIA/Tesla (hardware) or SwiftShader/llvmpipe (software)? Strong prior for software fallback; the probe settles it empirically. **This is the only question whose answer could flip the disposition from DEFER→(narrow)ADOPT.**

### Metrics

| Question | Status | Finding |
|---|---|---|
| Action security | ✅ closed | Auditable composite; pin SHA `e6bafb6…`; residual = unpinned kaggle CLI |
| Runs our stack | ✅ reasoned | Plausible but cold/heavy; Node installed in‑kernel ⇒ non‑reproducible ⇒ non‑required only |
| Hardware WebGL | ⏳ **needs probe** | Unknown; strong prior = SwiftShader fallback (action never tests WebGL) |
| Wall clock vs 5–6 min | ⚠️ reasoned | Likely worse (queue + cold start tax) |
| Reliability/quota | ⚠️ reasoned | Scheduler‑dependent availability; 30 GPU‑h/week |
| Reporting | ⚠️ reasoned | Crude; log only on error; artifacts need separate retrieval |
| Kaggle ToS | ⚠️ finding | Plausibly disallows CI use; account‑suspension risk |

### Output Files

- `data/output/` — will hold the probe's `nvidia-smi`/renderer log once the live Stage‑1 run executes (gated).

## What Worked

- Composite action = fully auditable; SHA pin is clean (tag `v2.0.0` == HEAD).
- Probe‑first staging isolates the single make‑or‑break question at ~2 min of Kaggle time.
- Keeping the prototype workflow inert (outside `.github/workflows/`, `workflow_dispatch`‑only) guarantees zero blast radius on the required gate.

## What Didn't Work / Obstacles

- **Can't self‑serve the live run:** `workflow_dispatch` isn't dispatchable from a feature branch until the workflow is on the default branch → a live probe needs a merge to `main` (or the architect to trigger it). I won't push a Kaggle‑touching workflow to `main` or spend the user's credential against an external service under ToS ambiguity without an explicit nod.
- **Token format unverifiable** without reading the secret (won't).
- Multiple independent priors (ToS, wall clock, reporting, reproducibility) already point away from adoption *before* the probe — the probe mainly decides DEFER vs REJECT and whether a narrow non‑required lane is even worth prototyping further.

## Go/no‑go (for the architect)

Sent to architect. The decision is theirs because it is outward‑facing + uses the real credential + is ToS‑ambiguous:
1. **Approve the live Stage‑1 probe?** (minimal ~2 min private kernel; how: I merge the inert workflow to `main` via PR, or you trigger it.)
2. **Confirm `KAGGLE_API_TOKEN` format** (new access‑token string vs legacy `kaggle.json`) — determines `api_token` vs `username`+`key` inputs.
3. **Accept the Kaggle‑ToS/account‑suspension risk** for a one‑off probe? (Sustained CI use is a separate, higher‑risk decision.)

## Next Steps

1. **Immediate:** await go/no‑go. On go → run Stage‑1 probe, capture renderer log to `data/output/`, finalize disposition (hardware WebGL ⇒ evaluate a narrow non‑required lane in Stage 2; software ⇒ **REJECT** with evidence).
2. **Regardless of probe:** the ToS + wall‑clock + reporting findings already make this a poor fit for the *required* gate — recommend the required gate stays SwiftShader‑sharded.
3. **Alternative for the real underlying need** (native‑GPU evidence / #22, killing SwiftShader flakes): the sibling issues **#41 (parallel local e2e)** and **#44 (opt‑in native‑GPU local lane, WSL2 Mesa d3d12 / hardware WebGL)** target the same goal *without* a third‑party service, credential, or ToS exposure — likely the better path; note in the recommendation.

## References

- Issue #42; sibling issues #41, #44; flake class #33/#34; native‑GPU gap #22; sharding baseline #30/PR #32.
- `Frederisk/kaggle-action@e6bafb6…` — `action.yml`, `README.md`, `__tests__/check-gpu.py` (audited).
- `.github/workflows/validation.yml` — current required gate (quality + 4‑shard Chromium/SwiftShader e2e + gate).
- `codev/resources/arch-critical.md` — reproducibility contract & validation baseline (why a differing‑toolchain lane can't be required).
