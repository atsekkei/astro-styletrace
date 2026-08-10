/**
 * ヒットテスト（§6.6）。
 *
 * オーバーレイには pointer-events: none が付いているので本来ここに現れないが、
 * 漏れると自分自身を計測して無限に混乱するため、属性でも二重に除外する（§10）。
 */

export function pick(x: number, y: number): Element | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (isCaliper(el)) continue;
    return el;
  }
  return null;
}

function isCaliper(el: Element): boolean {
  if (el.hasAttribute('data-caliper')) return true;
  if (el.closest('[data-caliper]')) return true;
  // Astro Dev Toolbar 本体（Shadow DOM のためホスト要素として 1 つ返る）
  if (el.closest('astro-dev-toolbar')) return true;
  return false;
}

/** Alt + ↑ / ↓ 用。移動できないときは null */
export function parentOf(el: Element): Element | null {
  const parent = el.parentElement;
  if (!parent || isCaliper(parent)) return null;
  return parent;
}

/**
 * ↓ は「今のポインタ位置を含む子」へ降りる。
 * 単純に firstElementChild を辿ると、見えていない要素に飛んでしまうため。
 */
export function childOf(el: Element, x: number, y: number): Element | null {
  let fallback: Element | null = null;

  for (const child of Array.from(el.children)) {
    if (isCaliper(child)) continue;
    if (!fallback) fallback = child;

    const rect = child.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return child;
  }

  return fallback;
}

/** 表示用の要素名。`div.card-grid#main` */
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

/**
 * Astro の scoped style は要素に data-astro-cid-XXXXXXXX を付ける。
 * ルール解決が空振りしたときの補助経路（§6.2）。
 */
export function astroComponentId(el: Element): string | null {
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-astro-cid-')) return attr.name.slice('data-astro-cid-'.length);
  }
  return null;
}
