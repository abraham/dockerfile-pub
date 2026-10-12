import type { Block, Inline, RichText } from './schema';

/** Parses backtick inline code in one line or paragraph of text (EXP-18, EXP-30). */
export function parseInline(source: string): Inline[] {
  const parts = source.split('`');
  if (parts.length % 2 === 0) throw new Error(`Unbalanced backtick in: ${source}`);
  const result: Inline[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      if (part === '') throw new Error(`Empty code span in: ${source}`);
      result.push({ code: part });
    } else if (part !== '') {
      result.push(part);
    }
  });
  return result;
}

/**
 * Parses authoring markup: paragraphs separated by blank lines, list blocks
 * whose every line starts with `- `, and inline code (§3.1). Throws on
 * anything ambiguous (EXP-30).
 */
export function parseRichText(source: string): RichText {
  if (/^\s*\n/.test(source) || /\n\s*$/.test(source)) {
    throw new Error('Leading or trailing blank lines');
  }
  return source.split(/\n[ \t]*\n+/).map((block): Block => {
    const lines = block.split('\n');
    const listLines = lines.filter((line) => line.startsWith('- '));
    if (listLines.length === lines.length) {
      return { type: 'list', items: lines.map((line) => parseInline(line.slice(2))) };
    }
    if (listLines.length > 0) throw new Error(`Block mixes list and other lines: ${block}`);
    return { type: 'paragraph', content: parseInline(lines.join(' ')) };
  });
}

/** Joins inline content into plain text; code spans contribute their text (EXP-29). */
export function flatten(inlines: readonly Inline[]): string {
  return inlines.map((part) => (typeof part === 'string' ? part : part.code)).join('');
}

/** Inline code (EXP-31). */
export function code(value: string): Inline {
  return { code: value };
}

/** A paragraph from plain strings and inline parts; strings are never parsed (EXP-31). */
export function p(...content: Inline[]): Block {
  return { type: 'paragraph', content: content.filter((part) => part !== '') };
}

export function list(...items: Inline[][]): Block {
  return { type: 'list', items };
}

/** Cuts interpolated Dockerfile text to `max` characters plus `…` (CMDX-21). */
export function clip(value: string, max = 32): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
