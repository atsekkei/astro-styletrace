/**
 * スタイル出自パネル（§F2）。
 *
 * 上段が 3 列表示（宣言値 / 計算値 / 実測値 + rem・vw 逆算）、
 * 下段が「どのファイルの、どのセレクタが、何を宣言しているか」。
 */

import { lineFor } from '../core/css-map.js';
import { formatMeasured, type Metric } from '../core/metrics.js';
import { copyText, editorTarget, openInEditor } from '../core/open-in-editor.js';
import { isDefaultProperty, type MatchResult, type MatchedRule } from '../core/rule-matcher.js';
import type { Source } from '../core/resolve-source.js';
import { fmt } from '../core/units.js';

export type PanelContent = {
  target: string;
  rect: DOMRect;
  match: MatchResult;
  metrics: Metric[];
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
      const width = el.offsetWidth || 380;
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

  if (content.pinned) badges.appendChild(badge('pinned', 'pin'));
  if (content.transformed) badges.appendChild(badge('transformed', 'warn'));
  if (content.astroComponentId) badges.appendChild(badge(`cid ${content.astroComponentId}`));
  for (const sheet of content.match.unreadable) {
    badges.appendChild(badge(`unreadable: ${sheet.label}`, 'warn'));
  }

  // エージェントへ渡す用（M5）。パネルの内容をそのままテキストで持ち出す
  const copy = action('copy all', 'Copy the whole panel as text', () =>
    copyText(summarize(content)),
  );
  badges.appendChild(copy);

  head.appendChild(badges);
}

/**
 * 押すと非同期で何かして、結果を短時間だけ見せるボタン。
 *
 * 成否を出さないと「押したのに何も起きない」（エディタが見つからない、
 * クリップボードが拒否された）が黙って消える。
 */
function action(label: string, title: string, run: () => Promise<boolean>): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'caliper-action';
  el.title = title;
  el.textContent = label;

  let timer = 0;
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    void run().then((ok) => {
      el.dataset.state = ok ? 'ok' : 'fail';
      clearTimeout(timer);
      timer = setTimeout(() => delete el.dataset.state, 1000) as unknown as number;
    });
  });

  return el;
}

