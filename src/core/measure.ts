export type Direction = 'left' | 'right' | 'up' | 'down';

export type Axis = {
  gap: number;
  dir: Direction;
  from: number;
  to: number;
};

export type Insets = { top: number; right: number; bottom: number; left: number };

export type MeasureResult =
  | { kind: 'separate'; horizontal: Axis | null; vertical: Axis | null }
  | { kind: 'contains'; outer: 'a' | 'b'; insets: Insets }
  | { kind: 'overlap'; x: number; y: number };

export function measure(a: DOMRect, b: DOMRect): MeasureResult {
  const horizontal: Axis | null =
    a.right <= b.left
      ? { gap: b.left - a.right, dir: 'right', from: a.right, to: b.left }
      : b.right <= a.left
        ? { gap: a.left - b.right, dir: 'left', from: b.right, to: a.left }
        : null;

  const vertical: Axis | null =
    a.bottom <= b.top
      ? { gap: b.top - a.bottom, dir: 'down', from: a.bottom, to: b.top }
      : b.bottom <= a.top
        ? { gap: a.top - b.bottom, dir: 'up', from: b.bottom, to: a.top }
        : null;

  if (horizontal || vertical) return { kind: 'separate', horizontal, vertical };

  if (contains(a, b)) return { kind: 'contains', outer: 'a', insets: insetsOf(a, b) };
  if (contains(b, a)) return { kind: 'contains', outer: 'b', insets: insetsOf(b, a) };

  return {
    kind: 'overlap',
    x: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  };
}

export function contains(outer: DOMRect, inner: DOMRect): boolean {
  return (
    outer.left <= inner.left &&
    outer.right >= inner.right &&
    outer.top <= inner.top &&
    outer.bottom >= inner.bottom
  );
}

function insetsOf(outer: DOMRect, inner: DOMRect): Insets {
  return {
    top: inner.top - outer.top,
    right: outer.right - inner.right,
    bottom: outer.bottom - inner.bottom,
    left: inner.left - outer.left,
  };
}

export function overlapCenter(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): number | null {
  const start = Math.max(a0, b0);
  const end = Math.min(a1, b1);
  if (end < start) return null;
  return (start + end) / 2;
}
