import { formatInspectorObservation } from '../core/agent-context.js';
import type {
  InspectorObservation,
  ObservationCandidate,
  ObservationMetric,
} from '../core/observation.js';
import { openInEditor } from '../core/open-in-editor.js';
import { fmt } from '../core/units.js';

export type PanelContent = {
  selectionKey: string;
  observation: InspectorObservation;
};

export type Panel = {
  update(content: PanelContent): void;
  place(rect: DOMRect): void;
  show(): void;
  hide(): void;
  dim(on: boolean): void;
  openPrimarySource(): boolean;
  destroy(): void;
};

export function createPanel(root: ShadowRoot): Panel {
  const el = document.createElement('div');
  el.className = 'cal-panel';
  el.setAttribute('data-styletrace', 'panel');
  el.setAttribute('data-visible', 'false');

  const head = document.createElement('div');
  head.className = 'cal-head';
  const body = document.createElement('div');
  body.className = 'cal-body';

  const actions = document.createElement('div');
  actions.className = 'cal-actions';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'cal-copy';
  copy.textContent = 'Copy for agent';
  actions.appendChild(copy);

  const agent = document.createElement('span');
  agent.className = 'cal-agent';
  agent.dataset.state = 'idle';
  agent.textContent = 'Agent ready · .astro-styletrace/handoff.md';
  actions.appendChild(agent);

  const hint = document.createElement('p');
  hint.className = 'cal-hint';
  hint.textContent =
    'Alt+Click select · Enter open source · Esc / outside click close · Alt+↑↓ parent/child';

  el.append(head, body, actions, hint);
  root.appendChild(el);

  let expanded = new Set<string>();
  let last: PanelContent | null = null;
  let previous: PanelContent | null = null;
  let primarySource: HTMLButtonElement | null = null;
  let copyReset = 0;

  let x = 0;
  let y = 0;
  let pinned = false;

  function moveTo(nextX: number, nextY: number) {
    const margin = 12;
    const width = el.offsetWidth || 400;
    const height = el.offsetHeight || 200;
    x = Math.min(Math.max(nextX, margin), Math.max(margin, innerWidth - width - margin));
    y = Math.min(Math.max(nextY, margin), Math.max(margin, innerHeight - height - margin));
    el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  head.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button')) return;

    const offsetX = event.clientX - x;
    const offsetY = event.clientY - y;
    pinned = true;
    el.dataset.dragging = 'true';
    event.preventDefault();
    head.setPointerCapture(event.pointerId);

    const onMove = (move: PointerEvent) => {
      moveTo(move.clientX - offsetX, move.clientY - offsetY);
    };
    const onEnd = () => {
      head.removeEventListener('pointermove', onMove);
      head.removeEventListener('pointerup', onEnd);
      head.removeEventListener('pointercancel', onEnd);
      delete el.dataset.dragging;
    };

    head.addEventListener('pointermove', onMove);
    head.addEventListener('pointerup', onEnd);
    head.addEventListener('pointercancel', onEnd);
  });

  copy.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!last) return;

    const text = formatInspectorObservation(last.observation);

    copy.disabled = true;
    void writeClipboard(text, root).then((ok) => {
      copy.textContent = ok ? 'Copied' : 'Copy failed';
      copy.dataset.state = ok ? 'success' : 'fail';

      if (copyReset) clearTimeout(copyReset);
      copyReset = window.setTimeout(() => {
        copy.textContent = 'Copy for agent';
        copy.disabled = false;
        delete copy.dataset.state;
        copyReset = 0;
      }, 1200);
    });
  });

  function render() {
    if (!last) return;
    primarySource = null;
    renderHead(head, last);
    renderBody(
      body,
      last,
      previous,
      expanded,
      (button) => {
        if (!primarySource) primarySource = button;
      },
      (property) => {
        if (expanded.has(property)) expanded.delete(property);
        else expanded.add(property);
        render();
      },
    );
  }

  return {
    update(content) {
      previous = last && last.selectionKey === content.selectionKey ? last : null;
      last = content;
      agent.dataset.state = 'ready';
      expanded = new Set();
      render();
    },

    place(rect) {
      if (pinned) return;

      const width = el.offsetWidth || 400;
      const height = el.offsetHeight || 200;
      const margin = 12;

      let nextX = rect.right + margin;
      if (nextX + width > innerWidth - margin) nextX = rect.left - width - margin;
      if (nextX < margin) nextX = Math.min(margin, Math.max(0, innerWidth - width - margin));

      let nextY = rect.top;
      if (nextY + height > innerHeight - margin) nextY = innerHeight - height - margin;
      if (nextY < margin) nextY = margin;

      x = Math.round(nextX);
      y = Math.round(nextY);
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    },

    show() {
      el.setAttribute('data-visible', 'true');
    },
    hide() {
      el.setAttribute('data-visible', 'false');
      pinned = false;
      agent.dataset.state = 'idle';
    },
    dim(on) {
      el.setAttribute('data-dim', String(on));
    },
    openPrimarySource() {
      if (!primarySource) return false;
      primarySource.click();
      return true;
    },
    destroy() {
      if (copyReset) clearTimeout(copyReset);
      el.remove();
    },
  };
}

async function writeClipboard(text: string, root: ShadowRoot): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text, root);
  }
}

function legacyCopy(text: string, root: ShadowRoot): boolean {
  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
  root.appendChild(input);
  input.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    input.remove();
  }
}

