# Experiment 42: kaggle-action for free Kaggle GPU CI compute

**Status**: **Complete — Disposition: REJECT for CI adoption (FINAL)** (architect decision record **rev 3**, issue #42). Grounded **first** in Kaggle's **Acceptable Use Policy** (primary source, effective 2025‑06‑22, captured verbatim in [`data/output/kaggle-aup-2025-06-22.txt`](data/output/kaggle-aup-2025-06-22.txt)): the resource‑abuse clause **explicitly prohibits** using Service resources for *"activity unrelated to ML data science"* and *"server farming."* Offloading this web app's Playwright/Chromium e2e suite onto a Kaggle GPU kernel as CI compute is non‑ML activity driving Kaggle's resources — a direct, **dispositive** violation. This supersedes the rev‑2 downgrade: the earlier "no explicit prohibition found" was a **tooling** limitation (the AUP page is client‑rendered and was machine‑inaccessible), **not** an absence of prohibition — the owner captured it directly. Because the AUP bars the activity, the Stage‑2 wall‑clock measurement is **moot** and was **not run** — the measurement dispatch would *itself* be the violating activity. The Stage‑2 harness was fully built and is **retained as documentation of a built‑but‑not‑run capability**. For the record, the make‑or‑break capability was **proven achievable** earlier (run #5: `ANGLE (NVIDIA … Tesla T4)`, verified with `--disable-software-rasterizer`), but that positive result does not change the disposition. Corroborating (independent of the AUP): reproducibility‑contract violation ⇒ can never be the *required* gate; projected‑worse wall clock; driver‑version fragility; the confirmed action reporting defect. Credential‑free **#41/#44** reach the same native‑GPU goal with no third party, secret, or ToS exposure.

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
2. **Stage 2 — full e2e trial** (`kaggle_e2e_runner.py`): *after* Stage 1 confirmed hardware WebGL (run #5) — install the exact‑version NVIDIA userspace (proven runfile recipe), install exact Node 22.23.1, clone `main`, `npm ci`, build, run the **full** Chromium suite with the winning ANGLE‑Vulkan flags, and **measure per‑stage + end‑to‑end wall clock**. The harness was **fully built** (env‑gated `playwright.config.ts` hook + this runner) but **never dispatched**: the AUP finding (rev‑3) made the measurement moot *and* the dispatch itself a prohibited use. Retained as documentation of a built‑but‑not‑run capability.

This mirrored the protocol's "keep scope minimal for quick iteration." Stage 2 was to run once, manually — but the primary‑source AUP settled the disposition (REJECT) before any dispatch, so it was not run.

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
- [`kaggle_webgl_probe_nvgl.py`](kaggle_webgl_probe_nvgl.py) — run #5 **escalation** probe: reads the driver version, installs the matching `libnvidia-gl-<branch>` (apt) then the exact‑version runfile userspace, then retries the EGL/ANGLE‑Vulkan flag sets. Self‑contained so run #4's baseline script stays byte‑unchanged.
- [`kaggle_e2e_runner.py`](kaggle_e2e_runner.py) — **Stage‑2 measured full‑suite runner (now wired, `stage=e2e`).** Reproduces the proven run #5 recipe (NVIDIA runfile userspace) → Node 22.23.1 via nvm → clone `main` → `npm ci` → `playwright install --with-deps chromium` → `npm run build` → **pre‑flight renderer probe** (launches the repo's own `@playwright/test` Chromium under the hardware flags and reads `UNMASKED_RENDERER_WEBGL`, to prove the kernel reaches the T4 before trusting the suite) → **full Chromium suite** (`E2E_ENGINES=chromium`, CI parity retries=2/240 s, **no test dropped, no timing trimmed**). Instruments **per‑stage + total wall‑clock timing**, writes a retrievable `e2e_result.json`, and tars the Playwright HTML report + JSON results into the kernel working dir. Injects the hardware flags via `PW_CHROMIUM_ARGS` (consumed by the env‑gated config). Ships a fail‑fast guard: aborts if the cloned `playwright.config.ts` does not read `PW_CHROMIUM_ARGS` (which would silently measure SwiftShader on the GPU box).

### Stage‑2 hard‑gate — **RESOLVED** (env‑gated hook added; hook retained for #44)

Previously `playwright.config.ts` **hardcoded** `--use-angle=swiftshader --enable-unsafe-swiftshader` and read no args env, so a Stage‑2 GPU run would have forced **software** WebGL even on a Kaggle GPU box. **Fixed:** the chromium `launchOptions.args` now read from an optional `PW_CHROMIUM_ARGS` env — **unset ⇒ byte‑identical** `["--use-angle=swiftshader","--enable-unsafe-swiftshader"]` (verified by loading the real config: the required Validation gate and `npm run validate` are untouched); **set ⇒** the split flag array. **This hook is KEPT** — with the Kaggle path rejected, it now serves **#44** (opt‑in native‑GPU **local** lane), which can inject the run #5 ANGLE‑Vulkan flags on real local hardware. Stage‑1 was always unaffected — the probe launches Chromium directly with its own args. (The Python probe pins `playwright==1.61.0` — the same 1.61 Chromium line as the repo's JS `@playwright/test@1.61.1`; the Python package has no 1.61.1, per PR #47.)
- `.github/workflows/kaggle-gpu-spike.yml` — **REMOVED (rev‑3).** The SHA‑pinned, `workflow_dispatch`‑only spike workflow (probe + e2e stages, credential sniff, output retrieval) was deleted: with REJECT final on AUP grounds, a standing dispatch surface against the owner's Kaggle account should not exist — even a one‑off dispatch is prohibited non‑ML activity. Its full design is preserved in git history (PRs #45–#49) and the per‑run evidence files; the reproducible one‑off recipe lives in `data/output/probe-run-5-evidence.md`.
- [`kaggle_webgl_probe_nvgl.py`](kaggle_webgl_probe_nvgl.py) — run #5 **escalation** probe: reads the driver version, `apt install`s the matching `libnvidia-gl-<branch>` + NVIDIA Vulkan ICD, then retries the EGL/ANGLE‑Vulkan flag sets. Self‑contained so run #4's baseline script stays byte‑unchanged.

**GPU‑forcing techniques that do NOT apply here (record for #44):** `MESA_D3D12_DEFAULT_ADAPTER_NAME` / `GALLIUM_DRIVER=d3d12` is the **WSL2‑only** path (needs `/dev/dxg` + `libdxcore`, a Windows/WSL host); it is inapplicable in a Kaggle Linux container. That native‑GPU technique belongs to issue **#44**, not here.

**Xvfb — considered, out of scope by itself.** Xvfb is a *software* framebuffer: headed Chromium under `xvfb-run` gets **Mesa software GL** — the same class we already measure — so Xvfb alone is **not** an escalation path. **One narrow conditional exception:** if run #5 shows the NVIDIA userspace installed *cleanly* (ICD + EGL vendor json present, `vulkaninfo` sees the T4) **but all headless flag sets still fail**, then a real **Xorg‑on‑NVIDIA** with `AllowEmptyInitialConfiguration` (or **VirtualGL**, with Xvfb only as the 2D display) would be the final escalation rung — attempted only in that specific case, otherwise documented and left to #44.

### Credential‑format sniff (token shape unknown, write‑only secret)

`KAGGLE_API_TOKEN` is write‑only, so nobody can inspect it. The workflow detects its shape **without ever echoing the value**: a first step reads the secret from `env` (never interpolated into the script text) and, if it parses as JSON containing `username`/`key`, `::add-mask::`es those and routes to the action's `username`+`key` inputs; otherwise it passes the secret straight through as `api_token`. Only a non‑secret `mode` (`string`|`json`) leaves the step in the clear. On auth failure the action surfaces the kaggle‑CLI error (non‑secret) and we iterate (probe is ~2 min; retries are cheap — architect‑accepted).

## Environment & Reproduction

**The dispatch workflow has been REMOVED (rev‑3) and MUST NOT be recreated to run against Kaggle** — doing so violates the Kaggle AUP (see the Decision section and `data/output/kaggle-aup-2025-06-22.txt`). The paragraphs below are the **historical** record of how runs #1–#5 were executed while the spike workflow existed (git history: PRs #45–#49); they are retained for provenance, not as an invitation to re‑run.

Runs #1–#5 were executed via the (now‑removed) `.github/workflows/kaggle-gpu-spike.yml`, `workflow_dispatch`‑only after merge to `main`:
```bash
# HISTORICAL — the workflow no longer exists on main.
gh workflow run kaggle-gpu-spike.yml -f machine_shape=NvidiaTeslaT4
gh run watch "$(gh run list --workflow=kaggle-gpu-spike.yml -L1 --json databaseId -q '.[0].databaseId')"
# On kernel SUCCESS the action discards the log — retrieve it directly:
#   kaggle kernels output <username>/nextjs3dfg-webgl-probe
```
**Dependencies (historical):** `secrets.KAGGLE_API_TOKEN` (created 2026‑07‑21 — **recommend revoking**, nothing references it now) and a phone‑verified Kaggle account with GPU+internet enabled. `ubuntu-latest` provides `pwsh` + `python3`. The Stage‑2 e2e runner (`kaggle_e2e_runner.py`) is retained as documentation of the built‑but‑not‑run measurement capability; it was **never dispatched** (AUP).

---

## Results

### Determined WITHOUT a live run (high confidence)

1. **Security:** the action is auditable (composite, no blob), token least‑exposed, uploads only the named script, egress limited to PyPI+kaggle.com. Safe to pin & spike. Residual: unpinned kaggle CLI.
2. **Positioning:** can only be an *additive non‑required* lane (toolchain/OS differs from the reproducible gate). Required gate + `npm run validate` stay intact.
3. **Wall‑clock prior:** async **batch + queue + cold start** structurally works against the "faster than 5–6 min" goal. **(A prior only — NEVER measured: the rev‑3 AUP finding made REJECT dispositive, so the Stage‑2 measurement was moot and not run.)**
4. **Reliability prior:** a required check gated on Kaggle's scheduler adds an availability/flake source; 30 GPU‑h/week caps frequency.
5. **Reporting:** crude (status string; log only surfaced on error) — a regression from Playwright blob/HTML + GH artifacts.
6. **ToS / AUP:** **CONFIRMED VIOLATION — dispositive REJECT (rev‑3, primary source).** Kaggle's AUP (2025‑06‑22) explicitly bars "server farming" and "activity unrelated to ML data science"; our e2e‑CI use is exactly that. The rev‑2 "no explicit prohibition" was a **tooling** limitation (client‑rendered AUP page, machine‑inaccessible), **not** absence — corrected by the owner's direct capture ([`data/output/kaggle-aup-2025-06-22.txt`](data/output/kaggle-aup-2025-06-22.txt)). Unverified accounts also get no internet/GPU (run #2).

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
| **Hardware WebGL** | ✅ **PROVEN (run #5)** | Achievable via runfile NVIDIA userspace + ANGLE‑Vulkan; **software** on a default kernel (run #4). Proven for the record; **moot** given the AUP. |
| Wall clock vs 5–6 min | ➖ **moot / not measured** | REJECT rests on the AUP, not timing; the measurement dispatch would itself violate the AUP, so it was **not run**. (Prior: *projected* worse than the ~5m32s–6m57s 4‑shard baseline — async queue + cold `npm ci`/browser + driver install.) |
| Reliability/quota | ⚠️ fragile | Scheduler availability + 30 GPU‑h/wk + **driver‑version coupling** (runfile 404s if host driver goes non‑public). |
| Reporting | ⚠️ crude/broken | Action's log dump **crashes** on kernel ERROR (run #1); needed our own `kaggle kernels output` retrieval. Real, but worked around. |
| **Kaggle AUP** | ❌ **REJECT — dispositive (primary source)** | AUP 2025‑06‑22 explicitly bars **"server farming"** + **"activity unrelated to ML data science"**; e2e‑CI on Kaggle GPU is exactly that. Evidence: [`data/output/kaggle-aup-2025-06-22.txt`](data/output/kaggle-aup-2025-06-22.txt). Corrects rev‑2 (the page was machine‑inaccessible, not silent). |

### Output Files

- `data/output/probe-run-1-evidence.md` … `probe-run-5-evidence.md` — per‑run curated evidence (sniff, account‑layer blocker, verified‑account software baseline, and the hardware‑WebGL escalation with the reproducible recipe).
- [`data/output/kaggle-aup-2025-06-22.txt`](data/output/kaggle-aup-2025-06-22.txt) — **primary source: Kaggle Acceptable Use Policy** (verbatim, effective 2025‑06‑22), the dispositive basis for the final REJECT.

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

## Decision / Recommendation — **REJECT for CI adoption (FINAL)** (rev‑3)

**Dispositive reason — Kaggle AUP (primary source).** Kaggle's Acceptable Use Policy
(effective 2025‑06‑22; verbatim in [`data/output/kaggle-aup-2025-06-22.txt`](data/output/kaggle-aup-2025-06-22.txt))
prohibits abusing Service resources, expressly enumerating **"server farming"** and
**"activity unrelated to ML data science."** Offloading this web app's Playwright/Chromium
e2e suite onto Kaggle GPU kernels as CI compute is non‑ML activity driving Kaggle's resources
— a direct violation. This is the **primary, dispositive** ground for REJECT and is
independent of any performance result.

**Correction to rev‑2.** The rev‑2 record downgraded the ToS concern to "no explicit
prohibition found in Kaggle's reachable public terms." That was a **tooling** limitation — the
AUP page is client‑rendered and could not be machine‑extracted — **not** evidence of absence.
The owner captured the AUP directly; the prohibition is explicit. Corrected finding: **the AUP
explicitly bars this use.**

**Measurement is moot (and would itself violate the AUP).** REJECT does not depend on the
wall‑clock number, so it was **not measured**: dispatching the Stage‑2 e2e run on Kaggle would
be the very "activity unrelated to ML data science" the AUP prohibits. The Stage‑2 harness was
fully built and is retained **as documentation of a built‑but‑not‑run capability**, never
dispatched.

**For the record — the make‑or‑break capability is real.** Run #5 proved hardware WebGL on a
Kaggle T4 is achievable (NVIDIA runfile userspace + ANGLE‑Vulkan; `ANGLE (NVIDIA … Tesla T4)`,
verified with `--disable-software-rasterizer`). Documented for completeness; it does **not**
change the disposition — the AUP bars using it.

**Corroborating drivers (each independent of the AUP):**
1. **Required‑gate: impossible.** Installs Node **and** a full NVIDIA driver userspace in a
   Python‑first image — a different toolchain/OS than the `npm ci` reproducibility contract
   (arch‑critical). Can never be the required gate; the SwiftShader‑sharded gate +
   `npm run validate` stay as‑is.
2. **Wall clock: projected worse** (async queue + cold `npm ci`/browser + `next build` +
   ~hundreds‑of‑MB driver runfile per cold kernel vs the ~5–6 min sharded target) — now moot,
   never measured.
3. **Reliability: fragile** — Kaggle scheduler availability, 30 GPU‑h/week, and driver‑version
   coupling: run #5 worked only because the host `580.159.04` was on the public tesla server; a
   future non‑public driver → runfile 404 → silent loss of hardware GL.
4. **Reporting: crude + buggy** — `Frederisk/kaggle-action`'s log dump crashes on kernel ERROR
   (run #1); usable results required our own `kaggle kernels output` retrieval.

**Actions taken (rev‑3):**
- **Removed** `.github/workflows/kaggle-gpu-spike.yml` — no standing dispatch surface against
  the owner's Kaggle account; even a one‑off dispatch is prohibited non‑ML activity.
- **Kept** the `playwright.config.ts` `PW_CHROMIUM_ARGS` hook (default byte‑identical
  SwiftShader) — it now serves **#44** (opt‑in **native‑GPU LOCAL** lane), which can inject the
  run #5 ANGLE‑Vulkan flags on real local hardware with no third party or ToS exposure.
- **Retained** the Stage‑2 runner (`kaggle_e2e_runner.py`) + the run #5 recipe under
  `experiments/` as documentation of the built‑but‑not‑run measurement capability.

**Better path:** **#41** (parallelize local e2e to hardware) and **#44** (opt‑in native‑GPU
local lane) deliver the same native‑GPU WebGL goal without a third‑party service, a stored
credential, or AUP exposure.

## Next Steps

1. **Merge this PR** (COMPLETE/REJECT, `Closes #42`) after porch completion + CI green.
2. **Revoke the `KAGGLE_API_TOKEN` secret** — nothing references it after the spike‑workflow
   removal; leaving a live Kaggle credential with no consumer is needless exposure.
3. **Route the native‑GPU need to #41/#44**, citing run #5 as evidence the capability is real
   and the `PW_CHROMIUM_ARGS` hook as the ready injection point for a local‑GPU lane.
4. **If the Kaggle path is ever revisited**, the **AUP is the blocker**: it would require
   Kaggle's explicit permission for non‑ML CI use, which the current AUP does not grant.

## References

- **[Kaggle Acceptable Use Policy, effective 2025‑06‑22](https://www.kaggle.com/aup)** — primary source for the final REJECT; captured verbatim in [`data/output/kaggle-aup-2025-06-22.txt`](data/output/kaggle-aup-2025-06-22.txt).
- Issue #42; sibling issues #41, #44; flake class #33/#34; native‑GPU gap #22; sharding baseline #30/PR #32. Decision records rev 1→rev 3 on issue #42.
- `Frederisk/kaggle-action@e6bafb6…` — `action.yml`, `README.md`, `__tests__/check-gpu.py` (audited).
- `.github/workflows/validation.yml` — current required gate (quality + 4‑shard Chromium/SwiftShader e2e + gate).
- `codev/resources/arch-critical.md` — reproducibility contract & validation baseline (why a differing‑toolchain lane can't be required).
