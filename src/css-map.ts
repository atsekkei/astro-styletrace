/**
 * PostCSS で `selector → 行番号` を作る Vite plugin（§6.9 M6）。★Vite 依存
 *
 * transform フックは「その CSS のソース文字列」を持っている唯一の場所。
 * ここで行番号を控えておかないと、ブラウザ側の CSSOM からは二度と辿れない。
 */

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
        // 他のプラグインが CSS を書き換える前の、書いたとおりの行に合わせる
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

  // `.astro` の `<style>` は 1 行に潰されて渡ってくるので、元ファイルから読み直す
  const block = PLAIN_STYLE.has(extname(file)) ? { code, offset: 0 } : styleBlock(file, id);
  if (!block) return null;

  let root: postcss.Root;
  try {
    root = postcss.parse(block.code, { from: file });
  } catch {
    // 未コンパイルの scss などは読めなくて当然。行が出ないだけで害はない
    return null;
  }

  const out: Record<string, number> = {};

  root.walkRules((rule) => {
    const line = rule.source?.start?.line;
    if (!line) return;

    const at = line + block.offset;
    const key = normalizeSelector(rule.selector);
    if (key && out[key] === undefined) out[key] = at;

    // `a, b { }` は CSSOM 側が片方だけを返すこともあるので、単体でも引けるようにする
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

/**
 * `.astro` の `<style>` ブロックを元ファイルから切り出す。
 *
 * transform に渡ってくる code は Astro がコンパイルした後のもので、改行が
 * 落ちて全ルールが同じ行になる。行番号が欲しいのだから、書いたままのソースを読む。
 * セレクタもスコープ属性が付く前の形になるが、正規化で吸収する。
 */
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
    // 切り出した 1 行目は `<style>` タグと同じ行にある
    offset: source.slice(0, start + 1).split('\n').length - 1,
  };
}
