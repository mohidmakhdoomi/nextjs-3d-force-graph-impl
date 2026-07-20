# Lessons Learned

Durable engineering wisdom captured across the project's work. Update it during
the review phase of any work that surfaces a generally-applicable pattern,
gotcha, or constraint.

## Validation Evidence

- A continuously rendered software-WebGL canvas can make Playwright actionability
  waits expensive. Pause animation first; if the initial pause requires a forced
  click, prove the control's center receives pointer events and keep later
  interactions on ordinary Playwright clicks.
- When a diagnostic command intentionally returns nonzero for findings, do not
  normalize status blindly. Preserve the original exit and validate the
  machine-readable report structure so advisory evidence remains distinct from
  registry, tool, or malformed-output failures.
- When an upgrade-sensitive browser interaction fails, replay the same physical
  input against the rollback baseline before attributing it to dependency drift.
  Record the exact input and renderer that were exercised instead of broadening
  an environment-limited result into a full-pass claim. For a *nondeterministic*
  interaction (e.g. synthetic node drag under software rendering), a single
  before/after draw is not evidence — characterize the registration **rate**
  across repeated identical runs on both the upgraded and rollback stacks. Equal
  rates (observed 2/4 == 2/4 for node drag across the 0.172→0.185 three upgrade)
  prove a harness property, not a regression; only a rate that shifts with the
  upgrade is attributable to it.
- Verify react-force-graph interactions numerically through the imperative handle,
  not screenshots: reach it by walking the React fiber up from the three.js-created
  canvas (which has no fiber key) to the first React-managed ancestor, then to the
  ref whose `.current` exposes `graph2ScreenCoords`/`camera`/`scene`. Read
  `camera().position` for motion and node `__data.fx` for fixed-state. A rotating
  or inertia-settling camera stales projected node coordinates, so pause and let
  TrackballControls settle before aiming clicks at a node's exact
  `graph2ScreenCoords` center. In headless SwiftShader, Playwright synthetic node
  LEFT-clicks register (`onNodeClick`) reliably only on a *stationary* target —
  a click cannot land on an orbiting projection (the decisive hover raycast
  resolves one frame after pointerup while the projection pans ~430 px/s), so
  pause rotation first. Node RIGHT-clicks (`onNodeRightClick`) DO register when
  aimed at the fixed node's exact projection after wheeling the camera back out
  to a moderate positive depth (the focus tween can leave the node behind the
  camera, where `graph2ScreenCoords` returns a phantom center point). Node DRAG
  (`onNodeDragEnd`) registers only intermittently (~50%). All of this held
  identically across the three 0.172→0.185 upgrade in both Chromium and Firefox
  — treat the intermittent/blocked cases as a known harness delivery limitation,
  not an app defect, and qualify them with rate comparison against baseline.

## Toolchain and Worktree Hygiene

- A local gate failure caused **only** by an untracked builder-harness file
  (e.g. `.claude/hooks/worktree-write-guard.cjs`, which `eslint .` lints but which
  is absent from any `git clone`/`actions/checkout`) is environment noise, not a
  project-gate failure. Do **not** add a suppression to committed config (e.g.
  `.claude/**` to `eslint.config.mjs`) to silence it. Prove the gate on the
  committed tree instead: `git worktree add --detach <tmp> HEAD` (untracked harness
  files do not propagate) + real `npm ci` + `npm run validate` → exit 0. Use a real
  `npm ci`, not a symlinked `node_modules` — Turbopack rejects a symlink that
  "points out of the filesystem root".
- When `package.json` declares no `name`, `npm install` inside a builder worktree
  rewrites `package-lock.json`'s top-level `name` to the worktree directory
  basename (e.g. `spir-12` instead of the canonical `primary`). Reset it before
  committing — it is worktree contamination, not a dependency delta, and it muddies
  the lockfile diff. `npm ci` never rewrites the lockfile, so once corrected the
  value is stable for clean reproduction.
- The builder worktree ships **without** `node_modules`, so verifying an installed
  package's behavior (plugin rule counts, config shapes, parser warnings, peer
  ranges) via a bare `require('<pkg>')` silently resolves the **parent checkout's**
  `node_modules`, which can carry **stale** pre-branch versions — e.g. a bare
  `require('eslint-plugin-react-hooks')` resolving the parent's `5.1.0` (2 rules)
  instead of the manifest-pinned `7.1.1` (16/17/29 rules). This produced a
  contradictory reviewer reading during a spec consultation. Verify installed-package
  facts only after a real `npm ci` in the worktree (or an isolated version-exact
  probe), never a bare `require`.
