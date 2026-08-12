/**
 * declared / computed / measured を 1 ブロックに揃える（§F2）。
 *
 * 3 行並べることが仕様の核心。declared と computed の乖離が P2 を解決し、
 * computed と measured の乖離（margin 相殺、flex の分配、gap と justify-content の
 * 競合）がバグの発見点になる。
 *
 * 一致していても畳まない。ブロックの形が固定であることのほうが、数行ぶんの
 * 高さより価値がある（§F2）。
 */

import { findInherited } from './inherit.js';
import type { Source } from './resolve-source.js';
import type { MatchedRule } from './rule-matcher.js';
import { fmt, parsePx } from './units.js';

/** その longhand を担っている宣言 1 件 */
export type Candidate = {
  value: string;
  /** 宣言に使われていたプロパティ名。ショートハンドで書かれていれば longhand と異なる */
  property: string;
  source: Source;
  selector: string;
};

export type Metric = {
  property: string;
  /** 詳細度で選んだ最有力候補。断定ではない（§6.4） */
  declared: Candidate;
  /** 同じ longhand を担う他の候補。`+N` の中身（§F2） */
  others: Candidate[];
  /** 継承で得た場合、宣言を持っていた祖先の記述。`body` */
  inheritedFrom: string | null;
  /** 唯一の真実（§6.4） */
  computed: string;
  /** 実測値。算出できないプロパティでは null */
  measured: number | null;
  /** computed と measured が食い違っている。バグの発見点 */
  diverged: boolean;
};

/**
 * 表示するプロパティと、その順序（§F2）。
 * ノギスなので寸法から。width / height は宣言があるときだけ立つので最後。
 */
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

/** 宣言が無ければ継承元を遡るプロパティ。継承しないものを遡っても意味がない */
const INHERITED = new Set(['font-size', 'line-height']);

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
): Metric[] {
  const measured = measureAll(el, rect, computed);
  const out: Metric[] = [];

  for (const property of PROPERTIES) {
    let candidates = findCandidates(rules, property);
    let inheritedFrom: string | null = null;

    // 宣言があるものだけを出す。無いプロパティは直しに行く先が無い（§F2）
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
    // 小数は 1 桁まで（§5）。それ以上は視覚ノイズ
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

/**
 * その longhand を担っている宣言を、強い順に全て返す。
 *
 * rules は既にカスケード順にソートされているので先頭が最有力候補。
 * §6.4 の通りこれは断定ではないため、2 件目以降も捨てずに返す
 * （UI では `+N` として件数だけ出す。§F2）。
 */
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
