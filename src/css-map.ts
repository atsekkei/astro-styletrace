import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import postcss from 'postcss';
import type { Plugin } from 'vite';
import { normalizeSelector, type CssMap } from './core/css-map.js';
import { splitTopLevel } from './core/specificity.js';

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
        name: 'astro-styletrace:css-map',
        enforce: 'pre',
        apply: 'serve',
        transform(code, id) {
          const sources = collectSources(code, id);
          if (sources) {
            for (const [file, lines] of Object.entries(sources)) {
              map[file] = lines;
            }
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

export function collect(code: string, id: string): Record<string, number[]> | null {
  if (!STYLE_ID.test(id)) return null;
  if (id.includes('/node_modules/')) return null;

  const file = fileOf(id);
  return collectFile(code, file);
}

export function collectSources(code: string, id: string): CssMap | null {
  if (!STYLE_ID.test(id)) return null;
  if (id.includes('/node_modules/')) return null;

  const file = fileOf(id);
  const out: CssMap = {};
  collectSourcesInto(code, file, out, new Set());
  return Object.keys(out).length ? out : null;
}

function collectSourcesInto(code: string, file: string, out: CssMap, seen: Set<string>): void {
  if (seen.has(file)) return;
  seen.add(file);

  const lines = collectFile(code, file);
  if (lines) out[file] = lines;

  for (const imported of localImports(code, file)) {
    let importedCode: string;
    try {
      importedCode = readFileSync(imported, 'utf8');
    } catch {
      continue;
    }
    collectSourcesInto(importedCode, imported, out, seen);
  }
}

function collectFile(code: string, file: string): Record<string, number[]> | null {
  const blocks = PLAIN_STYLE.has(extname(file)) ? [{ code, offset: 0 }] : styleBlocks(file);
  if (!blocks?.length) return null;

  const out: Record<string, number[]> = {};

  for (const block of blocks) collectBlock(block, file, out);
  return Object.keys(out).length ? out : null;
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
    const selector = resolvePostcssNesting(rule);
    const key = normalizeSelector(selector);
    if (key) pushLine(out, key, at);

    const selectors = splitTopLevel(selector, ',');
    if (selectors.length > 1) {
      for (const part of selectors) {
        const single = normalizeSelector(part);
        if (single) pushLine(out, single, at);
      }
    }
  });

}

function resolvePostcssNesting(rule: postcss.Rule): string {
  let selector = rule.selector;
  let parent = rule.parent;

  while (parent && parent.type !== 'root') {
    if (parent.type === 'rule') selector = resolveNesting(selector, parent.selector);
    parent = parent.parent;
  }

  return selector;
}

function resolveNesting(selector: string, parent: string): string {
  const parentRef = splitTopLevel(parent, ',').length > 1 ? `:is(${parent})` : parent;

  return splitTopLevel(selector, ',')
    .map((part) => {
      if (part.includes('&')) return part.replace(/&/g, parentRef);
      return `${parentRef} ${part}`;
    })
    .join(', ');
}

function pushLine(out: Record<string, number[]>, selector: string, line: number): void {
  const lines = (out[selector] ??= []);
  if (!lines.includes(line)) lines.push(line);
}

function fileOf(id: string): string {
  return id.split('?')[0] ?? id;
}

function localImports(code: string, file: string): string[] {
  let root: postcss.Root;
  try {
    root = postcss.parse(code, { from: file });
  } catch {
    return [];
  }

  const out: string[] = [];
  root.walkAtRules('import', (rule) => {
    const specifier = importSpecifier(rule.params);
    if (!specifier) return;

    const resolved = resolveImport(file, specifier);
    if (resolved) out.push(resolved);
  });
  return out;
}

function importSpecifier(params: string): string | null {
  const trimmed = params.trim();
  const match =
    /^url\(\s*(?:"([^"]+)"|'([^']+)'|([^)'"\s]+))\s*\)/.exec(trimmed) ??
    /^(?:"([^"]+)"|'([^']+)')/.exec(trimmed);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function resolveImport(file: string, specifier: string): string | null {
  if (/^(?:[a-z]+:)?\/\//i.test(specifier)) return null;
  if (specifier.startsWith('/') || specifier.startsWith('\0')) return null;

  const base = resolve(dirname(file), specifier);
  const candidates = extname(base)
    ? [base]
    : ['.css', '.scss', '.sass', '.less', '.styl', '.stylus'].map((ext) => `${base}${ext}`);

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
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
