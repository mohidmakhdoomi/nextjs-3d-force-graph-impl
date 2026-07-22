nextjs-3d-force-graph-impl
==========================

An implementation of 3d [react-force-graph](https://github.com/vasturiano/react-force-graph) in a [Next.js](https://github.com/vercel/next.js) App Router application and also uses some components directly from [Three.js](https://github.com/mrdoob/three.js).

**NOTE**: Updated for React 19 and Next 16 Active LTS; production builds (`npm run build`) use the default Turbopack bundler. The original React 19 / Next 15 port made minimal changes to files in this repo that are backwards compatible with the previous package.json except for the useRef changes in FocusGraph.tsx.

Serves as an example of combining various features of react-force-graph-3d + manipulating Three.js Camera, Controls and Scene + handling Next.js dynamic loading  

Additionally, uses [TypeScript](https://github.com/microsoft/TypeScript) with some simple [tailwindcss](https://github.com/tailwindlabs/tailwindcss), includes buttons that dynamically interact with the graph and makes use of useCallback, useEffect, useRef and useState [React](https://github.com/facebook/react) components.

Data used for the graph is a subset of the Neo4j StackOverflow Dataset.

## Functionality

| Action                                     | Description                                                                                                                             |
|--------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| Mouse left click on Node                   | Focus on Node and point camera at graph origin (0,0,0), <br>auto stop graph rotation, fix this Nodes position but unfix all other Nodes |
| Mouse right click on Node                  | Unfix this Nodes position                                                                                                               |
| Mouse left/middle/right click Drag on Node | On release of mouse button fix this Nodes position but unfix all other Nodes                                                            |
| Mouse scroll wheel                         | Zoom in and out of graph                                                                                                                |
| Mouse left click Drag on background        | Rotate graph around the origin (0,0,0)                                                                                                  |
| **Show / Hide Axes**                       | Show/Hide X, Y, Z axes helpers                                                                                                          |
| **Reset Camera**                           | Pause auto rotation if active, Zoom out to fit all nodes in view, Resume auto rotation if paused                                        |
| **Pause / Resume Auto Rotation**           | Pause/Resume automatic horizontal rotation of graph around origin (0,0,0)                                                               |             


#### NOTE:
In the first 4 seconds mouse interaction is disabled after which it is enabled. <br>This applies only to non button interaction listed in above table (buttons are bolded).   

## Reproducible development baseline

This repository supports exactly Node.js `22.23.1` with npm `10.9.8`. The
runtime is declared in `.nvmrc` and `package.json`; npm `10.9.8` generated the
committed lockfile v3.

The language and lint toolchain targets the **TypeScript 6** line — pinned
exactly in `package.json` and enforced by `tests/toolchain.test.mjs` — together
with the supported **ESLint 9** flat config in `eslint.config.mjs`. TypeScript 7
and ESLint 10 are intentionally deferred: TypeScript 7 is blocked by
`typescript-eslint` parser support (its declared TypeScript peer stops below
`6.1.0`), and ESLint 10 is tracked separately as a peer-compatibility experiment.

With [nvm](https://github.com/nvm-sh/nvm), install and verify the toolchain:

```sh
nvm install
nvm use
node --version # v22.23.1
npm --version  # 10.9.8
```

Install dependencies strictly from the lockfile, then install the Chromium
and Firefox binaries used by the browser smoke:

```sh
npm ci
npm run browser:install
```

### Validation commands

| Command | Purpose |
| --- | --- |
| `npm run lint` | Run the ESLint CLI across tracked source and configuration. |
| `npm run typecheck` | Run `tsc --noEmit`. |
| `npm test` | Check the toolchain, automation, and audit-evidence contracts. |
| `npm run build` | Create the production Next.js build. |
| `npm run start` | Start a previously built production application. |
| `npm run test:smoke` | Build, start the production server, and run the Chromium and Firefox WebGL smoke. |
| `npm run test:e2e:gpu` | Opt-in: run the full two-engine (Chromium + Firefox) e2e suite on verified hardware WebGL when a GPU adapter is usable, with honest software fallback otherwise. **Not part of the gate.** See [Opt-in native-GPU e2e lane](#opt-in-native-gpu-e2e-lane). |
| `npm run validate` | Fail fast through lint, typecheck, and the `test:smoke` browser suite (build plus the Chromium + Firefox WebGL smoke). |
| `npm run audit:full` | Report findings in the complete dependency graph. |
| `npm run audit:production` | Report findings with development dependencies omitted. |

`npm run validate` is the documented green gate: it runs lint, typecheck, and
`test:smoke`. The browser smoke observes a real WebGL drawing buffer and
exercises the axes, camera-reset, and rotation controls against `next start` in
both Chromium and Firefox; Playwright owns that server's startup and teardown.
`npm run validate` does not itself perform a standalone production start — a
direct `npm run start` serving the root page with HTTP 200 is verified separately
as a stage-qualification check.

**Local test parallelism (issue #41).** Local e2e runs are **serial by default**
(`workers: 1`) — the qualified `retries: 0` gate contract. Parallel execution is
**opt-in** via the `E2E_WORKERS` environment variable: a positive integer
(`E2E_WORKERS=4`) or a hardware-relative percentage (`E2E_WORKERS=50%`, scaled
from `os.cpus().length`); an invalid value fails loudly at config load rather than
silently running serial. Whenever `CI` is set the count is hard-pinned to `1`
regardless of `E2E_WORKERS`, so the sharded CI contract is untouched, and local
`retries: 0` is preserved so flakes stay visible. Parallel workers were qualified
and found to **destabilize** the timing-sensitive Chromium `matrix.spec.ts`
camera-settle/drag assertions under SwiftShader CPU contention (4–5 of 22 tests
fail on **every** parallel run there — the problem is destabilization, not speed:
parallel is actually faster), so parallelism is not the default. It is most useful
on the [native-GPU lane](#opt-in-native-gpu-e2e-lane), where the full two-engine
suite runs ~4× faster on real hardware and stays mostly green. Full qualification
evidence and the trade-off: `codev/reviews/41-parallelize-local-e2e-runs.md`.

### Audit evidence

Audits are evidence snapshots, not a zero-finding green gate. Either audit
command normally exits nonzero when it reports advisories; do not suppress that
status or run an automatic/forced fix as part of baseline validation. To inspect
why an affected package is installed, use:

```sh
npm explain <package>
```

The validation workflow preserves each audit's JSON and original exit code as
the `audit-full` and `audit-production` artifacts. It rejects malformed output,
registry errors, and inconsistent exit metadata instead of treating them as
valid advisory evidence.

### Continuous integration

GitHub Actions runs on pull requests and pushes to `main` using the same exact
Node/npm contract and `npm ci`. Locally, `npm run validate` is the one-command
green gate; in CI that gate is run as a **contract-equivalent decomposition**
across parallel jobs to cut wall clock (~15 min → ~5–6 min) without dropping any
check:

- **`quality`** — `npm run lint`, `npm run typecheck`, `npm test`, and both
  audit captures.
- **`e2e`** — the production build plus the full Playwright suite, split at the
  test level across four Chromium shards (`--shard=1/4 … 4/4`). Each shard runs
  strictly serially — the config resolves `workers` to `1` whenever `CI` is set
  (issue #41's `resolveWorkers` CI guard, which returns before reading
  `E2E_WORKERS`); `playwright.config.ts` sets `fullyParallel: true` so `--shard`
  splits per test rather than per file.
- **`merge-reports`** — stitches the per-shard blob reports into one HTML report.
- **`gate`** — a single required status that succeeds only when `quality` and
  `e2e` both pass.

CI enforces the Chromium (SwiftShader) WebGL arm as the deterministic gate — each
shard installs Chromium plus its Linux dependencies with:

```sh
npm exec -- playwright install --with-deps chromium
```

(the browser download is cached at `~/.cache/ms-playwright`, keyed on the
Playwright version) and runs its shard with `E2E_ENGINES=chromium`. Firefox has
no SwiftShader equivalent and cannot create a WebGL context on GPU-less runners,
so the Firefox arm of the two-engine matrix stays a documented **local**
qualification gate: `npm run browser:install` and `npm run validate` (with
`E2E_ENGINES` unset) exercise both engines locally. See
`codev/reviews/11-upgrade-and-behaviorally-quali.md` ("CI Enforcement vs. Local
Qualification").

On every run it uploads the two audit artifacts. When Playwright produces
diagnostics, the workflow also uploads the merged `playwright-report` and the
per-shard `playwright-test-results-<n>` artifacts.

## Opt-in native-GPU e2e lane

```sh
npm run test:e2e:gpu
```

An **opt-in, local-only** lane (issue #44 Chromium, issue #52 Firefox) that runs
the *full* **two-engine (Chromium + Firefox)** e2e suite on **genuine
hardware-accelerated WebGL** instead of SwiftShader. It is additional tooling and
evidence, **never the green gate**: `npm run validate`, `test:smoke`, CI, and
every committed test are unchanged and stay on the qualified SwiftShader serial
path (CI stays `E2E_ENGINES=chromium` SwiftShader-only — Firefox has no
SwiftShader equivalent and the Firefox arm is a **local** qualification lane, not
a CI gate). Nothing in the repo behaves differently unless you invoke the lane.

What one invocation does (`scripts/e2e-gpu-lane.mjs`):

1. **Probes the host per engine** and picks a hardware recipe from an
   evidence-ordered candidate list. **Chromium** uses ANGLE launch flags + the
   WSL2 Mesa d3d12 env (or ANGLE-Vulkan/GL on native Linux). **Firefox** uses the
   *same* Mesa d3d12 env with **no ANGLE flags** (Firefox reaches the adapter
   through the Mesa env alone). Unusable candidates are skipped with a one-line
   cause + remedy diagnostic.
2. **Verifies the renderer per engine before trusting anything**: launches the
   repo's own Playwright browser and reads `UNMASKED_RENDERER_WEBGL`; the string
   must not match the software deny-list (SwiftShader, llvmpipe, softpipe,
   lavapipe, swrast, software, Microsoft Basic). **Firefox renderer sanitization**:
   Firefox privacy-sanitizes the unmasked renderer to `Generic Renderer`, so the
   raw string is read through an **ephemeral, probe-only** preference
   `webgl.sanitize-unmasked-renderer: false` (Chromium's deny-list alone is too
   weak here — `Generic Renderer` matches no software marker, so it would
   false-pass as hardware; the lane classifies it as **unverifiable**, never
   hardware). This pref lives **only** in the probe browser — the application
   suite's Firefox profile keeps its normal `webgl.force-enabled: true` only.
   Failed candidates fall through (per-engine transcripts land in
   `gpu-lane-logs/probe-<engine>-….log`).
3. **Runs the suite** — `npm run build`, then one `npx playwright test` with
   `E2E_ENGINES=chromium,firefox`. Chromium's verified flags are injected through
   the config's `PW_CHROMIUM_ARGS` hook; **Firefox inherits the same Mesa env**
   from the suite process (no new config hook). Same production server, same
   **serial default** (`workers: 1`; set `E2E_WORKERS` to opt into parallel —
   ~4× faster here, see below), same `retries: 0`, same timeouts as the normal
   local suite.
4. **Reports honestly, per engine.** The run ends with a machine-greppable block:

   ```
   === E2E GPU LANE REPORT ===
   mode: hardware | software-fallback | skipped | abort
   engines: chromium,firefox
   renderer.chromium: <verbatim string | (software-fallback — SwiftShader)>
   renderer.firefox: <verbatim string | skipped (unverified — <reason>) | not run (<reason>)>
   suite: pass | fail (exit n) | skipped (no verified engine)
   wall-clock: <total>s (build <n>s, suite <n>s)
   ```

   `mode: hardware` is only ever printed after **every requested engine's**
   deny-list assertion passed. **Honest fallback** (no Firefox software
   masquerade): when the two engines cannot both verify hardware, Chromium runs
   under its deterministic SwiftShader fallback and **Firefox is skipped** with a
   stated reason (Firefox has no portable software-WebGL equivalent, so an
   unverified `llvmpipe` run is *never* presented as a qualified fallback), under
   an unmissable `SOFTWARE FALLBACK` banner at the start and before the report.
   Under `E2E_GPU_REQUIRE=1` the lane instead exits non-zero before build/suite if
   either engine is unverified. The suite's own pass/fail is the lane's exit code.

Measured on the qualification host (WSL2, RTX 3080): the full **two-engine**
hardware suite (22 tests) runs **serially** in ≈ 196 s (≈ 208 s total incl.
build) at `retries: 0`, versus the Chromium-only SwiftShader path measured in
`codev/reviews/52-firefox-hardware-webgl-gpu-lane.md` — the hardware lane runs
**twice the tests (both engines)** in a fraction of the software time, with the
SwiftShader-only hover/timing flake class absent. Full per-run / per-test
evidence and the software baseline live in that review (as the #44 lane's
evidence lives in `codev/reviews/44-add-an-opt-in-native-gpu-local.md`).

Issue #41's **opt-in parallel** (`E2E_WORKERS=50%` → 10 workers on this 20-core
host) cut that same two-engine hardware suite to ≈ 46 s (≈ 57 s incl. build) —
about **4× faster** — across a three-run qualification set. The known Firefox
flake #33 (below) recurred once in those three parallel runs (2/3 green), so
parallel remains opt-in and `retries: 0` keeps the amplification honest; the
SwiftShader gate stays serial (it fails 4–5/22 under parallel contention). Full
evidence: `codev/reviews/41-parallelize-local-e2e-runs.md`.

**Known Firefox flake**: `[firefox] tests/e2e/matrix.spec.ts:224` ("zooms in with
the wheel and rotates with a background drag") is a pre-existing Firefox
synthetic-input-delivery nondeterminism (not a software-WebGL timing problem — it
survives on hardware). It is **not masked with retries** and the canonical
assertion is **not weakened**. It is an **open, pre-existing** flake that surfaces
even serially at `retries: 0` (it recurred once in issue #41's serial SwiftShader
baseline), which is why it is tracked and why CI runs `retries: 2`. Parallel CPU
contention **amplifies** it (once in three hardware parallel runs), which is one
concrete reason parallel is opt-in, not the default. Issue #41 neither introduces
nor fixes it; it stays unmasked and the assertion unchanged, dispositioned here and
in review 41, never hidden.

### Env controls and flags

| Control | Effect |
| --- | --- |
| `--engine=chromium\|firefox\|all` | Select the engine set to probe and run. `all` (default) is the two-engine lane; single-engine values preserve targeted diagnostics and obey the same honesty rules. |
| `E2E_GPU_FORCE_FALLBACK=1` | Skip all hardware probing; take the honest fallback path (Chromium SwiftShader, Firefox skipped) deterministically. With `--engine=firefox` alone it is a benign no-op skip (Firefox has no software path), exit 0. |
| `E2E_GPU_REQUIRE=1` | Exit non-zero instead of falling back when **any requested engine** does not verify hardware — use for hardware-evidence runs so a silent fallback can't pollute results. With `--probe-only` the per-engine report is still printed (`mode: abort`) **before** the non-zero exit — the probe already did its work. |
| `--probe-only` | Probe + verify + report the requested engine set without building or running the suite. Always prints the report, even on a `E2E_GPU_REQUIRE=1` abort. |
| `E2E_WORKERS=<int\|percent>` | Config-level local worker count (issue #41), **inherited by this lane**. Opt into parallel with `E2E_WORKERS=50%` (hardware-relative) or `E2E_WORKERS=4`; **~4× faster** on this lane but can surface flake #33. Serial (`1`) by default; **pinned to `1` whenever `CI` is set**; an invalid value fails loudly at config load. |
| `--mode=headed\|headless` | Override the run mode. Default is **headless** (proven equivalent; see below). Headed needs WSLg/X (`DISPLAY`). |
| `--candidate=<id>` / `--channel=<name>` | Probe a specific Chromium recipe / a specific Playwright channel (`--channel` is probe-only). Chromium-only — rejected with `--engine=firefox`. Used by the FR5 matrix. |

Pass flags through npm like `npm run test:e2e:gpu -- --probe-only`.

### WSL2 Mesa d3d12 recipe (what the lane automates)

Proven on WSL2 + RTX 3080 (PR #43, then productized here). The lane detects
`/dev/dxg` + `/usr/lib/wsl/lib` and injects, per spawn (never into your
shell):

```sh
GALLIUM_DRIVER=d3d12                       # select Mesa's D3D12 gallium driver
LD_LIBRARY_PATH=/usr/lib/wsl/lib:$LD_LIBRARY_PATH   # WSL GPU driver libs (libd3d12.so, libdxcore.so)
# Chromium flags (via PW_CHROMIUM_ARGS):
--use-gl=angle --use-angle=gl --ignore-gpu-blocklist --disable-gpu-sandbox
```

`--use-angle=gl-egl` is a proven alternate backend (OpenGL ES 3.1);
ANGLE-Vulkan is a known llvmpipe dead end under WSL2 and is only tried on
native Linux. Optional multi-GPU disambiguators pass through if you export
them: `MESA_D3D12_DEFAULT_ADAPTER_NAME=<vendor>` (pick the adapter) and
`LIBGL_ALWAYS_SOFTWARE=false`. The sandbox/blocklist relaxations above exist
**only** inside this explicitly invoked lane — never in default launch args or
CI.

**Firefox** uses the *same* `GALLIUM_DRIVER=d3d12` + `LD_LIBRARY_PATH` Mesa env
and **no ANGLE flags** (no `--use-gl`/`--use-angle`; those are Chromium-only). In
the combined suite Firefox inherits that Mesa env from the suite process, so it
needs **no `playwright.config.ts` change**. The renderer probe launches Firefox
with two probe-only preferences and nothing else:

```js
firefoxUserPrefs: {
    "webgl.force-enabled": true,             // also the committed suite default
    "webgl.sanitize-unmasked-renderer": false, // PROBE ONLY — reveals the raw renderer
}
```

`webgl.sanitize-unmasked-renderer: false` is applied **only** to the ephemeral
renderer-probe browser (it changes renderer-string *disclosure*, not renderer
*selection*); the committed `firefox` Playwright project keeps
`webgl.force-enabled: true` only. On hardware the raw Firefox renderer reads
`D3D12 (NVIDIA GeForce RTX 3080)`; without the recipe it is `llvmpipe …`
(software), and without the sanitize pref it is the privacy-sanitized
`Generic Renderer` (treated as unverifiable, never hardware).

**Headless works** (2026-07 investigation): default Playwright headless
(headless shell), new headless (`--channel=chromium`), and headed WSLg all
reach the adapter with identical renderer strings and identical suite timing —
the d3d12 path needs no display, so the lane defaults to headless and works on
display-less WSL2 hosts. Evidence, including the 4-cell matrix and repeat-run
stability results, lives in `codev/reviews/44-add-an-opt-in-native-gpu-local.md`.

### Status and sequencing

- Renderer strings and timings above are **evidence dated 2026-07** on one
  host (Mesa 26.0.3, driver 581.29); driver updates can shift them. The lane
  probes rather than assumes, and falls back loudly.
- `workers` **defaults to `1`** in the lane, matching the qualified serial suite.
  Issue #41 qualified raising it and adopted a **serial-default + opt-in-parallel**
  contract: set `E2E_WORKERS=50%` (or an integer) to run this lane's two-engine
  suite in parallel (~4× faster on hardware). Parallel is not the default because
  it destabilizes the SwiftShader gate (4–5/22) and amplifies flake #33 (`retries:
  0` keeps that visible). See the "Local test parallelism" note above and
  `codev/reviews/41-parallelize-local-e2e-runs.md`.
