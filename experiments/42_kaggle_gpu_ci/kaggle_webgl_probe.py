#!/usr/bin/env python3
"""
Experiment 42 — Stage 1 (make-or-break) probe.

Question it answers, and nothing more:
    Does headless Chromium, running inside a Kaggle *GPU* kernel, obtain a
    HARDWARE WebGL renderer (UNMASKED_RENDERER_WEBGL != SwiftShader/llvmpipe),
    and if so under which GL flags?

Why this is the whole ballgame: the entire value proposition of issue #42 is
"real hardware WebGL, to kill the SwiftShader flake class at its source." Every
other cost (async queue latency, cold npm ci, ToS, Node-in-a-Python-image) only
matters if this probe passes. If Chromium falls back to SwiftShader/llvmpipe on
Kaggle GPU just like it does on a GitHub runner, the hypothesis is falsified and
there is no reason to ever upload/run the full e2e suite on Kaggle.

This is designed to run as a Kaggle "script" kernel (language=python,
kernel_type=script, enable_gpu=enable, enable_internet=enable). It is uploaded
verbatim by Frederisk/kaggle-action as the `code_file`.

Reporting note (important): Frederisk/kaggle-action only dumps the kernel's log
to the GitHub Actions console when the kernel ends in *error*. On a clean
"complete" it prints SUCCESS and discards the log. So this probe deliberately
exits non-zero unless a hardware renderer is confirmed — that both (a) gives the
CI check meaningful pass/fail semantics and (b) guarantees the renderer strings
land in the Actions log for the (expected) negative result. To retrieve output
on success, call `kaggle kernels output <slug>` separately.
"""
import json
import subprocess
import sys
import traceback

# Chromium flag sets to try, cheapest/most-default first. Each is a candidate
# path to hardware GL on a headless, display-less NVIDIA (CUDA) box.
FLAG_SETS = [
    ("baseline-headless", ["--headless=new", "--no-sandbox"]),
    ("egl", ["--headless=new", "--no-sandbox", "--use-gl=egl"]),
    ("angle-gl-egl", ["--headless=new", "--no-sandbox", "--use-gl=angle", "--use-angle=gl-egl"]),
    ("angle-vulkan", ["--headless=new", "--no-sandbox", "--use-gl=angle",
                       "--use-angle=vulkan", "--enable-features=Vulkan"]),
    ("desktop-gl", ["--headless=new", "--no-sandbox", "--use-gl=desktop"]),
    ("egl-ignore-blocklist", ["--headless=new", "--no-sandbox", "--use-gl=egl",
                              "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]),
]

# Substrings that mark a SOFTWARE rasterizer (the thing we already have on CI).
SOFTWARE_MARKERS = ["swiftshader", "llvmpipe", "software", "microsoft basic"]
# Substrings that mark real GPU hardware on Kaggle (T4 / P100 are NVIDIA).
HARDWARE_MARKERS = ["nvidia", "tesla", "t4", "p100", "angle (nvidia"]

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
        version: gl.getParameter(gl.VERSION),
        masked_renderer: gl.getParameter(gl.RENDERER),
      };
    } else {
      out[kind] = null;
    }
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


def classify(renderer: str):
    r = (renderer or "").lower()
    if any(m in r for m in SOFTWARE_MARKERS):
        return "software"
    if any(m in r for m in HARDWARE_MARKERS):
        return "hardware"
    return "unknown"


def main():
    print("=" * 72)
    print("Experiment 42 — Kaggle GPU WebGL probe")
    print("=" * 72)

    # 1) Environment evidence (parallels the action's own nvidia-smi check).
    _, gpu_out = sh(["bash", "-lc", "nvidia-smi -L || echo 'no nvidia-smi'"])
    sh(["bash", "-lc", "cat /etc/os-release | head -3 || true"])
    sh(["bash", "-lc", "ls -1 /usr/lib/x86_64-linux-gnu/ | grep -iE 'egl|gles|gl\\.so|nvidia' || echo 'no GL/EGL vendor libs found'"])
    sh(["bash", "-lc", "which glxinfo eglinfo vulkaninfo 2>/dev/null || echo 'no gl diag tools'"])

    # 2) Install Playwright + Chromium, version-PINNED to our repo's
    #    @playwright/test (1.61.1) so the probe exercises the SAME Chromium build
    #    we ship — otherwise a newer browser could report a different WebGL
    #    renderer/flag behavior than our actual stack, invalidating the evidence.
    sh([sys.executable, "-m", "pip", "install", "--quiet", "playwright==1.61.1"], check=True)
    # --with-deps needs apt (root). Kaggle kernels run as root; if this is flaky,
    # fall back to a plain install and let missing libs surface in the launch.
    code, _ = sh(["python", "-m", "playwright", "install", "--with-deps", "chromium"])
    if code != 0:
        print("WARN: 'install --with-deps' failed; retrying without deps", flush=True)
        sh(["python", "-m", "playwright", "install", "chromium"], check=True)

    from playwright.sync_api import sync_playwright  # noqa: E402

    results = {}
    hardware_hit = None

    with sync_playwright() as p:
        for name, flags in FLAG_SETS:
            entry = {"flags": flags}
            try:
                browser = p.chromium.launch(headless=True, args=flags)
                page = browser.new_page()
                page.goto("about:blank")
                info = page.evaluate(WEBGL_JS)
                entry["webgl"] = info
                # Prefer webgl2, then webgl, then experimental.
                ctx = info.get("webgl2") or info.get("webgl") or info.get("experimental-webgl")
                renderer = ctx["renderer"] if ctx else None
                entry["renderer"] = renderer
                entry["class"] = classify(renderer)
                browser.close()
            except Exception as e:  # noqa: BLE001 - probe: capture, don't crash the matrix
                entry["error"] = f"{type(e).__name__}: {e}"
                entry["class"] = "error"
                entry["traceback"] = traceback.format_exc()
            results[name] = entry
            print(f"\n[{name}] class={entry.get('class')} renderer={entry.get('renderer')!r}", flush=True)
            if entry.get("class") == "hardware" and hardware_hit is None:
                hardware_hit = name

    summary = {
        "verdict": "hardware" if hardware_hit else "software_or_error",
        "hardware_flag_set": hardware_hit,
        "gpu": gpu_out.strip(),
        "results": results,
    }

    # Write a structured artifact to the kernel working dir. Kaggle collects
    # files written here as retrievable kernel OUTPUT — so `kaggle kernels
    # output` fetches this verdict directly, independent of the action's
    # (fragile) stdout-log parsing. This is the primary evidence channel.
    try:
        with open("webgl_probe_result.json", "w") as f:
            json.dump(summary, f, indent=2, default=str)
        print("Wrote webgl_probe_result.json (retrievable kernel output artifact).")
    except Exception as e:  # noqa: BLE001
        print(f"WARN: could not write result artifact: {e}")

    print("\n" + "=" * 72)
    print("PROBE RESULT (machine-readable):")
    print(json.dumps(summary, indent=2, default=str))
    print("=" * 72)

    if hardware_hit:
        print(f"VERDICT: HARDWARE WebGL achieved via flag set '{hardware_hit}'. "
              f"Hypothesis SUPPORTED — proceed to Stage 2 (full e2e trial).")
        sys.exit(0)
    else:
        print("VERDICT: No flag set produced a hardware WebGL renderer — all "
              "software (SwiftShader/llvmpipe) or errored. Hypothesis FALSIFIED "
              "for the hardware-WebGL premise on this Kaggle image/shape.")
        sys.exit(1)  # non-zero => action surfaces this full log in the CI console


if __name__ == "__main__":
    main()
