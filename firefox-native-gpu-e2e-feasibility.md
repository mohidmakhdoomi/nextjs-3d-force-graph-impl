# Firefox Native-GPU E2E Feasibility

**Date:** 2026-07-21  
**Related:** GitHub issue [#44](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/issues/44), merged PR [#50](https://github.com/mohidmakhdoomi/nextjs-3d-force-graph-impl/pull/50)  
**Status:** Feasible follow-up; not implemented

## Verdict

Firefox hardware-WebGL support in `npm run test:e2e:gpu` is feasible. PR #50
deliberately made the lane Chromium-only because its proven configurations were
Chromium+ANGLE; Firefox hardware GL was explicitly out of scope rather than
blocked by a browser limitation (see
[`codev/specs/44-add-an-opt-in-native-gpu-local.md`](codev/specs/44-add-an-opt-in-native-gpu-local.md)).

The existing architecture already contains most of what is needed:

- Playwright has a Firefox project and supports selecting both projects with
  `E2E_ENGINES=chromium,firefox`.
- The Mesa D3D12 environment used by the Chromium lane is inherited by Firefox.
- Playwright supports per-launch environment variables and Firefox preferences.
- A combined Chromium+Firefox hardware run passed all 22 tests on the
  qualification host.

This should be delivered as a separate follow-up issue/spec, while leaving the
canonical validation command and CI workflow unchanged.

## Qualification Host

- WSL2, Linux kernel `6.6.87.2-microsoft-standard-WSL2`
- NVIDIA GeForce RTX 3080
- NVIDIA Windows driver `581.29`
- Mesa `26.0.3`
- Node.js `22.23.1`
- Playwright `1.61.1`, bundled Firefox `151.0`
- `/dev/dxg` and `/usr/lib/wsl/lib` available

`glxinfo -B` reported:

```text
Device: D3D12 (NVIDIA GeForce RTX 3080)
Accelerated: yes
OpenGL core profile version: 4.6
```

## Runtime Evidence

| Check | Result |
| --- | --- |
| Firefox headless with the Mesa D3D12 recipe | Hardware WebGL; raw renderer `D3D12 (NVIDIA GeForce RTX 3080)` |
| Firefox headed with the Mesa D3D12 recipe | Hardware WebGL works |
| Firefox without the GPU recipe | `llvmpipe (LLVM 21.1.8, 256 bits)` |
| Firefox full-suite run 1 | 11/11 passed in approximately 1.7 minutes |
| Firefox full-suite run 2 | 10/11 passed in approximately 1.8 minutes; known background-drag miss |
| Firefox full-suite run 3 | 11/11 passed in approximately 1.7 minutes |
| Background-drag test repeated independently | 5/5 passed |
| Combined Chromium+Firefox hardware run | 22/22 passed in 3.2 minutes |

The combined execution used the same shape a generalized wrapper would use:

```sh
E2E_ENGINES=chromium,firefox \
PW_CHROMIUM_ARGS='--use-gl=angle --use-angle=gl --ignore-gpu-blocklist --disable-gpu-sandbox' \
GALLIUM_DRIVER=d3d12 \
LD_LIBRARY_PATH=/usr/lib/wsl/lib \
MESA_D3D12_DEFAULT_ADAPTER_NAME=NVIDIA \
LIBGL_ALWAYS_SOFTWARE=false \
npx playwright test
```

## Firefox Renderer Verification

Firefox normally exposed the following values to page JavaScript under the
hardware recipe:

```text
renderer: Generic Renderer
vendor: Microsoft Corporation
```

This is Firefox privacy sanitization, not a software-renderer result. Reusing
Chromium's current deny-list against `Generic Renderer` would therefore be too
weak: it could produce an unverifiable or false hardware classification.

Firefox has a `webgl.sanitize-unmasked-renderer` preference. Setting it to
`false` only in the short-lived renderer-probe browser exposed the underlying
renderer:

```text
D3D12 (NVIDIA GeForce RTX 3080)
```

The software control exposed:

```text
llvmpipe (LLVM 21.1.8, 256 bits)
```

The preference should be disabled only for the ephemeral blank-page probe, not
for the application suite. It changes renderer-string disclosure, not renderer
selection. The suite can retain its normal Firefox profile and preferences.

Relevant upstream documentation and source:

- [Playwright `BrowserType.launch`](https://playwright.dev/docs/api/class-browsertype#browser-type-launch)
  supports launch environments and `firefoxUserPrefs`.
- [Firefox WebGL parameter handling](https://searchfox.org/firefox-main/source/dom/canvas/ClientWebGLContext.cpp)
  applies renderer sanitization conditionally.
- [Firefox renderer sanitization](https://searchfox.org/firefox-main/source/dom/canvas/SanitizeRenderer.cpp)
  recognizes `llvmpipe` and otherwise buckets or replaces renderer strings.
- [Firefox static WebGL preferences](https://searchfox.org/firefox-main/source/modules/libpref/init/StaticPrefList.yaml)
  define `webgl.sanitize-unmasked-renderer`.

## Required Implementation Changes

### 1. Generalize the probe by engine

Replace the Chromium-only launcher in
[`scripts/e2e-gpu-lane.mjs`](scripts/e2e-gpu-lane.mjs) with an
engine-aware launcher:

- Chromium: retain the candidate's ANGLE flags and Mesa environment.
- Firefox: use the same Mesa environment, no Chromium ANGLE flags, and probe
  with:

  ```js
  firefoxUserPrefs: {
      "webgl.force-enabled": true,
      "webgl.sanitize-unmasked-renderer": false,
  }
  ```

The probe should record a renderer and vendor for each requested engine. Expand
the software deny-list to fail closed for at least SwiftShader, llvmpipe,
softpipe, lavapipe, swrast, software rasterizers, and Microsoft Basic Render
Driver.

### 2. Verify every requested engine

For the default two-engine lane, a candidate is fully verified only after both
Chromium and Firefox return hardware renderer verdicts. Under
`E2E_GPU_REQUIRE=1`, failure to verify either engine should exit nonzero before
the build or suite starts.

An optional `--engine=chromium|firefox|all` control would preserve targeted
diagnostics while allowing `all` to be the intended two-engine behavior.

### 3. Run the existing two-engine Playwright matrix

For a verified candidate, set:

```text
E2E_ENGINES=chromium,firefox
```

Continue setting `PW_CHROMIUM_ARGS` for Chromium. Firefox needs no new
Playwright-config hook because it inherits the Mesa environment from the suite
process. The build should still run once, followed by one Playwright invocation
with `workers: 1` and `retries: 0` unchanged.

### 4. Make the report engine-aware

The current report hardcodes `engine: chromium` and one renderer. Replace that
with an explicit per-engine contract, for example:

```text
=== E2E GPU LANE REPORT ===
mode: hardware
engines: chromium,firefox
renderer.chromium: ANGLE (... D3D12 ...)
renderer.firefox: D3D12 (NVIDIA GeForce RTX 3080)
suite: pass
wall-clock: ...
```

Update unit tests and any consumers that grep the existing report keys.

### 5. Preserve honest fallback semantics

Firefox has no portable bundled SwiftShader equivalent. If both hardware
engines cannot be verified, the safest default behavior is:

- preserve PR #50's deterministic Chromium SwiftShader fallback;
- skip Firefox and report why it was skipped;
- under `E2E_GPU_REQUIRE=1`, fail instead of falling back.

Do not label an unverified Firefox llvmpipe run as equivalent to Chromium's
qualified SwiftShader fallback. A portable Firefox software lane would need
separate dependencies and qualification.

## Known Stability Caveat

Hardware rendering did not eliminate Firefox's existing synthetic
background-drag flake:

```text
[firefox] tests/e2e/matrix.spec.ts:224
zooms in with the wheel and rotates with a background drag

Expected camera delta: > 1
Observed camera delta: 0.0006443659645876926
```

PR #50's review had already recorded the same test failing once in two local
Firefox validation runs. This investigation reproduced it once in three full
hardware Firefox runs, although the test then passed 5/5 when repeated alone
and also passed in the combined 22-test run.

Therefore the issue is better described as Firefox synthetic-input delivery
nondeterminism, not solely a slow software-WebGL timing problem. A follow-up
should either fix/qualify that test separately or explicitly accept the known
local qualification flake. It should not hide it with retries or weaken the
canonical assertion as part of the GPU-lane change.

## Recommended Acceptance Criteria

- `npm run test:e2e:gpu` verifies hardware renderers independently for Chromium
  and Firefox before running a two-engine hardware suite.
- Firefox's raw probe renderer is collected through the probe-only sanitization
  preference and rejects known software renderers.
- A verified WSL2 candidate runs all 22 tests in one Playwright invocation.
- `E2E_GPU_REQUIRE=1` fails if either requested engine is not hardware-backed.
- Non-strict exhaustion retains a loud Chromium software fallback and clearly
  reports Firefox as skipped/unverified.
- At least three consecutive full two-engine hardware runs pass with
  `retries: 0`, or any Firefox flake is explicitly resolved and requalified.
- `npm run validate`, `test:smoke`, `.github/workflows/validation.yml`, browser
  defaults, `workers`, retries, and committed test timings remain unchanged.
- No new dependency or lockfile change is introduced.

## Conclusion

This is a **go** as a focused follow-up feature. There is no Firefox or
Playwright blocker, headless Firefox reaches the WSL2 D3D12 adapter, exact
renderer verification is available through an ephemeral probe preference, and
the existing Playwright configuration already runs both engines successfully.

The principal remaining risk is test stability, specifically the known Firefox
background-drag input-delivery flake. That should be handled transparently in
the follow-up's qualification rather than attributed to software rendering or
masked with retries.
