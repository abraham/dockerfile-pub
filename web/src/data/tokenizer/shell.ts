import { isBlank } from './types';
import type {
  Escape,
  Instruction,
  Lexeme,
  ShellRef,
  ShellRole,
  TokenType,
  ExplanationRef,
} from './types';
import { scanVariable, variableName } from './words';
import { scanHeredocMarker } from './heredoc';
import type { HeredocMarker } from './heredoc';

interface Ctx {
  s: string;
  end: number;
  instruction: Instruction;
  /** Collects Docker heredoc markers; `null` where they aren't recognized. */
  heredocs: HeredocMarker[] | null;
  /** Substitution nesting depth, capped so pathological input can't overflow the stack. */
  depth: number;
  /** Whether `\` escapes; not under `# escape=`` `, where shells are Windows shells. */
  backslash: boolean;
}

const MAX_DEPTH = 32;

interface Piece {
  start: number;
  end: number;
  type: TokenType;
  /** Fixed pieces keep `ref`; the others take the enclosing word's ref. */
  fixed: boolean;
  ref: ExplanationRef | null;
}

type Item =
  | { kind: 'space'; start: number; end: number; newline: boolean }
  | { kind: 'comment'; start: number; end: number }
  | { kind: 'operator'; start: number; end: number }
  | { kind: 'redirection'; start: number; end: number; needsTarget: boolean }
  | { kind: 'heredoc'; start: number; end: number; delimiter: string }
  | { kind: 'word'; start: number; end: number; pieces: Piece[] };

type Terminator = ')' | '))' | '`' | null;

const OPERATOR_CHARS = '&|;<>()';
const WORD_STOP = '&|;<>()`\\\'"$';
const REDIRECTION = /[0-9]*(?:<<<|<<-?|>>|>&|<&|>\||<>|&>>?|>|<)/y;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
const RESERVED: ReadonlySet<string> = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'in',
  '{',
  '}',
  '!',
]);

function shellRef(
  ctx: Ctx,
  role: ShellRole,
  text: string,
  command: string | null = null,
  words: readonly string[] = [],
  wordIndex = -1,
  before: string | null = null,
  after: string | null = null,
): ShellRef {
  return {
    kind: 'shell',
    instruction: ctx.instruction,
    role,
    command,
    text,
    words,
    wordIndex,
    before,
    after,
  };
}

