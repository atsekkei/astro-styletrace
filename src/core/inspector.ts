/**
 * イベントの受け口と、rAF での 1 回コミット（§7）。
 *
 * pointermove では座標を持つだけ。DOM の読み取りも書き込みも frame() に集約し、
 * 「読み終わってから書く」順序を守る。
 */

import { describe, astroComponentId, childOf, parentOf, pick } from './hit-test.js';
import { measure, type MeasureResult } from './measure.js';
import { buildMetrics, type Metric } from './metrics.js';
import { matchRules, type MatchResult } from './rule-matcher.js';
import { invalidateStyleIndex } from './stylesheet-index.js';
import { unitContext } from './units.js';
import { createOverlay, type BoxModel, type Overlay } from '../ui/overlay.js';
import { createPanel, type Panel } from '../ui/panel.js';
import { CSS } from '../ui/styles.js';

export type Inspector = {
  start(): void;
  stop(): void;
  destroy(): void;
  /** HMR 後に呼ぶ。索引と表示中の内容を捨てる */
  invalidate(): void;
};

export function createInspector(canvas: ShadowRoot): Inspector {
  const style = document.createElement('style');
  style.setAttribute('data-caliper', 'styles');
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
  let pinned: Element | null = null;

  let box: BoxModel | null = null;
  let match: MatchResult | null = null;
  let metrics: Metric[] = [];
  let transformed = false;
  let placedKey = '';

  const resizeObserver = new ResizeObserver(() => schedule());
  const styleObserver = new MutationObserver(() => invalidateStyleIndex());

  function schedule() {
    if (!active || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      commit();
    });
  }

  /** ここだけが DOM を触る。読み取りを全部済ませてから書き込む */
  function commit() {
    if (!active) return;

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

    // ---- 読み取り ----
    const rect = target.getBoundingClientRect();
    const pinnedRect = pinned && pinned.isConnected ? pinned.getBoundingClientRect() : null;

    if (changed || !box) {
      const computed = getComputedStyle(target);
      box = readBox(computed);
      transformed = computed.transform !== 'none';
      match = matchRules(target);
      metrics = buildMetrics(target, rect, computed, match.rules, unitContext());
    }

    const result: MeasureResult | null = pinnedRect ? measure(pinnedRect, rect) : null;

    // ---- 書き込み ----
    if (changed && match) {
      panel.update({
        target: describe(target),
        rect,
        match,
        metrics,
        transformed,
        pinned: pinned === target,
        astroComponentId: astroComponentId(target),
      });
    }

    overlay.render({
      hover: { rect, box },
      pinned: pinnedRect ? { rect: pinnedRect } : null,
      result,
    });

    const key = `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}`;
    if (key !== placedKey) {
      placedKey = key;
      panel.place(rect);
    }
    panel.show();
  }

  function setAlt(next: boolean) {
    if (altHeld === next) return;
    altHeld = next;
    if (altHeld) schedule();
    else overlay.clear(); // パネルは最後の内容を保持する（§F4）
  }

  function pin(el: Element | null) {
    resizeObserver.disconnect();
    pinned = el;
    if (el) resizeObserver.observe(el);
    schedule();
  }

  const onPointerMove = (event: PointerEvent) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    traversal = null; // ポインタが動いたら親子移動を解除
    setAlt(event.altKey);
    if (altHeld) schedule();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Alt') {
      setAlt(true);
      return;
    }

    if (event.key === 'Escape' && pinned) {
      event.preventDefault();
      pin(null);
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

  /** Alt + Click はページ側に渡さない（リンクを踏んでしまう） */
  const onClick = (event: MouseEvent) => {
    if (!event.altKey) return;
    const el = traversal ?? pick(event.clientX, event.clientY);
    if (!el) return;
    event.preventDefault();
    event.stopPropagation();
    pin(el === pinned ? null : el);
  };

  const onScrollOrResize = () => {
    box = null; // resize で padding/margin が変わりうる
    schedule();
  };

  return {
    start() {
      if (active) return;
      active = true;

      document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('keyup', onKeyUp, true);
      document.addEventListener('click', onClick, true);
      window.addEventListener('blur', onBlur);
      // 内側のスクロールコンテナも拾うため capture が必要（§6.8）
      document.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
      window.addEventListener('resize', onScrollOrResize, { passive: true });

      styleObserver.observe(document.head, {
        childList: true,
        subtree: true,
        characterData: true,
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
      document.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);

      styleObserver.disconnect();
      resizeObserver.disconnect();
      pinned = null;
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
      box = null;
      match = null;
      metrics = [];
      target = null;
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
