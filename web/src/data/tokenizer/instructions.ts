import { isBlank, isInstruction, isSpace } from './types';
import type { ArgumentRole, Escape, ExplanationRef, Instruction, Lexeme, TokenType } from './types';
import { clipPieces, findEquals, scanWord, scanWords, variableName } from './words';
import type { Piece, Word, WordItem } from './words';
import { scanJsonArray } from './json-array';
import { scanHeredocMarker } from './heredoc';
import type { HeredocMarker } from './heredoc';
import { lexShell } from './shell';

export interface InstructionLex {
  lexemes: Lexeme[];
  heredocs: HeredocMarker[];
  form: 'exec' | 'shell' | null;
}

const NOT_NESTABLE: ReadonlySet<Instruction> = new Set<Instruction>([
  'ONBUILD',
  'FROM',
  'MAINTAINER',
]);

function isLetter(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z'));
}

/**
 * Matches an instruction keyword at `pos`: case-insensitive, as a whole word
 * followed by whitespace, the escape character or the end (TOK-13).
 */
export function matchKeyword(
  s: string,
  pos: number,
  end: number,
  escape: string,
): { instruction: Instruction; end: number } | null {
  let i = pos;
  while (i < end && isLetter(s[i])) i++;
  if (i === pos) return null;
  const word = s.slice(pos, i).toUpperCase();
  if (!isInstruction(word)) return null;
  if (i < end && !isSpace(s[i]) && s[i] !== escape) return null;
  return { instruction: word, end: i };
}

class Lexer {
  readonly s: string;
  readonly end: number;
  readonly escape: Escape;
  readonly lexemes: Lexeme[] = [];
  readonly heredocs: HeredocMarker[] = [];

  constructor(s: string, end: number, escape: Escape) {
    this.s = s;
    this.end = end;
    this.escape = escape;
  }

  push(start: number, end: number, type: TokenType, ref: ExplanationRef | null): void {
    if (end > start) this.lexemes.push({ start, end, type, ref });
  }

  /** Emits leading whitespace at `pos`; returns the position after it. */
  space(pos: number): number {
    const start = pos;
    while (pos < this.end && isSpace(this.s[pos])) pos++;
    this.push(start, pos, 'whitespace', null);
    return pos;
  }

  text(start: number, end: number): string {
    return this.s.slice(start, end);
  }

  /** Emits a word's pieces with `ref`; variable pieces get their own ref. */
  pieces(pieces: Piece[], ref: ExplanationRef | null, instruction: Instruction): void {
    for (const piece of pieces) {
      if (piece.type === 'variable') {
        const text = this.text(piece.start, piece.end);
        this.push(piece.start, piece.end, 'variable', {
          kind: 'variable',
          name: variableName(text),
          text,
          instruction,
          expandedBy: 'docker',
        });
      } else {
        this.push(piece.start, piece.end, piece.type, ref);
      }
    }
  }

  words(pos: number, splitVars: boolean): WordItem[] {
    return scanWords(this.s, pos, this.end, this.escape, splitVars);
  }

  argument(word: Word, instruction: Instruction, role: ArgumentRole, text?: string): void {
    this.pieces(
      word.pieces,
      { kind: 'argument', instruction, role, text: text ?? this.text(word.start, word.end) },
      instruction,
    );
  }

  /** Emits words with a role chosen per word index; whitespace has no ref. */
  emitWords(
    items: WordItem[],
    instruction: Instruction,
    roleFor: (index: number, word: Word) => ArgumentRole,
  ): void {
    let index = 0;
    for (const item of items) {
      if (item.kind === 'space') {
        this.push(item.start, item.end, 'whitespace', null);
      } else {
        this.argument(item, instruction, roleFor(index, item));
        index++;
      }
    }
  }

  /** Lexes `--name[=value]` flags in flag position (TOK-24, TOK-25). */
  flags(pos: number, instruction: Instruction): number {
    const { s, end } = this;
    for (;;) {
      let q = pos;
      while (q < end && isSpace(s[q])) q++;
      if (!(s[q] === '-' && s[q + 1] === '-' && isLetter(s[q + 2]) && q + 2 < end)) return pos;
      this.push(pos, q, 'whitespace', null);
      let n = q + 2;
      while (n < end && !isSpace(s[n]) && s[n] !== '=') n++;
      const ref: ExplanationRef = { kind: 'flag', instruction, flag: s.slice(q, n) };
      this.push(q, n, 'flag', ref);
      if (s[n] === '=' && n < end) {
        this.push(n, n + 1, 'punctuation', ref);
        const value = scanWord(s, n + 1, end, this.escape, false);
        for (const piece of value.pieces) this.push(piece.start, piece.end, piece.type, ref);
        pos = value.end;
      } else {
        pos = n;
      }
    }
  }

