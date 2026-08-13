import { resolveSource, type Source } from './resolve-source.js';
import { specificity, splitTopLevel, type Specificity } from './specificity.js';
import { normalizeSelector } from './css-map.js';

export type Condition = {
  kind: 'media' | 'supports' | 'container' | 'scope' | 'other';
  text: string;
};

export type IndexedRule = {
  rule: CSSStyleRule;
  selector: string;
  rawSelector: string;
  source: Source;
  conditions: Condition[];
  layer: string | null;
  specificity: Specificity;
  order: number;
  occurrence: number;
};

export type UnreadableSheet = {
  label: string;
  reason: string;
};

export type StyleIndex = {
  rules: IndexedRule[];
  unreadable: UnreadableSheet[];
  layerOrder: string[];
};

let cache: StyleIndex | null = null;

export function getStyleIndex(): StyleIndex {
  if (!cache) cache = buildStyleIndex();
  return cache;
}

export function invalidateStyleIndex(): void {
  cache = null;
}

export function buildStyleIndex(): StyleIndex {
  const rules: IndexedRule[] = [];
  const unreadable: UnreadableSheet[] = [];
  const layerOrder: string[] = [];
  let order = 0;
  const occurrences = new Map<string, number>();

  for (const sheet of Array.from(document.styleSheets)) {
    const source = resolveSource(sheet as CSSStyleSheet);

    const owner = sheet.ownerNode as HTMLElement | null;
    if (owner?.hasAttribute?.('data-styletrace')) continue;

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
      const key = `${ctx.source.raw}\0${normalizeSelector(rawSelector)}`;
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      rules.push({
        rule,
        selector,
        rawSelector,
        source: ctx.source,
        conditions: ctx.conditions,
        layer: ctx.layer,
        specificity: specificity(selector),
        order: order++,
        occurrence,
      });
    }, layerOrder);
  }

  return { rules, unreadable, layerOrder };
}

type Ctx = {
  source: Source;
  conditions: Condition[];
  layer: string | null;
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
      const rawParts = splitTopLevel(rule.selectorText, ',');
      const selectorParts = splitTopLevel(selector, ',');
      for (const [index, part] of selectorParts.entries()) {
        visit(rule, ctx, rawParts[index] ?? rule.selectorText, part);
      }

      const nested = (rule as CSSStyleRule & { cssRules?: CSSRuleList }).cssRules;
      if (nested && nested.length) {
        walk(nested, { ...ctx, parent: selector }, visit, layerOrder);
      }
      continue;
    }

    const nameList = (rule as CSSRule & { nameList?: string[] }).nameList;
    if (nameList) {
      for (const name of Array.from(nameList)) {
        if (!layerOrder.includes(name)) layerOrder.push(name);
      }
      continue;
    }

    const group = rule as CSSRule & { cssRules?: CSSRuleList; style?: CSSStyleDeclaration };

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
  return null;
}

export function resolveNesting(selector: string, parent: string | null): string {
  if (!parent) return selector;

  const parentRef = splitTopLevel(parent, ',').length > 1 ? `:is(${parent})` : parent;

  return splitTopLevel(selector, ',')
    .map((part) => {
      if (part.includes('&')) return part.replace(/&/g, parentRef);
      return `${parentRef} ${part}`;
    })
    .join(', ');
}
