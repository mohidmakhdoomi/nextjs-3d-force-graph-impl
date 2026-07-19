# spir-11 thread — Upgrade and behaviorally qualify the Three.js force-graph stack

## 2026-07-19 — Spawn / Specify phase

- Strict-mode SPIR builder for issue #11 (Stage 2 of the modernization roadmap,
  depends on #10 which is merged as PR #24).
- No existing spec; drafting `codev/specs/11-upgrade-and-behaviorally-quali.md`
  from the detailed issue body. Issue has no Baked Decisions section.
- Pre-draft reconnaissance (registry checked 2026-07-19):
  - Targets exist and are exactly the current latest: `three@0.185.1`,
    `@types/three@0.185.1`, `react-force-graph-3d@1.29.1` — no drift from the
    research doc.
  - Peer tree is satisfiable: `react-force-graph-3d@1.29.1` → `3d-force-graph
    ^1.79` (1.80.0 requires `three >=0.179 <1`) → `three-render-objects ^1.41`
    (peer `three >=0.179`), `three-forcegraph 1` (peer `three >=0.118.3`).
    One deduped Three runtime is expected.
  - `three@0.185.1` still exports BOTH `./examples/jsm/*` and the documented
    `./addons/*` alias, so the import-path change is optional, not forced.
  - `react-force-graph-3d@1.29.1` d.ts still exports `ForceGraphMethods` /
    `GraphData` / `NodeObject` with defaulted generics — current component
    type usage should survive.
  - `tests/toolchain.test.mjs` pins `dependencies.three === "~0.172.0"`; that
    contract test must move with the upgrade.
  - Known harness limitation carried from #9/#10: headless SwiftShader Chromium
    does not register synthetic node DRAG (`onNodeDragEnd`) or node RIGHT-click
    (`onNodeRightClick`); matrix evidence for those items needs the scripted
    imperative-handle procedure and honest recording.
- Key spec decisions I'm proposing (flagged for reviewers/architect):
  - Second browser: Firefox (Playwright project), not WebKit.
  - Switch TrackballControls import to documented `three/addons/...` path.
  - Pin all three target packages exactly (issue says "exact" for three/types;
    extending to react-force-graph-3d for one-qualified-release rationale).

## 2026-07-19 — Specify iteration 1 consultation

- Verdicts: Gemini APPROVE, Claude APPROVE (verified every spec claim against
  the codebase), Codex REQUEST_CHANGES with five structural points — all
  accepted: settled the exact-pin and Firefox-in-CI decisions (no
  pre-authorized fallback; escalation only), split FR9 into explicit Class
  A/Class B acceptance classes, clarified the external-harness scope (no
  test-only app surface), and added supply-chain verification to FR6
  (registry-only sources, install-script delta, clean `npm ci`).
- Rebuttal at `codev/projects/11-upgrade-and-behaviorally-quali/11-specify-iter1-rebuttals.md`;
  spec Consultation Log updated. Awaiting porch re-verification.
