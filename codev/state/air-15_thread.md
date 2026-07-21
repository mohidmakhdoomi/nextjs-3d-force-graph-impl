# air-15 — Remove skipLibCheck after 3D & TypeScript alignment (issue #15)

Protocol: AIR (strict). Worktree: `.builders/air-15`. Branch: `builder/air-15`.

## Phase: Implement

### Baseline
- `npm ci` clean (429 packages). Prereqs #11 (three/rfg 0.185.1/1.29.1) and #13 (TS 6.0.3) already on `main`.
- `tsc --noEmit` GREEN with `skipLibCheck: true`.
- No pre-existing custom `declare module` / ambient `.d.ts` in the repo (clean slate — good).

### Errors surfaced by `tsc --noEmit --skipLibCheck false` (exactly 3)

| # | File (node_modules) | Error | Classification |
|---|---|---|---|
| 1 | `3d-force-graph@1.80.0/dist/3d-force-graph.d.ts:1` | `import { Renderer } from 'three'` — TS2305 no exported member `Renderer` | **Transitive** (rfg→3d-force-graph). `three`/`@types/three` r0.185 removed the `Renderer` base interface; upstream still imports it. |
| 2 | `@vercel/speed-insights@1.1.0/dist/react/index.d.mts:39` | `JSX.Element` — TS2503 cannot find namespace `JSX` | **Direct dep.** React 19 `@types/react` moved `JSX` from global into `React.JSX`; upstream still uses the removed global. |
| 3 | `three-forcegraph@1.43.4/dist/three-forcegraph.d.ts:257` | `NodeType` does not satisfy constraint `NodeObject` — TS2344 | **Transitive** (rfg→3d-force-graph→three-forcegraph). Class `ThreeForceGraph<NodeType=…>` omits the `extends NodeObject` constraint its base `ThreeForceGraphGeneric` requires. Genuine upstream `.d.ts` bug. |

None are application code. All three packages are already at their **latest published version** (rfg 1.29.1, 3d-force-graph 1.80.0, three-forcegraph 1.43.4, speed-insights latest 2.0.0 still ships the same `JSX.Element`). So **no supported release resolves any of them** → the issue's "narrow, documented upstream workaround" clause applies.

### Decision: `patch-package` (uniform, for all 3)
- Error 3 is a malformed **class generic constraint** inside a bundled `.d.ts` — un-fixable by TS module augmentation (you can't re-constrain an existing class type param). That alone forces file-level patching.
- Using `patch-package` for all three keeps our own source tree **free of any ambient global/`declare module` declarations or suppressions** — the strongest alignment with the acceptance criterion "No broad ambient module declaration or unexplained suppression." Each patch is a minimal, reviewable, version-pinned diff attributable to one upstream defect.
- Rejected alternatives: global `JSX` shim + `declare module 'three'` augmentation (would leave ambient globals in our tree AND still can't fix error 3); downgrading `@types/three` (would de-align the single three type family — forbidden).

### Patches (minimal)
1. `three-forcegraph`: add `extends NodeObject` / `extends LinkObject<NodeType>` to the `ThreeForceGraph` class params.
2. `3d-force-graph`: drop `Renderer` from the `three` import; add a local minimal `Renderer` interface (the removed three base interface) so `extraRenderers?: Renderer[]` stays faithfully typed.
3. `@vercel/speed-insights` (react entry only — the only subpath in the program): `import type * as React from 'react'` + `JSX.Element` → `React.JSX.Element`.

Then remove `skipLibCheck` from `tsconfig.json`; add `patch-package` devDep + `postinstall`.

### ⚠️ Discovery: `next build` re-adds `skipLibCheck: true`
`next build` runs `writeConfigurationDefaults` and adds "suggested" tsconfig values for any **absent** key — `skipLibCheck: true` is one of them. So *removing* the key is silently undone on every build (verified: build printed "reconfigured your tsconfig.json … skipLibCheck was set to true"). Fix: set `"skipLibCheck": false` **explicitly**. Next respects a present key and does not override it (verified: rebuild leaves tsconfig untouched, value stays `false`). The issue permits "Remove **or disable**", so disabling is in-scope — and it's the only durable option here. Net diff is a single line: `true` → `false`.

### Verification
- `npm ci` → postinstall `patch-package Applying patches...` → all 3 patches applied → `tsc --noEmit` exit 0.
- `npm test` 33/33 pass (30 existing + 3 new toolchain invariants).
- `npm run lint` clean for project files; only failures are in untracked `.claude/hooks/worktree-write-guard.cjs` (builder-harness noise, absent from clean checkouts — per lessons-critical, proven on a clean detached checkout, not suppressed in committed config).
- `npm run build` exit 0, `skipLibCheck` stays `false` post-build.
- Full `npm run validate` (lint+typecheck+build+playwright smoke) proven on a clean `git worktree --detach` + real `npm ci` (below).
