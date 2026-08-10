/**
 * Dev Toolbar App の器。★Astro 依存はこのファイルと index.ts のみ（§3）。
 *
 * canvas（このアプリ専用の ShadowRoot）を core に渡すだけ。
 */

import { defineToolbarApp } from 'astro/toolbar';
import { createInspector } from './core/inspector.js';

type ViteHot = {
  on(event: string, cb: () => void): void;
};

export default defineToolbarApp({
  init(canvas, app) {
    const inspector = createInspector(canvas);

    app.onToggled(({ state }) => {
      if (state) inspector.start();
      else inspector.stop();
    });

    // HMR で CSS が差し替わったら索引を捨てる（§7 / §10）
    const hot = (import.meta as ImportMeta & { hot?: ViteHot }).hot;
    hot?.on('vite:afterUpdate', () => inspector.invalidate());

    document.addEventListener('astro:after-swap', () => inspector.invalidate());
  },
});
