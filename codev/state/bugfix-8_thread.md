# Bugfix #8 builder thread

## Investigate

- Confirmed issue #7 is merged at `d605178`; no competing open PR exists.
- Reproduced in development with the pinned Node 22.23.1/npm 10.9.8 toolchain: one page mount logged the main effect three times (`counter` 1, 2, and 3). React's development setup/cleanup replay accounts for the second run, while `parsedData` being reconstructed on render makes it an unstable dependency and causes the third.
- The counter at `FocusGraph.tsx:10-11,89-135` suppresses later setup rather than making setup/cleanup symmetric. The first setup creates two timeouts and an axes helper with no cleanup; the rotation effect separately creates an interval with no unmount cleanup. Reset creates another untracked timeout.
- `handleDragEnd` reads nodes from the transient `Graph` React element and lists `Graph?.props.graphData.nodes` as a callback dependency instead of using component graph data.
- Axes are found by a global scene name and only hidden/shown; setup can add duplicates and never removes/disposes the helper.
- Removing `FocusGraph.d.ts` in a temporary clean typecheck confirmed the installed Three types already cover the current application without compiler errors. The ambient declaration nevertheless blankets all Three imports as `any` and must be removed.
- Expected fix is contained to `FocusGraph.tsx`, deletion of `FocusGraph.d.ts`, and a focused lifecycle regression test, comfortably within BUGFIX scope.

## Fix

- Replaced the counter guard with symmetric effect setup/cleanup, stable memoized graph data, owned timer/helper refs, and direct node-data callbacks. Removed the ambient Three declaration and handled the typed material union during disposal.
- Added `tests/focus-graph-lifecycle.test.mjs`. Lint, clean typecheck, unit tests (14/14), production build/start, Playwright smoke, and a development-mode control/error check pass.
- Initial CMAP: Gemini approved; Codex requested a behavioral resource-ownership regression instead of source-only assertions; Claude was unavailable due quota. Extracted the timer/axes owner into `focusGraphResources.ts` and replaced the cleanup regex test with an injected-scheduler/scene test covering replay, replacement, idempotency, and teardown.