/** パネルの表示内容をプレーンテキストに落とす（M5「パネル内容のコピー」） */
function summarize(content: PanelContent): string {
  const lines: string[] = [
    `${content.target}  ${fmt(content.rect.width)} × ${fmt(content.rect.height)}`,
  ];

  for (const metric of content.metrics) {
    const parts = [`declared ${metric.declared ?? '-'}`, `computed ${metric.computed}`];
    if (metric.measured !== null) parts.push(`measured ${formatMeasured(metric.measured)}`);
    lines.push(`  ${metric.property}: ${parts.join(' / ')}`);
    if (metric.declaredSource) {
      lines.push(`    ${metric.declaredSource} · ${metric.declaredSelector ?? ''}`);
    }
  }

  for (const rule of content.match.rules) {
    lines.push(`  ${rule.source.label} · ${rule.rawSelector} (${rule.specificity.join(',')})`);
    for (const declaration of rule.declarations) {
      const flags = declaration.overridden ? ' [overridden]' : '';
      lines.push(`    ${declaration.property}: ${declaration.value}${flags}`);
    }
  }

  return lines.join('\n');
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

  if (content.metrics.length > 0) body.appendChild(renderMetrics(content.metrics));

  const rules = content.match.rules;
  if (rules.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'caliper-empty';
    empty.textContent = 'No matching rules.';
    body.appendChild(empty);
  }

  for (const group of groupBySource(rules)) {
    const section = document.createElement('section');
    section.className = 'caliper-group';

    section.appendChild(renderFile(group));

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
  toggle.textContent = showAll ? 'Layout properties only' : 'All declarations of matched rules';
  toggle.addEventListener('click', onToggle);
  body.appendChild(toggle);

  const hint = document.createElement('p');
  hint.className = 'caliper-hint';
  hint.textContent = 'Alt measure · Alt+Click pin · Esc unpin · Alt+↑↓ parent/child';
  body.appendChild(hint);
}

/** 出自ファイルの見出し。ディスク上にあるファイルならエディタで開ける（§6.9） */
function renderFile(group: Group): HTMLElement {
  const inline = group.rules[0]?.inline ?? false;
  const target = inline ? null : editorTarget(group.source);

  if (!target) {
    const el = document.createElement('div');
    el.className = 'caliper-file';
    el.dataset.inline = String(inline);
    el.textContent = group.label;
    return el;
  }

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'caliper-file';
  el.dataset.inline = 'false';
  el.dataset.open = 'true';
  el.title = `Open ${target} in your editor`;
  el.textContent = group.label;
  el.addEventListener('click', () => {
    void openInEditor(target).then((ok) => {
      el.dataset.state = ok ? 'ok' : 'fail';
      setTimeout(() => delete el.dataset.state, 1000);
    });
  });
  return el;
}

/** 3 列表示（§F2）。3 つが一致している行は 1 列に畳む */
function renderMetrics(metrics: Metric[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'caliper-metrics';

  for (const metric of metrics) {
    const row = document.createElement('div');
    row.className = 'caliper-metric';
    row.dataset.diverged = String(metric.diverged);

    const headline = document.createElement('div');
    headline.className = 'caliper-metric-head';

    const prop = document.createElement('span');
    prop.className = 'caliper-prop';
    prop.textContent = metric.property;
    headline.appendChild(prop);

    if (metric.collapsed) {
      const value = document.createElement('span');
      value.className = 'caliper-value';
      value.textContent = metric.computed;
      headline.appendChild(value);
    }

    if (metric.alternates) {
      const alt = document.createElement('span');
      alt.className = 'caliper-alt';
      alt.textContent = metric.alternates;
      headline.appendChild(alt);
    }

    row.appendChild(headline);

    if (!metric.collapsed) {
      const columns = document.createElement('dl');
      columns.className = 'caliper-cols';

      if (metric.declared !== null) {
        // ショートハンドで書かれていた場合、その名前は値の側に添える
        // （ラベル列を広げると値の列が潰れる）
        const via = metric.declaredAs === metric.property ? null : `via ${metric.declaredAs}`;
        columns.append(...column('declared', metric.declared, 'declared', via));
        if (metric.variables) columns.append(...column('', metric.variables, 'variables'));
      }
      columns.append(...column('computed', metric.computed, 'computed'));
      if (metric.measured !== null) {
        columns.append(...column('measured', formatMeasured(metric.measured), 'measured'));
      }

      row.appendChild(columns);
    }

    if (metric.declaredSource) {
      const origin = document.createElement('div');
      origin.className = 'caliper-origin';
      origin.textContent = `${metric.declaredSource} · ${metric.declaredSelector ?? ''}`;
      origin.title = 'Strongest candidate by specificity — not asserted as the winner (§6.4)';
      row.appendChild(origin);
    }

    section.appendChild(row);
  }

  return section;
}

function column(
  label: string,
  value: string,
  kind: string,
  note?: string | null,
): [HTMLElement, HTMLElement] {
  const dt = document.createElement('dt');
  dt.className = 'caliper-col-label';
  dt.textContent = label;

  const dd = document.createElement('dd');
  dd.className = 'caliper-col-value';
  dd.dataset.col = kind;
  dd.textContent = value;

  if (note) {
    const suffix = document.createElement('span');
    suffix.className = 'caliper-col-note';
    suffix.textContent = note;
    dd.appendChild(suffix);
  }

  return [dt, dd];
}

function renderRule(rule: MatchedRule, declarations: MatchedRule['declarations']): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'caliper-rule';

  const selector = document.createElement('div');
  selector.className = 'caliper-selector';

  const text = document.createElement('code');
  text.textContent = rule.rawSelector;
  selector.appendChild(text);

  // 行が引けるなら直接そこへ飛ぶ（M6）。引けなければセレクタを持ち出して検索（M5）
  const file = rule.inline ? null : editorTarget(rule.source);
  const line = file ? lineFor(rule.source, rule.rawSelector) : null;

  if (file && line !== null) {
    selector.appendChild(
      action('open', `Open ${file}:${line}`, () => openInEditor(`${file}:${line}`)),
    );
  }
  selector.appendChild(action('copy', 'Copy this selector', () => copyText(rule.rawSelector)));

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
    if (declaration.matchesComputed) item.title = 'matches the computed value';

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

type Group = { label: string; source: Source; rules: MatchedRule[] };

/** 出自ファイルごとにグルーピング（§F2）。並び順は詳細度順のまま保つ */
function groupBySource(rules: MatchedRule[]): Group[] {
  const groups: Group[] = [];

  for (const rule of rules) {
    const label = rule.source.label;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rules.push(rule);
    else groups.push({ label, source: rule.source, rules: [rule] });
  }

  return groups;
}
