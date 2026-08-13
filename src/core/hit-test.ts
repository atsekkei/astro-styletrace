export function pick(x: number, y: number): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (isStyletrace(el)) continue;
    return el;
  }
  return null;
}

function isStyletrace(el: Element): boolean {
  if (el.hasAttribute('data-styletrace')) return true;
  if (el.closest('[data-styletrace]')) return true;
  if (el.closest('astro-dev-toolbar')) return true;
  return false;
}

export function parentOf(el: Element): Element | null {
  const parent = el.parentElement;
  if (!parent || isStyletrace(parent)) return null;
  return parent;
}

export function childOf(el: Element, x: number, y: number): Element | null {
  let fallback: Element | null = null;

  for (const child of Array.from(el.children)) {
    if (isStyletrace(child)) continue;
    if (!fallback) fallback = child;

    const rect = child.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return child;
  }

  return fallback;
}

export function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : '';
  const classes = Array.from(el.classList)
    .filter((c) => !c.startsWith('astro-'))
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${id}${classes}`;
}

export function locatorFor(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    parts.unshift(segmentFor(current));
    if (current.id) break;
    current = current.parentElement;
  }

  return parts.join('>');
}

export function resolveLocator(locator: string): Element | null {
  if (!locator) return null;

  try {
    return document.querySelector(locator);
  } catch {
    return null;
  }
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `${tag}#${cssEscape(el.id)}`;

  const classes = Array.from(el.classList)
    .filter((c) => !c.startsWith('astro-'))
    .slice(0, 2)
    .map((c) => `.${cssEscape(c)}`)
    .join('');

  const parent = el.parentElement;
  if (!parent) return `${tag}${classes}`;

  let index = 1;
  for (const sibling of Array.from(parent.children)) {
    if (sibling === el) break;
    if (sibling.tagName === el.tagName) index += 1;
  }

  return `${tag}${classes}:nth-of-type(${index})`;
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
