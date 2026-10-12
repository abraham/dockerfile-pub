import { isSpace } from './types';

export type PieceType = 'text' | 'string' | 'variable';

export interface Piece {
  start: number;
  end: number;
  type: PieceType;
}

export interface Word {
  start: number;
  end: number;
  pieces: Piece[];
}

export type WordItem = { kind: 'space'; start: number; end: number } | ({ kind: 'word' } & Word);

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;
const SPECIAL_PARAMS = '@*#?-$!';

/**
 * Returns the end of a variable reference starting at `pos` (which holds `$`),
 * or `pos` if there isn't one. `shell` also accepts positional and special
 * parameters. An unterminated `${` runs to `end`.
 */
export function scanVariable(s: string, pos: number, end: number, shell: boolean): number {
  const next = s[pos + 1];
  if (pos + 1 >= end) return pos;
  if (next === '{') {
    let depth = 1;
    let i = pos + 2;
    while (i < end && depth > 0) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') depth--;
      i++;
    }
    return i;
  }
  if (NAME_START.test(next)) {
    let i = pos + 2;
    while (i < end && NAME_CHAR.test(s[i])) i++;
    return i;
  }
  if (shell && (/[0-9]/.test(next) || SPECIAL_PARAMS.includes(next))) return pos + 2;
  return pos;
}

/** The variable name in a reference such as `$HOME`, `${NODE_VERSION:-26}` or `$?`. */
export function variableName(text: string): string {
  let inner = text.startsWith('${') ? text.slice(2) : text.slice(1);
  if (text.startsWith('${') && inner.startsWith('#') && inner.length > 1 && inner[1] !== '}') {
    inner = inner.slice(1);
  }
  const match = /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|[@*#?$!-])/.exec(inner);
  return match ? match[0] : inner.replace(/}$/, '');
}

function pushPiece(pieces: Piece[], type: PieceType, start: number, end: number): void {
  if (end <= start) return;
  const last = pieces[pieces.length - 1];
  if (last && last.type === 'text' && type === 'text' && last.end === start) {
    last.end = end;
    return;
  }
  pieces.push({ start, end, type });
}

/** Lexes one non-shell word starting at `pos` (TOK-29, TOK-30). */
export function scanWord(
  s: string,
  pos: number,
  end: number,
  escape: string,
  splitVars: boolean,
): Word {
  const start = pos;
  const pieces: Piece[] = [];
  while (pos < end && !isSpace(s[pos])) {
    const ch = s[pos];
    if (ch === escape) {
      const next = Math.min(pos + 2, end);
      pushPiece(pieces, 'text', pos, next);
      pos = next;
    } else if (ch === '"') {
      let segStart = pos;
      let i = pos + 1;
      while (i < end && s[i] !== '"') {
        if (s[i] === escape && i + 1 < end) {
          i += 2;
          continue;
        }
        if (splitVars && s[i] === '$') {
          const v = scanVariable(s, i, end, false);
          if (v > i) {
            pushPiece(pieces, 'string', segStart, i);
            pushPiece(pieces, 'variable', i, v);
            segStart = v;
            i = v;
            continue;
          }
        }
        i++;
      }
      if (i < end) i++;
      pushPiece(pieces, 'string', segStart, i);
      pos = i;
    } else if (ch === "'") {
      const close = s.indexOf("'", pos + 1);
      const next = close < 0 || close >= end ? end : close + 1;
      pushPiece(pieces, 'string', pos, next);
      pos = next;
    } else if (splitVars && ch === '$') {
      const v = scanVariable(s, pos, end, false);
      if (v > pos) {
        pushPiece(pieces, 'variable', pos, v);
        pos = v;
      } else {
        pushPiece(pieces, 'text', pos, pos + 1);
        pos++;
      }
    } else {
      let i = pos + 1;
      while (
        i < end &&
        !isSpace(s[i]) &&
        s[i] !== escape &&
        s[i] !== '"' &&
        s[i] !== "'" &&
        !(splitVars && s[i] === '$')
      ) {
        i++;
      }
      pushPiece(pieces, 'text', pos, i);
      pos = i;
    }
  }
  return { start, end: pos, pieces };
}

/** Splits `s[pos..end)` into whitespace runs and words (§5.4). */
export function scanWords(
  s: string,
  pos: number,
  end: number,
  escape: string,
  splitVars: boolean,
): WordItem[] {
  const items: WordItem[] = [];
  while (pos < end) {
    if (isSpace(s[pos])) {
      const start = pos;
      while (pos < end && isSpace(s[pos])) pos++;
      items.push({ kind: 'space', start, end: pos });
    } else {
      const word = scanWord(s, pos, end, escape, splitVars);
      items.push({ kind: 'word', ...word });
      pos = word.end;
    }
  }
  return items;
}

/** Position of the first unquoted `=` in a word, or -1 (TOK-31). */
export function findEquals(s: string, word: Word): number {
  for (const piece of word.pieces) {
    if (piece.type !== 'text') continue;
    for (let i = piece.start; i < piece.end; i++) {
      if (s[i] === '=') return i;
    }
  }
  return -1;
}

/** The pieces of `word` clipped to `[from, to)`. */
export function clipPieces(word: Word, from: number, to: number): Piece[] {
  const result: Piece[] = [];
  for (const piece of word.pieces) {
    const start = Math.max(piece.start, from);
    const end = Math.min(piece.end, to);
    if (end > start) result.push({ start, end, type: piece.type });
  }
  return result;
}
