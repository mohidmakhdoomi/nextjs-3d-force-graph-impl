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

## 2026-07-19 — Spec approved; Plan phase

- Architect approved spec-approval with all three elections confirmed (exact
  rfg3d pin, three/addons path, Firefox inside the required CI gate).
- Plan drafted: 3 phases, baseline-first — (1) Firefox second engine on
  current deps, (2) Class A matrix automation + baseline evidence capture
  (incl. Class B transcripts per engine), (3) dependency flip + qualification.
  Single PR = rollback unit.
- Plan iteration 1: Claude APPROVE; Gemini caught that `toolchain.test.mjs`
  pins the exact `browser:install` string (Phase 1 would have broken
  `npm test` at its own commit — file added to Phase 1); Codex caught the
  CDP-is-Chromium-only trap for Firefox Class B evidence (now Playwright
  cross-engine `page.mouse` APIs as primary for both engines) and asked for
  an explicit FR5 no-drift step (added: app/components diff must be exactly
  the one-line import change). All points accepted.

## 2026-07-19 — Plan approved; Implement Phase 1 (firefox-second-engine)

- Architect approved plan-approval; baseline-first sequencing endorsed; Class B
  scripted procedure stays uncommitted per #9/#10 precedent.
- Phase 1 findings:
  - Registry drift check: zero drift; 0.185.1/1.29.1 still exactly latest.
  - **Firefox headless WebGL works** with a single pref:
    `firefoxUserPrefs: {"webgl.force-enabled": true}` (no Chromium flags
    inherited). First two-project smoke: chromium 32.7 s, firefox 43.4 s,
    both green on the current baseline deps.
  - Contract tests updated in lockstep (automation: workflow step renamed
    "Install Chromium, Firefox, and system dependencies"; toolchain:
    browser:install string) — 19/19 green at this phase's tree.
  - Lint caveat carried from review 10: `eslint .` traverses the untracked
    Claude Code harness file `.claude/hooks/worktree-write-guard.cjs` (18
    errors, all from that file); gate run with the harness dir moved aside →
    exit 0, then restored. Not project source; absent from CI and commits.
  - Typecheck exit 0.
  - Stability bar: 5/5 consecutive green two-project runs (1× full
    `test:smoke` incl. build + 4× `playwright test` on the same build).
    Firefox per-run range 39.0–43.4 s, zero flakes, zero unexpected errors.
