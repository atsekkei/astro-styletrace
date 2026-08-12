/**
 * スタイル出自パネル（§F2）。
 *
 * プロパティ 1 件が 1 ブロック。ブロックは常に同じ形をしている
 * （declared / computed / measured を一致していても畳まない）。
 */

import { lineFor } from '../core/css-map.js';
import { formatMeasured, type Candidate, type Metric } from '../core/metrics.js';
import { editorTarget, openInEditor } from '../core/open-in-editor.js';
import { fmt } from '../core/units.js';

export type PanelContent = {
  target: string;
  rect: DOMRect;
  metrics: Metric[];
  /** transform 適用中（computed と measured がずれる。§6.5） */
  transformed: boolean;
};

export type Panel = {
  update(content: PanelContent): void;
  place(rect: DOMRect): void;
  show(): void;
  hide(): void;
  /** 探索中の減光。消さずに落とす（§F4） */
  dim(on: boolean): void;
  destroy(): void;
};

export function createPanel(root: ShadowRoot): Panel {
  const el = document.createElement('div');
  el.className = 'cal-panel';
  el.setAttribute('data-caliper', 'panel');
  el.setAttribute('data-visible', 'false');

  const head = document.createElement('div');
  head.className = 'cal-head';
  const body = document.createElement('div');
  body.className = 'cal-body';

  const hint = document.createElement('p');
  hint.className = 'cal-hint';
  hint.textContent = 'Alt+Click select · Esc / outside click close · Alt+↑↓ parent/child';

  el.append(head, body, hint);
  root.appendChild(el);

  /** `+N` を開いているプロパティ。要素が変われば畳み直す */
  let expanded = new Set<string>();
  let last: PanelContent | null = null;

  function render() {
    if (!last) return;
    renderHead(head, last);
    renderBody(body, last, expanded, (property) => {
      if (expanded.has(property)) expanded.delete(property);
      else expanded.add(property);
      render();
    });
  }

  return {
    update(content) {
      last = content;
      expanded = new Set();
      render();
    },

    /** hover 要素の近傍へ。ビューポート端で反転させる（§5） */
    place(rect) {
      const width = el.offsetWidth || 400;
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
    dim(on) {
      el.setAttribute('data-dim', String(on));
    },
    destroy() {
      el.remove();
    },
  };
}

function renderHead(head: HTMLElement, content: PanelContent) {
  head.textContent = '';

  const target = document.createElement('div');
  target.className = 'cal-target';

  const name = document.createElement('b');
  name.textContent = content.target;

  // width / height は宣言があるときだけ行が立つ。実寸はここに常時出す（§F2）
  const size = document.createElement('span');
  size.className = 'cal-size';
  size.textContent = `${fmt(content.rect.width)} × ${fmt(content.rect.height)}`;

  target.append(name, size);
  head.appendChild(target);

  const badges = document.createElement('div');
  badges.className = 'cal-badges';

  // 出すのは「この要素の今の状態」だけ。要素によらず同じ内容が出続けるものは
  // 常時点いている飾りにしかならない（cid / 解析不能シート / 選択中であること）
  if (content.transformed) badges.appendChild(badge('transformed', 'warn'));

  head.appendChild(badges);
}

function badge(text: string, tone?: 'warn'): HTMLElement {
  const el = document.createElement('span');
  el.className = 'cal-badge';
  if (tone) el.dataset.tone = tone;
  el.textContent = text;
  return el;
}

function renderBody(
  body: HTMLElement,
  content: PanelContent,
  expanded: Set<string>,
  onToggle: (property: string) => void,
) {
  body.textContent = '';

  if (content.metrics.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cal-empty';
    empty.textContent = 'No declarations for this element.';
    body.appendChild(empty);
    return;
  }

  for (const metric of content.metrics) {
    body.appendChild(renderBlock(metric, expanded.has(metric.property), onToggle));
  }
}

function renderBlock(
  metric: Metric,
  open: boolean,
  onToggle: (property: string) => void,
): HTMLElement {
  const block = document.createElement('section');
  block.className = 'cal-block';
  block.dataset.diverged = String(metric.diverged);

  block.appendChild(renderBlockHead(metric, open, onToggle));
  block.appendChild(renderRows(metric));
  block.appendChild(renderSource(metric.declared));

  if (open && metric.others.length > 0) block.appendChild(renderOthers(metric.others));

  return block;
}

function renderBlockHead(
  metric: Metric,
  open: boolean,
  onToggle: (property: string) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cal-block-head';

  const prop = document.createElement('span');
  prop.className = 'cal-prop';
  prop.textContent = metric.property;
  el.appendChild(prop);

  if (metric.inheritedFrom) {
    const inherited = document.createElement('span');
    inherited.className = 'cal-inherit';
    inherited.textContent = `← ${metric.inheritedFrom}`;
    el.appendChild(inherited);
  }

  const selector = document.createElement('span');
  selector.className = 'cal-selector';
  selector.textContent = metric.declared.selector;
  selector.title = metric.declared.selector;
  el.appendChild(selector);

  // 件数が付いていない行は候補が 1 つしかないので、そのまま信じてよい（§F2）
  if (metric.others.length > 0) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'cal-more';
    more.textContent = `+${metric.others.length}`;
    more.setAttribute('aria-expanded', String(open));
    more.title = `${metric.others.length} more declaration(s) for ${metric.property}`;
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      onToggle(metric.property);
    });
    el.appendChild(more);
  }

  return el;
}

