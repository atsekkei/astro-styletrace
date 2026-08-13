# Beta QA

Run these checks before publishing a beta build.

## Scenario A: Human fixes simple spacing

1. Start the playground with `pnpm dev`.
2. Open the playground route and press `Ctrl+Shift+C`.
3. Hold `Alt`, click a heading or paragraph with suspicious spacing.
4. Confirm the panel shows declared candidate, computed value, measured value, and a source `file:line`.
5. Click the source link and edit one spacing declaration in the editor.
6. Confirm HMR updates the page and the panel recomputes without using Copy for agent.

## Scenario B: Human finds the real cause

1. Select the card grid or a card inside it.
2. Confirm the panel distinguishes card margins from parent `gap`.
3. Expand competing candidates and confirm each candidate has its own source link.
4. Change the winning source and verify measured distance changes after HMR.

## Scenario C: Human delegates complex fix

1. Resize to a narrow mobile viewport.
2. Select the hero/editorial region.
3. Click `Copy for agent`.
4. Confirm the copied text includes element, viewport, source, selector, declared candidate, computed value, measured value, and competing candidate count.
5. Confirm the copied text does not include DOM subtree content, input values, cookies, localStorage, API tokens, or a home directory path.

## Scenario D: Production remains clean

1. Run `pnpm check`.
2. Run `pnpm check:compat`.
3. Run `npm publish --dry-run --tag beta`.
4. Confirm production output does not include `astro-styletrace/app`, `/__styletrace/css-map`, or `/__styletrace/open-in-editor`.
