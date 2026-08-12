import type { Source } from './resolve-source.js';

export type CssMap = Record<string, Record<string, number[]>>;

const ENDPOINT = '/__caliper/css-map';

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
  const file = source.raw.split('?')[0];
  if (!file) return null;

  const lines = map[file];
  if (!lines) return null;

  const matches = lines[normalizeSelector(rawSelector)];
  if (!matches?.length) return null;
  return matches[Math.min(occurrence, matches.length - 1)] ?? null;
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
