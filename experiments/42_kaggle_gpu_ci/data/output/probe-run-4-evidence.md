# Probe run #4 — BASELINE VERDICT (GitHub Actions run 29862696170)

Workflow: `kaggle-gpu-spike.yml` @ probe v2 + `playwright==1.61.0` fix · verified
account · `machine_shape=NvidiaTeslaT4` · job conclusion: **failure** (software) ·
**result artifact written** (evidence channel worked).

## Verdict: SOFTWARE — no hardware WebGL, despite 2× Tesla T4

```json
{
  "verdict": "software_or_error",
  "hardware_flag_set": null,
  "gpu": "GPU 0: Tesla T4 ...\nGPU 1: Tesla T4 ...",
  "results": {
    "baseline-headless": { "class": "software",
      "renderer": "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" },
    "egl":            { "class": "software", "renderer": "ANGLE (... SwiftShader driver)" },
    "angle-gl-egl":   { "renderer": null },   // no WebGL context created at all
    "angle-vulkan":   { "class": "software", "renderer": "ANGLE (... SwiftShader driver)" },
    "desktop-gl":     { "class": "software", "renderer": "ANGLE (... SwiftShader driver)" },
    "egl-ignore-blocklist": { "class": "software", "renderer": "ANGLE (... SwiftShader driver)" }
  }
}
```

**Every** flag set that produced a context returned the SwiftShader software
rasterizer — the *same class* we already get on GPU-less GitHub runners. Notably
even `--use-angle=vulkan` resolved to **SwiftShader's software Vulkan**, not the
T4's Vulkan; `--use-angle=gl-egl` produced no context. `webgpu: false` throughout.

## Why (confirmed): compute-only GPU, no NVIDIA graphics userspace

- `nvidia-smi` sees 2× Tesla T4 (CUDA compute libs are mounted).
- But the GL/EGL/Vulkan **userspace vendor driver is absent** — only Mesa
  (`libEGL_mesa`, `libgl1-mesa-dri`, `libglx-mesa0`) is present; `playwright
  install --with-deps` pulled in more **Mesa** packages, never NVIDIA GL.
- Chromium's ANGLE therefore has no path to the T4 and falls back to its bundled
  SwiftShader (software) — regardless of `--use-gl`/`--use-angle` flags.

## Bottom line
The make-or-break premise of issue #42 — "real hardware WebGL on Kaggle GPU" —
is **FALSE for the default Kaggle GPU kernel**. Run #5 tests whether manually
installing the matching `libnvidia-gl-<branch>` + NVIDIA Vulkan ICD can change
this; a failure there is equally conclusive.