/** 常に同じ形（§F2）。measured が取れないときも declared / computed の位置は動かさない */
function renderRows(metric: Metric): HTMLElement {
  const rows = document.createElement('dl');
  rows.className = 'cal-rows';

  // ショートハンドで書かれていた場合、その名前は値の側に添える
  // （ラベル列を広げると値の列が潰れる）
  const via =
    metric.declared.property === metric.property ? null : `via ${metric.declared.property}`;

  rows.append(...row('declared', metric.declared.value, 'declared', via));
  rows.append(...row('computed', metric.computed, 'computed'));
  if (metric.measured !== null) {
    rows.append(...row('measured', formatMeasured(metric.measured), 'measured'));
  }

  return rows;
}

function row(
  label: string,
  value: string,
  kind: string,
  note?: string | null,
): [HTMLElement, HTMLElement] {
  const dt = document.createElement('dt');
  dt.className = 'cal-label';
  dt.textContent = label;

  const dd = document.createElement('dd');
  dd.className = 'cal-val';
  dd.dataset.row = kind;
  dd.textContent = value;

  if (note) {
    const suffix = document.createElement('span');
    suffix.className = 'cal-note';
    suffix.textContent = note;
    dd.appendChild(suffix);
  }

  return [dt, dd];
}

/**
 * 出自リンク。ブロックごとに持つ（§F3）。
 * リセット CSS + グローバル + scoped style が混ざるので、パネル単位ではまとめられない。
 */
function renderSource(candidate: Candidate): HTMLElement {
  const file = editorTarget(candidate.source);

  if (!file) {
    const el = document.createElement('span');
    el.className = 'cal-source';
    el.dataset.open = 'false';
    el.textContent = candidate.source.label;
    return el;
  }

  // 行が引けるならそこへ、引けなければファイル先頭へ（§6.9）
  const line = lineFor(candidate.source, candidate.selector);
  const target = line === null ? file : `${file}:${line}`;

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cal-source';
  el.dataset.open = 'true';
  el.title = `Open ${target} in your editor`;
  el.textContent = `${candidate.source.label} ↗`;
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    void openInEditor(target).then((ok) => {
      if (ok) return;
      el.dataset.state = 'fail';
      setTimeout(() => delete el.dataset.state, 1000);
    });
  });

  return el;
}

function renderOthers(others: Candidate[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'cal-others';

  for (const candidate of others) {
    const item = document.createElement('div');
    item.className = 'cal-other';

    const value = document.createElement('span');
    value.className = 'cal-other-value';
    value.textContent = `${candidate.property}: ${candidate.value}`;

    const selector = document.createElement('span');
    selector.className = 'cal-other-selector';
    selector.textContent = candidate.selector;

    item.append(value, selector);
    item.appendChild(renderSource(candidate));
    list.appendChild(item);
  }

  return list;
}
