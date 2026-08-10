/**
 * 数値の整形と、px ⇄ rem / vw の逆算（§F2 の補助表示）。
 *
 * 相対単位で書かれた設計を、相対単位のまま検証できるようにするためのもの。
 */

/** 小数 1 桁まで。整数のときは小数点を付けない（§5） */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** `12.3px` 形式 */
export function px(n: number): string {
  return `${fmt(n)}px`;
}

export type UnitContext = {
  rootFontSize: number;
  viewportWidth: number;
};

export function unitContext(): UnitContext {
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return {
    rootFontSize: Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : 16,
    viewportWidth: window.innerWidth || 1,
  };
}

/** `28.8px` → 28.8。px 以外の単位や複数値は null */
export function parsePx(value: string): number | null {
  const match = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  if (!match) return null;
  const n = Number.parseFloat(match[1]!);
  return Number.isFinite(n) ? n : null;
}

export function toRem(value: number, ctx: UnitContext): string {
  return `${fmt(value / ctx.rootFontSize)}rem`;
}

export function toVw(value: number, ctx: UnitContext): string {
  return `${fmt((value / ctx.viewportWidth) * 100)}vw`;
}

/**
 * `28.8px` → `1.8rem · 2.0vw`。
 * 0 や、px として読めない値では null（併記する意味がない）。
 */
export function alternates(value: string, ctx: UnitContext): string | null {
  const n = parsePx(value);
  if (n === null || n === 0) return null;
  return `${toRem(n, ctx)} · ${toVw(n, ctx)}`;
}
