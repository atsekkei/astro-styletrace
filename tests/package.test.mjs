import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);

test('package tarball contains only publishable artifacts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'astro-styletrace-pack-'));
  try {
    const { stdout } = await exec('npm', ['pack', '--json', '--dry-run', '--ignore-scripts'], {
      cwd: process.cwd(),
      env: { ...process.env, npm_config_cache: join(temp, 'npm-cache') },
    });
    const [pack] = JSON.parse(stdout);
    const files = pack.files.map((file) => file.path).sort();

    assert(files.includes('dist/index.js'));
    assert(files.includes('dist/app.js'));
    assert(files.includes('dist/cli.js'));
    assert(files.includes('dist/index.d.ts'));
    assert(files.includes('dist/cli.d.ts'));
    assert(files.includes('README.md'));
    assert(files.includes('LICENSE'));
    assert(files.includes('CHANGELOG.md'));
    assert(!files.some((file) => file.startsWith('src/')));
    assert(!files.some((file) => file.startsWith('tests/')));
    assert(!files.some((file) => file.startsWith('playground/')));
    assert(!files.includes('spec.md'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
