// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DOCKERFILE_MAX_LINES, SYSTEM_PROMPT, buildUserMessage } from '../data/rewrite/prompt';
import { parseReply } from '../data/rewrite/validate';
import { diffLines } from '../data/rewrite/diff';
import { truncate } from '../data/text';
import { markdownReply as reply } from './fake-language-model';

const FILE = 'FROM alpine:3.20\nRUN apk add --no-cache curl\nCMD ["curl", "--version"]';
const reason = (text: string) => {
  const parsed = parseReply(text);
  return parsed.ok ? null : parsed.reason;
};

describe('prompt (AIR-23, AIR-24)', () => {
  it('wraps the request and Dockerfile in delimiters, trimmed', () => {
    expect(buildUserMessage('  use alpine \n', '\nFROM node\n\n')).toBe(
      '<request>\nuse alpine\n</request>\n\n<dockerfile>\nFROM node\n</dockerfile>',
    );
  });

  it('keeps the reviewed system prompt', () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });
});

describe('parseReply (AIR-22, AIR-25, AIR-26)', () => {
  it('accepts a valid reply, keeping exec-form quotes intact', () => {
    expect(parseReply(reply(FILE, ['Uses curl.']))).toEqual({
      ok: true,
      value: { dockerfile: FILE, changes: ['Uses curl.'] },
    });
  });

  it('ignores text around the block and accepts a fence without a language', () => {
    const parsed = parseReply(`Here you go:\n\n\`\`\`\n\n${FILE}\n\n\`\`\`\nDone.`);
    expect(parsed).toEqual({ ok: true, value: { dockerfile: FILE, changes: [] } });
  });

  it('reads -, * and numbered bullets after the block, trimmed, cut at 200 and at most 8', () => {
    const text = `${reply(FILE)}\n* star\n2. numbered\n-   \n- ${'x'.repeat(250)}\nplain text`;
    const parsed = parseReply(text);
    expect(parsed.ok && parsed.value.changes).toEqual(['star', 'numbered', `${'x'.repeat(199)}…`]);
    const many = parseReply(
      reply(
        FILE,
        Array.from({ length: 10 }, (_, i) => `c${i}`),
      ),
    );
    expect(many.ok && many.value.changes).toHaveLength(8);
  });

  it('allows RUN commands that start with a shell test bracket', () => {
    expect(reason(reply(`${FILE}\nRUN [ -f /etc/os-release ] || exit 1`))).toBeNull();
  });

  it.each([
    ['prose without a code block', 'Here is your Dockerfile: FROM node', 'no code block'],
    [
      'a block cut off before its closing fence',
      '```dockerfile\nFROM node\nCMD ["no',
      'unclosed code block',
    ],
    ['an empty Dockerfile', reply('  '), 'empty'],
    ['prose inside the Dockerfile', reply(`Sure! Here it is:\n${FILE}`), 'unknown line'],
    ['no FROM', reply('RUN echo hi'), 'no FROM'],
    ['a CMD cut off after its bracket', reply('FROM node\nCMD ['), 'broken exec form'],
    [
      'an ENTRYPOINT cut off mid-array',
      reply('FROM node\nENTRYPOINT ["node", "ser'),
      'broken exec form',
    ],
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
