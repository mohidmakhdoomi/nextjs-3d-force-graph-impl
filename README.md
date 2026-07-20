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
| `npm run validate` | Fail fast through lint, typecheck, build, production start, and browser smoke. |
| `npm run audit:full` | Report findings in the complete dependency graph. |
| `npm run audit:production` | Report findings with development dependencies omitted. |

`npm run validate` is the documented green gate. The browser smoke observes a
real WebGL drawing buffer and exercises the axes, camera-reset, and rotation
controls against `next start` in both Chromium and Firefox; Playwright owns
server startup and teardown.

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
Node/npm contract, `npm ci`, `npm test`, and `npm run validate`. CI enforces the
Chromium (SwiftShader) WebGL arm as the deterministic gate — it installs Chromium
plus its Linux dependencies with:

```sh
npm exec -- playwright install --with-deps chromium
```

and runs the Validate step with `E2E_ENGINES=chromium`. Firefox has no
SwiftShader equivalent and cannot create a WebGL context on GPU-less runners, so
the Firefox arm of the two-engine matrix stays a documented **local**
qualification gate: `npm run browser:install` and `npm run validate` (with
`E2E_ENGINES` unset) exercise both engines locally. See
`codev/reviews/11-upgrade-and-behaviorally-quali.md` ("CI Enforcement vs. Local
Qualification").

On every run it uploads the two audit artifacts. When Playwright produces
diagnostics, the workflow also uploads stable `playwright-report` and
`playwright-test-results` artifacts.
