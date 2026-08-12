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
    source: { label: 'style attribute', raw: '' },
    conditions: [],
    layer: null,
    specificity: [1, 0, 0],
    declarations: readDeclarations(style),
    inline: true,
  };
}

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
    return false;
  }
}

function isActive(conditions: Condition[]): boolean {
  for (const condition of conditions) {
    if (condition.kind === 'media') {
      if (!condition.text) continue;
      try {
        if (!matchMedia(condition.text).matches) return false;
      } catch {
      }
      continue;
    }
    if (condition.kind === 'supports') {
      try {
        if (condition.text && !CSS.supports(condition.text)) return false;
      } catch {
      }
    }
  }
  return true;
}

function layerRank(layer: string | null, order: string[]): number {
  if (layer === null) return order.length + 1;
  const at = order.indexOf(layer);
  return at < 0 ? 0 : at;
}
