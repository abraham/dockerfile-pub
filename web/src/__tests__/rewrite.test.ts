// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DOCKERFILE_MAX_LINES,
  RESPONSE_SCHEMA,
  SYSTEM_PROMPT,
  buildUserMessage,
} from '../data/rewrite/prompt';
import { parseReply } from '../data/rewrite/validate';
import { diffLines } from '../data/rewrite/diff';
import { truncate } from '../data/text';

const FILE = 'FROM alpine:3.20\nRUN apk add --no-cache curl\nCMD ["curl", "--version"]';
const reply = (dockerfile: unknown, changes: unknown = ['A change.']) =>
  JSON.stringify({ dockerfile, changes });
const reason = (text: string) => {
  const parsed = parseReply(text);
  return parsed.ok ? null : parsed.reason;
};

describe('prompt (AIR-22 to AIR-24)', () => {
  it('wraps the request and Dockerfile in delimiters, trimmed', () => {
    expect(buildUserMessage('  use alpine \n', '\nFROM node\n\n')).toBe(
      '<request>\nuse alpine\n</request>\n\n<dockerfile>\nFROM node\n</dockerfile>',
    );
  });

  it('constrains replies to { dockerfile, changes }', () => {
    expect(RESPONSE_SCHEMA).toEqual({
      type: 'object',
      properties: {
        dockerfile: { type: 'string' },
        changes: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      },
      required: ['dockerfile', 'changes'],
      additionalProperties: false,
    });
  });

  it('keeps the reviewed system prompt', () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });
});

describe('parseReply (AIR-25, AIR-26)', () => {
  it('accepts a valid reply', () => {
    expect(parseReply(reply(FILE, ['Uses curl.']))).toEqual({
      ok: true,
      value: { dockerfile: FILE, changes: ['Uses curl.'] },
    });
  });

  it('trims the Dockerfile and removes one surrounding code fence', () => {
    const fenced = parseReply(reply(`\n\`\`\`dockerfile\n${FILE}\n\`\`\`\n`));
    expect(fenced.ok && fenced.value.dockerfile).toBe(FILE);
  });

  it('trims changes, drops empty ones and cuts long ones at 200 characters', () => {
    const parsed = parseReply(reply(FILE, ['  a  ', '', 'x'.repeat(250)]));
    expect(parsed.ok && parsed.value.changes).toEqual(['a', `${'x'.repeat(199)}…`]);
  });

  it.each([
    ['prose instead of JSON', 'Here is your Dockerfile: FROM node', 'not JSON'],
    ['a JSON array', '[]', 'not an object'],
    ['a missing field', JSON.stringify({ dockerfile: FILE }), 'schema mismatch'],
    [
      'an extra field',
      JSON.stringify({ dockerfile: FILE, changes: [], note: 'x' }),
      'schema mismatch',
    ],
    ['non-string changes', reply(FILE, [1]), 'schema mismatch'],
    ['more than 8 changes', reply(FILE, Array<string>(9).fill('c')), 'schema mismatch'],
    ['a non-string Dockerfile', reply(42), 'schema mismatch'],
    ['an empty Dockerfile', reply('  '), 'empty'],
    ['prose inside the Dockerfile', reply(`Sure! Here it is:\n${FILE}`), 'unknown line'],
    ['no FROM', reply('RUN echo hi'), 'no FROM'],
    ['too many lines', reply(`${FILE}\n${'# x\n'.repeat(DOCKERFILE_MAX_LINES)}`), 'too many lines'],
    ['more than 16 KB', reply(`${FILE}\n# ${'é'.repeat(9000)}`), 'too large'],
  ])('rejects %s', (_, text, expected) => {
    expect(reason(text)).toBe(expected);
  });
});

describe('diffLines', () => {
  it('marks unchanged, removed and added lines', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc\nd')).toEqual([
      { op: ' ', text: 'a' },
      { op: '-', text: 'b' },
      { op: '+', text: 'x' },
      { op: ' ', text: 'c' },
      { op: '+', text: 'd' },
    ]);
  });

  it('returns only unchanged lines for identical input', () => {
    expect(diffLines(FILE, FILE).every((line) => line.op === ' ')).toBe(true);
  });

  it('handles additions to and removals from an empty side', () => {
    expect(diffLines('a', 'a\nb')).toEqual([
      { op: ' ', text: 'a' },
      { op: '+', text: 'b' },
    ]);
    expect(diffLines('a\nb', 'b')).toEqual([
      { op: '-', text: 'a' },
      { op: ' ', text: 'b' },
    ]);
  });
});

describe('truncate', () => {
  it('collapses whitespace and cuts with an ellipsis', () => {
    expect(truncate(' a\n b ', 80)).toBe('a b');
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});
