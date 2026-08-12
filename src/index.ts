import type { AstroIntegration } from 'astro';
import launchEditorMiddleware from 'launch-editor-middleware';
import type { CaliperOptions } from './app.js';
import { createCssMapStore } from './css-map.js';

const OPEN_IN_EDITOR = '/__caliper/open-in-editor';
const CSS_MAP = '/__caliper/css-map';

export type { CaliperOptions };

export default function caliper(options: CaliperOptions = {}): AstroIntegration {
  const cssMap = createCssMapStore();

  return {
    name: 'astro-caliper',
    hooks: {
      'astro:config:setup': ({ command, injectScript, updateConfig }) => {
        if (command !== 'dev') return;

        updateConfig({ vite: { plugins: [cssMap.plugin()] } });

        injectScript(
          'page',
          `import boot from 'astro-caliper/app';\nboot(${JSON.stringify(options)});`,
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
            server.config.logger.warn(`[astro-caliper] could not open ${file}: ${error ?? ''}`);
          }),
        );
      },
    },
  };
}
