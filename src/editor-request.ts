import { readFileSync } from 'node:fs';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

export type EditorTarget =
  | { ok: true; file: string; line: number | null; column: number | null; target: string }
  | { ok: false; status: 400 | 403; message: string };

export function resolveEditorTarget(root: string, rawFile: string | null): EditorTarget {
  if (!rawFile) return { ok: false, status: 400, message: 'Missing file query.' };
  if (rawFile.includes('\0')) {
    return { ok: false, status: 400, message: 'Invalid file query.' };
  }

  const parsed = splitLine(rawFile);
  if (!parsed.ok) return parsed;

  const rootPath = normalize(resolve(root));
  const rawPath = stripViteFsPrefix(parsed.file);
  const file = normalize(isAbsolute(rawPath) ? rawPath : resolve(rootPath, rawPath));

  if (!inside(rootPath, file)) {
    return { ok: false, status: 403, message: 'Refusing to open a file outside the project root.' };
  }

  const column = parsed.column ?? (parsed.line === null ? null : lineEndColumn(file, parsed.line));

  return {
    ok: true,
    file,
    line: parsed.line,
    column,
    target:
      parsed.line === null
        ? file
        : column === null
          ? `${file}:${parsed.line}`
          : `${file}:${parsed.line}:${column}`,
  };
}

function splitLine(raw: string):
  | { ok: true; file: string; line: number | null; column: number | null }
  | { ok: false; status: 400; message: string } {
  const match = /^(.*):([^:]+)(?::([^:]+))?$/.exec(raw);
  if (!match) return { ok: true, file: raw, line: null, column: null };

  const file = match[1] ?? '';
  const suffix = match[2] ?? '';
  const columnSuffix = match[3] ?? null;

  if (!/^\d+$/.test(suffix)) {
    return { ok: false, status: 400, message: 'Line must be a positive integer.' };
  }

  const line = Number.parseInt(suffix, 10);
  if (!Number.isSafeInteger(line) || line < 1) {
    return { ok: false, status: 400, message: 'Line must be a positive integer.' };
  }

  if (columnSuffix !== null) {
    if (!/^\d+$/.test(columnSuffix)) {
      return { ok: false, status: 400, message: 'Column must be a positive integer.' };
    }

    const column = Number.parseInt(columnSuffix, 10);
    if (!Number.isSafeInteger(column) || column < 1) {
      return { ok: false, status: 400, message: 'Column must be a positive integer.' };
    }

    return { ok: true, file, line, column };
  }

  return { ok: true, file, line, column: null };
}

function stripViteFsPrefix(file: string): string {
  return file.startsWith('/@fs/') ? file.slice('/@fs'.length) : file;
}

function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..'));
}

function lineEndColumn(file: string, line: number): number | null {
  try {
    const text = readFileSync(file, 'utf8');
    const row = text.split('\n')[line - 1];
    if (row === undefined) return null;
    return row.replace(/\r$/, '').length + 1;
  } catch {
    return null;
  }
}
