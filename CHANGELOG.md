# Changelog

## 0.1.0-beta.2

- Raised the styletrace host and overlay z-index values so the inspector stays above inspected page elements.

## 0.1.0-beta.1

- Improved the human self-fix workflow with HMR selection recovery, before/after value hints, source-open feedback, and keyboard source opening.
- Added a versioned `InspectorObservation` model shared by the panel, handoff JSON, and agent-facing formatters.
- Added local agent handoff files at `.astro-styletrace/current-observation.json` and `.astro-styletrace/handoff.md`.
- Added the `astro-styletrace` CLI with observation/source reads and an optional stdio MCP adapter.
- Added the shared `.agents/skills/astro-styletrace` skill for workspace-aware agents.
- Replaced `Copy for agent` with automatic local handoff and a pulsing context dot beside the selected element name.

## 0.1.0-beta.0

- First public beta target.
- Astro dev-only CSS inspection overlay and source panel.
- Source jump, measured geometry, competing candidates, and Copy for agent.
