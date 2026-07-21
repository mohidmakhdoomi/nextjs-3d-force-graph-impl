#!/usr/bin/env python3
"""
Experiment 42 — Stage 1, run #5 ESCALATION probe (architect-directed).

Run #4 (baseline) proved that a default Kaggle GPU kernel gives Chromium only
SwiftShader software WebGL despite 2x Tesla T4 — because the GPU is
compute-capability-only: CUDA libs are mounted, but the NVIDIA GL/EGL/Vulkan
USERSPACE vendor driver is not present (only Mesa is).

This escalation tests the last plausible path to hardware WebGL: install the
NVIDIA graphics userspace whose branch matches the mounted kernel driver, then
retry the EGL / ANGLE-Vulkan flag sets. Per the plan, this is FRAGILE and
version-dependent — the exact libs may be absent from Ubuntu's archive or may
mismatch the mounted driver ABI. **A failed attempt is conclusive evidence** that
this approach is not viable on Kaggle.

Self-contained (Kaggle uploads only this one file). Writes
`webgl_probe_result.json` as the retrievable evidence artifact; exits non-zero
unless a hardware renderer is obtained.
"""
import json
import re
import subprocess
import sys
import traceback

# Only the flag sets that could plausibly reach an NVIDIA GL/Vulkan path.
FLAG_SETS = [
    ("baseline-headless", ["--headless=new", "--no-sandbox"]),
    ("egl", ["--headless=new", "--no-sandbox", "--use-gl=egl"]),
    ("angle-gl-egl", ["--headless=new", "--no-sandbox", "--use-gl=angle", "--use-angle=gl-egl"]),
    ("angle-vulkan", ["--headless=new", "--no-sandbox", "--use-gl=angle",
                      "--use-angle=vulkan", "--enable-features=Vulkan"]),
]
SOFTWARE_MARKERS = ["swiftshader", "llvmpipe", "software", "microsoft basic"]
HARDWARE_MARKERS = ["nvidia", "tesla", "t4", "angle (nvidia"]

WEBGL_JS = r"""
() => {
  const out = {};
  for (const kind of ['webgl2', 'webgl', 'experimental-webgl']) {
    const c = document.createElement('canvas');
    let gl = null;
    try { gl = c.getContext(kind); } catch (e) {}
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      out[kind] = {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      };
    } else { out[kind] = null; }
  }
  out.webgpu = !!(navigator.gpu);
  return out;
}
"""


def sh(cmd, check=False):
    print(f"\n$ {' '.join(cmd)}", flush=True)
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    print(r.stdout, flush=True)
    if check and r.returncode != 0:
        raise SystemExit(f"command failed ({r.returncode}): {' '.join(cmd)}")
    return r.returncode, r.stdout


def classify(renderer):
    r = (renderer or "").lower()
    if any(m in r for m in SOFTWARE_MARKERS):
        return "software"
    if any(m in r for m in HARDWARE_MARKERS):
        return "hardware"
    return "unknown"


def install_nvidia_gl():
    """Best-effort install of the NVIDIA GL/EGL/Vulkan userspace matching the
    mounted driver branch. Returns a dict of diagnostics. Never raises."""
    diag = {}
    _, drv = sh(["bash", "-lc", "nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1"])
    drv = drv.strip().splitlines()[-1].strip() if drv.strip() else ""
    diag["driver_version"] = drv
    branch = drv.split(".")[0] if re.match(r"^\d+", drv) else ""
    diag["branch"] = branch
    if not branch:
        diag["install"] = "SKIPPED — could not read driver_version"
        return diag
    # Try the exact-branch userspace GL (provides libEGL_nvidia, libGLX_nvidia,
    # and the Vulkan ICD /usr/share/vulkan/icd.d/nvidia_icd.json), plus diag tools.
    pkgs = [f"libnvidia-gl-{branch}", "vulkan-tools", "mesa-utils"]
    code, out = sh(["bash", "-lc",
                    "export DEBIAN_FRONTEND=noninteractive; apt-get update -y >/dev/null 2>&1; "
                    f"apt-get install -y {' '.join(pkgs)} 2>&1 | tail -25"])
    diag["apt_exit"] = code
    diag["apt_tail"] = out.strip()[-1500:]
    # Evidence of whether the NVIDIA vendor userspace actually landed.
    _, ls = sh(["bash", "-lc",
                "ls -1 /usr/share/vulkan/icd.d/ 2>/dev/null; "
                "ls -1 /usr/share/glvnd/egl_vendor.d/ 2>/dev/null; "
                "ls -1 /usr/lib/x86_64-linux-gnu/ | grep -iE 'nvidia|EGL_nvidia|GLX_nvidia' || echo '(no nvidia GL libs)'"])
    diag["gl_files"] = ls.strip()
    _, vk = sh(["bash", "-lc", "vulkaninfo --summary 2>&1 | grep -iE 'deviceName|driverName|GPU id' | head -10 || echo '(vulkaninfo unavailable)'"])
    diag["vulkan_devices"] = vk.strip()
    return diag


def main():
    print("=" * 72)
    print("Experiment 42 — run #5 ESCALATION (install NVIDIA GL userspace)")
    print("=" * 72)
    sh(["bash", "-lc", "nvidia-smi -L || echo 'no nvidia-smi'"])

    nv = install_nvidia_gl()
    print("\nNVIDIA-GL install diagnostics:\n" + json.dumps(nv, indent=2))

    sh([sys.executable, "-m", "pip", "install", "--quiet", "playwright==1.61.0"], check=True)
    code, _ = sh(["python", "-m", "playwright", "install", "--with-deps", "chromium"])
    if code != 0:
        sh(["python", "-m", "playwright", "install", "chromium"])

    results, hardware_hit = {}, None
    try:
        from playwright.sync_api import sync_playwright  # noqa: E402
        with sync_playwright() as p:
            for name, flags in FLAG_SETS:
                entry = {"flags": flags}
                try:
                    b = p.chromium.launch(headless=True, args=flags)
                    pg = b.new_page()
                    pg.goto("about:blank")
                    info = pg.evaluate(WEBGL_JS)
                    ctx = info.get("webgl2") or info.get("webgl") or info.get("experimental-webgl")
                    entry["renderer"] = ctx["renderer"] if ctx else None
                    entry["class"] = classify(entry["renderer"])
                    b.close()
                except Exception as e:  # noqa: BLE001
                    entry["error"] = f"{type(e).__name__}: {e}"
                    entry["class"] = "error"
                    entry["traceback"] = traceback.format_exc()
                results[name] = entry
                print(f"\n[{name}] class={entry.get('class')} renderer={entry.get('renderer')!r}", flush=True)
                if entry.get("class") == "hardware" and hardware_hit is None:
                    hardware_hit = name
    except Exception as e:  # noqa: BLE001
        print(f"TOP-LEVEL browser error: {type(e).__name__}: {e}\n{traceback.format_exc()}", flush=True)

    summary = {
        "verdict": "hardware" if hardware_hit else "software_or_error",
        "hardware_flag_set": hardware_hit,
        "nvidia_gl_install": nv,
        "results": results,
    }
    try:
        with open("webgl_probe_result.json", "w") as f:
            json.dump(summary, f, indent=2, default=str)
        print("Wrote webgl_probe_result.json (retrievable kernel output artifact).")
    except Exception as e:  # noqa: BLE001
        print(f"WARN: could not write result artifact: {e}")

    print("\n" + "=" * 72)
    print("ESCALATION RESULT:")
    print(json.dumps(summary, indent=2, default=str))
    print("=" * 72)
    sys.exit(0 if hardware_hit else 1)


if __name__ == "__main__":
    main()
