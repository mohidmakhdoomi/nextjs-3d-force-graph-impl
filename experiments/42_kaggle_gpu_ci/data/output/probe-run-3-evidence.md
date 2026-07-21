# Probe run #3 — evidence (GitHub Actions run 29861849190)

Workflow: `kaggle-gpu-spike.yml` @ probe v2 · dispatched 2026-07-21 ~19:35 UTC
(after the Kaggle account was phone-verified) · `machine_shape=NvidiaTeslaT4` ·
job conclusion: **failure** (~1 min) · verdict artifact: still none, but for a new
(trivial, now-fixed) reason.

## Verification worked — the account-layer blocker is gone

```
$ nvidia-smi -L
GPU 0: Tesla T4 (UUID: GPU-41bdf1f6-...)
GPU 1: Tesla T4 (UUID: GPU-bde42e00-...)          # ← GPU now present (was absent in run #2)

$ pip install --quiet playwright==1.61.0           # internet now works:
ERROR: Could not find a version that satisfies the requirement playwright==1.61.1
  (from versions: 1.9.0, ... , 1.60.0, 1.61.0)     # ← pip REACHED PyPI and listed versions
```

Both prior blockers are resolved by phone verification:
- ✅ **GPU present:** 2× Tesla T4 (`nvidia-smi` works).
- ✅ **Internet present:** `pip` reached PyPI (it enumerated available versions) —
  contrast run #2's `Temporary failure in name resolution`.

## New, trivial blocker (my bug) — now fixed

The pin `playwright==1.61.1` has **no Python distribution**: the Python `playwright`
package's 1.61 line tops out at **1.61.0** (JS `@playwright/test` and the Python
package diverge at the patch level; there is no Python 1.61.1). pip therefore
errored `No matching distribution found`, and the probe (pip `check=True`) exited
before installing Chromium — hence still "no result artifact."

**Fix (committed):** pin the Python package to `playwright==1.61.0` — the same 1.61
Chromium line as our JS `@playwright/test@1.61.1` — and make the browser-install
steps non-fatal so a launch failure can never again pre-empt the result artifact.

## Note on GL libraries (still relevant for the WebGL test)

Even with the GPU present, the kernel's userspace GL is **Mesa only**
(`libEGL_mesa`, `libGL`, `libGLESv2`) — **no NVIDIA GL/EGL vendor driver** is
installed. This is the crux of the make-or-break question: without an NVIDIA
EGL/GL ICD (or a working Vulkan/ANGLE path to the T4), headless Chromium will
likely still resolve WebGL to **Mesa software (llvmpipe)**, not the Tesla T4.
Run #4 measures this directly.
