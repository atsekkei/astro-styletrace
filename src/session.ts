import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  serializeInspectorObservation,
  type InspectorObservation,
} from './core/observation.js';

export const OBSERVATION_ENDPOINT = '/__styletrace/session/observation';
export const SOURCE_ENDPOINT = '/__styletrace/session/source';
export const HANDOFF_DIR = '.astro-styletrace';
export const OBSERVATION_FILE = `${HANDOFF_DIR}/current-observation.json`;
export const HANDOFF_FILE = `${HANDOFF_DIR}/handoff.md`;

export type StyletraceSession = {
  update(observation: InspectorObservation): void;
  clear(): void;
  observation(): InspectorObservation | null;
};

export function createStyletraceSession(): StyletraceSession {
  let current: InspectorObservation | null = null;

  return {
    update(observation) {
      current = observation;
    },
    clear() {
      current = null;
    },
    observation() {
      return current;
    },
  };
}

export function handleObservationSession(
  session: StyletraceSession,
  root: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  if (req.method === 'GET') {
    const observation = session.observation();
    if (!observation) {
      text(res, 404, 'No styletrace selection is active.');
      return;
    }

    json(res, 200, serializeInspectorObservation(observation));
    return;
  }

  if (req.method === 'DELETE') {
    session.clear();
    void clearHandoffFiles(root);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    text(res, 405, 'Method not allowed.');
    return;
  }

  void readJson(req).then(
    (body) => {
      if (!isObservation(body)) {
        text(res, 400, 'Invalid observation.');
        return;
      }

      session.update(body);
      writeHandoffFiles(root, body).then(
        () => {
          res.statusCode = 204;
          res.end();
        },
        () => text(res, 500, 'Could not write styletrace handoff files.'),
      );
    },
    () => text(res, 400, 'Invalid JSON.'),
  );
}

export async function writeHandoffFiles(
  root: string,
  observation: InspectorObservation,
): Promise<void> {
  const dir = resolve(root, HANDOFF_DIR);
  const observationPath = resolve(root, OBSERVATION_FILE);
  const handoffPath = resolve(root, HANDOFF_FILE);

  await mkdir(dir, { recursive: true });
  await writeFile(observationPath, serializeInspectorObservation(observation), 'utf8');
  await writeFile(handoffPath, formatHandoff(observation), 'utf8');
}

export async function clearHandoffFiles(root: string): Promise<void> {
  await Promise.all([
    rm(resolve(root, OBSERVATION_FILE), { force: true }),
    rm(resolve(root, HANDOFF_FILE), { force: true }),
  ]);
}

export function formatHandoff(observation: InspectorObservation): string {
  const lines = [
    '# astro-styletrace handoff',
    '',
    'The browser panel selected this element. Use the JSON file next to this document as the source of truth.',
    '',
    `- Observation: ${OBSERVATION_FILE}`,
    `- Element: ${observation.target}`,
    `- Viewport: ${observation.viewport.width} x ${observation.viewport.height}px`,
    `- Border box: ${observation.borderBox.width} x ${observation.borderBox.height}px`,
  ];

  const sources = sourceList(observation);
  if (sources.length > 0) {
    lines.push('', '## Sources');
    for (const source of sources) lines.push(`- ${source}`);
  }

  lines.push(
    '',
    '## Task',
    '',
    'Inspect the observation, read the referenced source files, and make the smallest CSS change that addresses the visual issue the user describes.',
    '',
  );

  return lines.join('\n');
}

export function handleSourceRead(root: string, req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== 'GET') {
    text(res, 405, 'Method not allowed.');
    return;
  }

  const url = new URL(req.url ?? '/', 'http://styletrace.local');
  const target = resolveSourceTarget(root, url.searchParams.get('file'));
  if (!target.ok) {
    text(res, target.status, target.message);
    return;
  }

  const line = positiveInt(url.searchParams.get('line')) ?? null;
  const context = positiveInt(url.searchParams.get('context')) ?? 6;

  void readSource(target.file, line, context).then(
    (source) => json(res, 200, JSON.stringify({ file: target.label, ...source }, null, 2) + '\n'),
    () => text(res, 404, 'Source file could not be read.'),
  );
}

export function resolveSourceTarget(
  root: string,
  rawFile: string | null,
): { ok: true; file: string; label: string } | { ok: false; status: 400 | 403; message: string } {
  if (!rawFile) return { ok: false, status: 400, message: 'Missing file query.' };
  if (rawFile.includes('\0')) return { ok: false, status: 400, message: 'Invalid file query.' };

  const rootPath = normalize(resolve(root));
  const fileOnly = rawFile.replace(/:\d+(?::\d+)?$/, '');
  const rawPath = fileOnly.startsWith('/@fs/') ? fileOnly.slice('/@fs'.length) : fileOnly;
  const file = normalize(isAbsolute(rawPath) ? rawPath : resolve(rootPath, rawPath));

  if (!inside(rootPath, file)) {
    return { ok: false, status: 403, message: 'Refusing to read a file outside the project root.' };
  }

  return { ok: true, file, label: relative(rootPath, file).split(sep).join('/') };
}

async function readSource(
  file: string,
  line: number | null,
  context: number,
): Promise<{ startLine: number; endLine: number; text: string }> {
  const source = await readFile(file, 'utf8');
  const lines = source.split('\n');

  if (line === null) {
    return { startLine: 1, endLine: lines.length, text: source };
  }

  const radius = Math.min(Math.max(context, 0), 40);
  const startLine = Math.max(1, line - radius);
  const endLine = Math.min(lines.length, line + radius);
  const text = lines.slice(startLine - 1, endLine).join('\n');
  return { startLine, endLine, text };
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveJson, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 512_000) {
        req.destroy();
        reject(new Error('Body too large.'));
      }
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolveJson(JSON.parse(body || 'null'));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function isObservation(value: unknown): value is InspectorObservation {
  if (!value || typeof value !== 'object') return false;
  const observation = value as Partial<InspectorObservation>;
  return (
    observation.version === 1 &&
    typeof observation.target === 'string' &&
    Boolean(observation.borderBox) &&
    Boolean(observation.viewport) &&
    Array.isArray(observation.metrics)
  );
}

function positiveInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..'));
}

function sourceList(observation: InspectorObservation): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const metric of observation.metrics) {
    for (const candidate of [metric.declared, ...metric.others]) {
      const source =
        candidate.source.line === null
          ? candidate.source.label
          : `${candidate.source.label}:${candidate.source.line}`;
      if (seen.has(source)) continue;
      seen.add(source);
      out.push(source);
    }
  }

  return out.slice(0, 16);
}

function json(res: ServerResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(body);
}

function text(res: ServerResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(body);
}
