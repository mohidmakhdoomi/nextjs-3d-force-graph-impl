# Architecture

This document evolves as the project grows. Update it during the review phase
of any work that introduces or changes architectural patterns.

## Validation Baseline

The repository's reproducibility contract is Node.js `22.23.1`, npm `10.9.8`,
lockfile v3, and clean `npm ci`. GitHub Actions runs contract tests plus the
shared `npm run validate` gate, whose real production-server Chromium smoke
checks WebGL and the core controls. Full and production npm audits are separate
evidence: CI validates their JSON/original status and uploads them without
turning existing advisory totals into a zero-findings gate. Contributor commands
and artifact names live in `README.md`; implementation details live in
`.github/workflows/validation.yml`, `playwright.config.ts`, and
`scripts/validate-audit-report.mjs`.
