# Experiment 42: kaggle-action for free Kaggle GPU CI compute

**Status**: In Progress — **BASELINE VERDICT IN (run #4): SOFTWARE.** On a verified account with **2× Tesla T4**, headless Chromium returned SwiftShader software WebGL for every flag set (`ANGLE (…SwiftShader driver)`) — the same class as our GPU‑less CI, zero hardware benefit. Root cause: the T4 is compute‑only; no NVIDIA GL/EGL/Vulkan **userspace** vendor driver (Mesa only). Running the architect‑directed **run #5 escalation** (apt‑install matching `libnvidia-gl-<branch>` + Vulkan ICD, retry EGL/ANGLE‑Vulkan) as the last hardware‑GL attempt; a failure there is equally conclusive → then finalize REJECT.

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
- [`kaggle_e2e_runner.py`](kaggle_e2e_runner.py) — Stage‑2 reference full‑suite runner (Node 22.23.1 via nvm → `npm ci` → build → full Chromium e2e with winning flags). **Reference only**, not wired in. Ships a fail‑fast guard for the Stage‑2 hard‑gate (below).

### Stage‑2 hard‑gate (recorded on PR #45, non‑blocking for the probe)

`playwright.config.ts` **hardcodes** the chromium launch args `--use-angle=swiftshader --enable-unsafe-swiftshader` (lines 12–17) and reads **no** external args env. Consequence: running the real suite via `playwright test` would force **software** WebGL *even on a Kaggle GPU box*, so `PW_CHROMIUM_ARGS` is a no‑op. **Any future Stage‑2 GPU run is therefore hard‑gated on first changing the config** to (a) drop the forced‑swiftshader args for that lane and (b) inject the winning hardware‑GL flags (e.g. read them from env in `launchOptions.args`). `kaggle_e2e_runner.py` refuses to run until that wiring exists. **Stage‑1 is unaffected** — the probe launches Chromium directly with its own args, not through this config, so its renderer reading is valid. (Also note the Python probe pins `playwright==1.61.0` — the same 1.61 Chromium line as the repo's JS `@playwright/test@1.61.1`; the Python package has no 1.61.1, per PR #47.)
- [`../../.github/workflows/kaggle-gpu-spike.yml`](../../.github/workflows/kaggle-gpu-spike.yml) — SHA‑pinned, `workflow_dispatch`‑**only** probe workflow. Architect‑approved for promotion into `.github/workflows/`; still non‑required and never auto‑runs (no `push`/`pull_request`/`schedule` trigger). Includes a **format‑agnostic credential sniff** (below) and an `install_nvidia_gl` input that selects the escalation script for run #5.
- [`kaggle_webgl_probe_nvgl.py`](kaggle_webgl_probe_nvgl.py) — run #5 **escalation** probe: reads the driver version, `apt install`s the matching `libnvidia-gl-<branch>` + NVIDIA Vulkan ICD, then retries the EGL/ANGLE‑Vulkan flag sets. Self‑contained so run #4's baseline script stays byte‑unchanged.

**GPU‑forcing techniques that do NOT apply here (record for #44):** `MESA_D3D12_DEFAULT_ADAPTER_NAME` / `GALLIUM_DRIVER=d3d12` is the **WSL2‑only** path (needs `/dev/dxg` + `libdxcore`, a Windows/WSL host); it is inapplicable in a Kaggle Linux container. That native‑GPU technique belongs to issue **#44**, not here.

### Credential‑format sniff (token shape unknown, write‑only secret)

`KAGGLE_API_TOKEN` is write‑only, so nobody can inspect it. The workflow detects its shape **without ever echoing the value**: a first step reads the secret from `env` (never interpolated into the script text) and, if it parses as JSON containing `username`/`key`, `::add-mask::`es those and routes to the action's `username`+`key` inputs; otherwise it passes the secret straight through as `api_token`. Only a non‑secret `mode` (`string`|`json`) leaves the step in the clear. On auth failure the action surfaces the kaggle‑CLI error (non‑secret) and we iterate (probe is ~2 min; retries are cheap — architect‑accepted).

## Environment & Reproduction

Workflow promoted to `.github/workflows/kaggle-gpu-spike.yml` (via the approved PR). To run the live Stage‑1 probe after merge to `main`:
```bash
gh workflow run kaggle-gpu-spike.yml -f machine_shape=NvidiaTeslaT4
gh run watch "$(gh run list --workflow=kaggle-gpu-spike.yml -L1 --json databaseId -q '.[0].databaseId')"
# On kernel SUCCESS the action discards the log — retrieve it directly:
#   kaggle kernels output <username>/nextjs3dfg-webgl-probe
```
**Dependencies:** `secrets.KAGGLE_API_TOKEN` (present, created 2026‑07‑21) and a phone‑verified Kaggle account with GPU+internet enabled. `ubuntu-latest` provides `pwsh` + `python3`. **Manual dispatch only — no recurring/scheduled runs** (ToS constraint, per decision record).

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

- **Live run couldn't be self‑served from the builder branch:** `workflow_dispatch` isn't dispatchable until the workflow is on the default branch → needed a merge to `main`. Plus the live trigger is outward‑facing + uses the real credential + ToS‑ambiguous, so it was correctly the architect's call. **Resolved:** architect approved; promoted via reviewed PR (`Refs #42`), then dispatch.
- **Token format unverifiable** (write‑only secret; won't read it) → handled by the format‑agnostic sniff rather than blocking.
- Multiple independent priors (ToS, wall clock, reporting, reproducibility) already point away from adoption *before* the probe — the probe mainly decides DEFER vs REJECT and whether a narrow non‑required lane is even worth prototyping further.

## Go/no‑go — RESOLVED (architect decision record, issue #42, 2026‑07‑21)

1. **Live Stage‑1 probe: GO.** Path: minimal PR adding only the `workflow_dispatch`‑only workflow (SHA‑pinned `e6bafb6`) → architect reviews → I merge → `gh workflow run`. Manual dispatch only.
2. **Token format: unknown & unverifiable (write‑only secret) → made the workflow format‑agnostic** (sniff JSON‑vs‑string without echoing; fail fast with a non‑secret diagnostic on auth failure and iterate).
3. **One‑off ToS/account risk: ACCEPTED** for a single short probe + a few manual auth/flag retries. **No recurring/scheduled runs.** Sustained‑CI‑use ToS exposure is recorded as an **adoption blocker**, not a probe blocker.

## Next Steps

1. **Immediate:** await go/no‑go. On go → run Stage‑1 probe, capture renderer log to `data/output/`, finalize disposition (hardware WebGL ⇒ evaluate a narrow non‑required lane in Stage 2; software ⇒ **REJECT** with evidence).
2. **Regardless of probe:** the ToS + wall‑clock + reporting findings already make this a poor fit for the *required* gate — recommend the required gate stays SwiftShader‑sharded.
3. **Alternative for the real underlying need** (native‑GPU evidence / #22, killing SwiftShader flakes): the sibling issues **#41 (parallel local e2e)** and **#44 (opt‑in native‑GPU local lane, WSL2 Mesa d3d12 / hardware WebGL)** target the same goal *without* a third‑party service, credential, or ToS exposure — likely the better path; note in the recommendation.

## References

- Issue #42; sibling issues #41, #44; flake class #33/#34; native‑GPU gap #22; sharding baseline #30/PR #32.
- `Frederisk/kaggle-action@e6bafb6…` — `action.yml`, `README.md`, `__tests__/check-gpu.py` (audited).
- `.github/workflows/validation.yml` — current required gate (quality + 4‑shard Chromium/SwiftShader e2e + gate).
- `codev/resources/arch-critical.md` — reproducibility contract & validation baseline (why a differing‑toolchain lane can't be required).
