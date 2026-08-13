# astro-styletrace

An Astro integration that shows **where a style came from** and **how far apart two elements are**, without opening DevTools.

Hold `Alt` to measure. `Alt + Click` an element to open a panel that tells you, for every declared property, what the CSS says, what the browser computed, and what the layout actually produced — plus the file it came from, one click away from your editor.

Use **Copy for agent** in the panel to copy that diagnosis — including selectors and source lines — as compact text you can paste into your coding agent.

Dev only. The integration bails out unless `command === 'dev'`, so nothing reaches a production build.

## Install

```bash
npm install -D astro-styletrace
# pnpm add -D astro-styletrace
# yarn add -D astro-styletrace
```

Supports Astro 5, 6, and 7 (Vite 6, 7, and 8 respectively).

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import styletrace from 'astro-styletrace';

export default defineConfig({
  integrations: [styletrace()],
  // The Dev Toolbar can stay off. styletrace does not depend on it.
  devToolbar: { enabled: false },
});
```

Start the dev server and press `Ctrl + Shift + C`.

## Keys

| Key | Action |
| --- | --- |
| `Ctrl + Shift + C` | Toggle styletrace on / off (default; configurable) |
| `Alt` (held) | Show the measurement overlay (the panel stays closed) |
| `Alt + Click` | Select an element and open the panel (click it again to close) |
| `Esc` / click outside | Clear the selection and close the panel |
| `Alt + ↑ / ↓` | Move the hovered element to its parent / child |

An indicator sits in the bottom-left corner while styletrace is on.

### Searching and reading are separate

While `Alt` is held you get the overlay only — no panel. `Alt + Click` the element you want to read and the panel opens; from then on **hovering no longer changes its contents**. The selection doubles as the reference point for measurement, so you can keep measuring the distance between the element you chose and anything else on the page. While you measure (`Alt` held) the panel fades back to stay out of the way. Clicking outside closes the panel and the click still reaches the page.

## Options

```js
styletrace({ shortcut: 'Alt+Shift+D' })
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `shortcut` | `string` | `'Ctrl+Shift+C'` | Toggle shortcut. `Ctrl` / `Cmd` / `Shift` / `Alt` plus one key. |

Change it if the default collides with a handler on your page. Matching is done on `event.code`, so keyboard layout and modifier-mangled `event.key` values do not matter.

## Reading the panel

One property per block. **Only properties that are actually declared appear.**

```
margin-top                        .row[data-astro-cid-j7pv25f6]  +2
  declared   var(--space-l)  via margin-block
  computed   64px
  measured   64px
src/pages/index.astro ↗
```

- **declared** is the strongest candidate by specificity, not a verdict on which rule won. If other declarations feed the same longhand, a `+N` badge appears. **A row without `+N` has exactly one candidate and can be trusted as-is.**
- **computed** is the only ground truth.
- **measured** is the difference between `getBoundingClientRect()` values. Rows where it disagrees with `computed` are highlighted. Margin collapsing, flex distribution, and `gap` losing to `justify-content` all show up here.
- If `font-size` / `line-height` are not declared on the element, styletrace walks up the ancestors and labels the source, e.g. `← body`.
- `width` / `height` get a row only when explicitly declared. The actual size is always shown in the header.

Click the source file name to open it in your editor, at the exact line when one can be resolved.

Click **Copy for agent** to copy the selected element, viewport, declared candidates, computed and measured values, selectors, competing-candidate counts, and `file:line` sources. The copied text labels declarations as candidates because styletrace does not claim to reproduce the complete cascade. Copying is explicit and local; nothing is sent to an external service.

### What measured means

| Property | Measured value |
| --- | --- |
| `width` / `height` | The content box, derived from `getBoundingClientRect()` minus border and padding. `getComputedStyle()` resolves these to the used value, which is the content box whatever `box-sizing` says, so both rows describe the same box. The header keeps showing the full border box. |
| `margin-*` | The real gap to the adjacent sibling, or to the parent's content box. Only shown when the element has a margin of its own — with a computed margin of `0` the space beside it belongs to the parent's `gap` or to the sibling's margin, not to this element. Margin collapsing and `gap` conflicts surface here. |
| `row-gap` / `column-gap` | The smallest actual gap between children |
| `padding-*`, `font-size`, `line-height` | None — computed only |

For example, a paragraph with `margin-block: 1rem` inside a flex container with `gap: 12px` reports a computed value of `16px` and a measured value of `44px`.

## Features

- Hit testing, hover highlighting, margin / padding boxes
- Distance measurement in all three configurations (separated / contained / overlapping) with guide lines and collision-avoiding labels
- Source resolution through `data-vite-dev-id`, including nested CSS `&`, conditional groups (`@layer` / `@media` / `@supports`), and declarations directly inside nested at-rules (`CSSNestedDeclarations`)
- Specificity calculation with `:is()` / `:where()` / `:has()` support, used to rank candidates
- Cross-origin sheets are kept in the index as unreadable rather than silently dropped
- `+N` for competing declarations, expandable in place
- Editor jump with a PostCSS-built `selector → line` map
- Agent-ready diagnostic copy with source lines and measured layout values

## Non-goals

styletrace deliberately does not show: the resolved value behind `var()`, the expansion of `clamp()`, px → rem / vw conversions, the full list of matched rules, specificity and `@layer` values, or a text export of the panel. The two questions worth answering are "what does the CSS say" and "what did it actually become" — not the derivation in between.

## Editor jump

The dev server runs `launch-editor` behind `/__styletrace/open-in-editor`. Editor selection is left to the `LAUNCH_EDITOR` / `EDITOR` environment variables, or inferred from a running editor.

Line numbers come from a Vite `transform` hook where PostCSS collects `selector → line` and serves it at `/__styletrace/css-map`. The map is fetched once at startup and read synchronously afterwards (fetching per hover cannot hold 60fps).

- For `.astro` `<style>` blocks the **original file is re-read** rather than the compiled code, which collapses newlines and puts every rule on the same line
- Selectors are matched through a normalization key (drop `[data-astro-cid-*]`, `'` → `"`, `*::before` → `::before`). The normalizer lives in one place, `src/core/css-map.ts`, and the dev server imports the same function
- Rules whose line cannot be resolved (cross-origin, inline, key mismatch) fall back to the top of the file

## Architecture

Everything except `src/index.ts` (the integration) and `src/app.ts` (the client shell) is free of Astro dependencies. This is machine-checked:

```bash
pnpm check
```

`app.ts` creates the host element and its ShadowRoot, listens for the shortcut, and calls `createInspector(shadowRoot)`. The host is attached directly under `document.documentElement` — under `body` it would break pages that rely on `body > *:last-child`.

Styles live in `src/ui/styles.ts` as a string rather than a `.css` file: Vite would otherwise inject the CSS into the whole page through the dev server, defeating the ShadowRoot.

## Development

```bash
pnpm install
pnpm build
pnpm --filter playground dev
```

| Script | Purpose |
| --- | --- |
| `pnpm build` | Compile to `dist/` |
| `pnpm watch` | Compile in watch mode |
| `pnpm typecheck` | Types only |
| `pnpm check` | `typecheck` + the Astro-dependency boundary check |
| `pnpm check:compat` | Pack and smoke-test the integration against Astro 5, 6, and 7 |

The design document is [spec.md](./spec.md) (Japanese).

## License

MIT
