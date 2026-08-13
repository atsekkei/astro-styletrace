import { loadCssMap } from './css-map.js';
import { describe, childOf, parentOf, pick } from './hit-test.js';
import { matchCached, resetInheritCache } from './inherit.js';
import { measure, type MeasureResult } from './measure.js';
import { buildMetrics, hasTransformedChain } from './metrics.js';
import { invalidateStyleIndex } from './stylesheet-index.js';
import { createOverlay, type BoxModel, type Overlay } from '../ui/overlay.js';
import { createPanel, type Panel } from '../ui/panel.js';
import { CSS } from '../ui/styles.js';

export type Inspector = {
  start(): void;
  stop(): void;
  destroy(): void;
  invalidate(): void;
};

export function createInspector(canvas: ShadowRoot): Inspector {
  const style = document.createElement('style');
  style.setAttribute('data-styletrace', 'styles');
  style.textContent = CSS;
  canvas.appendChild(style);

  const overlay: Overlay = createOverlay(canvas);
  const panel: Panel = createPanel(canvas);

  let active = false;
  let altHeld = false;
  let frame = 0;

  const pointer = { x: -1, y: -1 };
  let target: Element | null = null;
  let traversal: Element | null = null;

  let selected: Element | null = null;
  let selectionDirty = false;

  let box: BoxModel | null = null;
  let placedKey = '';

  const resizeObserver = new ResizeObserver(() => {
    selectionDirty = true;
    schedule();
  });
  const styleObserver = new MutationObserver(() => {
    invalidateStyleIndex();
    resetInheritCache();
    void loadCssMap();
    box = null;
    target = null;
    selectionDirty = selected !== null;
    schedule();
  });
  const domObserver = new MutationObserver(() => {
    if (!selected) return;
    resetInheritCache();
    box = null;
    target = null;
    selectionDirty = true;
    schedule();
  });

  function schedule() {
    if (!active || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      commit();
    });
  }

  function commit() {
    if (!active) return;

    if (selected && !selected.isConnected) select(null);

    const selectedRect = selected ? selected.getBoundingClientRect() : null;

    if (!selected || !selectedRect) {
      panel.hide();
    } else {
      if (selectionDirty) {
        selectionDirty = false;
        const computed = getComputedStyle(selected);
        const match = matchCached(selected);
        panel.update({
          target: describe(selected),
          rect: selectedRect,
          metrics: buildMetrics(selected, selectedRect, computed, match.rules),
          transformed: hasTransformedChain(selected),
        });
      }

      const key = `${Math.round(selectedRect.left)},${Math.round(selectedRect.top)},${Math.round(selectedRect.width)},${Math.round(selectedRect.height)}`;
      if (key !== placedKey) {
        placedKey = key;
        panel.place(selectedRect);
      }
      panel.show();
      panel.dim(altHeld);
    }

    if (!altHeld) {
      overlay.clear();
      return;
    }

    const next = traversal ?? (pointer.x >= 0 ? pick(pointer.x, pointer.y) : null);
    if (!next) {
      overlay.clear();
      return;
    }

    const changed = next !== target;
    target = next;

    const rect = next.getBoundingClientRect();
    const hoverReliable = !hasTransformedChain(next);
    if (changed || (!box && hoverReliable)) {
      box = hoverReliable ? readBox(getComputedStyle(next)) : null;
    }
    const selectedReliable = selected ? !hasTransformedChain(selected) : true;

    const result: MeasureResult | null =
      selectedRect && next !== selected && selectedReliable && hoverReliable
        ? measure(selectedRect, rect)
        : null;

    overlay.render({
      hover: { rect, box, geometryReliable: hoverReliable },
      pinned: selectedRect ? { rect: selectedRect } : null,
      result,
    });
  }

  function setAlt(next: boolean) {
    if (altHeld === next) return;
    altHeld = next;
    schedule();
    if (!altHeld) overlay.clear();
  }

  function select(el: Element | null) {
    resizeObserver.disconnect();
    selected = el;
    selectionDirty = el !== null;
    placedKey = '';
    if (el) resizeObserver.observe(el);
    else panel.hide();
    schedule();
  }

  const onPointerMove = (event: PointerEvent) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    traversal = null;
    setAlt(event.altKey);
    if (altHeld) schedule();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Alt') {
      setAlt(true);
      return;
    }

    if (event.key === 'Escape' && selected) {
      event.preventDefault();
      select(null);
      return;
    }

    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      const current = traversal ?? target;
      if (!current) return;
      const next =
        event.key === 'ArrowUp'
          ? parentOf(current)
          : childOf(current, pointer.x, pointer.y);
      if (!next) return;
      event.preventDefault();
      traversal = next;
      setAlt(true);
      schedule();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Alt') setAlt(false);
  };

  const onBlur = () => setAlt(false);

  const onClick = (event: MouseEvent) => {
    if (event.altKey) {
      const el = traversal ?? pick(event.clientX, event.clientY);
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      select(el === selected ? null : el);
      return;
    }

    if (!selected) return;
    if (event.composedPath().some(isStyletraceNode)) return;
    select(null);
  };

  const onScroll = () => {
    selectionDirty = selected !== null;
    schedule();
  };

  const onResize = () => {
    box = null;
    resetInheritCache();
    target = null;
    selectionDirty = true;
    schedule();
  };

  return {
    start() {
      if (active) return;
      active = true;

      void loadCssMap();

      document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('keyup', onKeyUp, true);
      document.addEventListener('click', onClick, true);
      window.addEventListener('blur', onBlur);
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('resize', onResize, { passive: true });

      styleObserver.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      domObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
        childList: true,
        subtree: true,
      });
    },

    stop() {
      if (!active) return;
      active = false;
      altHeld = false;

      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);

      styleObserver.disconnect();
      domObserver.disconnect();
      resizeObserver.disconnect();
      selected = null;
      traversal = null;
      target = null;

      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      overlay.clear();
      panel.hide();
    },

    invalidate() {
      invalidateStyleIndex();
      resetInheritCache();
      void loadCssMap();
      box = null;
      target = null;
      selectionDirty = true;
      schedule();
    },

    destroy() {
      this.stop();
      overlay.destroy();
      panel.destroy();
      style.remove();
    },
  };
}

function isStyletraceNode(node: EventTarget): boolean {
  return node instanceof Element && node.hasAttribute('data-styletrace');
}

function readBox(computed: CSSStyleDeclaration): BoxModel {
  return {
    margin: {
      top: num(computed.marginTop),
      right: num(computed.marginRight),
      bottom: num(computed.marginBottom),
      left: num(computed.marginLeft),
    },
    padding: {
      top: num(computed.paddingTop),
      right: num(computed.paddingRight),
      bottom: num(computed.paddingBottom),
      left: num(computed.paddingLeft),
    },
  };
}

function num(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}
