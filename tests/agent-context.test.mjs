import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAgentContext } from '../dist/core/agent-context.js';

test('agent context contains inspection facts but excludes page data stores', () => {
  const text = formatAgentContext({
    target: 'section.hero',
    rect: { width: 320, height: 120 },
    viewport: { width: 390, height: 844 },
    metrics: [
      {
        property: 'margin-top',
        declared: {
          value: 'var(--space-l)',
          property: 'margin-block',
          source: { label: 'src/pages/index.astro', raw: '/project/src/pages/index.astro' },
          selector: '.hero',
          important: false,
          occurrence: 0,
        },
        others: [],
        inheritedFrom: null,
        computed: '64px',
        measured: 112,
        diverged: true,
      },
    ],
  });

  assert.match(text, /Element: section\.hero/);
  assert.match(text, /Viewport: 390 × 844px/);
  assert.match(text, /declared candidate: var\(--space-l\) via margin-block/);
  assert.doesNotMatch(text, /<input|value=|cookie|localStorage|sessionStorage|document\.cookie/i);
});
