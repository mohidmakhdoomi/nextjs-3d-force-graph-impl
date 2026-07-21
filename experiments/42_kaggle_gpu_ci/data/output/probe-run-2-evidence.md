# Probe run #2 — evidence (GitHub Actions run 29860830320)

Workflow: `kaggle-gpu-spike.yml` @ probe **v2** (robust retrieval) · dispatched
2026-07-21 19:16 UTC · `machine_shape=NvidiaTeslaT4` · job conclusion: **failure**
(~4.5 min). The v2 retrieval bypassed the action's broken log dump and
successfully fetched the kernel's stdout — so this run reveals the real cause.

## Reconstructed kernel stdout (verbatim, key parts)

```
Experiment 42 — Kaggle GPU WebGL probe

$ bash -lc nvidia-smi -L || echo 'no nvidia-smi'
bash: line 1: nvidia-smi: command not found
no nvidia-smi

$ bash -lc cat /etc/os-release | head -3 || true
PRETTY_NAME="Ubuntu 22.04.5 LTS"

$ ... ls /usr/lib/.../ egl|gles|gl.so|nvidia ...
libEGL_mesa.so.0        libGLESv2.so.2     libGL.so.1
libEGL.so.1             libOpenGL.so.0     libwayland-egl.so.1
   # ^ Mesa SOFTWARE GL only — NO NVIDIA/EGL vendor driver present

$ /usr/bin/python3 -m pip install --quiet playwright==1.61.1
WARNING: Retrying ... after connection broken by 'NewConnectionError(...
  Failed to establish a new connection: [Errno -3] Temporary failure in name resolution')': /simple/playwright/
   # ^ repeated 5x
ERROR: Could not find a version that satisfies the requirement playwright==1.61.1 (from versions: none)
ERROR: No matching distribution found for playwright==1.61.1
command failed (1): /usr/bin/python3 -m pip install --quiet playwright==1.61.1
```

The probe then raised `SystemExit` (pip `check=True`) → kernel ended `ERROR`
**before** writing `webgl_probe_result.json`, so the retrieval reported
"(no result artifact)". The v2 log-retrieval channel itself worked correctly.

## What this proves — two hard blockers, one likely root cause

1. **No internet in the kernel.** `enable_internet: true` was requested, yet DNS
   resolution fails → `pip` cannot reach PyPI. Without egress the kernel cannot
   `pip install`, `npm ci`, download Playwright browsers, or even `git clone` our
   repo. **Our stack cannot run at all.**
2. **No GPU in the kernel.** `nvidia-smi` is absent and only **Mesa software** GL
   libraries are present, despite `machine_shape=NvidiaTeslaT4` /
   `enable_gpu: true`. Any WebGL here would be **llvmpipe/Mesa software** — the
   same software-render class we already have on GitHub runners. **Zero benefit.**
3. **Most likely root cause: the Kaggle account is not phone-verified.** Kaggle
   silently disables **both** internet and GPU for unverified accounts — the
   action's own README warns of exactly this ("kaggle may require you to use your
   mobile phone number… network unavailable or GPU unavailable… kaggle restricts
   unauthenticated users"). The simultaneous loss of internet **and** GPU is that
   signature. (Secondary possibility: the metadata flags weren't applied to the
   commit run — less likely given both were lost together.)

## Consequence for the experiment

The make-or-break WebGL question could **not** be reached: a more fundamental
account-level blocker stops the stack from installing. Both live runs (#1, #2)
failed at this same layer. **Precise unblock condition:** phone-verify the Kaggle
account behind `KAGGLE_API_TOKEN`, confirm a kernel then actually receives
internet + a GPU (`nvidia-smi` present), and only then can the probe test whether
Chromium obtains a hardware `UNMASKED_RENDERER_WEBGL`.
