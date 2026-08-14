import type { Source } from './resolve-source.js';
import { shorten } from './resolve-source.js';

export type CssMap = Record<string, Record<string, number[]>>;
export type SourceLocation = {
  source: Source;
  line: number;
};

const ENDPOINT = '/__styletrace/css-map';

let map: CssMap = {};

export async function loadCssMap(): Promise<void> {
  try {
    const response = await fetch(ENDPOINT);
    if (!response.ok) return;
    map = (await response.json()) as CssMap;
  } catch {
    map = {};
  }
}

export function lineFor(source: Source, rawSelector: string, occurrence = 0): number | null {
  return sourceLocationFor(source, rawSelector, occurrence)?.line ?? null;
}

export function sourceLocationFor(
  source: Source,
  rawSelector: string,
  occurrence = 0,
): SourceLocation | null {
  const file = source.raw.split('?')[0];
  if (!file) return fallbackSourceLocation(rawSelector, occurrence);

  const lines = map[file];
  if (!lines) return fallbackSourceLocation(rawSelector, occurrence);

  const matches = lines[normalizeSelector(rawSelector)];
  if (!matches?.length) return fallbackSourceLocation(rawSelector, occurrence);

  return {
    source,
    line: matches[Math.min(occurrence, matches.length - 1)] ?? matches[0],
  };
}

export function normalizeSelector(selector: string): string {
  return selector
    .replace(/\[data-astro-cid-[^\]]*\]/g, '')
    .replace(/'/g, '"')
    .replace(/\*::/g, '::')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackSourceLocation(rawSelector: string, occurrence: number): SourceLocation | null {
  const selector = normalizeSelector(rawSelector);
  const candidates = Object.entries(map).flatMap(([file, lines]) => {
    const matches = lines[selector];
    if (!matches?.length) return [];
    return [{ file, matches }];
  });

  if (candidates.length !== 1) return null;

  const [{ file, matches }] = candidates;
  return {
    source: { label: shorten(file), raw: file },
    line: matches[Math.min(occurrence, matches.length - 1)] ?? matches[0],
  };
}
