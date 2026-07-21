#!/usr/bin/env python3
"""
Experiment 42 — Stage 2: MEASURED end-to-end e2e run on a Kaggle GPU kernel.

STATUS: BUILT BUT NEVER DISPATCHED (retained as documentation). The final
disposition (decision record rev 3, issue #42) is REJECT on primary-source
Kaggle-AUP grounds — the AUP prohibits "activity unrelated to ML data science"
and "server farming", so running this suite on a Kaggle kernel is a violation,
and the measurement dispatch would ITSELF be the violating activity. The
wall-clock number this script would have produced is therefore moot and was not
collected. This file is kept as a record of the built measurement capability and
of the proven run #5 recipe; do NOT dispatch it against Kaggle.


Architect decision record rev 2 (issue #42) withdrew the preliminary REJECT and
made Stage 2 GO: the make-or-break question (hardware WebGL on a Kaggle T4) is
already PROVEN positive (run #5), and the driver-install cost was waived by the
owner. The one thing REJECT rested on that was never measured — end-to-end wall
clock vs the ~5-6 min sharded gate — must now be measured, not projected.

This is the self-contained kernel script the Kaggle action uploads and runs. It
reproduces the proven run #5 recipe and then runs the ACTUAL Chromium e2e suite
on the real GPU, with no test dropped and no timing trimmed:

  1. Install the NVIDIA GL/EGL/Vulkan USERSPACE via the exact-version runfile
     (--no-kernel-modules), matching Kaggle's mounted kernel driver (run #5).
  2. Install the exact Node 22.23.1 toolchain (.nvmrc) via nvm.
  3. Clone the repo at REF, `npm ci` against the committed lockfile, install the
     Chromium browser, `npm run build`.
  4. PRE-FLIGHT: launch the repo's own Chromium (@playwright/test) with the
     hardware ANGLE-Vulkan flags and read UNMASKED_RENDERER_WEBGL, to PROVE this
     kernel genuinely reaches the T4 before trusting the suite result.
  5. Run the FULL Chromium suite (E2E_ENGINES=chromium, CI parity: retries=2,
     240 s timeout) with PW_CHROMIUM_ARGS injecting the hardware flags into
     playwright.config.ts (which now reads that env; default stays SwiftShader).

Everything is instrumented with per-stage wall-clock timing and written to a
retrievable `e2e_result.json`; the Playwright HTML report + JSON results are
tarred into the kernel working dir so `kaggle kernels output` can fetch them.
Exit non-zero unless the suite passed AND the renderer was hardware, so the
action surfaces a failure.

NOTE: the Kaggle action does not pass workflow env into the kernel, so all
config is baked into the constants below (single source of truth for the recipe).
"""
import json
import os
import re
import subprocess
import sys
import time
import traceback

REPO = "https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl"
# The clone target. The kernel fetches the code itself (the action only uploads
# THIS file). It must be a ref whose playwright.config.ts already reads
# PW_CHROMIUM_ARGS — i.e. main, after the Stage-2 change merges.
REF = "main"
NODE_VERSION = "22.23.1"  # MUST match .nvmrc / package.json engines exactly.

# Hardware WebGL flag set proven DECISIVE in run #5 (angle-vulkan-nofallback):
# ANGLE-Vulkan reaches the Tesla T4, and --disable-software-rasterizer removes
# any silent SwiftShader fallback so a green suite is UNAMBIGUOUSLY on hardware.
# --no-sandbox is required because Kaggle kernels run as root. To retry with the
# fallback-permitting set instead, drop --disable-software-rasterizer.
GL_FLAGS = (
    "--no-sandbox --use-gl=angle --use-angle=vulkan --enable-features=Vulkan "
    "--ignore-gpu-blocklist --disable-software-rasterizer"
)

SOFTWARE_MARKERS = ["swiftshader", "llvmpipe", "software", "microsoft basic"]
HARDWARE_MARKERS = ["nvidia", "tesla", "t4", "angle (nvidia"]

WORK = os.getcwd()  # Kaggle kernel cwd == /kaggle/working (retrievable output).
APP = os.path.join(WORK, "app_under_test")

