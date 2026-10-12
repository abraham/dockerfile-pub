import { LINE_TYPE } from './types';
import type {
  Escape,
  ExplanationRef,
  InstructionContext,
  Lexeme,
  Line,
  Token,
  TokenType,
} from './types';
import {
  KNOWN_DIRECTIVES,
  continuationIndex,
  indentEnd,
  isBlankLine,
  isCommentLine,
  parseDirective,
  splitLines,
} from './lines';
import { lexInstruction, matchKeyword } from './instructions';
import { isTerminator } from './heredoc';
import type { HeredocMarker } from './heredoc';
import { lexShell } from './shell';

export { INSTRUCTIONS, LINE_TYPE, TOKEN_TYPE } from './types';
export type {
  ArgumentRole,
  ExplanationRef,
  Instruction,
  InstructionContext,
  Line,
  LineType,
  ShellRole,
  Token,
  TokenType,
} from './types';

interface Piece {
  text: string;
  type: TokenType;
  ref: ExplanationRef | null;
}

/** Logical text plus a map from each offset back to its physical line (-1: a joiner). */
interface Logical {
  text: string;
  lineOf: number[];
}

function appendLogical(logical: Logical, raw: string, line: number, from: number, to: number) {
  logical.text += raw.slice(from, to);
  for (let c = from; c < to; c++) logical.lineOf.push(line);
}

/** Covers any text the lexers didn't claim, so nothing is ever dropped (P1). */
function fillGaps(lexemes: Lexeme[], length: number, text: string): Lexeme[] {
  const sorted = [...lexemes].sort((a, b) => a.start - b.start);
  const result: Lexeme[] = [];
  let pos = 0;
  for (const lexeme of sorted) {
    if (lexeme.start < pos) continue;
    if (lexeme.start > pos) {
      const gap = text.slice(pos, lexeme.start);
      result.push({
        start: pos,
        end: lexeme.start,
        type: gap.trim() === '' ? 'whitespace' : 'text',
        ref: null,
      });
    }
    result.push(lexeme);
    pos = lexeme.end;
  }
  if (pos < length) {
    result.push({ start: pos, end: length, type: 'text', ref: null });
  }
  return result;
}

/** Phase 5: cuts lexemes at line boundaries and appends them to their lines (TOK-19). */
function split(lexemes: Lexeme[], logical: Logical, buckets: Piece[][]): void {
  for (const lexeme of fillGaps(lexemes, logical.text.length, logical.text)) {
    let i = lexeme.start;
    while (i < lexeme.end) {
      const line = logical.lineOf[i];
      if (line < 0) {
        i++;
        continue;
      }
      let j = i + 1;
      while (j < lexeme.end && logical.lineOf[j] === line) j++;
      buckets[line].push({ text: logical.text.slice(i, j), type: lexeme.type, ref: lexeme.ref });
      i = j;
    }
  }
}

/** Leading whitespace, then the rest of the line as one token. */
function simpleLine(raw: string, type: TokenType): Piece[] {
  const indent = indentEnd(raw);
  const pieces: Piece[] = [];
  if (indent > 0) pieces.push({ text: raw.slice(0, indent), type: 'whitespace', ref: null });
  if (indent < raw.length) pieces.push({ text: raw.slice(indent), type, ref: null });
  return pieces;
}

