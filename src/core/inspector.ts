/**
 * イベントの受け口と、rAF での 1 回コミット（§7）。
 *
 * pointermove では座標を持つだけ。DOM の読み取りも書き込みも frame() に集約し、
 * 「読み終わってから書く」順序を守る。
 */

import { loadCssMap } from './css-map.js';
import { describe, childOf, parentOf, pick } from './hit-test.js';
import { matchCached, resetInheritCache } from './inherit.js';
import { measure, type MeasureResult } from './measure.js';
import { buildMetrics } from './metrics.js';
import { invalidateStyleIndex } from './stylesheet-index.js';
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

  /** Alt + Click で選んだ要素。パネルの中身も距離計測の基準もこれ（§F4） */
  let selected: Element | null = null;
  let selectionDirty = false;

  let box: BoxModel | null = null;
  let placedKey = '';

  const resizeObserver = new ResizeObserver(() => {
    selectionDirty = true; // 選択要素の寸法が変わった。実測値を取り直す
    schedule();
  });
  const styleObserver = new MutationObserver(() => {
    invalidateStyleIndex();
    resetInheritCache();
  });

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

    // HMR で選択要素ごと差し替わることがある
    if (selected && !selected.isConnected) select(null);

    // ---- パネル（選択に従う。hover では書き換えない。§F4） ----
    const selectedRect = selected ? selected.getBoundingClientRect() : null;

    if (!selected || !selectedRect) {
      panel.hide();
    } else {
      if (selectionDirty) {
        selectionDirty = false;
        const computed = getComputedStyle(selected);
        // 継承の遡り（§F2）で祖先も引くため、マッチ結果はキャッシュ経由で取る
        const match = matchCached(selected);
        panel.update({
          target: describe(selected),
          rect: selectedRect,
          metrics: buildMetrics(selected, selectedRect, computed, match.rules),
          transformed: computed.transform !== 'none',
        });
      }

      const key = `${Math.round(selectedRect.left)},${Math.round(selectedRect.top)},${Math.round(selectedRect.width)}`;
      if (key !== placedKey) {
        placedKey = key;
        panel.place(selectedRect);
      }
      panel.show();
      // 探索中は視界を空ける。消さずに落とすだけ（位置を見失わないため。§F4）
      panel.dim(altHeld);
    }

    // ---- オーバーレイ（hover に従う） ----
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
    if (changed || !box) box = readBox(getComputedStyle(next));

    // 選択要素そのものを hover しているときは測る相手がいない
    const result: MeasureResult | null =
      selectedRect && next !== selected ? measure(selectedRect, rect) : null;

    overlay.render({
      hover: { rect, box },
      pinned: selectedRect ? { rect: selectedRect } : null,
      result,
    });
  }

  function setAlt(next: boolean) {
    if (altHeld === next) return;
    altHeld = next;
    // 離した側も schedule する。パネルの減光を戻す必要がある（§F4）
    schedule();
    if (!altHeld) overlay.clear();
  }

  /** 選択 = パネルを開くこと。解除 = 閉じること。この 2 つは常に一致する（§F4） */
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
    traversal = null; // ポインタが動いたら親子移動を解除
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
    // Alt + Click は選択。ページ側には渡さない（リンクを踏んでしまう）
    if (event.altKey) {
      const el = traversal ?? pick(event.clientX, event.clientY);
      if (!el) return;
      event.preventDefault();
      event.stopPropagation();
      select(el === selected ? null : el);
      return;
    }

    // パネル外クリックで閉じる。capture なのでパネル内のボタンが止める前に来る。
    // 経路で判定しないと、出自リンクを押しただけで閉じてしまう
    if (!selected) return;
    if (event.composedPath().some(isCaliperNode)) return;
    // 閉じるだけで伝播はさせる。観察器がページのクリックを飲まない（§F4）
    select(null);
  };

  const onScroll = () => {
    schedule();
  };

  const onResize = () => {
    box = null; // resize で padding/margin が変わりうる
    // @media の成否が変われば、キャッシュ済みのマッチ結果は嘘になる
    resetInheritCache();
    target = null;
    selectionDirty = true;
    schedule();
  };

  return {
    start() {
      if (active) return;
      active = true;

      // 行番号マップは hover の前に取っておく（引くのは同期。§7）
      void loadCssMap();

      document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
      document.addEventListener('keydown', onKeyDown, true);
      document.addEventListener('keyup', onKeyUp, true);
      document.addEventListener('click', onClick, true);
      window.addEventListener('blur', onBlur);
      // 内側のスクロールコンテナも拾うため capture が必要（§6.8）
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      window.addEventListener('resize', onResize, { passive: true });

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
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);

      styleObserver.disconnect();
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

/** composedPath の要素は ShadowRoot / Window も混ざる */
function isCaliperNode(node: EventTarget): boolean {
  return node instanceof Element && node.hasAttribute('data-caliper');
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
