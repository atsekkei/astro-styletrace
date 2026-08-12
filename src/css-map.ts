import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import postcss from 'postcss';
import type { Plugin } from 'vite';
import { normalizeSelector, type CssMap } from './core/css-map.js';

const STYLE_ID = /\.(css|scss|sass|less|styl|stylus)(\?|$)/;
const PLAIN_STYLE = new Set(['.css', '.scss', '.sass', '.less', '.styl', '.stylus']);

export type CssMapStore = {
  plugin(): Plugin;
  snapshot(): CssMap;
};

export function createCssMapStore(): CssMapStore {
  const map: CssMap = {};

  return {
    plugin() {
      return {
        name: 'astro-caliper:css-map',
        enforce: 'pre',
        apply: 'serve',
        transform(code, id) {
          const lines = collect(code, id);
          if (lines) {
            const file = fileOf(id);
            map[file] = lines;
          }
          return null;
        },
      };
    },

    snapshot() {
      return map;
    },
  };
}

function collect(code: string, id: string): Record<string, number[]> | null {
  if (!STYLE_ID.test(id)) return null;
  if (id.includes('/node_modules/')) return null;

  const file = fileOf(id);

  const blocks = PLAIN_STYLE.has(extname(file)) ? [{ code, offset: 0 }] : styleBlocks(file);
  if (!blocks?.length) return null;

  const out: Record<string, number[]> = {};

  for (const block of blocks) collectBlock(block, file, out);
  return out;
}

function collectBlock(
  block: { code: string; offset: number },
  file: string,
  out: Record<string, number[]>,
): void {
  let root: postcss.Root;
  try {
    root = postcss.parse(block.code, { from: file });
  } catch {
    return;
  }

  root.walkRules((rule) => {
    const line = rule.source?.start?.line;
    if (!line) return;

    const at = line + block.offset;
    const key = normalizeSelector(rule.selector);
    if (key) pushLine(out, key, at);

    if (rule.selectors.length > 1) {
      for (const part of rule.selectors) {
        const single = normalizeSelector(part);
        if (single) pushLine(out, single, at);
      }
    }
  });

}

function pushLine(out: Record<string, number[]>, selector: string, line: number): void {
  const lines = (out[selector] ??= []);
  if (!lines.includes(line)) lines.push(line);
}

function fileOf(id: string): string {
  return id.split('?')[0] ?? id;
}

function styleBlocks(file: string): { code: string; offset: number }[] | null {
  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  const blocks: { code: string; offset: number }[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    const at = source.indexOf('<style', cursor);
    if (at < 0) break;
    const start = source.indexOf('>', at);
    if (start < 0) break;
    const end = source.indexOf('</style', start);
    if (end < 0) break;
    blocks.push({
      code: source.slice(start + 1, end),
      offset: source.slice(0, start + 1).split('\n').length - 1,
    });
    cursor = end + 7;
  }
  return blocks;
}
