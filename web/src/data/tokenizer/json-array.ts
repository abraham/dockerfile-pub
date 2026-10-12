export type JsonPart =
  | { kind: 'space'; start: number; end: number }
  | { kind: 'punctuation'; start: number; end: number }
  | { kind: 'element'; start: number; end: number; index: number };

export interface JsonArray {
  parts: JsonPart[];
  /** Each element's decoded string value. */
  values: string[];
}

function isJsonSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * Lexes `s[pos..end)` as a JSON array of strings, or returns `null` if the
 * whole range isn't one (TOK-32). Single-quoted "JSON" is not exec form.
 */
export function scanJsonArray(s: string, pos: number, end: number): JsonArray | null {
  const parts: JsonPart[] = [];
  const values: string[] = [];

  const space = (i: number): number => {
    const start = i;
    while (i < end && isJsonSpace(s[i])) i++;
    if (i > start) parts.push({ kind: 'space', start, end: i });
    return i;
  };

  let i = space(pos);
  if (s[i] !== '[' || i >= end) return null;
  parts.push({ kind: 'punctuation', start: i, end: i + 1 });
  i = space(i + 1);

  if (s[i] === ']' && i < end) {
    parts.push({ kind: 'punctuation', start: i, end: i + 1 });
  } else {
    for (;;) {
      if (s[i] !== '"' || i >= end) return null;
      const start = i;
      i++;
      while (i < end && s[i] !== '"') {
        if (s[i] < ' ') return null;
        i += s[i] === '\\' ? 2 : 1;
      }
      if (i >= end) return null;
      i++;
      let value: unknown;
      try {
        value = JSON.parse(s.slice(start, i));
      } catch {
        return null;
      }
      if (typeof value !== 'string') return null;
      parts.push({ kind: 'element', start, end: i, index: values.length });
      values.push(value);
      i = space(i);
      if (i >= end) return null;
      if (s[i] === ']') {
        parts.push({ kind: 'punctuation', start: i, end: i + 1 });
        break;
      }
      if (s[i] !== ',') return null;
      parts.push({ kind: 'punctuation', start: i, end: i + 1 });
      i = space(i + 1);
    }
  }

  i = space(i + 1);
  return i === end ? { parts, values } : null;
}