timings = {}  # stage name -> seconds


def sh(cmd, cwd=None, env=None, check=False):
    """Run a shell command, stream output, return (code, combined_output)."""
    print(f"\n$ {cmd}", flush=True)
    r = subprocess.run(cmd, cwd=cwd, shell=True, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    print(r.stdout, flush=True)
    if check and r.returncode != 0:
        raise SystemExit(f"FAILED ({r.returncode}): {cmd}")
    return r.returncode, r.stdout


class stage:
    """Context manager that records wall-clock seconds for a named stage."""

    def __init__(self, name):
        self.name = name

    def __enter__(self):
        print("\n" + "=" * 72 + f"\n# STAGE: {self.name}\n" + "=" * 72, flush=True)
        self.t0 = time.monotonic()
        return self

    def __exit__(self, *exc):
        dt = round(time.monotonic() - self.t0, 1)
        timings[self.name] = dt
        print(f"\n# STAGE {self.name} took {dt}s", flush=True)
        return False  # never suppress exceptions


def classify(renderer):
    r = (renderer or "").lower()
    if any(m in r for m in SOFTWARE_MARKERS):
        return "software"
    if any(m in r for m in HARDWARE_MARKERS):
        return "hardware"
    return "unknown"


# --- NVIDIA GL userspace install (copied verbatim-in-spirit from the proven
#     run #5 escalation probe; the kernel uploads only this one file). ---------
def install_nvidia_gl():
    diag = {}
    _, drv = sh("nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1")
    drv = drv.strip().splitlines()[-1].strip() if drv.strip() else ""
    diag["driver_version"] = drv
    branch = drv.split(".")[0] if re.match(r"^\d+", drv) else ""
    diag["branch"] = branch
    if not drv:
        diag["install"] = "SKIPPED — could not read driver_version"
        return diag

    # Attempt 1 — apt branch package (cheap; point-release mismatch is evidence).
    apt_code, apt_out = sh(
        "export DEBIAN_FRONTEND=noninteractive; apt-get update -y >/dev/null 2>&1; "
        f"apt-get install -y libnvidia-gl-{branch} vulkan-tools "
        "mesa-utils mesa-utils-extra 2>&1 | tail -15")
    diag["apt_exit"] = apt_code

    # Attempt 2 — runfile userspace-only, EXACT version (--no-kernel-modules).
    run_url = f"https://us.download.nvidia.com/tesla/{drv}/NVIDIA-Linux-x86_64-{drv}.run"
    diag["runfile_url"] = run_url
    rf_code, rf_out = sh(
        f"curl -fsSL -o nvidia.run '{run_url}' && echo DOWNLOAD_OK "
        "|| echo 'DOWNLOAD_FAILED (404 => host driver not on public tesla server)'; "
        "if [ -f nvidia.run ]; then sh nvidia.run --silent --no-kernel-modules 2>&1 | tail -15 "
        "|| echo RUNFILE_INSTALL_FAILED; fi; ldconfig 2>/dev/null || true")
    diag["runfile_exit"] = rf_code
    diag["runfile_download"] = "OK" if "DOWNLOAD_OK" in rf_out else "FAILED"

    _, nvlibs = sh("ls -1 /usr/lib/x86_64-linux-gnu/ | grep -iE "
                   "'EGL_nvidia|GLX_nvidia|libnvidia-glcore|libnvidia-eglcore' "
                   "|| echo '(no nvidia GL libs)'")
    diag["nvidia_gl_libs"] = nvlibs.strip()[-400:]
    _, vkinfo = sh("vulkaninfo --summary 2>&1 | grep -iE 'deviceName|driverName' "
                   "| head -8 || echo '(vulkaninfo unavailable)'")
    diag["vulkaninfo"] = vkinfo.strip()[-400:]

    # Point the Vulkan loader at the NVIDIA ICD so ANGLE-Vulkan enumerates the T4
    # (inherited by the browser process the suite launches).
    if os.path.exists("/usr/share/vulkan/icd.d/nvidia_icd.json"):
        os.environ["VK_ICD_FILENAMES"] = "/usr/share/vulkan/icd.d/nvidia_icd.json"
        diag["VK_ICD_FILENAMES"] = os.environ["VK_ICD_FILENAMES"]
    return diag


# nvm-sourcing prefix so every node/npm command uses the exact pinned Node.
NODE_ENV = ('export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; '
            f'nvm use {NODE_VERSION} >/dev/null && ')


PREFLIGHT_JS = r"""
const { chromium } = require('@playwright/test');
(async () => {
  const args = (process.env.PW_CHROMIUM_ARGS || '').split(/\s+/).filter(Boolean);
  const out = { flags: args };
  try {
    const b = await chromium.launch({ args });
    const pg = await b.newPage();
    await pg.goto('about:blank');
    out.webgl = await pg.evaluate(() => {
      const res = {};
      for (const kind of ['webgl2', 'webgl']) {
        const c = document.createElement('canvas');
        let gl = null; try { gl = c.getContext(kind); } catch (e) {}
        if (gl) {
          const d = gl.getExtension('WEBGL_debug_renderer_info');
          res[kind] = { renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL)
                                     : gl.getParameter(gl.RENDERER) };
        } else { res[kind] = null; }
      }
      return res;
    });
    await b.close();
  } catch (e) { out.error = String(e && e.stack || e); }
  require('fs').writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  console.log('PREFLIGHT ' + JSON.stringify(out));
})();
"""


def preflight_renderer(env):
    """Prove the suite's own Chromium reaches the GPU under GL_FLAGS."""
    js_path = os.path.join(APP, "webgl_preflight.js")
    out_path = os.path.join(WORK, "preflight.json")
    with open(js_path, "w") as f:
        f.write(PREFLIGHT_JS)
    sh(NODE_ENV + f"node webgl_preflight.js '{out_path}'", cwd=APP, env=env)
    try:
        with open(out_path) as f:
            pf = json.load(f)
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not read preflight.json: {e}"}, None
    ctx = (pf.get("webgl") or {}).get("webgl2") or (pf.get("webgl") or {}).get("webgl")
    renderer = ctx["renderer"] if ctx else None
    pf["renderer"] = renderer
    pf["renderer_class"] = classify(renderer)
    return pf, renderer


def parse_suite_stats(results_json_path):
    """Read Playwright's JSON reporter stats (expected/unexpected/flaky/skipped)."""
    try:
        with open(results_json_path) as f:
            data = json.load(f)
        st = data.get("stats", {})
        return {
            "passed": st.get("expected"),
            "failed": st.get("unexpected"),
            "flaky": st.get("flaky"),
            "skipped": st.get("skipped"),
            "duration_ms": st.get("duration"),
        }
    except Exception as e:  # noqa: BLE001
        return {"parse_error": str(e)}


def main():
    t_start = time.monotonic()
    summary = {"gl_flags": GL_FLAGS, "ref": REF, "node_version": NODE_VERSION}
    try:
        sh("nvidia-smi -L || echo 'no nvidia-smi'")

        with stage("nvidia_gl_install"):
            nv = install_nvidia_gl()
        summary["nvidia_gl_install"] = nv
        summary["driver_version"] = nv.get("driver_version")
        print("\nNVIDIA-GL diagnostics:\n" + json.dumps(nv, indent=2))

        with stage("node_install"):
            sh("curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash",
               check=True)
            sh('export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; '
               f'nvm install {NODE_VERSION}', check=True)
            sh(NODE_ENV + f'test "$(node --version)" = "v{NODE_VERSION}"', check=True)

        with stage("clone"):
            sh(f"rm -rf '{APP}' && git clone --depth 1 --branch {REF} {REPO} '{APP}'",
               check=False)
            if not os.path.isdir(os.path.join(APP, ".git")):
                sh(f"git clone {REPO} '{APP}' && git -C '{APP}' checkout {REF}", check=True)
            _, head = sh(f"git -C '{APP}' rev-parse HEAD")
            summary["cloned_commit"] = head.strip().splitlines()[-1] if head.strip() else None

        # Guard: the clone MUST have the env-gated config (Stage-2 change on main),
        # else the suite would silently run SwiftShader again on the GPU box.
        cfg = os.path.join(APP, "playwright.config.ts")
        with open(cfg) as f:
            cfg_text = f.read()
        if "PW_CHROMIUM_ARGS" not in cfg_text:
            raise SystemExit(
                "STAGE-2 BLOCKED: cloned playwright.config.ts does not read "
                "PW_CHROMIUM_ARGS — the env-gated hardware-GL hook is not on this "
                f"ref ({REF}). Merge the Stage-2 config change first.")

        with stage("npm_ci"):
            sh(NODE_ENV + "npm ci", cwd=APP, check=True)
        with stage("browser_install"):
            code, _ = sh(NODE_ENV + "npm exec -- playwright install --with-deps chromium", cwd=APP)
            if code != 0:
                sh(NODE_ENV + "npm exec -- playwright install chromium", cwd=APP)
        with stage("build"):
            sh(NODE_ENV + "npm run build", cwd=APP, check=True)

        # PRE-FLIGHT: prove the renderer is hardware under GL_FLAGS before the suite.
        pf_env = dict(os.environ, PW_CHROMIUM_ARGS=GL_FLAGS)
        with stage("preflight_probe"):
            pf, renderer = preflight_renderer(pf_env)
        summary["preflight"] = pf
        summary["renderer"] = renderer
        summary["renderer_class"] = pf.get("renderer_class")
        print(f"\nPRE-FLIGHT renderer: {renderer!r} ({pf.get('renderer_class')})")

        # FULL suite — CI parity (retries=2, 240 s timeout via CI=1), Chromium
        # only (Firefox arm is a local-only qualification lane), NO test dropped.
        results_json = os.path.join(WORK, "playwright-results.json")
        suite_env = dict(
            os.environ,
            E2E_ENGINES="chromium",
            CI="1",
            PW_CHROMIUM_ARGS=GL_FLAGS,
            PLAYWRIGHT_JSON_OUTPUT_NAME=results_json,
        )
        with stage("e2e_suite"):
            code, _ = sh(
                NODE_ENV + "npm exec -- playwright test --reporter=list,json,html",
                cwd=APP, env=suite_env)
        summary["suite_exit_code"] = code
        summary["suite"] = parse_suite_stats(results_json)

        # Package the human-readable report + machine results for retrieval.
        sh(f"tar czf '{os.path.join(WORK, 'playwright-report.tgz')}' "
           f"-C '{APP}' playwright-report 2>/dev/null || echo '(no report dir)'")

        renderer_hw = summary.get("renderer_class") == "hardware"
        suite_pass = code == 0
        if renderer_hw and suite_pass:
            summary["verdict"] = "pass_on_hardware"
        elif suite_pass and not renderer_hw:
            summary["verdict"] = "pass_but_renderer_unconfirmed"
        elif renderer_hw and not suite_pass:
            summary["verdict"] = "hardware_but_suite_failed"
        else:
            summary["verdict"] = "failed"
    except SystemExit as e:
        summary["fatal"] = str(e)
        summary.setdefault("verdict", "aborted")
    except Exception as e:  # noqa: BLE001
        summary["fatal"] = f"{type(e).__name__}: {e}"
        summary["traceback"] = traceback.format_exc()
        summary.setdefault("verdict", "aborted")
    finally:
        summary["stage_timings_sec"] = timings
        summary["total_sec"] = round(time.monotonic() - t_start, 1)
        try:
            with open(os.path.join(WORK, "e2e_result.json"), "w") as f:
                json.dump(summary, f, indent=2, default=str)
        except Exception as e:  # noqa: BLE001
            print(f"WARN: could not write e2e_result.json: {e}")

    print("\n" + "=" * 72 + "\nE2E RESULT:\n" + "=" * 72)
    print(json.dumps(summary, indent=2, default=str))
    sys.exit(0 if summary.get("verdict") == "pass_on_hardware" else 1)


if __name__ == "__main__":
    main()