  /** Tries exec form; emits it and returns true if the rest is a JSON array. */
  json(
    pos: number,
    instruction: Instruction,
    elementRef: (index: number, values: string[]) => ExplanationRef,
  ): boolean {
    const array = scanJsonArray(this.s, pos, this.end);
    if (!array) return false;
    for (const part of array.parts) {
      if (part.kind === 'space') this.push(part.start, part.end, 'whitespace', null);
      else if (part.kind === 'punctuation') {
        this.push(part.start, part.end, 'punctuation', { kind: 'json-array', instruction });
      } else this.push(part.start, part.end, 'string', elementRef(part.index, array.values));
    }
    return true;
  }

  /** Exec form or shell form, for RUN/CMD/ENTRYPOINT/HEALTHCHECK CMD. */
  command(pos: number, instruction: Instruction, heredocs: boolean): 'exec' | 'shell' {
    const isExec = this.json(pos, instruction, (index, values) => ({
      kind: 'exec-form',
      instruction,
      role: index === 0 ? 'executable' : 'argument',
      text: values[index],
      words: values,
      wordIndex: index,
    }));
    if (isExec) return 'exec';
    const found: HeredocMarker[] = [];
    const lexemes = lexShell(
      this.s,
      pos,
      this.end,
      instruction,
      heredocs ? found : null,
      this.escape,
    );
    // `RUN <<EOF` alone runs the body as a script; otherwise bodies are input files.
    if (
      found.length === 1 &&
      lexemes.every((l) => l.type === 'whitespace' || l.ref?.kind === 'heredoc')
    ) {
      found[0].script = true;
    }
    this.lexemes.push(...lexemes);
    this.heredocs.push(...found);
    return 'shell';
  }

  /** `key=value` pairs for ENV, LABEL and ARG (TOK-31). */
  pairs(items: WordItem[], instruction: Instruction, varsInKey: boolean): void {
    for (const item of items) {
      if (item.kind === 'space') {
        this.push(item.start, item.end, 'whitespace', null);
        continue;
      }
      const eq = findEquals(this.s, item);
      if (eq < 0) {
        this.argument(item, instruction, instruction === 'ARG' ? 'key' : 'word');
        continue;
      }
      const keyRef: ExplanationRef = {
        kind: 'argument',
        instruction,
        role: 'key',
        text: this.text(item.start, eq),
      };
      const keyPieces = clipPieces(item, item.start, eq);
      if (varsInKey) this.pieces(keyPieces, keyRef, instruction);
      else for (const p of keyPieces) this.push(p.start, p.end, p.type, keyRef);
      this.push(eq, eq + 1, 'punctuation', null);
      this.pieces(
        clipPieces(item, eq + 1, item.end),
        { kind: 'argument', instruction, role: 'value', text: this.text(eq + 1, item.end) },
        instruction,
      );
    }
  }

