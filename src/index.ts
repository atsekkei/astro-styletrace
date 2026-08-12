/**
 * Astro Integration。★Astro 依存はこのファイルと app.ts のみ（§3）。
 *
 * dev のみで有効。production build には一切含まれない。
 */

import type { AstroIntegration } from 'astro';
import launchEditorMiddleware from 'launch-editor-middleware';
import type { CaliperOptions } from './app.js';
import { createCssMapStore } from './css-map.js';

/** クライアントの open-in-editor.ts / css-map.ts と対で持つ。片方だけ変えないこと */
const OPEN_IN_EDITOR = '/__caliper/open-in-editor';
const CSS_MAP = '/__caliper/css-map';

export type { CaliperOptions };

export default function caliper(options: CaliperOptions = {}): AstroIntegration {
  const cssMap = createCssMapStore();

  return {
    name: 'astro-caliper',
    hooks: {
      'astro:config:setup': ({ command, injectScript, updateConfig }) => {
        // ここが本番混入を防ぐ唯一の関門（§6.1）。条件を外さないこと
        if (command !== 'dev') return;

        // §6.9 M6。CSS のソース文字列を見られるのは transform フックだけ
        updateConfig({ vite: { plugins: [cssMap.plugin()] } });

        injectScript(
          'page',
          `import boot from 'astro-caliper/app';\nboot(${JSON.stringify(options)});`,
        );
      },

      // §6.9 エディタジャンプ
      'astro:server:setup': ({ server }) => {
        server.middlewares.use(CSS_MAP, (_req, res) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(cssMap.snapshot()));
        });

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
