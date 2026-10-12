import type { Escape } from './types';

export interface PhysicalLine {
  raw: string;
  eol: '' | '\n' | '\r\n';
}

/** Phase 1: splits on `\r\n` and `\n`, with no phantom last line (TOK-7, TOK-8). */
export function splitLines(text: string): PhysicalLine[] {
  const lines: PhysicalLine[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl < 0) {
      if (start < text.length || lines.length === 0) {
        lines.push({ raw: text.slice(start), eol: '' });
      }
      return lines;
    }
    const crlf = nl > start && text[nl - 1] === '\r';
    lines.push({ raw: text.slice(start, crlf ? nl - 1 : nl), eol: crlf ? '\r\n' : '\n' });
    start = nl + 1;
  }
}

export interface Directive {
  name: string;
  value: string;
  /** Offsets in the line: `#` start, name start/end, `=`, value start/end. */
  hash: number;
  nameStart: number;
  nameEnd: number;
  equals: number;
  valueStart: number;
  valueEnd: number;
}

function isDirectiveSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r';
}

/** Matches `^\s*#\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*?)\s*$` by hand (TOK-9). */
export function parseDirective(raw: string): Directive | null {
  let i = 0;
  while (isDirectiveSpace(raw[i])) i++;
  if (raw[i] !== '#') return null;
  const hash = i;
  i++;
  while (isDirectiveSpace(raw[i])) i++;
  const nameStart = i;
  if (!/[A-Za-z]/.test(raw[i] ?? '')) return null;
  while (i < raw.length && /[A-Za-z0-9]/.test(raw[i])) i++;
  const nameEnd = i;
  while (isDirectiveSpace(raw[i])) i++;
  if (raw[i] !== '=') return null;
  const equals = i;
  i++;
  while (isDirectiveSpace(raw[i])) i++;
  const valueStart = i;
  let valueEnd = raw.length;
  while (valueEnd > valueStart && isDirectiveSpace(raw[valueEnd - 1])) valueEnd--;
  return {
    name: raw.slice(nameStart, nameEnd).toLowerCase(),
    value: raw.slice(valueStart, valueEnd),
    hash,
    nameStart,
    nameEnd,
    equals,
    valueStart,
    valueEnd,
  };
}

export const KNOWN_DIRECTIVES: ReadonlySet<string> = new Set(['syntax', 'escape', 'check']);

/**
 * If `raw` ends with the escape character plus optional spaces and tabs,
 * returns the escape character's index; otherwise -1 (TOK-14).
 */
export function continuationIndex(raw: string, escape: Escape): number {
  let i = raw.length;
  while (i > 0 && (raw[i - 1] === ' ' || raw[i - 1] === '\t')) i--;
  return i > 0 && raw[i - 1] === escape ? i - 1 : -1;
}

/** Index of the first character that isn't a space, tab or stray CR. */
export function indentEnd(raw: string): number {
  let i = 0;
  while (i < raw.length && isDirectiveSpace(raw[i])) i++;
  return i;
}

export function isBlankLine(raw: string): boolean {
  return indentEnd(raw) === raw.length;
}

export function isCommentLine(raw: string): boolean {
  return raw[indentEnd(raw)] === '#';
}
