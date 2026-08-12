/**
 * ハイライト・ガイド線・矢印・ラベルを単一の SVG レイヤーに描く（§6.7）。
 *
 * 要素は毎フレーム作り直さずプールから再利用する。ラベル幅は tabular-nums の
 * 前提で文字数から見積もる（getBBox は強制同期レイアウトを起こすため使わない）。
 */

import { overlapCenter, type MeasureResult } from '../core/measure.js';
import { fmt } from '../core/units.js';
import { TOKENS } from './styles.js';

const NS = 'http://www.w3.org/2000/svg';

/** Inter 12px・tabular-nums の 1 文字あたりの送り幅（数字基準） */
const CHAR_W = 7.2;
const LABEL_H = 18;
const LABEL_PAD = 6;
const CAP = 4;

export type Insets = { top: number; right: number; bottom: number; left: number };
export type BoxModel = { margin: Insets; padding: Insets };

export type OverlayState = {
  hover: { rect: DOMRect; box: BoxModel } | null;
  pinned: { rect: DOMRect } | null;
  result: MeasureResult | null;
};

type Variant = 'pin' | 'hover' | 'measure';

/**
 * 彩度を 1 色に絞ったので、ピンと hover の区別は色ではなく線種に持たせる（§5）。
 * ピンは実線、hover は破線。
 */
const STROKE: Record<Variant, string> = {
  pin: TOKENS.ink,
  hover: TOKENS.accent,
  measure: TOKENS.accent,
};

const DASH: Record<Variant, string | null> = {
  pin: null,
  hover: '4 3',
  measure: null,
};

export type Overlay = {
  render(state: OverlayState): void;
  clear(): void;
  destroy(): void;
};

