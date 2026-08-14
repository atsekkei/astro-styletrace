import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collect, collectSources } from '../dist/css-map.js';
import { loadCssMap, sourceLocationFor } from '../dist/core/css-map.js';

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

test('css map follows local stylesheet imports as separate sources', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'styletrace-css-map-'));
  try {
    const global = join(dir, 'global.css');
    const about = join(dir, 'about.css');
    await writeFile(about, '.about-title {\n  color: blue;\n}\n');

    const map = collectSources('@import "./about.css";\nbody { margin: 0; }\n', global);

    assert.deepEqual(map?.[global]?.body, [2]);
    assert.deepEqual(map?.[about]?.['.about-title'], [1]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('source lookup falls back to the unique imported file selector', async () => {
  const global = join(process.cwd(), 'src/styles/global.css');
  const about = join(process.cwd(), 'src/styles/about.css');
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        [global]: { body: [1] },
        [about]: { '.about-title': [7] },
      };
    },
  });

  try {
    await loadCssMap();
    assert.deepEqual(sourceLocationFor({ label: 'src/styles/global.css', raw: global }, '.about-title'), {
      source: { label: 'src/styles/about.css', raw: about },
      line: 7,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
