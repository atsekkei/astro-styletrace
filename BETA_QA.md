# Beta QA

Run these checks before publishing a beta build.

## Scenario A: Human fixes simple spacing

1. Start the playground with `pnpm dev`.
2. Open the playground route and press `Ctrl+Shift+C`.
3. Hold `Alt`, click a heading or paragraph with suspicious spacing.
4. Confirm the panel shows declared candidate, computed value, measured value, and a source `file:line`.
5. Click the source link and edit one spacing declaration in the editor.
6. Confirm HMR updates the page and the panel recomputes without using Copy for agent.
7. Confirm changed rows show a `before` value for the edited declaration.
8. Confirm selection survives HMR when the same DOM locator still exists after replacement.

## Scenario B: Human finds the real cause

1. Select the card grid or a card inside it.
2. Confirm the panel distinguishes card margins from parent `gap`.
3. Expand competing candidates and confirm each candidate has its own source link.
4. Change the winning source and verify measured distance changes after HMR.
5. Press `Enter` with the selection open and confirm the primary source opens with success feedback.

## Scenario C: Human delegates complex fix

1. Resize to a narrow mobile viewport.
2. Select the hero/editorial region.
3. Click `Copy for agent`.
4. Confirm the copied text includes element, viewport, source, selector, declared candidate, computed value, measured value, and competing candidate count.
5. Confirm the copied text does not include DOM subtree content, input values, cookies, localStorage, API tokens, or a home directory path.
6. Confirm the serialized observation JSON contains `version`, plain numbers/strings/booleans, and no DOM class instances or editor open targets.

## Scenario D: Production remains clean

1. Run `pnpm check`.
2. Run `pnpm check:compat`.
3. Run `npm publish --dry-run --tag beta`.
4. Confirm production output does not include `astro-styletrace/app`, `/__styletrace/css-map`, `/__styletrace/open-in-editor`, or `/__styletrace/session/*`.

## Scenario E: Agent pulls current selection

1. Start the playground and select an element with styletrace.
2. Confirm the panel shows `Agent ready · .astro-styletrace/handoff.md`.
3. Confirm `.astro-styletrace/current-observation.json` and `.astro-styletrace/handoff.md` exist in the project root.
4. Ask a workspace-aware agent to read `.astro-styletrace/handoff.md` and confirm it can find the selected element and source lines without a CLI command.
5. Run `npx astro-styletrace observation --url http://localhost:4321` and confirm the JSON includes `version`, element, viewport, declared candidates, computed values, measured values, selectors, and source lines.
6. Run `npx astro-styletrace source <file-from-observation> --line <line> --url http://localhost:4321`.
7. Confirm the source text is returned and path traversal outside the project root is rejected.
8. Start `npx astro-styletrace mcp --url http://localhost:4321` from an MCP client and confirm `styletrace_observation` and `styletrace_source` are listed.
9. Run `npx skills add atsekkei/astro-styletrace --skill astro-styletrace --list` after publishing the branch and confirm the skill is discoverable.
