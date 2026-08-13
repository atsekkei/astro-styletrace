---
name: astro-styletrace
description: Use when the user asks to fix, inspect, explain, or delegate styling for an Astro page element selected with astro-styletrace, or mentions .astro-styletrace/handoff.md, .astro-styletrace/current-observation.json, Agent ready, selected browser element, or current styletrace selection.
---

# astro-styletrace

Use this skill to consume astro-styletrace handoff files and make targeted CSS fixes from the element the user selected in the browser.

## Workflow

1. Read `.astro-styletrace/handoff.md` first.
2. Read `.astro-styletrace/current-observation.json` as the source of truth.
3. Inspect the referenced source files and lines before editing.
4. Identify the smallest CSS change that addresses the visual issue the user describes.
5. Prefer editing the declaration or nearby rule identified by the observation.
6. Preserve unrelated styles, layout structure, and generated Astro attributes.
7. Run the project checks that are appropriate for the edit.

If the handoff files are missing, ask the user to select the relevant element with astro-styletrace until the panel shows `Agent ready`.

## Observation Rules

- Treat `computed` as browser truth.
- Treat `declared` as the strongest candidate styletrace found, not a complete cascade proof.
- Use `measured` when reasoning about actual spacing, gaps, width, or height.
- Use `source.label` and `source.line` to locate CSS evidence.
- Do not expect DOM subtrees, input values, cookies, localStorage, API tokens, or editor open targets in the JSON.

## Editing Guidance

- For spacing bugs, compare `computed` and `measured`; margin collapse, parent `gap`, flex distribution, and `justify-content` can make them differ.
- For inherited typography, check `inheritedFrom` and inspect the ancestor rule before editing the selected element.
- When several candidates exist, inspect `others` before assuming the declared candidate is the only relevant source.
- Keep fixes local to the selected component/page unless the source line clearly belongs to a shared token or layout utility.
- After editing, ask the user to keep the same element selected or reselect it so astro-styletrace can regenerate the handoff if more iteration is needed.