  /** Emits the arguments of `instruction` starting at `pos` (§5.3). */
  args(pos: number, instruction: Instruction): 'exec' | 'shell' | null {
    switch (instruction) {
      case 'RUN':
      case 'CMD':
      case 'ENTRYPOINT':
        return this.command(pos, instruction, instruction === 'RUN');

      case 'FROM': {
        let index = 0;
        let stage = false;
        for (const item of this.words(pos, true)) {
          if (item.kind === 'space') {
            this.push(item.start, item.end, 'whitespace', null);
            continue;
          }
          if (index === 1 && this.text(item.start, item.end).toUpperCase() === 'AS') {
            this.push(item.start, item.end, 'keyword', {
              kind: 'subkeyword',
              instruction,
              word: 'AS',
            });
            stage = true;
          } else {
            const role = index === 0 ? 'image' : index === 2 && stage ? 'stage-name' : 'word';
            this.argument(item, instruction, role);
          }
          index++;
        }
        return null;
      }

      case 'HEALTHCHECK': {
        pos = this.space(pos);
        const word = scanWord(this.s, pos, this.end, this.escape, false);
        const sub = this.text(word.start, word.end).toUpperCase();
        if (sub === 'CMD' || sub === 'NONE') {
          this.push(word.start, word.end, 'keyword', {
            kind: 'subkeyword',
            instruction,
            word: sub,
          });
          if (sub === 'CMD') return this.command(word.end, instruction, false);
          pos = word.end;
        }
        this.emitWords(this.words(pos, false), instruction, () => 'word');
        return null;
      }

      case 'SHELL': {
        const isExec = this.json(pos, instruction, (index, values) => ({
          kind: 'exec-form',
          instruction,
          role: index === 0 ? 'executable' : 'argument',
          text: values[index],
          words: values,
          wordIndex: index,
        }));
        if (!isExec) this.emitWords(this.words(pos, false), instruction, () => 'word');
        return null;
      }

      case 'ONBUILD': {
        let q = pos;
        while (q < this.end && isSpace(this.s[q])) q++;
        const nested = matchKeyword(this.s, q, this.end, this.escape);
        if (nested && !NOT_NESTABLE.has(nested.instruction)) {
          this.push(pos, q, 'whitespace', null);
          this.instruction(q, nested.instruction, nested.end);
        } else {
          this.emitWords(this.words(pos, false), instruction, () => 'word');
        }
        return null;
      }

      case 'COPY':
      case 'ADD': {
        const isExec = this.json(pos, instruction, (index, values) => ({
          kind: 'argument',
          instruction,
          role: index === values.length - 1 && values.length > 1 ? 'destination' : 'source',
          text: values[index],
        }));
        if (isExec) return null;
        const items = this.words(pos, true);
        const words = items.filter((item) => item.kind === 'word');
        const markers = words.map((word) => {
          const marker = scanHeredocMarker(this.s, word.start, word.end);
          return marker && marker.end === word.end ? marker : null;
        });
        let destination = -1;
        if (words.length > 1) {
          for (let i = words.length - 1; i >= 0; i--) {
            if (!markers[i]) {
              destination = i;
              break;
            }
          }
        }
        let index = 0;
        for (const item of items) {
          if (item.kind === 'space') {
            this.push(item.start, item.end, 'whitespace', null);
            continue;
          }
          const marker = markers[index];
          if (marker) {
            this.push(item.start, item.end, 'operator', {
              kind: 'heredoc',
              instruction,
              delimiter: marker.delimiter,
            });
            this.heredocs.push({
              instruction,
              delimiter: marker.delimiter,
              stripTabs: marker.stripTabs,
              script: false,
            });
          } else {
            this.argument(item, instruction, index === destination ? 'destination' : 'source');
          }
          index++;
        }
        return null;
      }

      case 'ENV': {
        const items = this.words(pos, true);
        const first = items.find((item) => item.kind === 'word');
        if (first && findEquals(this.s, first) < 0) {
          // Legacy `ENV key value`: everything after the key is one value.
          const rest = items.filter((item) => item.start >= first.end);
          const valueWords = rest.filter((item) => item.kind === 'word');
          const last = valueWords[valueWords.length - 1];
          const valueText = last ? this.text(valueWords[0].start, last.end) : '';
          for (const item of items) {
            if (item.kind === 'space') this.push(item.start, item.end, 'whitespace', null);
            else if (item === first) this.argument(item, instruction, 'key');
            else this.argument(item, instruction, 'value', valueText);
          }
          return null;
        }
        this.pairs(items, instruction, true);
        return null;
      }

      case 'LABEL':
        this.pairs(this.words(pos, true), instruction, true);
        return null;

      case 'ARG':
        // Variables are expanded only in defaults, not in names.
        this.pairs(this.words(pos, true), instruction, false);
        return null;

      case 'WORKDIR':
        this.emitWords(this.words(pos, true), instruction, () => 'path');
        return null;

      case 'VOLUME': {
        const isExec = this.json(pos, instruction, (index, values) => ({
          kind: 'argument',
          instruction,
          role: 'path',
          text: values[index],
        }));
        if (!isExec) this.emitWords(this.words(pos, true), instruction, () => 'path');
        return null;
      }

      case 'USER':
        this.emitWords(this.words(pos, true), instruction, (i) => (i === 0 ? 'user' : 'word'));
        return null;

      case 'EXPOSE':
        this.emitWords(this.words(pos, true), instruction, () => 'port');
        return null;

      case 'STOPSIGNAL':
        this.emitWords(this.words(pos, true), instruction, (i) => (i === 0 ? 'signal' : 'word'));
        return null;

      case 'MAINTAINER': {
        const items = this.words(pos, false);
        const words = items.filter((item) => item.kind === 'word');
        const name = words.length ? this.text(words[0].start, words[words.length - 1].end) : '';
        for (const item of items) {
          if (item.kind === 'space') this.push(item.start, item.end, 'whitespace', null);
          else this.argument(item, instruction, 'name', name);
        }
        return null;
      }
    }
  }

  /** Lexes keyword, flags and arguments of an instruction starting at `pos`. */
  instruction(pos: number, instruction: Instruction, keywordEnd: number): 'exec' | 'shell' | null {
    this.push(pos, keywordEnd, 'keyword', { kind: 'instruction', instruction });
    pos = keywordEnd;
    if (instruction !== 'ONBUILD') pos = this.flags(pos, instruction);
    return this.args(pos, instruction);
  }
}

/**
 * Lexes the logical text of one instruction (§4.4). `keywordEnd` is where the
 * keyword found by line classification ends.
 */
export function lexInstruction(
  s: string,
  instruction: Instruction,
  keywordEnd: number,
  escape: Escape,
): InstructionLex {
  const lexer = new Lexer(s, s.length, escape);
  let pos = 0;
  while (pos < s.length && isBlank(s[pos])) pos++;
  lexer.push(0, pos, 'whitespace', null);
  const form = lexer.instruction(pos, instruction, keywordEnd);
  return { lexemes: lexer.lexemes, heredocs: lexer.heredocs, form };
}
