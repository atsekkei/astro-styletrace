/**
 * 継承で決まっている値の出どころを辿る（§F2）。
 *
 * font-size / line-height に限り、その要素に宣言が無ければ親方向へ遡る。
 * 「なぜこの文字が 16px なのか」は継承元を知りたい質問であり、
 * 宣言が無いときこそ答えが要る。
 *
 * 何を「宣言」と見なすかは呼び出し側（metrics）が決める。ここは歩くだけ。
 */

import { describe } from './hit-test.js';
import { matchRules, type MatchedRule, type MatchResult } from './rule-matcher.js';

/** 遡る上限。html まで届かない設計はまず無いが、壊れた DOM で無限に歩かない保険 */
const MAX_DEPTH = 32;

/**
 * hover のたびに祖先ぶんの matchRules を走らせると 60fps が出ない（§7）。
 * 要素は使い回されるので WeakMap で持ち、索引が変わったら捨てる。
 */
let cache = new WeakMap<Element, MatchResult>();

export function matchCached(el: Element): MatchResult {
  const hit = cache.get(el);
  if (hit) return hit;
  const result = matchRules(el);
  cache.set(el, result);
  return result;
}

/** HMR で索引が変わったら呼ぶ。WeakMap は消せないので作り直す */
export function resetInheritCache(): void {
  cache = new WeakMap();
}

export type Inherited<T> = {
  found: T;
  /** 宣言を持っていた祖先の記述。`body` */
  from: string;
};

/**
 * el の祖先を上へ辿り、find が最初に何かを返した時点で止める。
 * el 自身は見ない（呼び出し側が既に見ている前提）。
 */
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
