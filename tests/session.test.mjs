import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  clearHandoffFiles,
  createStyletraceSession,
  HANDOFF_FILE,
  OBSERVATION_FILE,
  resolveSourceTarget,
  writeHandoffFiles,
} from '../dist/session.js';

test('styletrace session stores the current observation only', () => {
  const session = createStyletraceSession();
  assert.equal(session.observation(), null);

  session.update({
    version: 1,
    target: 'section.hero',
    borderBox: { width: 320, height: 120 },
    viewport: { width: 390, height: 844 },
    transformed: false,
    metrics: [],
  });

  assert.equal(session.observation().target, 'section.hero');
  session.clear();
  assert.equal(session.observation(), null);
});

test('source target validation stays inside project root', () => {
  const root = resolve(join(tmpdir(), 'styletrace-session-project'));
  mkdirSync(resolve(root, 'src/pages'), { recursive: true });
  writeFileSync(resolve(root, 'src/pages/index.astro'), '<style>.hero { margin: 0; }</style>\n');

  assert.deepEqual(resolveSourceTarget(root, 'src/pages/index.astro:1'), {
    ok: true,
    file: resolve(root, 'src/pages/index.astro'),
    label: 'src/pages/index.astro',
  });

  const outside = resolveSourceTarget(root, '../outside.css');
  assert.equal(outside.ok, false);
  assert.equal(outside.status, 403);
});

test('handoff files are written as well-known agent context', async () => {
  const root = await mkdtemp(join(tmpdir(), 'styletrace-handoff-'));
  try {
    await writeHandoffFiles(root, {
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
            source: { label: 'src/pages/index.astro', line: 12, target: null },
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

    const observation = JSON.parse(await readFile(resolve(root, OBSERVATION_FILE), 'utf8'));
    const handoff = await readFile(resolve(root, HANDOFF_FILE), 'utf8');

    assert.equal(observation.target, 'section.hero');
    assert.equal(observation.metrics[0].declared.source.target, undefined);
    assert.match(handoff, /# astro-styletrace handoff/);
    assert.match(handoff, /current-observation\.json/);
    assert.match(handoff, /src\/pages\/index\.astro:12/);

    await clearHandoffFiles(root);
    await assert.rejects(readFile(resolve(root, HANDOFF_FILE), 'utf8'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
