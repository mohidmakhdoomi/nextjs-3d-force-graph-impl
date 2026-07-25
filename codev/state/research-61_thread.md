# Research 61 thread

## Scope

Architect directed this project to analyze the closed `E2E_WORKERS=22` failure set as root-cause research, separating evidence-backed conclusions from hypotheses and recommending explicit follow-up experiments without implementing fixes.

Reviewed issue #61's verbatim 10-run dataset, current Playwright/test code at baseline `f1eebf7`, validation architecture/lessons, and related evidence from #33, #34, #41, #55, and #56. The brief treats all six low-level signatures and all nine observed test×browser combinations as required targets, calls out missing renderer/resource/crash telemetry, prevents conflation with #55's fixed background-drag mechanism, and requires a falsifiable Research→EXPERIMENT program.

Scope artifact: `codev/research/e2e-instability-at-e2e-workers-brief.md`.
