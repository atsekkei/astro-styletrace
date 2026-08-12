import assert from 'node:assert/strict';
import test from 'node:test';
import { compareCascade } from '../dist/core/cascade.js';
import { measure } from '../dist/core/measure.js';
import { resolveNesting } from '../dist/core/stylesheet-index.js';

const weight = (overrides = {}) => ({
  important: false,
  inline: false,
  layer: null,
  specificity: [0, 1, 0],
  order: 0,
  declarationOrder: 0,
  ...overrides,
});

test('important beats higher specificity and later source order', () => {
  assert.ok(
    compareCascade(
      weight({ important: true }),
      weight({ specificity: [1, 0, 0], order: 99 }),
    ) > 0,
  );
});

test('cascade layer order reverses for important declarations', () => {
  assert.ok(compareCascade(weight({ layer: 2 }), weight({ layer: 0 })) > 0);
  assert.ok(
    compareCascade(
      weight({ important: true, layer: 0 }),
      weight({ important: true, layer: 2 }),
    ) > 0,
  );
  assert.ok(compareCascade(weight({ layer: null }), weight({ layer: 2 })) > 0);
  assert.ok(
    compareCascade(
      weight({ important: true, layer: 2 }),
      weight({ important: true, layer: null }),
    ) > 0,
  );
});

test('inline declarations win at equal importance', () => {
  assert.ok(
    compareCascade(
      weight({ inline: true, specificity: [1, 0, 0] }),
      weight({ specificity: [9, 9, 9], order: 99 }),
    ) > 0,
  );
});

test('nesting keeps selector-list branches independent', () => {
  assert.equal(resolveNesting('& > .icon, .label', '.card, .tile'), ':is(.card, .tile) > .icon, :is(.card, .tile) .label');
});

test('measure reports diagonal separation on both axes', () => {
  const a = { left: 0, right: 20, top: 0, bottom: 10 };
  const b = { left: 25, right: 35, top: 14, bottom: 24 };
  assert.deepEqual(measure(a, b), {
    kind: 'separate',
    horizontal: { gap: 5, dir: 'right', from: 20, to: 25 },
    vertical: { gap: 4, dir: 'down', from: 10, to: 14 },
  });
});

test('measure reports containment insets', () => {
  const outer = { left: 0, right: 100, top: 0, bottom: 80 };
  const inner = { left: 10, right: 70, top: 5, bottom: 65 };
  assert.deepEqual(measure(outer, inner), {
    kind: 'contains',
    outer: 'a',
    insets: { top: 5, right: 30, bottom: 15, left: 10 },
  });
});
