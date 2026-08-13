import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { resolveEditorTarget } from '../dist/editor-request.js';

const root = resolve(join(tmpdir(), 'styletrace-project'));
mkdirSync(resolve(root, 'src/pages'), { recursive: true });
mkdirSync(resolve(root, 'src/components'), { recursive: true });
mkdirSync(resolve(root, 'src/styles'), { recursive: true });
writeFileSync(resolve(root, 'src/pages/index.astro'), 'one\n  .hero { margin: 0; }\nthree\n');
writeFileSync(resolve(root, 'src/components/Card.astro'), '<article></article>\n');
writeFileSync(resolve(root, 'src/styles/layout.css'), '.grid {\n  gap: 1rem;\n}\n');

test('editor target accepts project-relative files and opens at the end of the line', () => {
  assert.deepEqual(resolveEditorTarget(root, 'src/pages/index.astro:2'), {
    ok: true,
    file: resolve(root, 'src/pages/index.astro'),
    line: 2,
    column: 23,
    target: `${resolve(root, 'src/pages/index.astro')}:2:23`,
  });
});

test('editor target accepts absolute files inside the project root', () => {
  const file = resolve(root, 'src/components/Card.astro');
  assert.deepEqual(resolveEditorTarget(root, file), {
    ok: true,
    file,
    line: null,
    column: null,
    target: file,
  });
});

test('editor target strips Vite /@fs prefix before validation', () => {
  const file = resolve(root, 'src/styles/layout.css');
  assert.equal(resolveEditorTarget(root, `/@fs${file}:2`).target, `${file}:2:13`);
});

test('editor target preserves an explicit positive column', () => {
  const file = resolve(root, 'src/styles/layout.css');
  assert.equal(resolveEditorTarget(root, `${file}:2:4`).target, `${file}:2:4`);
});

test('editor target rejects path traversal outside the project root', () => {
  const target = resolveEditorTarget(root, '../outside.css:1');
  assert.equal(target.ok, false);
  assert.equal(target.status, 403);
});

test('editor target rejects absolute files outside the project root', () => {
  const target = resolveEditorTarget(root, resolve(tmpdir(), 'outside.css'));
  assert.equal(target.ok, false);
  assert.equal(target.status, 403);
});

test('editor target rejects missing, zero, and non-numeric lines', () => {
  assert.equal(resolveEditorTarget(root, null).status, 400);
  assert.equal(resolveEditorTarget(root, 'src/index.css:0').status, 400);
  assert.equal(resolveEditorTarget(root, 'src/index.css:abc').status, 400);
  assert.equal(resolveEditorTarget(root, 'src/index.css:1:0').status, 400);
  assert.equal(resolveEditorTarget(root, 'src/index.css:1:abc').status, 400);
});
