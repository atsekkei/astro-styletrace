import { describe } from './hit-test.js';
import { matchRules, type MatchedRule, type MatchResult } from './rule-matcher.js';

const MAX_DEPTH = 32;

let cache = new WeakMap<Element, MatchResult>();

export function matchCached(el: Element): MatchResult {
  const hit = cache.get(el);
  if (hit) return hit;
  const result = matchRules(el);
  cache.set(el, result);
  return result;
}

export function resetInheritCache(): void {
  cache = new WeakMap();
}

export type Inherited<T> = {
  found: T;
  from: string;
};

export function findInherited<T>(
  el: Element,
  find: (rules: MatchedRule[]) => T | null,
): Inherited<T> | null {
  let current = el.parentElement;

  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    const found = find(matchCached(current).rules);
    if (found) return { found, from: describe(current) };
    current = current.parentElement;
  }

  return null;
}
