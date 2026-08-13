import type { Source } from './resolve-source.js';

const ENDPOINT = '/__styletrace/open-in-editor';

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
