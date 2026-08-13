import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { collect } from '../dist/css-map.js';

test('css map resolves native nesting to browser selector keys', () => {
  const file = join(process.cwd(), 'src/styles/nested.css');
  const map = collect(
    `
.card {
  & h2 {
    margin: 0;
  }
}
`,
    file,
  );

  assert.deepEqual(map?.['.card h2'], [3]);
});

test('css map keeps nested at-rule source lines', () => {
  const file = join(process.cwd(), 'src/styles/layout.css');
  const map = collect(
    `
.grid {
  display: grid;

  @media (min-width: 48rem) {
    & > article {
      margin-block: 2rem;
    }
  }
}
`,
    file,
  );

  assert.deepEqual(map?.['.grid > article'], [6]);
});

test('css map stores selector-list branches independently', () => {
  const file = join(process.cwd(), 'src/styles/layout.css');
  const map = collect(
    `
.card,
.tile {
  padding: 1rem;
}
`,
    file,
  );

  assert.deepEqual(map?.['.card, .tile'], [2]);
  assert.deepEqual(map?.['.card'], [2]);
  assert.deepEqual(map?.['.tile'], [2]);
});