export function createOverlay(root: ShadowRoot): Overlay {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'cal-svg');
  svg.setAttribute('data-caliper', 'overlay');
  svg.setAttribute('aria-hidden', 'true');

  const boxLayer = layer(svg);
  const rectLayer = layer(svg);
  const guideLayer = layer(svg);
  const lineLayer = layer(svg);
  const labelLayer = layer(svg);

  const paths = new Pool<SVGPathElement>(boxLayer, 'path');
  const rects = new Pool<SVGRectElement>(rectLayer, 'rect');
  const guides = new Pool<SVGPathElement>(guideLayer, 'path');
  const lines = new Pool<SVGPathElement>(lineLayer, 'path');
  const labels = new LabelPool(labelLayer);

  root.appendChild(svg);

  function resetAll() {
    paths.reset();
    rects.reset();
    guides.reset();
    lines.reset();
    labels.reset();
  }

  function trimAll() {
    paths.trim();
    rects.trim();
    guides.trim();
    lines.trim();
    labels.trim();
  }

  function highlight(rect: DOMRect, variant: Variant) {
    const node = rects.next();
    node.setAttribute('x', String(rect.left));
    node.setAttribute('y', String(rect.top));
    node.setAttribute('width', String(Math.max(0, rect.width)));
    node.setAttribute('height', String(Math.max(0, rect.height)));
    node.setAttribute('rx', '0');
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', STROKE[variant]);
    node.setAttribute('stroke-width', '1.5');
    node.setAttribute('opacity', '1');
    node.setAttribute('vector-effect', 'non-scaling-stroke');

    const dash = DASH[variant];
    if (dash) node.setAttribute('stroke-dasharray', dash);
    else node.removeAttribute('stroke-dasharray');
  }

  /** margin / padding のボックス（外枠と内枠のあいだを塗る） */
  function frame(outer: DOMRect | Box, inner: Box, fill: string) {
    const o = toBox(outer);
    if (equalBox(o, inner)) return;
    const node = paths.next();
    node.setAttribute('d', `${boxPath(o)} ${boxPath(inner)}`);
    node.setAttribute('fill', fill);
    node.setAttribute('fill-rule', 'evenodd');
  }

  function line(from: Point, to: Point, horizontal: boolean) {
    const node = lines.next();
    const cap = horizontal
      ? `M ${from.x} ${from.y - CAP} V ${from.y + CAP} M ${to.x} ${to.y - CAP} V ${to.y + CAP}`
      : `M ${from.x - CAP} ${from.y} H ${from.x + CAP} M ${to.x - CAP} ${to.y} H ${to.x + CAP}`;
    node.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y} ${cap}`);
    node.setAttribute('stroke', STROKE.measure);
    node.setAttribute('stroke-width', '1');
    node.setAttribute('fill', 'none');
  }

  /** 基準要素のエッジから対象まで伸ばす破線。分離パターンの体験の核心（§6.7） */
  function guide(from: Point, to: Point) {
    if (from.x === to.x && from.y === to.y) return;
    const node = guides.next();
    node.setAttribute('d', `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
    node.setAttribute('stroke', STROKE.measure);
    node.setAttribute('stroke-width', '1');
    node.setAttribute('stroke-dasharray', '3 3');
    node.setAttribute('opacity', '0.6');
    node.setAttribute('fill', 'none');
  }

  function drawSeparate(a: DOMRect, b: DOMRect, result: Extract<MeasureResult, { kind: 'separate' }>) {
    if (result.horizontal) {
      const axis = result.horizontal;
      const y = overlapCenter(a.top, a.bottom, b.top, b.bottom) ?? (a.top + a.bottom) / 2;

      line({ x: axis.from, y }, { x: axis.to, y }, true);
      guide({ x: axis.from, y: clampTo(y, a.top, a.bottom) }, { x: axis.from, y });
      guide({ x: axis.to, y: clampTo(y, b.top, b.bottom) }, { x: axis.to, y });

      placeLabel(`${fmt(axis.gap)}`, axis.from, axis.to, y, true);
    }

    if (result.vertical) {
      const axis = result.vertical;
      const x = overlapCenter(a.left, a.right, b.left, b.right) ?? (a.left + a.right) / 2;

      line({ x, y: axis.from }, { x, y: axis.to }, false);
      guide({ x: clampTo(x, a.left, a.right), y: axis.from }, { x, y: axis.from });
      guide({ x: clampTo(x, b.left, b.right), y: axis.to }, { x, y: axis.to });

      placeLabel(`${fmt(axis.gap)}`, axis.from, axis.to, x, false);
    }
  }

  function drawContains(outer: DOMRect, inner: DOMRect) {
    const cx = (inner.left + inner.right) / 2;
    const cy = (inner.top + inner.bottom) / 2;

    const segments: [Point, Point, boolean][] = [
      [{ x: cx, y: outer.top }, { x: cx, y: inner.top }, false],
      [{ x: cx, y: inner.bottom }, { x: cx, y: outer.bottom }, false],
      [{ x: outer.left, y: cy }, { x: inner.left, y: cy }, true],
      [{ x: inner.right, y: cy }, { x: outer.right, y: cy }, true],
    ];

    for (const [from, to, horizontal] of segments) {
      const gap = horizontal ? to.x - from.x : to.y - from.y;
      if (gap <= 0.05) continue;
      line(from, to, horizontal);
      if (horizontal) placeLabel(fmt(gap), from.x, to.x, cy, true);
      else placeLabel(fmt(gap), from.y, to.y, cx, false);
    }
  }

  function drawOverlap(a: DOMRect, b: DOMRect, result: Extract<MeasureResult, { kind: 'overlap' }>) {
    const left = Math.max(a.left, b.left);
    const top = Math.max(a.top, b.top);
    const width = Math.min(a.right, b.right) - left;
    const height = Math.min(a.bottom, b.bottom) - top;

    const node = rects.next();
    node.setAttribute('x', String(left));
    node.setAttribute('y', String(top));
    node.setAttribute('width', String(Math.max(0, width)));
    node.setAttribute('height', String(Math.max(0, height)));
    node.setAttribute('fill', TOKENS.overlapFill);
    node.setAttribute('stroke', STROKE.measure);
    node.setAttribute('stroke-width', '1');
    node.setAttribute('opacity', '1');
    node.setAttribute('rx', '0');
    node.setAttribute('stroke-dasharray', '4 3');

    labels.draw(`overlap ${fmt(result.x)} × ${fmt(result.y)}`, left + width / 2, top + height / 2);
  }

  /** gap が狭ければラベルを矢印の外側（延長線上）へ逃がす（§6.7） */
  function placeLabel(text: string, from: number, to: number, cross: number, horizontal: boolean) {
    const gap = Math.abs(to - from);
    const width = labelWidth(text);
    // 線に沿う方向のラベルの大きさ。横向きなら幅、縦向きなら高さ
    const span = horizontal ? width : LABEL_H;

    let main = (from + to) / 2;
    if (gap < span + 8) main = Math.max(from, to) + span / 2 + 6;

    // main は線に沿う座標、cross は線に直交する座標
    if (horizontal) labels.draw(text, main, cross - LABEL_H / 2 - 3);
    else labels.draw(text, cross + width / 2 + 6, main);
  }

  function render(state: OverlayState) {
    resetAll();
    svg.style.display = '';

    const { hover, pinned, result } = state;

    if (pinned) highlight(pinned.rect, 'pin');

    if (hover) {
      const rect = hover.rect;
      // margin ボックス（外側）と padding ボックス（内側）
      frame(expand(rect, hover.box.margin), toBox(rect), TOKENS.margin);
      frame(rect, shrink(rect, hover.box.padding), TOKENS.padding);
      highlight(rect, 'hover');
    }

    if (pinned && hover && result) {
      const a = pinned.rect;
      const b = hover.rect;

      if (result.kind === 'separate') drawSeparate(a, b, result);
      else if (result.kind === 'contains') {
        const outer = result.outer === 'a' ? a : b;
        const inner = result.outer === 'a' ? b : a;
        drawContains(outer, inner);
      } else drawOverlap(a, b, result);
    } else if (hover) {
      const rect = hover.rect;
      labels.draw(`${fmt(rect.width)} × ${fmt(rect.height)}`, rect.left + rect.width / 2, rect.top - LABEL_H / 2 - 4);
    }

    trimAll();
  }

  function clear() {
    resetAll();
    trimAll();
    svg.style.display = 'none';
  }

  function destroy() {
    svg.remove();
  }

  return { render, clear, destroy };
}

