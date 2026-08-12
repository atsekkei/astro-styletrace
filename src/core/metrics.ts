import { findInherited } from './inherit.js';
import type { Source } from './resolve-source.js';
import type { MatchedRule } from './rule-matcher.js';
import { fmt, parsePx } from './units.js';
import { compareCascade, type CascadeWeight } from './cascade.js';

export type Candidate = {
  value: string;
  property: string;
  source: Source;
  selector: string;
  important: boolean;
  occurrence: number;
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
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
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
    let candidates = findCandidates(rules, property, computed);
    let inheritedFrom: string | null = null;

    if (candidates.length === 0) {
      if (!INHERITED.has(property)) continue;

      const inherited = findInherited(el, (ancestorRules) => {
        const found = findCandidates(ancestorRules, property, computed);
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

function findCandidates(
  rules: MatchedRule[],
  property: string,
  computed: CSSStyleDeclaration,
): Candidate[] {
  const out: { candidate: Candidate; weight: CascadeWeight }[] = [];

  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (
        declaration.property !== property &&
        !covers(declaration.property, property, computed.writingMode, computed.direction)
      ) continue;
      out.push({
        candidate: {
          value: declaration.value,
          property: declaration.property,
          source: rule.source,
          selector: rule.rawSelector,
          important: declaration.important,
          occurrence: rule.occurrence,
        },
        weight: {
          important: declaration.important,
          inline: rule.inline,
          layer: rule.layerRank,
          specificity: rule.specificity,
          order: rule.order,
          declarationOrder: declaration.order,
        },
      });
    }
  }

  out.sort((a, b) => -compareCascade(a.weight, b.weight));
  return out.map(({ candidate }) => candidate);
}

function covers(
  declared: string,
  property: string,
  writingMode: string,
  direction: string,
): boolean {
  if (SHORTHANDS[declared]?.includes(property)) return true;

  const vertical = writingMode.startsWith('vertical') || writingMode.startsWith('sideways');
  const blockStart = vertical ? (writingMode.endsWith('-lr') ? 'left' : 'right') : 'top';
  const blockEnd = vertical ? (blockStart === 'left' ? 'right' : 'left') : 'bottom';
  const inlineStart = vertical
    ? direction === 'rtl'
      ? 'bottom'
      : 'top'
    : direction === 'rtl'
      ? 'right'
      : 'left';
  const inlineEnd = vertical
    ? inlineStart === 'top'
      ? 'bottom'
      : 'top'
    : inlineStart === 'left'
      ? 'right'
      : 'left';

  for (const prefix of ['margin', 'padding']) {
    if (!property.startsWith(`${prefix}-`)) continue;
    const side = property.slice(prefix.length + 1);
    if (declared === `${prefix}-block`) return side === blockStart || side === blockEnd;
    if (declared === `${prefix}-inline`) return side === inlineStart || side === inlineEnd;
    if (declared === `${prefix}-block-start`) return side === blockStart;
    if (declared === `${prefix}-block-end`) return side === blockEnd;
    if (declared === `${prefix}-inline-start`) return side === inlineStart;
    if (declared === `${prefix}-inline-end`) return side === inlineEnd;
  }
  return false;
}

function measureAll(
  el: Element,
  rect: DOMRect,
  computed: CSSStyleDeclaration,
): Record<string, number> {
  const out: Record<string, number> = {};

  // getBoundingClientRect() is an axis-aligned, post-transform box. Mixing it
  // with pre-transform computed insets produces plausible-looking false data.
  if (hasTransformedChain(el)) return out;

  const borderBox = computed.boxSizing === 'border-box';
  out.width = borderBox
    ? rect.width
    : rect.width -
      num(computed.borderLeftWidth) -
      num(computed.borderRightWidth) -
      num(computed.paddingLeft) -
      num(computed.paddingRight);
  out.height = borderBox
    ? rect.height
    : rect.height -
      num(computed.borderTopWidth) -
      num(computed.borderBottomWidth) -
      num(computed.paddingTop) -
      num(computed.paddingBottom);

  const parent = el.parentElement;
  if (parent) {
    const content = contentBox(parent);
    const siblings = siblingBoxes(el);

    const own = (value: number, margin: string) => (num(margin) === 0 ? null : value);

    set(
      out,
      'margin-top',
      own(
        directionalGap(rect, siblings, 'top') ?? rect.top - content.top,
        computed.marginTop,
      ),
    );
    set(
      out,
      'margin-bottom',
      own(
        directionalGap(rect, siblings, 'bottom') ?? content.bottom - rect.bottom,
        computed.marginBottom,
      ),
    );
    set(
      out,
      'margin-left',
      own(
        directionalGap(rect, siblings, 'left') ?? rect.left - content.left,
        computed.marginLeft,
      ),
    );
    set(
      out,
      'margin-right',
      own(
        directionalGap(rect, siblings, 'right') ?? content.right - rect.right,
        computed.marginRight,
      ),
    );
  }

  const display = computed.display;
  if (display.includes('flex') || display.includes('grid')) {
    const gaps = measureGaps(el, computed.writingMode);
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

function siblingBoxes(el: Element): DOMRect[] {
  const parent = el.parentElement;
  if (!parent) return [];
  return Array.from(parent.children)
    .filter((sibling) => sibling !== el && participatesInLayout(sibling))
    .map((sibling) => sibling.getBoundingClientRect());
}

function directionalGap(
  own: DOMRect,
  candidates: DOMRect[],
  side: 'top' | 'right' | 'bottom' | 'left',
): number | null {
  const vertical = side === 'top' || side === 'bottom';
  const ownCenter = vertical ? (own.top + own.bottom) / 2 : (own.left + own.right) / 2;
  const aligned = candidates.filter((box) => {
    if (vertical && !overlaps(own.left, own.right, box.left, box.right)) return false;
    if (!vertical && !overlaps(own.top, own.bottom, box.top, box.bottom)) return false;
    const center = vertical ? (box.top + box.bottom) / 2 : (box.left + box.right) / 2;
    return side === 'top' || side === 'left' ? center < ownCenter : center > ownCenter;
  });
  if (aligned.length === 0) return null;

  if (side === 'top') return own.top - Math.max(...aligned.map((box) => box.bottom));
  if (side === 'bottom') return Math.min(...aligned.map((box) => box.top)) - own.bottom;
  if (side === 'left') return own.left - Math.max(...aligned.map((box) => box.right));
  return Math.min(...aligned.map((box) => box.left)) - own.right;
}

function measureGaps(
  el: Element,
  writingMode: string,
): { row: number | null; column: number | null } {
  const boxes = Array.from(el.children)
    .filter(participatesInLayout)
    .map((child) => child.getBoundingClientRect());
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

  const physical = { row: min(rows), column: min(columns) };
  return writingMode.startsWith('vertical') || writingMode.startsWith('sideways')
    ? { row: physical.column, column: physical.row }
    : physical;
}

function participatesInLayout(el: Element): boolean {
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.position !== 'absolute' && style.position !== 'fixed';
}

export function hasTransformedChain(el: Element): boolean {
  for (let current: Element | null = el; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.transform !== 'none') return true;
    const zoom = Number.parseFloat(style.getPropertyValue('zoom'));
    if (Number.isFinite(zoom) && zoom !== 1) return true;
  }
  return false;
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
