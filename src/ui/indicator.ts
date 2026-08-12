export type Indicator = {
  show(): void;
  hide(): void;
  destroy(): void;
};

export function createIndicator(root: ShadowRoot, shortcut: string): Indicator {
  const el = document.createElement('div');
  el.className = 'cal-indicator';
  el.setAttribute('data-caliper', 'indicator');
  el.setAttribute('data-visible', 'false');
  el.setAttribute('aria-hidden', 'true');

  const name = document.createElement('b');
  name.textContent = 'caliper';

  const hint = document.createElement('span');
  hint.textContent = shortcut;

  el.append(name, hint);
  root.appendChild(el);

  return {
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
