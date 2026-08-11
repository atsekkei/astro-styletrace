/**
 * `selector → 行番号` のマップ（§6.9 M6）。
 *
 * CSSOM は行番号を持たないので、dev server 側（src/css-map.ts）で PostCSS が
 * 作ったマップを一度だけ取ってきて、以後は同期的に引く。
 * hover のたびに fetch すると 60fps が出ない（§7）。
 */

import type { Source } from './resolve-source.js';

/** `{ ファイルの絶対パス: { 正規化セレクタ: 行番号 } }` */
export type CssMap = Record<string, Record<string, number>>;

/** src/css-map.ts の CSS_MAP と対。片方だけ変えないこと */
const ENDPOINT = '/__caliper/css-map';

let map: CssMap = {};

export async function loadCssMap(): Promise<void> {
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) return;
    map = (await response.json()) as CssMap;
  } catch {
    // M6 が無効な環境（build 済み / 別の dev server）では M5 の挙動に落ちる
    map = {};
  }
}

/** 行が分からなければ null。呼び出し側はファイル単位のジャンプに落とす */
export function lineFor(source: Source, rawSelector: string): number | null {
  const file = source.raw.split('?')[0];
  if (!file) return null;

  const lines = map[file];
  if (!lines) return null;

  return lines[normalizeSelector(rawSelector)] ?? null;
}

/**
 * CSSOM のセレクタと、ソース上のセレクタを突き合わせるためのキー。
 *
 * dev server 側と同じ関数を使う（ここを共有しないと、片方だけ直して静かに
 * マッチしなくなる）。Astro のスコープ属性は付いている側と付いていない側が
 * あるので落とす。
 */
export function normalizeSelector(selector: string): string {
  return selector
    .replace(/\[data-astro-cid-[^\]]*\]/g, '')
    // 属性値のクォートは CSSOM が " に揃える。ソース側は ' のこともある
    .replace(/'/g, '"')
    // `*::before` は CSSOM が `::before` に縮める
    .replace(/\*::/g, '::')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}
