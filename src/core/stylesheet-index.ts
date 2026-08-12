/**
 * document.styleSheets を走査してルールを索引化する（§6.3）。
 *
 * hover ごとに全走査すると 60fps が出ないため、索引は 1 度だけ構築してキャッシュし、
 * HMR 側から invalidate() で捨てる（§7）。
 */

import { resolveSource, type Source } from './resolve-source.js';
import { specificity, splitTopLevel, type Specificity } from './specificity.js';

export type Condition = {
  kind: 'media' | 'supports' | 'container' | 'scope' | 'other';
  text: string;
};

export type IndexedRule = {
  rule: CSSStyleRule;
  /** ネストを解決した、el.matches() に渡せる絶対セレクタ */
  selector: string;
  /** CSSOM が返したままのセレクタ（`& .title` など）。表示用 */
  rawSelector: string;
  source: Source;
  conditions: Condition[];
  layer: string | null;
  specificity: Specificity;
  /** 文書順。同詳細度のときの並び替えに使う */
  order: number;
};

/** 読めなかったシート（§6.3 ハマりどころ 1、§10）。黙って落とさず UI に出す */
export type UnreadableSheet = {
  label: string;
  reason: string;
};

export type StyleIndex = {
  rules: IndexedRule[];
  unreadable: UnreadableSheet[];
  /** @layer の宣言順。先に宣言された層ほど弱い */
  layerOrder: string[];
};

let cache: StyleIndex | null = null;

export function getStyleIndex(): StyleIndex {
  if (!cache) cache = buildStyleIndex();
  return cache;
}

/** HMR 後に呼ぶ。次回 getStyleIndex() で再構築される */
export function invalidateStyleIndex(): void {
  cache = null;
}

export function buildStyleIndex(): StyleIndex {
  const rules: IndexedRule[] = [];
  const unreadable: UnreadableSheet[] = [];
  const layerOrder: string[] = [];
  let order = 0;

  for (const sheet of Array.from(document.styleSheets)) {
    const source = resolveSource(sheet as CSSStyleSheet);

    // caliper 自身のスタイルは索引に入れない
    const owner = sheet.ownerNode as HTMLElement | null;
    if (owner?.hasAttribute?.('data-caliper')) continue;

    let list: CSSRuleList;
    try {
      list = (sheet as CSSStyleSheet).cssRules;
    } catch (err) {
      unreadable.push({
        label: source.label,
        reason: err instanceof Error ? err.name : 'SecurityError',
      });
      continue;
    }

    walk(list, { source, conditions: [], layer: null, parent: null }, (rule, ctx, rawSelector, selector) => {
      rules.push({
        rule,
        selector,
        rawSelector,
        source: ctx.source,
        conditions: ctx.conditions,
        layer: ctx.layer,
        specificity: specificity(selector),
        order: order++,
      });
    }, layerOrder);
  }

  return { rules, unreadable, layerOrder };
}

type Ctx = {
  source: Source;
  conditions: Condition[];
  layer: string | null;
  /** 親のセレクタ（ネスト解決済み） */
  parent: string | null;
};

function walk(
  rules: CSSRuleList,
  ctx: Ctx,
  visit: (rule: CSSStyleRule, ctx: Ctx, rawSelector: string, selector: string) => void,
  layerOrder: string[],
): void {
  for (const rule of Array.from(rules)) {
    if (isStyleRule(rule)) {
      const selector = resolveNesting(rule.selectorText, ctx.parent);
      visit(rule, ctx, rule.selectorText, selector);

      // ネイティブ CSS ネスト: CSSStyleRule 自身が子ルールを持つ
      const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
      if (nested && nested.length) {
        walk(nested, { ...ctx, parent: selector }, visit, layerOrder);
      }
      continue;
    }

    // `@layer a, b, c;` は層の順序だけを宣言する。中身は持たない
    const nameList = (rule as CSSRule & { nameList?: string[] }).nameList;
    if (nameList) {
      for (const name of Array.from(nameList)) {
        if (!layerOrder.includes(name)) layerOrder.push(name);
      }
      continue;
    }

    const group = rule as CSSRule & { cssRules?: CSSRuleList; style?: CSSStyleDeclaration };

    /**
     * ネストした @media の直下に書いた宣言（CSSNestedDeclarations）。
     *
     *   .card-grid { gap: 1rem; @media (min-width: 48rem) { gap: 2rem; } }
     *
     * この `gap: 2rem` は selectorText を持たないルールとして現れる。拾わないと
     * 候補から丸ごと落ち、§F2 の `+N` が「他に候補は無い」と嘘をつく。
     *
     * セレクタは親そのもの（既に解決済みなので resolveNesting に通さない）。
     */
    if (!group.cssRules && group.style && ctx.parent) {
      visit(rule as CSSStyleRule, ctx, ctx.parent, ctx.parent);
      continue;
    }

    if (!group.cssRules) continue;

    const layerName = layerNameOf(rule);
    if (layerName !== null && !layerOrder.includes(layerName)) layerOrder.push(layerName);

    walk(group.cssRules, pushCondition(ctx, rule, layerName), visit, layerOrder);
  }
}

function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  // CSSStyleRule かつネストされた @media などではないこと
  return typeof (rule as CSSStyleRule).selectorText === 'string' && 'style' in rule;
}

function layerNameOf(rule: CSSRule): string | null {
  const name = (rule as CSSRule & { name?: string }).name;
  const ctorName = rule.constructor?.name ?? '';
  if (ctorName.includes('Layer') && typeof name === 'string') return name || '(anonymous)';
  return null;
}

function pushCondition(ctx: Ctx, rule: CSSRule, layerName: string | null): Ctx {
  if (layerName !== null) return { ...ctx, layer: layerName };

  const condition = conditionOf(rule);
  if (!condition) return ctx;
  return { ...ctx, conditions: [...ctx.conditions, condition] };
}

function conditionOf(rule: CSSRule): Condition | null {
  const ctorName = rule.constructor?.name ?? '';
  const anyRule = rule as CSSRule & {
    conditionText?: string;
    media?: MediaList;
    containerName?: string;
  };

  if (ctorName.includes('Media')) {
    return { kind: 'media', text: anyRule.conditionText ?? anyRule.media?.mediaText ?? '' };
  }
  if (ctorName.includes('Supports')) {
    return { kind: 'supports', text: anyRule.conditionText ?? '' };
  }
  if (ctorName.includes('Container')) {
    const name = anyRule.containerName ? `${anyRule.containerName} ` : '';
    return { kind: 'container', text: `${name}${anyRule.conditionText ?? ''}`.trim() };
  }
  if (ctorName.includes('Scope')) {
    return { kind: 'scope', text: rule.cssText.split('{')[0]?.trim() ?? '@scope' };
  }
  // @keyframes などは要素にマッチしないので条件として持たない
  return null;
}

/**
 * ネストされたセレクタを絶対セレクタへ。§6.3 ハマりどころ 2。
 *
 * `& .title` を親セレクタに置換する。親がセレクタリストのときは `:is()` で包む
 * ——これは詳細度の面でも CSS ネストの規定と一致する。
 */
export function resolveNesting(selector: string, parent: string | null): string {
  if (!parent) return selector;

  const parentRef = splitTopLevel(parent, ',').length > 1 ? `:is(${parent})` : parent;

  return splitTopLevel(selector, ',')
    .map((part) => {
      if (part.includes('&')) return part.replace(/&/g, parentRef);
      // `&` が省略されたネストは子孫結合子が補われる
      return `${parentRef} ${part}`;
    })
    .join(', ');
}
