/**
 * 数値の整形。§5「小数は 1 桁まで」。
 * px ⇄ rem / vw の逆算（§F2 の補助表示）は M4 で追加する。
 */

/** 小数 1 桁まで。整数のときは小数点を付けない。 */
export function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** `12.3px` 形式。 */
export function px(n: number): string {
  return `${fmt(n)}px`;
}