/** Tokenizes Dockerfile text into physical lines of tokens (TOK-1). */
export function tokenize(text: string): Line[] {
  const physical = splitLines(text);
  const n = physical.length;
  const lines: Line[] = physical.map((p, lineIndex) => ({
    lineIndex,
    raw: p.raw,
    eol: p.eol,
    type: LINE_TYPE.BLANK,
    instruction: null,
    tokens: [],
  }));
  const buckets: Piece[][] = physical.map(() => []);
  let escape: Escape = '\\';
  let i = 0;

  // Phase 2: parser directives (TOK-9 to TOK-12).
  const seen = new Set<string>();
  while (i < n) {
    const raw = physical[i].raw;
    const d = parseDirective(raw);
    if (!d || !KNOWN_DIRECTIVES.has(d.name) || seen.has(d.name)) break;
    seen.add(d.name);
    if (d.name === 'escape' && (d.value === '\\' || d.value === '`')) escape = d.value;
    const ref: ExplanationRef = { kind: 'directive', directive: d.name };
    const parts: [number, number, TokenType, ExplanationRef | null][] = [
      [0, d.hash, 'whitespace', null],
      [d.hash, d.nameStart, 'directive', ref],
      [d.nameStart, d.nameEnd, 'directive', ref],
      [d.nameEnd, d.equals, 'whitespace', null],
      [d.equals, d.equals + 1, 'punctuation', ref],
      [d.equals + 1, d.valueStart, 'whitespace', null],
      [d.valueStart, d.valueEnd, 'text', ref],
      [d.valueEnd, raw.length, 'whitespace', null],
    ];
    for (const [from, to, type, partRef] of parts) {
      if (to > from) buckets[i].push({ text: raw.slice(from, to), type, ref: partRef });
    }
    lines[i].type = LINE_TYPE.DIRECTIVE;
    i++;
  }

  // Phases 3 and 4: logical instructions, lexed one at a time.
  while (i < n) {
    const raw = physical[i].raw;
    if (isBlankLine(raw)) {
      buckets[i] = simpleLine(raw, 'whitespace');
      i++;
      continue;
    }
    if (isCommentLine(raw)) {
      lines[i].type = LINE_TYPE.COMMENT;
      buckets[i] = simpleLine(raw, 'comment');
      i++;
      continue;
    }
    const keyword = matchKeyword(raw, indentEnd(raw), raw.length, escape);
    if (!keyword) {
      lines[i].type = LINE_TYPE.UNKNOWN;
      buckets[i] = simpleLine(raw, 'text');
      i++;
      continue;
    }

    const ctx: InstructionContext = {
      keyword: keyword.instruction,
      startLine: i,
      form: null,
    };
    const logical: Logical = { text: '', lineOf: [] };
    const suffixes: { line: number; at: number }[] = [];
    let j = i;
    let first = true;
    while (j < n) {
      const r = physical[j].raw;
      if (!first && (isBlankLine(r) || isCommentLine(r))) {
        // Embedded blank and comment lines don't end the instruction (TOK-15).
        lines[j].type = isBlankLine(r) ? LINE_TYPE.BLANK : LINE_TYPE.COMMENT;
        lines[j].instruction = ctx;
        buckets[j] = simpleLine(r, isBlankLine(r) ? 'whitespace' : 'comment');
        j++;
        continue;
      }
      lines[j].type = first ? LINE_TYPE.INSTRUCTION : LINE_TYPE.CONTINUATION;
      lines[j].instruction = ctx;
      const at = continuationIndex(r, escape);
      appendLogical(logical, r, j, 0, at >= 0 ? at : r.length);
      if (at >= 0) suffixes.push({ line: j, at });
      first = false;
      j++;
      if (at < 0) break;
    }

    const lexed = lexInstruction(logical.text, keyword.instruction, keyword.end, escape);
    ctx.form = lexed.form;
    split(lexed.lexemes, logical, buckets);
    for (const { line, at } of suffixes) {
      const r = physical[line].raw;
      buckets[line].push({
        text: escape,
        type: 'escape',
        ref: { kind: 'line-continuation', escape },
      });
      if (at + 1 < r.length) {
        buckets[line].push({ text: r.slice(at + 1), type: 'whitespace', ref: null });
      }
    }

    // Heredoc bodies follow the instruction, in order (TOK-18, TOK-40).
    for (const marker of lexed.heredocs) {
      j = heredocBody(marker, j, physical, lines, buckets, ctx, escape);
    }
    i = j;
  }

  return lines.map((line, lineIndex) => {
    let column = 0;
    const tokens: Token[] = buckets[lineIndex].map((piece, tokenIndex) => {
      const token: Token = {
        id: `${lineIndex}-${tokenIndex}`,
        lineIndex,
        tokenIndex,
        column,
        text: piece.text,
        type: piece.type,
        ref: piece.ref,
      };
      column += piece.text.length;
      return token;
    });
    return { ...line, tokens };
  });
}

/** Tokenizes one heredoc body and its terminator; returns the next line index. */
function heredocBody(
  marker: HeredocMarker,
  start: number,
  physical: { raw: string }[],
  lines: Line[],
  buckets: Piece[][],
  ctx: InstructionContext,
  escape: Escape,
): number {
  let end = start;
  while (end < physical.length && !isTerminator(physical[end].raw, marker)) end++;
  for (let k = start; k < end; k++) {
    lines[k].type = LINE_TYPE.HEREDOC;
    lines[k].instruction = ctx;
  }

  if (marker.script) {
    // RUN bodies are a shell script; line breaks separate commands (TOK-41).
    const logical: Logical = { text: '', lineOf: [] };
    for (let k = start; k < end; k++) {
      if (k > start) {
        logical.text += '\n';
        logical.lineOf.push(-1);
      }
      appendLogical(logical, physical[k].raw, k, 0, physical[k].raw.length);
    }
    split(lexShell(logical.text, 0, logical.text.length, 'RUN', null, escape), logical, buckets);
  } else {
    for (let k = start; k < end; k++) buckets[k] = simpleLine(physical[k].raw, 'text');
  }

  if (end < physical.length) {
    const raw = physical[end].raw;
    const indent = raw.length - marker.delimiter.length;
    lines[end].type = LINE_TYPE.HEREDOC;
    lines[end].instruction = ctx;
    if (indent > 0)
      buckets[end].push({ text: raw.slice(0, indent), type: 'whitespace', ref: null });
    buckets[end].push({
      text: marker.delimiter,
      type: 'operator',
      ref: { kind: 'heredoc', instruction: marker.instruction, delimiter: marker.delimiter },
    });
    return end + 1;
  }
  return end;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

/** A stable, unique string for a ref, e.g. `flag:COPY:--from` (TOK-2). */
export function refKey(ref: ExplanationRef): string {
  switch (ref.kind) {
    case 'instruction':
      return `instruction:${ref.instruction}`;
    case 'subkeyword':
      return `subkeyword:${ref.instruction}:${ref.word}`;
    case 'flag':
      return `flag:${ref.instruction}:${encode(ref.flag)}`;
    case 'argument':
      return `argument:${ref.instruction}:${ref.role}:${encode(ref.text)}`;
    case 'json-array':
      return `json-array:${ref.instruction}`;
    case 'exec-form':
      return `exec-form:${ref.instruction}:${ref.role}:${encode(ref.text)}`;
    case 'shell':
      return ref.role === 'command' || ref.command === null
        ? `shell:${ref.instruction}:${ref.role}:${encode(ref.text)}`
        : `shell:${ref.instruction}:${ref.role}:${encode(ref.command)}:${encode(ref.text)}`;
    case 'variable':
      return `variable:${ref.instruction}:${ref.expandedBy}:${encode(ref.text)}`;
    case 'heredoc':
      return `heredoc:${ref.instruction}:${encode(ref.delimiter)}`;
    case 'directive':
      return `directive:${ref.directive}`;
    case 'line-continuation':
      return `line-continuation:${encodeURIComponent(ref.escape)}`;
  }
}
