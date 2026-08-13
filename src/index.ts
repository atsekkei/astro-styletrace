import type { AstroIntegration } from 'astro';
import launchEditorMiddleware from 'launch-editor-middleware';
import type { StyletraceOptions } from './app.js';
import { createCssMapStore } from './css-map.js';
import { resolveEditorTarget } from './editor-request.js';
import {
  createStyletraceSession,
  handleObservationSession,
  handleSourceRead,
  OBSERVATION_ENDPOINT,
  SOURCE_ENDPOINT,
} from './session.js';

const OPEN_IN_EDITOR = '/__styletrace/open-in-editor';
const CSS_MAP = '/__styletrace/css-map';

export type { StyletraceOptions };

export default function styletrace(options: StyletraceOptions = {}): AstroIntegration {
  const cssMap = createCssMapStore();
  const session = createStyletraceSession();

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

        server.middlewares.use(OBSERVATION_ENDPOINT, (req, res) => {
          handleObservationSession(session, server.config.root, req, res);
        });

        server.middlewares.use(SOURCE_ENDPOINT, (req, res) => {
          handleSourceRead(server.config.root, req, res);
        });

        const launchEditor = launchEditorMiddleware(undefined, server.config.root, (file, error) => {
          server.config.logger.warn(`[astro-styletrace] could not open ${file}: ${error ?? ''}`);
        });

        server.middlewares.use(OPEN_IN_EDITOR, (req, res) => {
          const url = new URL(req.url ?? '/', 'http://styletrace.local');
          const target = resolveEditorTarget(server.config.root, url.searchParams.get('file'));

          if (!target.ok) {
            res.statusCode = target.status;
            res.setHeader('content-type', 'text/plain; charset=utf-8');
            res.end(target.message);
            return;
          }

          url.searchParams.set('file', target.target);
          req.url = `${url.pathname}${url.search}`;
          launchEditor(req, res);
        });
      },
    },
  };
}
