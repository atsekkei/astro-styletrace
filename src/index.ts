/**
 * Astro Integration。★Astro 依存はこのファイルと app.ts のみ（§3）。
 *
 * dev のみで有効。production build には一切含まれない。
 */

import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import launchEditorMiddleware from 'launch-editor-middleware';

/** クライアントの open-in-editor.ts と対で持つ。片方だけ変えないこと */
const OPEN_IN_EDITOR = '/__caliper/open-in-editor';

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
  <path d="M3 6h18" />
  <path d="M3 4v4M9 4v3M15 4v3M21 4v4" />
  <path d="M6 13h12" />
  <path d="M6 11v4M18 11v4" />
  <path d="M4 20h16" />
</svg>`;

export default function caliper(): AstroIntegration {
  return {
    name: 'astro-caliper',
    hooks: {
      'astro:config:setup': ({ command, addDevToolbarApp }) => {
        if (command !== 'dev') return;

        addDevToolbarApp({
          id: 'astro-caliper',
          name: 'Caliper',
          icon: ICON,
          entrypoint: fileURLToPath(new URL('./app.js', import.meta.url)),
        });
      },

      // §6.9 エディタジャンプ。CSSOM は行番号を持たないので、開くのはファイル単位
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(
          OPEN_IN_EDITOR,
          // 第 1 引数は「使うエディタの指定」。既定（環境変数 / 実行中のエディタを推測）に任せる
          launchEditorMiddleware(undefined, server.config.root, (file, error) => {
            server.config.logger.warn(`[astro-caliper] could not open ${file}: ${error ?? ''}`);
          }),
        );
      },
    },
  };
}
