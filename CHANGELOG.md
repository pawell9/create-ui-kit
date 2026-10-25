# Changelog

## v0.1.0 — 2026-10-25

First public release, experimental.

- Phases: preflight → G1 → audit → design → G2 → build → QA → G3 → corrections.
- Read-only `audit.js` (inventory, tokens, components, spec) and `qa.js` (structural scan with P0/P1/P2 codes, fingerprints).
- Offline test suite with a mock Figma Plugin API: 40 checks.
- Tested: offline tests; one read-only run of preflight and audit on a real Figma file.
- Not tested yet: build, QA and corrections end to end on a real file.