/** Removes shell quoting from a word; variables and substitutions stay as written. */
export function unquote(raw: string): string {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "'") {
      let j = raw.indexOf("'", i + 1);
      if (j < 0) j = raw.length;
      out += raw.slice(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      i++;
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === '\\' && i + 1 < raw.length && '"\\$`'.includes(raw[i + 1])) {
          out += raw[i + 1];
          i += 2;
        } else {
          out += raw[i];
          i++;
        }
      }
      i++;
    } else if (c === '\\' && i + 1 < raw.length) {
      out += raw[i + 1];
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function pushPiece(pieces: Piece[], type: TokenType, start: number, end: number): void {
  if (end <= start) return;
  const last = pieces[pieces.length - 1];
  if (last && !last.fixed && last.type === type && type === 'text' && last.end === start) {
    last.end = end;
    return;
  }
  pieces.push({ start, end, type, fixed: false, ref: null });
}

function pushVariable(ctx: Ctx, pieces: Piece[], start: number, end: number): void {
  const text = ctx.s.slice(start, end);
  pieces.push({
    start,
    end,
    type: 'variable',
    fixed: true,
    ref: {
      kind: 'variable',
      name: variableName(text),
      text,
      instruction: ctx.instruction,
      expandedBy: 'shell',
    },
  });
}

/** Lexes a substitution (`$(…)`, `$((…))` or backticks) starting at `pos`. */
function substitution(ctx: Ctx, pieces: Piece[], pos: number, open: '`' | '$(' | '$(('): number {
  const { s, end } = ctx;
  const openEnd = pos + open.length;
  if (ctx.depth >= MAX_DEPTH) {
    pushPiece(pieces, 'text', pos, openEnd);
    return openEnd;
  }
  pieces.push({
    start: pos,
    end: openEnd,
    type: 'operator',
    fixed: true,
    ref: shellRef(ctx, 'substitution', open),
  });
  const close: Terminator = open === '`' ? '`' : open === '$((' ? '))' : ')';
  const nested: Ctx = { ...ctx, heredocs: null, depth: ctx.depth + 1 };
  const inner = scanItems(nested, openEnd, close);
  for (const lexeme of assignRoles(nested, inner.items)) {
    pieces.push({ ...lexeme, fixed: true });
  }
  let p = inner.end;
  if (p < end && s.startsWith(close, p)) {
    pieces.push({
      start: p,
      end: p + close.length,
      type: 'operator',
      fixed: true,
      ref: shellRef(ctx, 'substitution', close),
    });
    p += close.length;
  }
  return p;
}

function dollarParen(s: string, pos: number): '$(' | '$((' {
  return s[pos + 2] === '(' ? '$((' : '$(';
}

/** Lexes a double-quoted string starting at `pos`; returns the position after it. */
function doubleQuoted(ctx: Ctx, pieces: Piece[], pos: number, term: Terminator): number {
  const { s, end } = ctx;
  let seg = pos;
  let i = pos + 1;
  while (i < end && s[i] !== '"') {
    const c = s[i];
    if (c === '\\' && ctx.backslash && i + 1 < end) {
      i += 2;
    } else if (c === '$' && s[i + 1] === '(') {
      pushPiece(pieces, 'string', seg, i);
      i = substitution(ctx, pieces, i, dollarParen(s, i));
      seg = i;
    } else if (c === '$' && scanVariable(s, i, end, true) > i) {
      const v = scanVariable(s, i, end, true);
      pushPiece(pieces, 'string', seg, i);
      pushVariable(ctx, pieces, i, v);
      seg = v;
      i = v;
    } else if (c === '`' && term !== '`') {
      pushPiece(pieces, 'string', seg, i);
      i = substitution(ctx, pieces, i, '`');
      seg = i;
    } else {
      i++;
    }
  }
  if (i < end) i++;
  pushPiece(pieces, 'string', seg, i);
  return i;
}

function scanWord(ctx: Ctx, pos: number, term: Terminator): Item {
  const { s, end } = ctx;
  const start = pos;
  const pieces: Piece[] = [];
  while (pos < end) {
    const c = s[pos];
    if (isBlank(c) || c === '\n' || OPERATOR_CHARS.includes(c)) break;
    if (c === '`') {
      if (term === '`') break;
      pos = substitution(ctx, pieces, pos, '`');
    } else if (c === '\\' && ctx.backslash) {
      const next = Math.min(pos + 2, end);
      pushPiece(pieces, 'text', pos, next);
      pos = next;
    } else if (c === "'") {
      const close = s.indexOf("'", pos + 1);
      const next = close < 0 || close >= end ? end : close + 1;
      pushPiece(pieces, 'string', pos, next);
      pos = next;
    } else if (c === '"') {
      pos = doubleQuoted(ctx, pieces, pos, term);
    } else if (c === '$' && s[pos + 1] === '(') {
      pos = substitution(ctx, pieces, pos, dollarParen(s, pos));
    } else if (c === '$') {
      const v = scanVariable(s, pos, end, true);
      if (v > pos) {
        pushVariable(ctx, pieces, pos, v);
        pos = v;
      } else {
        pushPiece(pieces, 'text', pos, pos + 1);
        pos++;
      }
    } else {
      let j = pos + 1;
      while (j < end && !isBlank(s[j]) && s[j] !== '\n' && !WORD_STOP.includes(s[j])) j++;
      pushPiece(pieces, 'text', pos, j);
      pos = j;
    }
  }
  return { kind: 'word', start, end: pos, pieces };
}

function scanItems(ctx: Ctx, pos: number, term: Terminator): { items: Item[]; end: number } {
  const { s, end } = ctx;
  const items: Item[] = [];
  let depth = 0;
  while (pos < end) {
    const c = s[pos];
    if (depth === 0) {
      if (term === ')' && c === ')') break;
      if (term === '))' && c === ')' && s[pos + 1] === ')') break;
    }
    if (term === '`' && c === '`') break;

    if (isBlank(c) || c === '\n') {
      const start = pos;
      let newline = false;
      while (pos < end && (isBlank(s[pos]) || s[pos] === '\n')) {
        if (s[pos] === '\n') newline = true;
        pos++;
      }
      items.push({ kind: 'space', start, end: pos, newline });
      continue;
    }

    if (c === '#') {
      const start = pos;
      while (pos < end && s[pos] !== '\n') pos++;
      items.push({ kind: 'comment', start, end: pos });
      continue;
    }

    if (c === '<' && ctx.heredocs) {
      const marker = scanHeredocMarker(s, pos, end);
      if (marker) {
        items.push({ kind: 'heredoc', start: pos, end: marker.end, delimiter: marker.delimiter });
        ctx.heredocs.push({
          instruction: ctx.instruction,
          delimiter: marker.delimiter,
          stripTabs: marker.stripTabs,
          script: false,
        });
        pos = marker.end;
        continue;
      }
    }

    if (c === '<' || c === '>' || c === '&' || (c >= '0' && c <= '9')) {
      REDIRECTION.lastIndex = pos;
      const match = REDIRECTION.exec(s);
      if (match && pos + match[0].length <= end) {
        let next = pos + match[0].length;
        let needsTarget = true;
        if (match[0].endsWith('>&') || match[0].endsWith('<&')) {
          let k = next;
          while (k < end && s[k] >= '0' && s[k] <= '9') k++;
          if (k === next && s[k] === '-') k++;
          if (k > next) {
            next = k;
            needsTarget = false;
          }
        }
        items.push({ kind: 'redirection', start: pos, end: next, needsTarget });
        pos = next;
        continue;
      }
    }

    if (OPERATOR_CHARS.includes(c)) {
      const len = (c === '&' || c === '|' || c === ';') && s[pos + 1] === c ? 2 : 1;
      if (c === '(') depth++;
      else if (c === ')' && depth > 0) depth--;
      items.push({ kind: 'operator', start: pos, end: pos + len });
      pos += len;
      continue;
    }

    const word = scanWord(ctx, pos, term);
    if (word.end === pos) {
      // Defensive: never stall on a character no rule consumed (P2).
      items.push({
        kind: 'word',
        start: pos,
        end: pos + 1,
        pieces: [{ start: pos, end: pos + 1, type: 'text', fixed: false, ref: null }],
      });
      pos++;
      continue;
    }
    items.push(word);
    pos = word.end;
  }
  return { items, end: pos };
}

interface Segment {
  command: string | null;
  words: string[];
}

interface RoleInfo {
  role: ShellRole;
  segment: number;
  wordIndex: number;
}

/** Assigns simple-command roles (TOK-35, TOK-36) and returns the lexemes. */
function assignRoles(ctx: Ctx, items: Item[]): Lexeme[] {
  const { s } = ctx;
  const segments: Segment[] = [{ command: null, words: [] }];
  const roles: (RoleInfo | null)[] = [];
  let atStart = true;
  let endOfOptions = false;
  let pendingTarget = false;
  let control = false;

  const newSegment = () => {
    segments.push({ command: null, words: [] });
    atStart = true;
    endOfOptions = false;
    pendingTarget = false;
    control = false;
  };

  for (const item of items) {
    const index = segments.length - 1;
    const segment = segments[index];
    let info: RoleInfo | null = null;
    if (item.kind === 'space') {
      if (item.newline) newSegment();
    } else if (item.kind === 'operator') {
      info = { role: 'operator', segment: index, wordIndex: -1 };
      newSegment();
    } else if (item.kind === 'redirection') {
      info = { role: 'redirection', segment: index, wordIndex: -1 };
      pendingTarget = item.needsTarget;
    } else if (item.kind === 'word') {
      const raw = s.slice(item.start, item.end);
      const value = unquote(raw);
      if (pendingTarget) {
        info = { role: 'redirect-target', segment: index, wordIndex: -1 };
        pendingTarget = false;
      } else if (atStart) {
        if (ASSIGNMENT.test(raw)) {
          info = { role: 'assignment', segment: index, wordIndex: -1 };
        } else if (RESERVED.has(raw)) {
          info = { role: 'reserved', segment: index, wordIndex: -1 };
          if (raw === 'for' || raw === 'case') {
            atStart = false;
            control = true;
          }
        } else {
          info = { role: 'command', segment: index, wordIndex: segment.words.length };
          segment.command = value;
          segment.words.push(value);
          atStart = false;
        }
      } else if (control) {
        if (raw === 'in' || raw === 'do') {
          info = { role: 'reserved', segment: index, wordIndex: -1 };
          // `do` starts the loop body, which is a new simple command.
          if (raw === 'do') newSegment();
        } else {
          info = { role: 'argument', segment: index, wordIndex: -1 };
        }
      } else {
        const isOption = !endOfOptions && value.startsWith('-') && value !== '-';
        if (value === '--' && isOption) endOfOptions = true;
        info = {
          role: isOption ? 'option' : 'argument',
          segment: index,
          wordIndex: segment.words.length,
        };
        segment.words.push(value);
      }
    }
    roles.push(info);
  }

  // Nearest command word on each side of every segment, computed in O(n).
  const previous: (string | null)[] = [];
  let last: string | null = null;
  for (const segment of segments) {
    last = segment.command ?? last;
    previous.push(last);
  }
  const next: (string | null)[] = new Array<string | null>(segments.length).fill(null);
  let upcoming: string | null = null;
  for (let i = segments.length - 1; i >= 0; i--) {
    upcoming = segments[i].command ?? upcoming;
    next[i] = upcoming;
  }

  const lexemes: Lexeme[] = [];
  items.forEach((item, i) => {
    const info = roles[i];
    const text = s.slice(item.start, item.end);
    switch (item.kind) {
      case 'space':
        lexemes.push({ start: item.start, end: item.end, type: 'whitespace', ref: null });
        break;
      case 'comment':
        lexemes.push({ start: item.start, end: item.end, type: 'comment', ref: null });
        break;
      case 'heredoc':
        lexemes.push({
          start: item.start,
          end: item.end,
          type: 'operator',
          ref: { kind: 'heredoc', instruction: ctx.instruction, delimiter: item.delimiter },
        });
        break;
      case 'operator': {
        const segment = info?.segment ?? 0;
        lexemes.push({
          start: item.start,
          end: item.end,
          type: 'operator',
          ref: shellRef(
            ctx,
            'operator',
            text,
            null,
            [],
            -1,
            previous[segment],
            next[segment + 1] ?? null,
          ),
        });
        break;
      }
      case 'redirection': {
        const segment = segments[info?.segment ?? 0];
        lexemes.push({
          start: item.start,
          end: item.end,
          type: 'operator',
          ref: shellRef(ctx, 'redirection', text, segment.command, segment.words),
        });
        break;
      }
      case 'word': {
        const role = info?.role ?? 'argument';
        const segment = segments[info?.segment ?? 0];
        const standalone = role === 'reserved' || role === 'assignment';
        const ref = shellRef(
          ctx,
          role,
          text,
          standalone ? null : segment.command,
          role === 'reserved' ? [] : segment.words,
          info?.wordIndex ?? -1,
        );
        for (const piece of item.pieces) {
          lexemes.push({
            start: piece.start,
            end: piece.end,
            type: piece.type,
            ref: piece.fixed ? piece.ref : ref,
          });
        }
        break;
      }
    }
  });
  return lexemes;
}

/**
 * Lexes shell-form text `s[pos..end)` (§5.6). When `heredocs` is given,
 * Docker heredoc markers are recognized and collected into it (TOK-39).
 */
export function lexShell(
  s: string,
  pos: number,
  end: number,
  instruction: Instruction,
  heredocs: HeredocMarker[] | null,
  escape: Escape,
): Lexeme[] {
  const ctx: Ctx = { s, end, instruction, heredocs, depth: 0, backslash: escape === '\\' };
  return assignRoles(ctx, scanItems(ctx, pos, null).items);
}
