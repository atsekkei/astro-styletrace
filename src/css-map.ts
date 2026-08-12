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
            map[file] = { ...map[file], ...lines };
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

function collect(code: string, id: string): Record<string, number> | null {
  if (!STYLE_ID.test(id)) return null;
  if (id.includes('/node_modules/')) return null;

  const file = fileOf(id);

  const block = PLAIN_STYLE.has(extname(file)) ? { code, offset: 0 } : styleBlock(file, id);
  if (!block) return null;

  let root: postcss.Root;
  try {
    root = postcss.parse(block.code, { from: file });
  } catch {
    return null;
  }

  const out: Record<string, number> = {};

  root.walkRules((rule) => {
    const line = rule.source?.start?.line;
    if (!line) return;

    const at = line + block.offset;
    const key = normalizeSelector(rule.selector);
    if (key && out[key] === undefined) out[key] = at;

    if (rule.selectors.length > 1) {
      for (const part of rule.selectors) {
        const single = normalizeSelector(part);
        if (single && out[single] === undefined) out[single] = at;
      }
    }
  });

  return out;
}

function fileOf(id: string): string {
  return id.split('?')[0] ?? id;
}

function styleBlock(file: string, id: string): { code: string; offset: number } | null {
  const index = Number(/[?&]index=(\d+)/.exec(id)?.[1] ?? 0);

  let source: string;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    return null;
  }

  let at = -1;
  for (let i = 0; i <= index; i++) {
    at = source.indexOf('<style', at + 1);
    if (at < 0) return null;
  }

  const start = source.indexOf('>', at);
  if (start < 0) return null;

  const end = source.indexOf('</style', start);
  if (end < 0) return null;

  return {
    code: source.slice(start + 1, end),
    offset: source.slice(0, start + 1).split('\n').length - 1,
  };
}
