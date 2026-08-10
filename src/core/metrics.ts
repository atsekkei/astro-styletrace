/**
 * 宣言値 / 計算値 / 実測値の 3 つを 1 行に揃える（§F2）。
 *
 * 3 列並べることが仕様の核心。宣言値と計算値の乖離が P2 を解決し、
 * 計算値と実測値の乖離（margin 相殺、flex の分配、gap と justify-content の競合）が
 * バグの発見点になる。3 つが一致しているときは 1 列に畳む。
 */

import type { MatchedRule } from './rule-matcher.js';
import { alternates, fmt, parsePx, type UnitContext } from './units.js';

export type Metric = {
  property: string;
  /** 宣言値。マッチしたルールの中で最も強い候補のもの。無ければ null */
  declared: string | null;
  /** 宣言に使われていたプロパティ名。ショートハンドで書かれていれば longhand と異なる */
  declaredAs: string | null;
  declaredSource: string | null;
  declaredSelector: string | null;
  /** 計算値。唯一の真実（§6.4） */
  computed: string;
  /** 宣言値が var() を含むとき、その変数の値。`--space-l: clamp(2rem, 5vw, 4rem)` */
  variables: string | null;
  /** 実測値。算出できないプロパティでは null */
  measured: number | null;
  /** 計算値の px を rem / vw に逆算したもの */
  alternates: string | null;
  /** 計算値と実測値が食い違っている。バグの発見点 */
  diverged: boolean;
  /** 3 つ（または算出できた分）が一致していて 1 列に畳めるか */
  collapsed: boolean;
};

/** 3 列表示するプロパティ。§F2 の既定表示のうち、長さとして意味を持つもの */
const METRIC_PROPERTIES = [
  'width',
  'height',
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
];

/** 0 でも常に出すプロパティ。ここが 0 なのは情報である */
const ALWAYS = new Set(['width', 'height', 'font-size', 'line-height']);

/** ショートハンド → その宣言が担う longhand */
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
  ctx: UnitContext,
): Metric[] {
  const measured = measureAll(el, rect, computed);
  const out: Metric[] = [];

  for (const property of METRIC_PROPERTIES) {
    const raw = computed.getPropertyValue(property).trim();
    const declaration = findDeclaration(rules, property);
    const measuredValue = measured[property] ?? null;

    if (!ALWAYS.has(property) && !declaration && isZero(raw)) continue;

    const computedPx = parsePx(raw);
    // 小数は 1 桁まで（§5）。それ以上は視覚ノイズ
    const computedValue = computedPx === null ? raw : `${fmt(computedPx)}px`;
    const diverged =
      measuredValue !== null && computedPx !== null && Math.abs(measuredValue - computedPx) > 0.5;

    const declaredMatches =
      !declaration || normalize(declaration.value) === normalize(computedValue);

    out.push({
      property,
      declared: declaration?.value ?? null,
      declaredAs: declaration?.property ?? null,
      declaredSource: declaration?.source ?? null,
      declaredSelector: declaration?.selector ?? null,
      computed: computedValue,
      variables: declaration ? resolveVars(declaration.value, computed) : null,
      measured: measuredValue,
      alternates: alternates(raw, ctx),
      diverged,
      collapsed: declaredMatches && !diverged,
    });
  }

  return out;
}

/**
 * 宣言値の `var(--space-l)` が実際には何なのかを引く。
 * トークンで組んだ設計では、これが無いと宣言値の行が読めない。
 */
function resolveVars(value: string, computed: CSSStyleDeclaration): string | null {
  const names = new Set(Array.from(value.matchAll(/var\(\s*(--[\w-]+)/g), (m) => m[1]!));
  if (names.size === 0) return null;

  const parts: string[] = [];
  for (const name of names) {
    const resolved = computed.getPropertyValue(name).trim();
    if (resolved) parts.push(`${name}: ${resolved}`);
  }

  return parts.length > 0 ? parts.join('  /  ') : null;
}

function isZero(value: string): boolean {
  return value === '' || value === '0px' || value === 'normal' || value === 'auto';
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

type Found = { value: string; property: string; source: string; selector: string };

/**
 * その longhand を担っている宣言のうち、最も強い候補を返す。
 *
 * §6.4 の通りこれは断定ではない。計算値を隣に並べているので、候補が外れていれば
 * 「宣言値と計算値が食い違う行」として見えるようになっている。
 */
function findDeclaration(rules: MatchedRule[], property: string): Found | null {
  for (const rule of rules) {
    for (const declaration of rule.declarations) {
      if (declaration.overridden) continue;
      if (declaration.property === property || covers(declaration.property, property)) {
        return {
          value: declaration.value,
          property: declaration.property,
          source: rule.source.label,
          selector: rule.rawSelector,
        };
      }
    }
  }
  return null;
}

function covers(declared: string, property: string): boolean {
  return SHORTHANDS[declared]?.includes(property) ?? false;
}

/**
 * getBoundingClientRect() の差分から実測値を出す。
 *
 * margin は「隣接する兄弟、または親のコンテンツボックスとの実際の隙間」。
 * margin 相殺や gap との競合はここに現れる。
 */
function measureAll(
  el: Element,
  rect: DOMRect,
  computed: CSSStyleDeclaration,
): Record<string, number> {
  const out: Record<string, number> = {
    width: rect.width,
    height: rect.height,
  };

  const parent = el.parentElement;
  if (parent) {
    const content = contentBox(parent);
    const before = previousBox(el);
    const after = nextBox(el);

    out['margin-top'] =
      before && before.bottom <= rect.top ? rect.top - before.bottom : rect.top - content.top;
    out['margin-bottom'] =
      after && after.top >= rect.bottom ? after.top - rect.bottom : content.bottom - rect.bottom;
    out['margin-left'] =
      before && before.right <= rect.left ? rect.left - before.right : rect.left - content.left;
    out['margin-right'] =
      after && after.left >= rect.right ? after.left - rect.right : content.right - rect.right;
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

/**
 * 子要素の実際の隙間。同じ行 / 同じ列に並んでいる隣接ペアだけを見る。
 * 隙間がばらついている場合は最小値を返す（justify-content に食われた側が出る）。
 */
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

/** 実測値の表示用 */
export function formatMeasured(value: number): string {
  return `${fmt(value)}px`;
}
