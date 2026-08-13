import { execFile, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const matrix = [
  { range: '^5.0.0', port: 4355 },
  { range: '^6.0.0', port: 4366 },
  { range: '^7.0.0', port: 4377 },
];

const temp = await mkdtemp(join(tmpdir(), 'astro-styletrace-compat-'));
const npmEnv = { ...process.env, npm_config_cache: join(temp, 'npm-cache') };

try {
  const { stdout } = await exec('npm', ['pack', '--json', '--pack-destination', temp], {
    cwd: root,
    env: npmEnv,
  });
  const packed = JSON.parse(stdout);
  const tarball = join(temp, packed[0].filename);

  for (const target of matrix) {
    await checkVersion(target, tarball);
  }
} finally {
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function checkVersion(target, tarball) {
  const fixture = join(temp, `astro-${target.range.slice(1, 2)}`);
  await mkdir(join(fixture, 'src', 'pages'), { recursive: true });

  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify(
      {
        private: true,
        type: 'module',
        dependencies: {
          astro: target.range,
          'astro-styletrace': `file:${tarball}`,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(fixture, 'astro.config.mjs'),
    `import { defineConfig } from 'astro/config';\nimport styletrace from 'astro-styletrace';\n\nexport default defineConfig({ integrations: [styletrace()] });\n`,
  );
  await writeFile(
    join(fixture, 'src', 'pages', 'index.astro'),
    `<main class="fixture">compat</main>\n\n<style>\n  .fixture { margin-block: 1rem; }\n</style>\n`,
  );

  await exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: fixture,
    env: npmEnv,
  });

  const astro = join(fixture, 'node_modules', '.bin', 'astro');
  const { stdout: versionOutput } = await exec(astro, ['--version'], { cwd: fixture });
  const version = versionOutput.trim();

  await exec(astro, ['build'], { cwd: fixture });
  const productionHtml = await readFile(join(fixture, 'dist', 'index.html'), 'utf8');
  assert(!productionHtml.includes('astro-styletrace/app'), `${version}: client leaked into build`);

  const child = spawn(
    astro,
    ['dev', '--host', '127.0.0.1', '--port', String(target.port)],
    {
      cwd: fixture,
      env: { ...process.env, ASTRO_DEV_BACKGROUND: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  try {
    const base = `http://127.0.0.1:${target.port}`;
    const html = await poll(`${base}/`);
    const pageScriptPath = html.match(/<script[^>]+src="([^"]*astro:scripts\/page[^\"]*)"/)?.[1];
    assert(pageScriptPath, `${version}: Astro page script was not injected`);
    const pageScriptResponse = await fetch(new URL(pageScriptPath, base));
    assert(pageScriptResponse.ok, `${version}: page script returned ${pageScriptResponse.status}`);
    const pageScript = await pageScriptResponse.text();
    const bootPath = pageScript.match(/from "([^"]*astro-styletrace(?:\/|_)app[^"]*)"/)?.[1];
    assert(bootPath, `${version}: styletrace boot was not injected`);
    const bootResponse = await fetch(new URL(bootPath, base));
    assert(bootResponse.ok, `${version}: styletrace client returned ${bootResponse.status}`);
    const bootModule = await bootResponse.text();
    assert(bootModule.includes('data-styletrace'), `${version}: styletrace client is invalid`);

    const mapResponse = await fetch(`${base}/__styletrace/css-map`);
    assert(mapResponse.ok, `${version}: CSS map endpoint returned ${mapResponse.status}`);
    const map = await mapResponse.json();
    assert(Object.keys(map).some((file) => file.endsWith('index.astro')), `${version}: CSS map is empty`);
  } catch (error) {
    throw new Error(`${error.message}\n${output}`);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
      child.kill('SIGTERM');
      const stopped = await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
      ]);
      if (!stopped) {
        child.kill('SIGKILL');
        await exited;
      }
    }
  }

  console.log(`${version}: ok`);
}

async function poll(url) {
  let lastError;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.text();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
