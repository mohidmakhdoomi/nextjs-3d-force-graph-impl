# arch-critical.md — Always-On System-Shape Facts (HOT tier)

<!-- HOT tier: capped facts + a bounded map of arch.md. Always injected into every porch
phase prompt and into CLAUDE.md/AGENTS.md. CAP: <=10 facts, <=12 map topics, <=35 lines.
To add a fact, DEMOTE a weaker one into arch.md (displacement). MAINTAIN polices the cap
and keeps the map in sync with arch.md's top-level sections.
STARTER: replace the examples below with YOUR project's facts and arch.md sections. -->

## Critical facts (consult before deciding)
- The reproducibility contract is exact Node `22.23.1` / npm `10.9.8`, lockfile v3, and `npm ci`; do not regenerate dependencies under another toolchain.
- `npm run validate` is the green gate; full and production audits are separately validated evidence and existing advisories are not a zero-findings gate.

## Map of arch.md (consult when…)
- Validation Baseline — consult when changing toolchains, dependencies, CI, browser validation, or audit handling.
