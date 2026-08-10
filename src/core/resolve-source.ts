/**
 * sheet → ソースファイルパス。§3 の差し替え点。
 *
 * ここだけが「Vite dev server が `<style>` に `data-vite-dev-id` を付ける」
 * という前提に依存している。別環境へ移すときはこのファイルを差し替える。
 */

export type Source = {
  /** 表示用の短いパス（プロジェクトルート相対に見えるもの） */
  label: string;
  /** エディタジャンプ用の生の値（絶対パス or URL）。M5 で使う */
  raw: string;
};

const INLINE: Source = { label: '(inline)', raw: '' };

export function resolveSource(sheet: CSSStyleSheet): Source {
  const node = sheet.ownerNode as HTMLElement | null;

  const devId = node?.dataset?.viteDevId;
  if (devId) return { label: shorten(devId), raw: devId };

  if (sheet.href) return { label: shorten(sheet.href), raw: sheet.href };

  return INLINE;
}

/**
 * `/Users/me/proj/src/styles/_layout.css?astro&type=style` → `src/styles/_layout.css`
 * cross-origin の URL はホスト名込みで残す（外部 CSS だと分かる方が有用）。
 */
export function shorten(id: string): string {
  const withoutQuery = id.split('?')[0] ?? id;

  if (/^https?:\/\//.test(withoutQuery)) {
    try {
      const url = new URL(withoutQuery);
      if (url.origin === location.origin) return trimLeadingSlash(url.pathname);
      return `${url.host}${url.pathname}`;
    } catch {
      return withoutQuery;
    }
  }

  const srcAt = withoutQuery.lastIndexOf('/src/');
  if (srcAt >= 0) return withoutQuery.slice(srcAt + 1);

  const modulesAt = withoutQuery.lastIndexOf('/node_modules/');
  if (modulesAt >= 0) return withoutQuery.slice(modulesAt + 1);

  return trimLeadingSlash(withoutQuery);
}

function trimLeadingSlash(s: string): string {
  return s.startsWith('/') ? s.slice(1) : s;
}
