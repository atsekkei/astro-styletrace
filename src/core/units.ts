/**
 * 数値の整形（§5）。
 *
 * px → rem / vw の逆算は §2 で非目標にしたため持たない。知りたいのは
 * 「CSS にどう書いてあるか」と「実地はいくらか」の 2 点であって、その間の
 * 導出過程ではない。
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

/** `28.8px` → 28.8。px 以外の単位や複数値は null */
export function parsePx(value: string): number | null {
  const match = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  if (!match) return null;
  const n = Number.parseFloat(match[1]!);
  return Number.isFinite(n) ? n : null;
}
