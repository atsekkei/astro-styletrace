/**
 * エディタジャンプとコピー（§6.9 / M5）。
 *
 * CSSOM は行番号を持たないので、開けるのはファイル単位まで。
 * 行を特定するために、セレクタをクリップボードへ渡す口も並べて置く。
 */

import type { Source } from './resolve-source.js';

/** src/index.ts の OPEN_IN_EDITOR と対。片方だけ変えないこと */
const ENDPOINT = '/__caliper/open-in-editor';

/**
 * 出自からエディタで開けるパスを取り出す。開けないなら null。
 *
 * - `data-vite-dev-id` は絶対パス。クエリ（`?astro&type=style`）だけ落とす
 * - same-origin の URL は dev server root からの相対パスとして渡す
 * - cross-origin はディスク上に無いので開けない
 */
export function editorTarget(source: Source): string | null {
  const raw = source.raw;
  if (!raw) return null;

  const withoutQuery = raw.split('?')[0] ?? raw;

  if (/^https?:\/\//.test(withoutQuery)) {
    try {
      const url = new URL(withoutQuery);
      if (url.origin !== location.origin) return null;
      return url.pathname.replace(/^\/+/, '');
    } catch {
      return null;
    }
  }

  return withoutQuery || null;
}

export async function openInEditor(file: string): Promise<boolean> {
  try {
    const response = await fetch(`${ENDPOINT}?file=${encodeURIComponent(file)}`);
    return response.ok;
  } catch {
    return false;
  }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
