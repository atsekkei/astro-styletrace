import assert from 'node:assert/strict';
import test from 'node:test';
import { formatInspectorObservation } from '../dist/core/agent-context.js';
import { serializeInspectorObservation } from '../dist/core/observation.js';

test('agent context contains inspection facts but excludes page data stores', () => {
  const observation = {
    version: 1,
    target: 'section.hero',
    borderBox: { width: 320, height: 120 },
    viewport: { width: 390, height: 844 },
    transformed: false,
    metrics: [
      {
        property: 'margin-top',
        declared: {
          value: 'var(--space-l)',
          property: 'margin-block',
          source: { label: 'src/pages/index.astro', line: 12, target: 'src/pages/index.astro:12' },
          selector: '.hero',
          important: false,
        },
        others: [],
        inheritedFrom: null,
        computed: '64px',
        measured: { value: 112, label: '112px' },
        diverged: true,
      },
    ],
  };

  const text = formatInspectorObservation(observation);

  assert.match(text, /Observation version: 1/);
  assert.match(text, /Element: section\.hero/);
  assert.match(text, /Viewport: 390 × 844px/);
  assert.match(text, /declared candidate: var\(--space-l\) via margin-block/);
  assert.doesNotMatch(text, /<input|value=|cookie|localStorage|sessionStorage|document\.cookie/i);
});

test('serialized observation is JSON data and excludes open targets', () => {
  const json = serializeInspectorObservation({
    version: 1,
    target: 'section.hero',
    borderBox: { width: 320, height: 120 },
    viewport: { width: 390, height: 844 },
    transformed: false,
    metrics: [
      {
        property: 'margin-top',
        declared: {
          value: 'var(--space-l)',
          property: 'margin-block',
          source: {
            label: 'src/pages/index.astro',
            line: 12,
            target: '/Users/example/project/src/pages/index.astro:12',
          },
          selector: '.hero',
          important: false,
        },
        others: [],
        inheritedFrom: null,
        computed: '64px',
        measured: { value: 112, label: '112px' },
        diverged: true,
      },
    ],
  });

  const parsed = JSON.parse(json);
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.borderBox, { width: 320, height: 120 });
  assert.equal(parsed.metrics[0].declared.source.label, 'src/pages/index.astro');
  assert.equal(parsed.metrics[0].declared.source.line, 12);
  assert.equal(parsed.metrics[0].declared.source.target, undefined);
  assert.doesNotMatch(json, /Users\/example|raw|DOMRect|CSSStyleDeclaration/);
});
