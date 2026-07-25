# Research 61 thread

## Scope

Architect directed this project to analyze the closed `E2E_WORKERS=22` failure set as root-cause research, separating evidence-backed conclusions from hypotheses and recommending explicit follow-up experiments without implementing fixes.

Reviewed issue #61's verbatim 10-run dataset, current Playwright/test code at baseline `f1eebf7`, validation architecture/lessons, and related evidence from #33, #34, #41, #55, and #56. The brief treats all six low-level signatures and all nine observed test×browser combinations as required targets, calls out missing renderer/resource/crash telemetry, prevents conflation with #55's fixed background-drag mechanism, and requires a falsifiable Research→EXPERIMENT program.

Scope artifact: `codev/research/e2e-instability-at-e2e-workers-brief.md`.

`scope-approval` was explicitly approved on 2026-07-25.

## Investigate

Completed independent Gemini, Codex, and Claude reports under `codev/research/`. All three favor a layered common-precursor model, with Chromium SwiftShader/high concurrency as the leading pressure source and distinct downstream failure mechanisms. Important disagreement remains over confidence: Gemini and Claude sometimes promote CPU starvation or specific downstream mechanisms too strongly, while Codex is more calibrated because direct host telemetry is absent. The synthesis must preserve that uncertainty, correct frequency discrepancies from the canonical issue data, and avoid treating `ERR_ABORTED`, zero camera delta, or historical symptom similarity as mechanism proof.

## Synthesize

Drafted `codev/research/e2e-instability-at-e2e-workers.md` as a standalone synthesis. It uses issue #61's canonical frequencies, distinguishes the closed nine-member test×browser set from the only-partially-observed six low-level signatures, resolves investigator disagreements conservatively, and recommends observability-first replay → same-host renderer control → targeted co-load → adaptive worker ladder. The draft explicitly rejects fixed browser-process counts and preserves conditional ownership. `git diff --check` is clean; no phase-specific porch checks exist.

## Critique

Completed the required independent Gemini, Codex, and Claude critique. All three found complete A–F and nine-row coverage. Incorporated the strongest corrections: common-precursor and Target D confidence reduced to moderate; exact CPU starvation reduced to low; memory/OOM added only as an unverified candidate; Target B now uses the successful earlier ordinary clicks as a discriminator; #11/#44/#52 validation-contract history and the #41/#56 host-identity ambiguity are explicit. The experiment program now stages passive versus focused probes, uses balanced 5+5 observer controls, requires measured co-load overlap, uses 15 clean trials for rare 2/10 tails, and has same-host-GPU and global-stop branches.

Rejected unsupported critique that WSL2 had a particular default memory cap or that Run 10's generic `ERR_ABORTED` directly indicates an OOM kill. Full adjudication is in `codev/research/e2e-instability-at-e2e-workers-critique-rebuttals.md`.

Final document structure/whitespace checks passed; `git diff --check` is clean; porch defines no phase-specific critique checks. `porch done 61` reached the `research-complete` gate, and `porch gate 61` requested human approval. Work is paused at the required gate.

Pre-approval architect correction applied: Disagreements item 1 now matches the confidence table and critique adjudication by rating exact CPU starvation **Low**, not low-moderate. Final-commit scope is confirmed as the final report, critique rebuttals, and this thread only; raw investigation and raw critique outputs remain disposable working artifacts.
