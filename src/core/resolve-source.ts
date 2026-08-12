export type Source = {
  label: string;
  raw: string;
};

const EMBEDDED: Source = { label: '<style> element', raw: '' };

export function resolveSource(sheet: CSSStyleSheet): Source {
  const node = sheet.ownerNode as HTMLElement | null;

  const devId = node?.dataset?.viteDevId;
  if (devId) return { label: shorten(devId), raw: devId };

  if (sheet.href) return { label: shorten(sheet.href), raw: sheet.href };

  return EMBEDDED;
}

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
