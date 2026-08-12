export type Specificity = [number, number, number];

const ZERO: Specificity = [0, 0, 0];

const MAX_OF_ARGS = new Set([
  'is',
  'matches',
  'any',
  '-webkit-any',
  '-moz-any',
  'not',
  'has',
]);

const ZERO_ARGS = new Set(['where']);

export function compare(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function formatSpecificity(s: Specificity): string {
  return `${s[0]},${s[1]},${s[2]}`;
}

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

      if (name === 'before' || name === 'after' || name === 'first-line' || name === 'first-letter') {
        out[2] += 1;
      } else {
        out[1] += 1;
      }
      i = nameEnd;
      continue;
    }

    if (c === '*' || c === '&') {
      i += 1;
      continue;
    }

    if (c === '"' || c === "'") {
      i = skipString(s, i);
      continue;
    }

    if (isIdentStart(c)) {
      const end = skipIdent(s, i);
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
