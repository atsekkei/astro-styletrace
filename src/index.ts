import type { AstroIntegration } from 'astro';
import launchEditorMiddleware from 'launch-editor-middleware';
import type { StyletraceOptions } from './app.js';
import { createCssMapStore } from './css-map.js';

const OPEN_IN_EDITOR = '/__styletrace/open-in-editor';
const CSS_MAP = '/__styletrace/css-map';

export type { StyletraceOptions };

export default function styletrace(options: StyletraceOptions = {}): AstroIntegration {
  const cssMap = createCssMapStore();

  return {
    name: 'astro-styletrace',
    hooks: {
      'astro:config:setup': ({ command, injectScript, updateConfig }) => {
        if (command !== 'dev') return;

        updateConfig({ vite: { plugins: [cssMap.plugin()] } });

        injectScript(
          'page',
          `import boot from 'astro-styletrace/app';\nboot(${JSON.stringify(options)});`,
        );
      },

      'astro:server:setup': ({ server }) => {
        server.middlewares.use(CSS_MAP, (_req, res) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(cssMap.snapshot()));
        });

        server.middlewares.use(
          OPEN_IN_EDITOR,
          launchEditorMiddleware(undefined, server.config.root, (file, error) => {
            server.config.logger.warn(`[astro-styletrace] could not open ${file}: ${error ?? ''}`);
          }),
        );
      },
    },
  };
}
