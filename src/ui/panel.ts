/**
 * スタイル出自パネル（§F2 のうち M3 の範囲）。
 *
 * 宣言値 / 計算値 / 実測値の 3 列表示は M4。ここでは
 * 「どのファイルの、どのセレクタが、何を宣言しているか」と
 * 「計算値と一致している宣言はどれか」までを出す。
 */

import { isDefaultProperty, type MatchResult, type MatchedRule } from '../core/rule-matcher.js';
import { fmt } from '../core/units.js';

export type PanelContent = {
  target: string;
  rect: DOMRect;
  match: MatchResult;
  /** transform 適用中（計算値と実測値がずれる。§6.5） */
  transformed: boolean;
  pinned: boolean;
  astroComponentId: string | null;
};

export type Panel = {
  update(content: PanelContent): void;
  place(rect: DOMRect): void;
  show(): void;
  hide(): void;
  destroy(): void;
};

export function createPanel(root: ShadowRoot): Panel {
  const el = document.createElement('div');
  el.className = 'caliper-panel';
  el.setAttribute('data-caliper', 'panel');
  el.setAttribute('data-visible', 'false');

  const head = document.createElement('div');
  head.className = 'caliper-head';
  const body = document.createElement('div');
  body.className = 'caliper-body';
  el.append(head, body);
  root.appendChild(el);

  let showAll = false;
  let last: PanelContent | null = null;

  function render() {
    if (!last) return;
    renderHead(head, last);
    renderBody(body, last, showAll, () => {
      showAll = !showAll;
      render();
    });
  }

  return {
    update(content) {
      last = content;
      render();
    },

    /** hover 要素の近傍へ。ビューポート端で反転させる（§5） */
    place(rect) {
      const width = el.offsetWidth || 340;
      const height = el.offsetHeight || 200;
      const margin = 12;

      let x = rect.right + margin;
      if (x + width > innerWidth - margin) x = rect.left - width - margin;
      if (x < margin) x = Math.min(margin, Math.max(0, innerWidth - width - margin));

      let y = rect.top;
      if (y + height > innerHeight - margin) y = innerHeight - height - margin;
      if (y < margin) y = margin;

      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    },

    show() {
      el.setAttribute('data-visible', 'true');
    },
    hide() {
      el.setAttribute('data-visible', 'false');
    },
    destroy() {
      el.remove();
    },
  };
}

function renderHead(head: HTMLElement, content: PanelContent) {
  head.textContent = '';

  const target = document.createElement('div');
  target.className = 'caliper-target';

  const name = document.createElement('b');
  name.textContent = content.target;

  const size = document.createElement('span');
  size.className = 'caliper-size';
  size.textContent = `${fmt(content.rect.width)} × ${fmt(content.rect.height)}`;

  target.append(name, size);
  head.appendChild(target);

  const badges = document.createElement('div');
  badges.className = 'caliper-badges';

  if (content.pinned) badges.appendChild(badge('ピン留め中', 'pin'));
  if (content.transformed) badges.appendChild(badge('transform 適用中', 'warn'));
  if (content.astroComponentId) badges.appendChild(badge(`cid ${content.astroComponentId}`));
  for (const sheet of content.match.unreadable) {
    badges.appendChild(badge(`解析不能: ${sheet.label}`, 'warn'));
  }

  if (badges.childElementCount > 0) head.appendChild(badges);
}

function badge(text: string, tone?: 'warn' | 'pin'): HTMLElement {
  const el = document.createElement('span');
  el.className = 'caliper-badge';
  if (tone) el.dataset.tone = tone;
  el.textContent = text;
  return el;
}

function renderBody(
  body: HTMLElement,
  content: PanelContent,
  showAll: boolean,
  onToggle: () => void,
) {
  body.textContent = '';

  const rules = content.match.rules;
  if (rules.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'caliper-empty';
    empty.textContent = 'マッチしたルールがありません。';
    body.appendChild(empty);
  }

  for (const group of groupBySource(rules)) {
    const section = document.createElement('section');
    section.className = 'caliper-group';

    const file = document.createElement('div');
    file.className = 'caliper-file';
    file.dataset.inline = String(group.rules[0]?.inline ?? false);
    file.textContent = group.label;
    section.appendChild(file);

    for (const rule of group.rules) {
      const declarations = showAll
        ? rule.declarations
        : rule.declarations.filter((d) => isDefaultProperty(d.property));
      if (declarations.length === 0) continue;

      section.appendChild(renderRule(rule, declarations));
    }

    if (section.childElementCount > 1) body.appendChild(section);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'caliper-toggle';
  toggle.textContent = showAll ? 'レイアウト関連のみ表示' : 'マッチしたルールの全宣言を表示';
  toggle.addEventListener('click', onToggle);
  body.appendChild(toggle);

  const hint = document.createElement('p');
  hint.className = 'caliper-hint';
  hint.textContent = 'Alt: 計測 / Alt+Click: ピン留め / Esc: 解除 / Alt+↑↓: 親子移動';
  body.appendChild(hint);
}

function renderRule(rule: MatchedRule, declarations: MatchedRule['declarations']): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'caliper-rule';

  const selector = document.createElement('div');
  selector.className = 'caliper-selector';

  const text = document.createElement('code');
  text.textContent = rule.rawSelector;
  selector.appendChild(text);

  const spec = document.createElement('span');
  spec.className = 'caliper-spec';
  spec.textContent = rule.layer
    ? `@layer ${rule.layer} · ${rule.specificity.join(',')}`
    : rule.specificity.join(',');
  selector.appendChild(spec);
  wrap.appendChild(selector);

  for (const condition of rule.conditions) {
    const cond = document.createElement('div');
    cond.className = 'caliper-cond';
    cond.textContent = `@${condition.kind} ${condition.text}`;
    wrap.appendChild(cond);
  }

  const list = document.createElement('ul');
  list.className = 'caliper-decls';

  for (const declaration of declarations) {
    const item = document.createElement('li');
    item.className = 'caliper-decl';
    item.dataset.overridden = String(declaration.overridden);
    item.dataset.computed = String(declaration.matchesComputed);
    if (declaration.matchesComputed) item.title = '計算値と一致';

    const prop = document.createElement('span');
    prop.className = 'caliper-prop';
    prop.textContent = `${declaration.property}:`;

    const value = document.createElement('span');
    value.className = 'caliper-value';
    value.textContent = declaration.value;

    item.append(prop, value);

    if (declaration.important) {
      const important = document.createElement('span');
      important.className = 'caliper-important';
      important.textContent = '!';
      item.appendChild(important);
    }

    list.appendChild(item);
  }

  wrap.appendChild(list);
  return wrap;
}

type Group = { label: string; rules: MatchedRule[] };

/** 出自ファイルごとにグルーピング（§F2）。並び順は詳細度順のまま保つ */
function groupBySource(rules: MatchedRule[]): Group[] {
  const groups: Group[] = [];

  for (const rule of rules) {
    const label = rule.source.label;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rules.push(rule);
    else groups.push({ label, rules: [rule] });
  }

  return groups;
}
