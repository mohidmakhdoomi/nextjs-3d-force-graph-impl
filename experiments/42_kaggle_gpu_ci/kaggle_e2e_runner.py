#!/usr/bin/env python3
"""
Experiment 42 — Stage 2 (reference only; DO NOT run unless Stage 1 passes).

If (and only if) kaggle_webgl_probe.py confirms a hardware WebGL renderer, this
is the reference kernel script that would run the ACTUAL e2e suite on Kaggle GPU
and measure wall clock. It is included as the reference implementation the issue
asks for — it is intentionally NOT wired into the prototype workflow, because
running it is gated on Stage 1 succeeding AND an explicit go/no-go (Kaggle ToS).

Design constraints it must honor (from arch-critical.md + issue #42):
  - The Kaggle image is Python-first and does NOT contain our pinned toolchain.
    We must install Node 22.23.1 exactly (.nvmrc) and use `npm ci` against the
    committed lockfile. Because this runs under a *different* base OS/toolchain
    than the required gate, this lane can only ever be an ADDITIONAL,
    NON-REQUIRED GPU-qualification lane — never a replacement for the
    reproducible SwiftShader gate. (arch validation rule.)
  - No test may be dropped or its timing trimmed to manufacture a pass.
  - GL flags are injected via a Playwright launch-arg override env, using the
    winning flag set from Stage 1 (WINNING_GL_FLAGS below).

Reporting: like the probe, exit non-zero on any failure so the action surfaces
the log; retrieve artifacts (traces/report) via `kaggle kernels output <slug>`.
"""
import os
import subprocess
import sys

REPO = "https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl"
REF = os.environ.get("PROBE_REF", "main")          # commit/branch to test
NODE_VERSION = "22.23.1"                             # MUST match .nvmrc exactly
WINNING_GL_FLAGS = os.environ.get("WINNING_GL_FLAGS", "--use-gl=egl")


def sh(cmd, cwd=None, check=True, env=None):
    print(f"\n$ {cmd}", flush=True)
    r = subprocess.run(cmd, cwd=cwd, shell=True, text=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
    print(r.stdout, flush=True)
    if check and r.returncode != 0:
        sys.exit(f"FAILED ({r.returncode}): {cmd}")
    return r.returncode, r.stdout


def main():
    sh("nvidia-smi -L || echo 'no gpu'", check=False)

    # 1) Exact Node toolchain via nvm (the image's Node is the wrong version).
    sh("curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash")
    node_env = (
        'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; '
        f'nvm install {NODE_VERSION} && nvm use {NODE_VERSION} && '
    )
    sh(node_env + f'test "$(node --version)" = "v{NODE_VERSION}"')

    # 2) Clone at the ref under test (repo is public; action only uploads THIS
    #    script, so the kernel fetches the code itself).
    sh(f"rm -rf app_under_test && git clone --depth 1 --branch {REF} {REPO} app_under_test",
       check=False)  # --branch works for branch/tag; fall back to full clone + checkout
    if not os.path.isdir("app_under_test/.git"):
        sh(f"git clone {REPO} app_under_test && git -C app_under_test checkout {REF}")
    wd = "app_under_test"

    # 3) Reproducible install + browser + build (parallels validation.yml e2e job).
    sh(node_env + "npm ci", cwd=wd)
    sh(node_env + "npm exec -- playwright install --with-deps chromium", cwd=wd)
    sh(node_env + "npm run build", cwd=wd)

    # 4) HARD GATE (recorded on PR #45): playwright.config.ts HARDCODES the
    #    chromium launch args `--use-angle=swiftshader --enable-unsafe-swiftshader`
    #    and reads NO external args env. So `playwright test` forces SOFTWARE
    #    WebGL even on a GPU box, and PW_CHROMIUM_ARGS below is a NO-OP. A real
    #    Stage-2 GPU run therefore REQUIRES first changing the config to (a) drop
    #    the forced-swiftshader args for this lane and (b) inject WINNING_GL_FLAGS
    #    (e.g. read them from env in launchOptions.args). Until then, a Stage-2
    #    run would silently measure SwiftShader again — the exact failure this
    #    guard prevents. (Stage-1 probe is unaffected: it launches Chromium
    #    directly with its own args, not through this config.)
    cfg = os.path.join(wd, "playwright.config.ts")
    with open(cfg) as f:
        cfg_text = f.read()
    if "swiftshader" in cfg_text and "PW_CHROMIUM_ARGS" not in cfg_text:
        sys.exit(
            "STAGE-2 BLOCKED: playwright.config.ts still forces SwiftShader and "
            "does not consume PW_CHROMIUM_ARGS. Wire hardware-GL flags into the "
            "config before running the full suite on GPU (see PR #45 / notes.md)."
        )

    env = dict(os.environ, E2E_ENGINES="chromium", PW_CHROMIUM_ARGS=WINNING_GL_FLAGS)
    code, _ = sh(node_env + "npm exec -- playwright test", cwd=wd, check=False, env=env)

    sys.exit(code)  # non-zero => action reports failure + dumps log


if __name__ == "__main__":
    main()
