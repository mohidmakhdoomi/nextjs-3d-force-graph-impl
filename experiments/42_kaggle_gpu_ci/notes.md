# Experiment 42: kaggle-action for free Kaggle GPU CI compute

**Status**: **Complete — Disposition: REJECT for CI adoption** (documented capability retained). Five live runs. The make‑or‑break question is **answered POSITIVELY but with a heavy asterisk**: hardware WebGL on a Kaggle T4 **is achievable** (run #5: `ANGLE (NVIDIA … Tesla T4)`, proven with `--disable-software-rasterizer`) — but *only* after installing the exact‑version NVIDIA userspace via a ~hundreds‑of‑MB runfile on every cold kernel, using the ANGLE‑**Vulkan** path. A **default** kernel gives only SwiftShader software (run #4). Every non‑WebGL driver still argues against adoption: worse wall clock, async/queue + driver‑version **fragility**, **Kaggle‑ToS** account risk, reproducibility‑contract violation, and the **confirmed** action reporting defect. Credential‑free **#41/#44** reach the same native‑GPU goal without a third party, secret, or ToS exposure.

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

**Xvfb — considered, out of scope by itself.** Xvfb is a *software* framebuffer: headed Chromium under `xvfb-run` gets **Mesa software GL** — the same class we already measure — so Xvfb alone is **not** an escalation path. **One narrow conditional exception:** if run #5 shows the NVIDIA userspace installed *cleanly* (ICD + EGL vendor json present, `vulkaninfo` sees the T4) **but all headless flag sets still fail**, then a real **Xorg‑on‑NVIDIA** with `AllowEmptyInitialConfiguration` (or **VirtualGL**, with Xvfb only as the 2D display) would be the final escalation rung — attempted only in that specific case, otherwise documented and left to #44.

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

### Live‑run findings (5 runs — the make‑or‑break question, ANSWERED)

| Run | Config | Outcome | What it proved |
|---|---|---|---|
| #1 | baseline probe v1 | kernel ran → ERROR; **action's log dump crashed** (`ConvertFrom-Json`) | Auth/push/run works; **reporting defect is real, not theoretical** — verdict hidden |
| #2 | v2 robust retrieval | **no internet + no GPU** (`pip` DNS fail; no `nvidia-smi`) | **Unverified account** silently disables internet **and** GPU; stack can't install |
| #3 | after phone verification | **2× T4 + internet**; probe crashed on bad pin | Verification unblocks the account layer; `playwright==1.61.1` invalid (Python max 1.61.0) |
| #4 | **baseline**, verified | **SOFTWARE** — every set `ANGLE (…SwiftShader)` | A **default** Kaggle GPU kernel gives Chromium only software WebGL — same class as our CI |
| #5 | **escalation** (`install_nvidia_gl`) | **HARDWARE** — `ANGLE (NVIDIA … Tesla T4)`, proven with `--disable-software-rasterizer` | Hardware WebGL **is achievable** — but only via exact‑version runfile userspace + ANGLE‑**Vulkan** |

**The make‑or‑break answer (7):** hardware WebGL on Kaggle GPU is **PROVEN achievable**
(run #5), *not* on a default kernel (run #4). The working path is the NVIDIA driver
**runfile** (`--no-kernel-modules`, exact `driver_version` from `us.download.nvidia.com/tesla/`)
+ Chromium `--use-gl=angle --use-angle=vulkan`. `angle-vulkan-nofallback` returned the
T4 with software disabled → unambiguous. (`--use-gl=egl` and desktop‑GL `--use-angle=gl`
did **not** reach the GPU.) Full detail: `data/output/probe-run-5-evidence.md`.

### Metrics

| Question | Status | Finding |
|---|---|---|
| Action security | ✅ closed | Auditable composite; pin SHA `e6bafb6…`; residual = unpinned kaggle CLI |
| Runs our stack | ✅ tested | Yes on a **verified** account; Node/driver installed in‑kernel ⇒ non‑reproducible ⇒ non‑required only |
| **Hardware WebGL** | ✅ **PROVEN (run #5)** | Achievable via runfile NVIDIA userspace + ANGLE‑Vulkan; **software** on a default kernel (run #4) |
| Wall clock vs 5–6 min | ❌ worse | Async queue + cold `npm ci`/browser + **now a ~hundreds‑of‑MB driver install every run** |
| Reliability/quota | ❌ fragile | Scheduler availability + 30 GPU‑h/wk + **driver‑version coupling** (runfile 404s if host driver goes non‑public) |
| Reporting | ❌ crude/broken | Action's log dump **crashes** on kernel ERROR (run #1); needed our own `kaggle kernels output` retrieval |
| Kaggle ToS | ⚠️ blocker | Sustained CI use plausibly violates AUP; unverified accounts get no internet/GPU (run #2) → account‑suspension risk |

### Output Files

- `data/output/probe-run-1-evidence.md` … `probe-run-5-evidence.md` — per‑run curated evidence (sniff, account‑layer blocker, verified‑account software baseline, and the hardware‑WebGL escalation with the reproducible recipe).

## What Worked

- **Hardware WebGL was achieved** (run #5): exact‑version NVIDIA runfile (`--no-kernel-modules`) + `--use-angle=vulkan` → `ANGLE (NVIDIA … Tesla T4)`, proven with `--disable-software-rasterizer`.
- Composite action = fully auditable; clean SHA pin (`v2.0.0` == HEAD); token never echoed.
- **Format‑agnostic credential sniff** handled the write‑only, unknown‑shape secret (detected `mode=string` without leaking it).
- **Staged escalation** — cheap probe → account‑verify → baseline → driver escalation — isolated each variable and made every failure conclusive.
- Our **own `kaggle kernels output` retrieval** + structured artifact worked around the action's broken log dump and made results binary via `--disable-software-rasterizer`.

## What Didn't Work / Obstacles (all now resolved or conclusive)

- **Unverified account (run #2)** silently disabled internet **and** GPU → diagnosed; owner phone‑verified → unblocked.
- **`Frederisk/kaggle-action` log dump crashes** on kernel ERROR (`ConvertFrom-Json`) → real reporting defect; bypassed with direct output retrieval.
- **JS/Python Playwright patch divergence**: `playwright==1.61.1` has no Python build → pinned `1.61.0` (same 1.61 Chromium).
- **Default kernel = SwiftShader** (run #4); hardware needs manual driver‑userspace surgery (run #5) — heavy and version‑fragile.
- **`workflow_dispatch` not dispatchable off a feature branch** → each iteration needed a PR merge to `main`; outward‑facing + real‑credential + ToS‑ambiguous made the live trigger correctly the architect's call throughout.

## Go/no‑go — RESOLVED (architect decision record, issue #42, 2026‑07‑21)

1. **Live Stage‑1 probe: GO.** Path: minimal PR adding only the `workflow_dispatch`‑only workflow (SHA‑pinned `e6bafb6`) → architect reviews → I merge → `gh workflow run`. Manual dispatch only.
2. **Token format: unknown & unverifiable (write‑only secret) → made the workflow format‑agnostic** (sniff JSON‑vs‑string without echoing; fail fast with a non‑secret diagnostic on auth failure and iterate).
3. **One‑off ToS/account risk: ACCEPTED** for a single short probe + a few manual auth/flag retries. **No recurring/scheduled runs.** Sustained‑CI‑use ToS exposure is recorded as an **adoption blocker**, not a probe blocker.

## Decision / Recommendation — **REJECT for CI adoption; retain as a documented one‑off capability**

**What the experiment settled.** The headline premise of #42 — *real hardware WebGL on
free Kaggle GPU* — is **TRUE and proven** (run #5: an unambiguous NVIDIA Tesla T4 WebGL
renderer with software rasterization disabled). That is a genuine, positive result: it is
achievable. **But the surrounding hypothesis — that this yields a faster, reliable, safe,
CI‑integratable e2e lane — is FALSE**, on multiple independent axes that no amount of flag
tuning fixes:

1. **Required‑gate: REJECT (unequivocal).** The lane installs Node **and** a full NVIDIA
   driver userspace inside a Python‑first image — a wholly different toolchain/OS than the
   `npm ci` reproducibility contract. It can never be the reproducible required gate
   (arch‑critical). The SwiftShader‑sharded gate + `npm run validate` stay as‑is.
2. **Wall clock: worse, not better.** Async kernel queue + boot + cold `npm ci` + Playwright
   browser download + `next build` — **plus** a ~hundreds‑of‑MB driver runfile install on
   every cold kernel — against a ~5–6 min sharded target. It is structurally slower.
3. **Reliability: fragile + quota‑bound.** Kaggle scheduler availability, 30 GPU‑h/week, and
   a hard **driver‑version coupling**: run #5 worked only because the host's `580.159.04` was
   published on `us.download.nvidia.com/tesla/`; a future Google‑built/non‑public driver →
   runfile 404 → the lane silently loses hardware GL.
4. **Kaggle ToS: account risk.** Using free Kaggle GPU as CI infrastructure plausibly
   violates the AUP; unverified accounts are silently stripped of internet+GPU (run #2), and
   sustained automated use risks account suspension. This is an outward‑facing, hard‑to‑reverse
   exposure for the owner's account. **No recurring/scheduled runs** should be configured.
5. **Reporting: crude, and the action is buggy.** `Frederisk/kaggle-action`'s log dump
   **crashes** on kernel ERROR (run #1); usable results required our own `kaggle kernels
   output` retrieval. That is a regression from Playwright blob/HTML + GH artifacts.
6. **Stage‑2 is additionally hard‑gated** on rewiring `playwright.config.ts` (which currently
   force‑selects SwiftShader) to inject the ANGLE‑Vulkan flags — see the Stage‑2 hard‑gate note.

**Non‑required GPU‑qualification lane: also REJECT as a standing lane**, for reasons 2–5.
The value it would add (native‑GPU WebGL evidence, e.g. the #22 item‑11 gap) is real, but the
operational cost + ToS/account risk + fragility are not worth a *standing* lane when
credential‑free alternatives exist.

**Better path (recommended):** pursue **#41** (parallelize local e2e to hardware) and
**#44** (opt‑in native‑GPU local lane) — they deliver the same native‑GPU WebGL goal **without**
a third‑party service, a stored credential, or ToS exposure.

**Retain the capability (the one positive to keep):** the runfile+ANGLE‑Vulkan recipe in
`data/output/probe-run-5-evidence.md` is a working, reproducible way to capture a **one‑off,
manual** real‑GPU WebGL artifact on Kaggle if a specific native‑GPU repro is ever needed and
no local GPU is available. Keep it as a documented tool, **not** wired into CI.

## Next Steps

1. **Do not adopt** kaggle‑action into CI. Leave `kaggle-gpu-spike.yml` as a `workflow_dispatch`‑only,
   non‑required manual probe (or remove it after this record lands — architect's call).
2. **Route the underlying need to #41/#44** — link this experiment as evidence that native‑GPU
   WebGL is worth chasing, just not via Kaggle.
3. **If anyone re‑opens the Kaggle path**, the unblock/keep‑working conditions are: a verified
   account, the host driver still published on the public tesla server, and acceptance of the
   ToS/wall‑clock costs — all documented above.

## References

- Issue #42; sibling issues #41, #44; flake class #33/#34; native‑GPU gap #22; sharding baseline #30/PR #32.
- `Frederisk/kaggle-action@e6bafb6…` — `action.yml`, `README.md`, `__tests__/check-gpu.py` (audited).
- `.github/workflows/validation.yml` — current required gate (quality + 4‑shard Chromium/SwiftShader e2e + gate).
- `codev/resources/arch-critical.md` — reproducibility contract & validation baseline (why a differing‑toolchain lane can't be required).
