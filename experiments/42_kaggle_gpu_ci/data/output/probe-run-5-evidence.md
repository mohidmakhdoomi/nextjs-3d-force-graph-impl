# Probe run #5 — ESCALATION VERDICT: HARDWARE WebGL ACHIEVED (run 29864472544)

Workflow: `kaggle-gpu-spike.yml` @ `install_nvidia_gl=true` · verified account ·
`machine_shape=NvidiaTeslaT4` · job conclusion: **success (hardware)** · ~3.5 min.

## The escalation worked — real Tesla T4 WebGL, proven unambiguously

**Install (both attempts succeeded):**
- `driver_version = 580.159.04`; `apt_exit = 0`.
- **Runfile: `DOWNLOAD_OK`, `runfile_exit = 0`** — `https://us.download.nvidia.com/tesla/580.159.04/NVIDIA-Linux-x86_64-580.159.04.run` installed with `--no-kernel-modules` (userspace-only, against Kaggle's already-mounted kernel module). So Kaggle's host driver **is** on the public tesla server (today). Installed libs: `libEGL_nvidia.so.580.159.04`, `libGLX_nvidia.so.580.159.04`, `libnvidia-eglcore/glcore.so.580.159.04`.
- Verification: `nvidia_icd.json` (Vulkan 1.4.312) + glvnd `10_nvidia.json` present; `vulkaninfo` lists **Tesla T4 (NVIDIA)** alongside llvmpipe; `VK_ICD_FILENAMES` set.
- (Benign runfile warnings: glvnd-config-path guess, `systemctl`/`X library path` — harmless in a container; the vendor libs + ICDs still landed and work.)

**WebGL renderer per flag set (`"verdict": "hardware"`):**

| Flag set | `--disable-software-rasterizer`? | Renderer | Class |
|---|---|---|---|
| `baseline-headless` | no | `ANGLE (Google, … SwiftShader driver)` | software |
| `egl` (`--use-gl=egl`) | no | `ANGLE (Google, … SwiftShader driver)` | software |
| `angle-gl-egl` (`--use-gl=angle --use-angle=gl-egl`) | no | **`ANGLE (NVIDIA Corporation, Tesla T4/PCIe/SSE2, OpenGL ES 3.2)`** | **hardware** |
| `angle-vulkan` (`--use-angle=vulkan`) | no | **`ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA Tesla T4 (0x00001EB8)), NVIDIA)`** | **hardware** |
| `angle-gl-nofallback` (`--use-angle=gl` + no-sw) | **yes** | `null` (no context) | unknown |
| `angle-vulkan-nofallback` (`--use-angle=vulkan` + no-sw) | **yes** | **`ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA Tesla T4), NVIDIA)`** | **hardware** |

**The `angle-vulkan-nofallback` row is decisive:** with `--disable-software-rasterizer`
SwiftShader cannot mask the result, yet Chromium still rendered on the **NVIDIA Tesla
T4**. This is unambiguous hardware WebGL — not a software fallback.

## The reproducible recipe (for one-off manual native-GPU capture)

1. Verified Kaggle account; GPU kernel (`enable_gpu`, `enable_internet`, `machine_shape=NvidiaTeslaT4`).
2. In-kernel: `drv=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader)`;
   `curl -fLO https://us.download.nvidia.com/tesla/$drv/NVIDIA-Linux-x86_64-$drv.run`;
   `sh NVIDIA-Linux-x86_64-$drv.run --silent --no-kernel-modules`.
3. Launch Chromium with `--use-gl=angle --use-angle=vulkan` (optionally `VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/nvidia_icd.json`).

## Caveats that keep this out of CI (see recommendation)
- **Fragile/version-coupled:** works only while Kaggle's host driver point release is
  published on `us.download.nvidia.com/tesla/<ver>/`. A future Google-built/non-public
  driver → runfile 404 → breaks. `--use-angle=gl` (desktop GL) did NOT work even so;
  only the **Vulkan** path is reliable.
- **Per-run cost:** the runfile is ~hundreds of MB downloaded + installed on every cold
  kernel, on top of async queue/boot — strictly worse wall clock.
- Plain `--use-gl=egl` did NOT pick NVIDIA; the working paths are ANGLE-Vulkan (best)
  and ANGLE-gl-egl.
