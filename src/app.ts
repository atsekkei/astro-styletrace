/**
 * クライアントのエントリ（§6.1）。★Astro 依存はこのファイルと index.ts のみ（§3）。
 *
 * Dev Toolbar App をやめたので、器はここで自前で作る（§3）。
 * core / ui は「描画先の ShadowRoot をもらう」としか知らない。
 */

import { createInspector } from './core/inspector.js';
import { createIndicator } from './ui/indicator.js';

export type CaliperOptions = {
  /** 起動ショートカット。`Ctrl+Shift+C` 形式（§5） */
  shortcut?: string;
};

const DEFAULT_SHORTCUT = 'Ctrl+Shift+C';

type ViteHot = {
  on(event: string, cb: () => void): void;
};

type Combo = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

export default function boot(options: CaliperOptions = {}): void {
  if (typeof document === 'undefined') return;

  const shortcut = options.shortcut ?? DEFAULT_SHORTCUT;
  const combo = parseShortcut(shortcut);

  // host は documentElement 直下に置く。body 直下だと `body > *:last-child` や
  // :nth-child() を使っているページに影響が出る（§5）
  const host = document.createElement('div');
  host.setAttribute('data-caliper', 'host');
  host.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;color-scheme:light;';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const inspector = createInspector(shadow);
  const indicator = createIndicator(shadow, shortcut);

  let active = false;

  function toggle() {
    active = !active;
    if (active) {
      inspector.start();
      indicator.show();
    } else {
      inspector.stop();
      indicator.hide();
    }
  }

  document.addEventListener(
    'keydown',
    (event) => {
      if (!matches(event, combo)) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
    },
    true,
  );

  // HMR で CSS が差し替わったら索引を捨てる（§7 / §10）
  const hot = (import.meta as ImportMeta & { hot?: ViteHot }).hot;
  hot?.on('vite:afterUpdate', () => inspector.invalidate());

  document.addEventListener('astro:after-swap', () => {
    // View Transition で host ごと差し替わることはないが、DOM は総入れ替えになる
    inspector.invalidate();
  });
}

function parseShortcut(shortcut: string): Combo {
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);

  const combo: Combo = { key: '', ctrl: false, meta: false, shift: false, alt: false };

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') combo.ctrl = true;
    else if (lower === 'cmd' || lower === 'meta' || lower === 'command') combo.meta = true;
    else if (lower === 'shift') combo.shift = true;
    else if (lower === 'alt' || lower === 'option') combo.alt = true;
    else combo.key = lower;
  }

  return combo;
}

/**
 * event.key は修飾キーで化ける（Shift + c が "C"、Alt + c が "ç" など）ため、
 * 物理キーの event.code で照合する。
 */
function matches(event: KeyboardEvent, combo: Combo): boolean {
  if (!combo.key) return false;
  if (event.ctrlKey !== combo.ctrl) return false;
  if (event.metaKey !== combo.meta) return false;
  if (event.shiftKey !== combo.shift) return false;
  if (event.altKey !== combo.alt) return false;

  const code = event.code.toLowerCase();
  return code === combo.key || code === `key${combo.key}` || code === `digit${combo.key}`;
}
