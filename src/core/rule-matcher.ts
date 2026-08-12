/**
 * el → マッチしたルール[]。
 *
 * §6.4 の通り「勝者を断定しない」。詳細度はソート順のヒントに留め、
 * 計算値と一致する宣言値を持つ宣言に印を付けることで P1 を解決する。
 */

import { compare, splitTopLevel, type Specificity } from './specificity.js';
import { getStyleIndex, type Condition, type IndexedRule } from './stylesheet-index.js';
import type { Source } from './resolve-source.js';

export type Declaration = {
  property: string;
  value: string;
  important: boolean;
};

export type MatchedRule = {
  selector: string;
  rawSelector: string;
  source: Source;
  conditions: Condition[];
  layer: string | null;
  specificity: Specificity;
  declarations: Declaration[];
  /** インラインスタイル（el.style）は別枠で最上位に置く */
  inline: boolean;
};

export type MatchResult = {
  rules: MatchedRule[];
  unreadable: { label: string; reason: string }[];
};

export function matchRules(el: Element): MatchResult {
  const index = getStyleIndex();

  const matched: IndexedRule[] = [];
  for (const entry of index.rules) {
    if (!isActive(entry.conditions)) continue;
    if (!safeMatches(el, entry.selector)) continue;
    matched.push(entry);
  }

  matched.sort((a, b) => {
    const layerDiff = layerRank(a.layer, index.layerOrder) - layerRank(b.layer, index.layerOrder);
    if (layerDiff !== 0) return -layerDiff;
    const specDiff = compare(a.specificity, b.specificity);
    if (specDiff !== 0) return -specDiff;
    return b.order - a.order;
  });

  const rules: MatchedRule[] = [];

  const inline = inlineRule(el);
  if (inline) rules.push(inline);

  for (const entry of matched) {
    rules.push({
      selector: entry.selector,
      rawSelector: entry.rawSelector,
      source: entry.source,
      conditions: entry.conditions,
      layer: entry.layer,
      specificity: entry.specificity,
      declarations: readDeclarations(entry.rule.style),
      inline: false,
    });
  }

  return { rules, unreadable: index.unreadable };
}

function inlineRule(el: Element): MatchedRule | null {
  const style = (el as HTMLElement).style;
  if (!style || style.length === 0) return null;

  return {
    selector: 'style="…"',
    rawSelector: 'style="…"',
    source: { label: 'inline style', raw: '' },
    conditions: [],
    layer: null,
    specificity: [1, 0, 0],
    declarations: readDeclarations(style),
    inline: true,
  };
}

/**
 * 宣言は cssText から読む。
 *
 * style.item() で列挙すると、`margin: 0 0 var(--space-s)` のように var() を含む
 * ショートハンドが「値が空の個別プロパティ」に展開されてしまい、宣言値が消える。
 * §F2 の declared 行は「書いたとおりの値」でなければ意味がないので、authored 側を採る。
 */
function readDeclarations(style: CSSStyleDeclaration): Declaration[] {
  const out: Declaration[] = [];

  for (const text of splitTopLevel(style.cssText, ';')) {
    const colon = indexOfTopLevel(text, ':');
    if (colon < 0) continue;

    const property = text.slice(0, colon).trim();
    if (!property) continue;

    let value = text.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, '').trim();

    out.push({ property, value, important });
  }

  return out;
}

function indexOfTopLevel(input: string, char: string): number {
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === char && depth === 0) return i;
  }
  return -1;
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    // `&` が残ったセレクタや、ブラウザ未対応の記法。取りこぼしとして無視する
    return false;
  }
}

/** 条件付きグループが今この瞬間に有効か（§6.3） */
function isActive(conditions: Condition[]): boolean {
  for (const condition of conditions) {
    if (condition.kind === 'media') {
      if (!condition.text) continue;
      try {
        if (!matchMedia(condition.text).matches) return false;
      } catch {
        /* 解釈できない条件は有効とみなす */
      }
      continue;
    }
    if (condition.kind === 'supports') {
      try {
        if (condition.text && !CSS.supports(condition.text)) return false;
      } catch {
        /* 同上 */
      }
    }
    // @container / @scope は要素文脈に依存するため、ここでは判定しない
  }
  return true;
}

function layerRank(layer: string | null, order: string[]): number {
  // 層に属さない宣言は、名前付き層より強い
  if (layer === null) return order.length + 1;
  const at = order.indexOf(layer);
  return at < 0 ? 0 : at;
}
