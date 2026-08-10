/**
 * 詳細度の計算。ブラウザが API を公開していないため自前で持つ。
 *
 * §6.4 の通り、これは「勝者の断定」には使わない。あくまでソート順のヒント。
 * `:where()` は 0、`:is()` / `:not()` / `:has()` は引数中の最大値、という
 * §6.3 のハマりどころ 3 番だけは正しく扱う。
 */

export type Specificity = [number, number, number];

const ZERO: Specificity = [0, 0, 0];

/** 引数の詳細度を「その中の最大値」として扱う関数擬似クラス。 */
const MAX_OF_ARGS = new Set([
  'is',
  'matches',
  'any',
  '-webkit-any',
  '-moz-any',
  'not',
  'has',
]);

/** 引数を詳細度に数えない関数擬似クラス。 */
const ZERO_ARGS = new Set(['where']);

export function compare(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function formatSpecificity(s: Specificity): string {
  return `${s[0]},${s[1]},${s[2]}`;
}

/** セレクタリスト全体の詳細度 = 各セレクタの最大値。 */
export function specificity(selectorList: string): Specificity {
  let best: Specificity = ZERO;
  for (const part of splitTopLevel(selectorList, ',')) {
    const s = computeCompound(part);
    if (compare(s, best) > 0) best = s;
  }
  return best;
}

function add(a: Specificity, b: Specificity): Specificity {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function computeCompound(selector: string): Specificity {
  let out: Specificity = [0, 0, 0];
  const s = selector;
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === '#') {
      i = skipIdent(s, i + 1);
      out[0] += 1;
      continue;
    }

    if (c === '.') {
      i = skipIdent(s, i + 1);
      out[1] += 1;
      continue;
    }

    if (c === '[') {
      i = skipBalanced(s, i, '[', ']');
      out[1] += 1;
      continue;
    }

    if (c === ':') {
      // 疑似要素は c 列（要素側）
      if (s[i + 1] === ':') {
        const end = skipIdent(s, i + 2);
        i = s[end] === '(' ? skipBalanced(s, end, '(', ')') : end;
        out[2] += 1;
        continue;
      }

      const nameEnd = skipIdent(s, i + 1);
      const name = s.slice(i + 1, nameEnd).toLowerCase();

      if (s[nameEnd] === '(') {
        const argEnd = skipBalanced(s, nameEnd, '(', ')');
        const args = s.slice(nameEnd + 1, argEnd - 1);

        if (ZERO_ARGS.has(name)) {
          // :where() は常に 0
        } else if (MAX_OF_ARGS.has(name)) {
          out = add(out, specificity(args));
        } else if (name === 'nth-child' || name === 'nth-last-child') {
          out[1] += 1;
          const of = splitOf(args);
          if (of) out = add(out, specificity(of));
        } else {
          out[1] += 1;
        }
        i = argEnd;
        continue;
      }

      // 単一コロンで書かれた歴史的な疑似要素（:before など）は c 列
      if (name === 'before' || name === 'after' || name === 'first-line' || name === 'first-letter') {
        out[2] += 1;
      } else {
        out[1] += 1;
      }
      i = nameEnd;
      continue;
    }

    if (c === '*' || c === '&') {
      // ユニバーサルと、解決しきれなかった `&` は 0
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }

    if (isIdentStart(c)) {
      const end = skipIdent(s, i);
      // 名前空間 `ns|el` は要素側だけ数える
      if (s[end] === '|' && s[end + 1] !== '=') {
        i = end + 1;
        continue;
      }
      out[2] += 1;
      i = end;
      continue;
    }

    i += 1;
  }

  return out;
}

/** `:nth-child(2n of .foo)` の `.foo` を取り出す。無ければ null。 */
function splitOf(args: string): string | null {
  const m = /\bof\b/.exec(args);
  return m ? args.slice(m.index + 2).trim() : null;
}

function isIdentStart(c: string | undefined): boolean {
  return !!c && (/[a-zA-Z_-]/.test(c) || c.charCodeAt(0) > 127 || c === '\\');
}

function skipIdent(s: string, i: number): number {
  while (i < s.length) {
    const c = s[i]!;
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (/[a-zA-Z0-9_-]/.test(c) || c.charCodeAt(0) > 127) {
      i += 1;
      continue;
    }
    break;
  }
  return i;
}

function skipString(s: string, i: number): number {
  const quote = s[i];
  i += 1;
  while (i < s.length) {
    if (s[i] === '\\') {
      i += 2;
      continue;
    }
    if (s[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

function skipBalanced(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return i;
}

/** 括弧・引用符の内側を無視して区切る。 */
export function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;

  while (i < input.length) {
    const c = input[i]!;
    if (c === '"' || c === "'") {
      i = skipString(input, i);
      continue;
    }
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === sep && depth === 0) {
      out.push(input.slice(start, i).trim());
      start = i + 1;
    }
    i += 1;
  }

  const last = input.slice(start).trim();
  if (last) out.push(last);
  return out.filter((s) => s.length > 0);
}
