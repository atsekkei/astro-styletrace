import { findInherited } from './inherit.js';
import type { Source } from './resolve-source.js';
import type { MatchedRule } from './rule-matcher.js';
import { fmt, parsePx } from './units.js';

export type Candidate = {
  value: string;
  property: string;
  source: Source;
  selector: string;
};

export type Metric = {
  property: string;
  declared: Candidate;
  others: Candidate[];
  inheritedFrom: string | null;
  computed: string;
  measured: number | null;
  diverged: boolean;
};

const PROPERTIES = [
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'row-gap',
  'column-gap',
  'font-size',
  'line-height',
  'width',
  'height',
];

const INHERITED = new Set(['font-size', 'line-height']);

const SHORTHANDS: Record<string, string[]> = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'margin-block': ['margin-top', 'margin-bottom'],
  'margin-inline': ['margin-left', 'margin-right'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'padding-block': ['padding-top', 'padding-bottom'],
  'padding-inline': ['padding-left', 'padding-right'],
  gap: ['row-gap', 'column-gap'],
  inset: ['top', 'right', 'bottom', 'left'],
  font: ['font-size', 'line-height'],
};

export function buildMetrics(
  el: Element,
  rect: DOMRect,
  computed: CSSStyleDeclaration,
  rules: MatchedRule[],
): Metric[] {
  const measured = measureAll(el, rect, computed);
  const out: Metric[] = [];

  for (const property of PROPERTIES) {
    let candidates = findCandidates(rules, property);
    let inheritedFrom: string | null = null;

    if (candidates.length === 0) {
      if (!INHERITED.has(property)) continue;

      const inherited = findInherited(el, (ancestorRules) => {
        const found = findCandidates(ancestorRules, property);
        return found.length > 0 ? found : null;
      });
      if (!inherited) continue;

      candidates = inherited.found;
      inheritedFrom = inherited.from;
    }

    const raw = computed.getPropertyValue(property).trim();
    const computedPx = parsePx(raw);
    const computedValue = computedPx === null ? raw : `${fmt(computedPx)}px`;

    const measuredValue = measured[property] ?? null;
    const diverged =
      measuredValue !== null && computedPx !== null && Math.abs(measuredValue - computedPx) > 0.5;

    out.push({
      property,
      declared: candidates[0]!,
      others: candidates.slice(1),
      inheritedFrom,
      computed: computedValue,
      measured: measuredValue,
      diverged,
    });
  }

  return out;
}

function findCandidates(rules: MatchedRule[], property: string): Candidate[] {
  const out: Candidate[] = [];

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (declaration.property !== property && !covers(declaration.property, property)) continue;
      out.push({
        value: declaration.value,
        property: declaration.property,
        source: rule.source,
        selector: rule.rawSelector,
      });
    }
  }

  return out;
}

function covers(declared: string, property: string): boolean {
  return SHORTHANDS[declared]?.includes(property) ?? false;
}

function measureAll(
  el: Element,
  rect: DOMRect,
  computed: CSSStyleDeclaration,
): Record<string, number> {
  const out: Record<string, number> = {
    width:
      rect.width -
      num(computed.borderLeftWidth) -
      num(computed.borderRightWidth) -
      num(computed.paddingLeft) -
      num(computed.paddingRight),
    height:
      rect.height -
      num(computed.borderTopWidth) -
      num(computed.borderBottomWidth) -
      num(computed.paddingTop) -
      num(computed.paddingBottom),
  };

  const parent = el.parentElement;
  if (parent) {
    const content = contentBox(parent);
    const before = previousBox(el);
    const after = nextBox(el);

    const own = (value: number, margin: string) => (num(margin) === 0 ? null : value);

    set(
      out,
      'margin-top',
      own(
        before && before.bottom <= rect.top ? rect.top - before.bottom : rect.top - content.top,
        computed.marginTop,
      ),
    );
    set(
      out,
      'margin-bottom',
      own(
        after && after.top >= rect.bottom ? after.top - rect.bottom : content.bottom - rect.bottom,
        computed.marginBottom,
      ),
    );
    set(
      out,
      'margin-left',
      own(
        before && before.right <= rect.left ? rect.left - before.right : rect.left - content.left,
        computed.marginLeft,
      ),
    );
    set(
      out,
      'margin-right',
      own(
        after && after.left >= rect.right ? after.left - rect.right : content.right - rect.right,
        computed.marginRight,
      ),
    );
  }

  const display = computed.display;
  if (display.includes('flex') || display.includes('grid')) {
    const gaps = measureGaps(el);
    if (gaps.row !== null) out['row-gap'] = gaps.row;
    if (gaps.column !== null) out['column-gap'] = gaps.column;
  }

  return out;
}

type Box = { top: number; right: number; bottom: number; left: number };

function set(out: Record<string, number>, property: string, value: number | null): void {
  if (value !== null) out[property] = value;
}

function contentBox(el: Element): Box {
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    top: rect.top + num(cs.borderTopWidth) + num(cs.paddingTop),
    right: rect.right - num(cs.borderRightWidth) - num(cs.paddingRight),
    bottom: rect.bottom - num(cs.borderBottomWidth) - num(cs.paddingBottom),
    left: rect.left + num(cs.borderLeftWidth) + num(cs.paddingLeft),
  };
}

function previousBox(el: Element): DOMRect | null {
  const sibling = el.previousElementSibling;
  return sibling ? sibling.getBoundingClientRect() : null;
}

function nextBox(el: Element): DOMRect | null {
  const sibling = el.nextElementSibling;
  return sibling ? sibling.getBoundingClientRect() : null;
}

function measureGaps(el: Element): { row: number | null; column: number | null } {
  const boxes = Array.from(el.children).map((child) => child.getBoundingClientRect());
  if (boxes.length < 2) return { row: null, column: null };

  const rows: number[] = [];
  const columns: number[] = [];

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;

      if (overlaps(a.top, a.bottom, b.top, b.bottom)) {
        const gap = b.left >= a.right ? b.left - a.right : a.left >= b.right ? a.left - b.right : null;
        if (gap !== null) columns.push(gap);
      }
      if (overlaps(a.left, a.right, b.left, b.right)) {
        const gap = b.top >= a.bottom ? b.top - a.bottom : a.top >= b.bottom ? a.top - b.bottom : null;
        if (gap !== null) rows.push(gap);
      }
    }
  }

  return { row: min(rows), column: min(columns) };
}

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) > 0.5;
}

function min(values: number[]): number | null {
  return values.length === 0 ? null : Math.min(...values);
}

function num(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMeasured(value: number): string {
  return `${fmt(value)}px`;
}