type Point = { x: number; y: number };
type Box = { left: number; top: number; right: number; bottom: number };

function layer(parent: SVGSVGElement): SVGGElement {
  const g = document.createElementNS(NS, 'g');
  parent.appendChild(g);
  return g;
}

function toBox(rect: DOMRect | Box): Box {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function equalBox(a: Box, b: Box): boolean {
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

function expand(rect: DOMRect, insets: Insets): Box {
  return {
    left: rect.left - insets.left,
    top: rect.top - insets.top,
    right: rect.right + insets.right,
    bottom: rect.bottom + insets.bottom,
  };
}

function shrink(rect: DOMRect, insets: Insets): Box {
  return {
    left: rect.left + insets.left,
    top: rect.top + insets.top,
    right: Math.max(rect.left + insets.left, rect.right - insets.right),
    bottom: Math.max(rect.top + insets.top, rect.bottom - insets.bottom),
  };
}

function boxPath(box: Box): string {
  return `M ${box.left} ${box.top} H ${box.right} V ${box.bottom} H ${box.left} Z`;
}

function clampTo(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function labelWidth(text: string): number {
  return text.length * CHAR_W + LABEL_PAD * 2;
}

class Pool<T extends SVGElement> {
  private nodes: T[] = [];
  private used = 0;

  constructor(
    private parent: SVGElement,
    private tag: string,
  ) {}

  next(): T {
    let node = this.nodes[this.used];
    if (!node) {
      node = document.createElementNS(NS, this.tag) as unknown as T;
      this.nodes.push(node);
      this.parent.appendChild(node);
    }
    node.removeAttribute('display');
    this.used += 1;
    return node;
  }

  reset(): void {
    this.used = 0;
  }

  trim(): void {
    for (let i = this.used; i < this.nodes.length; i++) {
      this.nodes[i]!.setAttribute('display', 'none');
    }
  }
}

class LabelPool {
  private groups: { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement }[] = [];
  private used = 0;

  constructor(private parent: SVGElement) {}

  /** (cx, cy) を中心にラベルを置く。ビューポート端では内側へ寄せる */
  draw(text: string, cx: number, cy: number): void {
    const item = this.take();
    const width = labelWidth(text);

    const x = clampTo(cx - width / 2, 2, Math.max(2, innerWidth - width - 2));
    const y = clampTo(cy - LABEL_H / 2, 2, Math.max(2, innerHeight - LABEL_H - 2));

    item.rect.setAttribute('x', String(x));
    item.rect.setAttribute('y', String(y));
    item.rect.setAttribute('width', String(width));
    item.rect.setAttribute('height', String(LABEL_H));
    item.rect.setAttribute('rx', '4');

    item.text.setAttribute('x', String(x + width / 2));
    item.text.setAttribute('y', String(y + LABEL_H / 2));
    item.text.textContent = text;
  }

  private take() {
    let item = this.groups[this.used];
    if (!item) {
      const g = document.createElementNS(NS, 'g');
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('fill', TOKENS.labelBg);

      const text = document.createElementNS(NS, 'text');
      text.setAttribute('class', 'cal-label-text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');

      g.append(rect, text);
      this.parent.appendChild(g);
      item = { g, rect, text };
      this.groups.push(item);
    }
    item.g.removeAttribute('display');
    this.used += 1;
    return item;
  }

  reset(): void {
    this.used = 0;
  }

  trim(): void {
    for (let i = this.used; i < this.groups.length; i++) {
      this.groups[i]!.g.setAttribute('display', 'none');
    }
  }
}