function renderHead(head: HTMLElement, content: PanelContent) {
  head.textContent = '';
  const observation = content.observation;

  const target = document.createElement('div');
  target.className = 'cal-target';

  const name = document.createElement('b');
  name.textContent = observation.target;

  const size = document.createElement('span');
  size.className = 'cal-size';
  size.textContent = `${fmt(observation.borderBox.width)} × ${fmt(observation.borderBox.height)}`;

  target.append(name, size);
  head.appendChild(target);

  const badges = document.createElement('div');
  badges.className = 'cal-badges';

  if (observation.transformed) badges.appendChild(badge('transformed', 'warn'));

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
  previous: PanelContent | null,
  expanded: Set<string>,
  onPrimarySource: (button: HTMLButtonElement) => void,
  onToggle: (property: string) => void,
) {
  body.textContent = '';
  const observation = content.observation;

  if (observation.metrics.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cal-empty';
    empty.textContent = 'No declarations for this element.';
    body.appendChild(empty);
    return;
  }

  const previousByKey = new Map(
    (previous?.observation.metrics ?? []).map((metric) => [metricKey(metric), metric]),
  );

  for (const metric of observation.metrics) {
    body.appendChild(
      renderBlock(
        metric,
        previousByKey.get(metricKey(metric)) ?? null,
        expanded.has(metric.property),
        onPrimarySource,
        onToggle,
      ),
    );
  }
}

function renderBlock(
  metric: ObservationMetric,
  previous: ObservationMetric | null,
  open: boolean,
  onPrimarySource: (button: HTMLButtonElement) => void,
  onToggle: (property: string) => void,
): HTMLElement {
  const block = document.createElement('section');
  block.className = 'cal-block';
  block.dataset.diverged = String(metric.diverged);
  block.dataset.changed = String(hasChanged(metric, previous));

  block.appendChild(renderBlockHead(metric, open, onToggle));
  block.appendChild(renderRows(metric, previous));
  block.appendChild(renderSource(metric.declared, onPrimarySource));

  if (open && metric.others.length > 0) block.appendChild(renderOthers(metric.others));

  return block;
}

function renderBlockHead(
  metric: ObservationMetric,
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

function renderRows(metric: ObservationMetric, previous: ObservationMetric | null): HTMLElement {
  const rows = document.createElement('dl');
  rows.className = 'cal-rows';

  const via =
    metric.declared.property === metric.property ? null : `via ${metric.declared.property}`;

  rows.append(...row('declared', metric.declared.value, 'declared', via));
  rows.append(...row('computed', metric.computed, 'computed'));
  if (metric.measured !== null) {
    rows.append(...row('measured', metric.measured.label, 'measured'));
  }

  const diffs = diffRows(metric, previous);
  if (diffs.length > 0) {
    const dt = document.createElement('dt');
    dt.className = 'cal-label';
    dt.textContent = 'before';

    const dd = document.createElement('dd');
    dd.className = 'cal-val';
    dd.dataset.row = 'before';
    dd.append(...diffs);

    rows.append(dt, dd);
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

function renderSource(
  candidate: ObservationCandidate,
  onPrimarySource?: (button: HTMLButtonElement) => void,
): HTMLElement {
  const label =
    candidate.source.line === null
      ? candidate.source.label
      : `${candidate.source.label}:${candidate.source.line}`;

  if (!candidate.source.target) {
    const el = document.createElement('span');
    el.className = 'cal-source';
    el.dataset.open = 'false';
    el.textContent = label;
    return el;
  }

  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'cal-source';
  el.dataset.open = 'true';
  el.title = `Open ${candidate.source.target} in your editor`;
  el.textContent = `${label} ↗`;
  onPrimarySource?.(el);
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    void openInEditor(candidate.source.target ?? '').then((ok) => {
      const original = `${label} ↗`;
      el.dataset.state = ok ? 'success' : 'fail';
      el.textContent = ok ? `Opened ${label}` : `Failed ${label}`;
      setTimeout(() => {
        el.textContent = original;
        delete el.dataset.state;
      }, 1000);
    });
  });

  return el;
}

function renderOthers(others: ObservationCandidate[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'cal-others';

  for (const candidate of others) {
    const item = document.createElement('div');
    item.className = 'cal-other';

    const value = document.createElement('span');
    value.className = 'cal-other-value';
    value.textContent = `${candidate.property}: ${candidate.value}${candidate.important ? ' !important' : ''}`;

    const selector = document.createElement('span');
    selector.className = 'cal-other-selector';
    selector.textContent = candidate.selector;

    item.append(value, selector);
    item.appendChild(renderSource(candidate));
    list.appendChild(item);
  }

  return list;
}

function metricKey(metric: ObservationMetric): string {
  const declared = metric.declared;
  return [
    metric.property,
    declared.property,
    declared.source.label,
    declared.source.line ?? '',
    declared.selector,
  ].join('\0');
}

function hasChanged(metric: ObservationMetric, previous: ObservationMetric | null): boolean {
  if (!previous) return false;
  return (
    metric.declared.value !== previous.declared.value ||
    metric.computed !== previous.computed ||
    metric.measured?.value !== previous.measured?.value
  );
}

function diffRows(
  metric: ObservationMetric,
  previous: ObservationMetric | null,
): HTMLElement[] {
  if (!previous || !hasChanged(metric, previous)) return [];

  const out: HTMLElement[] = [];
  addDiff(out, 'declared', previous.declared.value, metric.declared.value);
  addDiff(out, 'computed', previous.computed, metric.computed);

  const previousMeasured = previous.measured?.label ?? null;
  const measured = metric.measured?.label ?? null;
  addDiff(out, 'measured', previousMeasured, measured);

  return out;
}

function addDiff(out: HTMLElement[], label: string, before: string | null, after: string | null) {
  if (before === after || before === null) return;

  const el = document.createElement('span');
  el.className = 'cal-diff';
  el.textContent = `${label} ${before}`;
  if (after !== null) el.title = `${before} → ${after}`;
  out.push(el);
}
