// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { tokenize, INSTRUCTIONS } from '../data/tokenizer';
import type { ExplanationRef, Instruction } from '../data/tokenizer';
import { EXAMPLES } from '../data/examples';
import { getExplanation, flatten } from '../data/explanations';
import type { Block, Explanation } from '../data/explanations';
import { REFERENCE_URL, register, registered, validate } from '../data/content/registry';
import { code, list, p, parseInline, parseRichText } from '../data/content/rich-text';
import { parseImage } from '../data/content/arguments';

const FIXTURES = import.meta.glob<string>('./fixtures/*.Dockerfile', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const CONTENT_SOURCES = import.meta.glob<string>(
  ['../data/content/*.ts', '../data/explanations.ts'],
  { query: '?raw', import: 'default', eager: true },
);

function allRefs(text: string): ExplanationRef[] {
  return tokenize(text).flatMap((line) => line.tokens.flatMap((t) => (t.ref ? [t.ref] : [])));
}

function explain(ref: ExplanationRef): Explanation {
  const explanation = getExplanation(ref);
  expect(explanation).not.toBeNull();
  return explanation as Explanation;
}

function arg(instruction: Instruction, role: string, text: string): Explanation {
  return explain({ kind: 'argument', instruction, role, text } as ExplanationRef);
}

const short = (e: Explanation) => flatten(e.short);

describe('rich text (§3)', () => {
  it('parses paragraphs, lists and inline code', () => {
    expect(parseRichText('One\nline.\n\n- `a` item\n- b\n\nLast * _ < &.')).toEqual([
      { type: 'paragraph', content: ['One line.'] },
      { type: 'list', items: [[{ code: 'a' }, ' item'], ['b']] },
      { type: 'paragraph', content: ['Last * _ < &.'] },
    ]);
  });

  it.each([
    ['mixed block', '- a\nb'],
    ['unbalanced backtick', 'a `b'],
    ['empty code span', 'a `` b'],
    ['leading blank line', '\nA'],
    ['trailing blank line', 'A\n'],
  ])('throws on a %s (EXP-30)', (_, source) => {
    expect(() => parseRichText(source)).toThrow();
  });

  it('flattens code spans without backticks (EXP-29)', () => {
    expect(flatten(parseInline('Use `COPY` here.'))).toBe('Use COPY here.');
  });

  it('never parses builder values (EXP-31)', () => {
    const block = p('- ', code('`x`'), ' <img src=x onerror=alert(1)>\n- y');
    expect(block).toEqual({
      type: 'paragraph',
      content: ['- ', { code: '`x`' }, ' <img src=x onerror=alert(1)>\n- y'],
    });
    expect(list(['a'])).toEqual({ type: 'list', items: [['a']] });
  });
});

describe('registry (§5)', () => {
  const keys = new Set(registered().keys());

  it('covers every instruction, sub-keyword and directive (EXP-19, EXP-33, EXP-34)', () => {
    for (const instruction of INSTRUCTIONS) expect(keys).toContain(`instruction:${instruction}`);
    for (const key of [
      'subkeyword:FROM:AS',
      'subkeyword:HEALTHCHECK:CMD',
      'subkeyword:HEALTHCHECK:NONE',
      'directive:syntax',
      'directive:escape',
      'directive:check',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('covers every flag in the reference (EXP-35)', () => {
    const flags: [Instruction, string[]][] = [
      ['FROM', ['--platform']],
      ['RUN', ['--mount', '--network', '--security']],
      ['COPY', ['--from', '--chown', '--chmod', '--link', '--parents', '--exclude']],
      ['ADD', ['--chown', '--chmod', '--link', '--keep-git-dir', '--checksum', '--exclude']],
      [
        'HEALTHCHECK',
        ['--interval', '--timeout', '--start-period', '--start-interval', '--retries'],
      ],
    ];
    for (const [instruction, names] of flags) {
      for (const flag of names) expect(keys).toContain(`flag:${instruction}:${flag}`);
    }
    expect([...keys].filter((k) => k.startsWith('flag:'))).toHaveLength(21);
  });

  it('registers flags per instruction (EXP-9)', () => {
    const copy = explain({ kind: 'flag', instruction: 'COPY', flag: '--chown' });
    const add = explain({ kind: 'flag', instruction: 'ADD', flag: '--chown' });
    expect(copy.category).toBe('COPY flag');
    expect(add.category).toBe('ADD flag');
    const wrong = explain({ kind: 'flag', instruction: 'RUN', flag: '--chown' });
    expect(wrong.generic).toBe(true);
  });

  it('resolves related refs to non-generic entries (EXP-28)', () => {
    for (const instruction of INSTRUCTIONS) {
      for (const ref of explain({ kind: 'instruction', instruction }).related ?? []) {
        expect(explain(ref).generic).toBeUndefined();
      }
    }
  });

  it('freezes entries (EXP-14)', () => {
    expect(Object.isFrozen(explain({ kind: 'instruction', instruction: 'RUN' }))).toBe(true);
  });

  it('marks MAINTAINER as deprecated (EXP-24)', () => {
    const maintainer = explain({ kind: 'instruction', instruction: 'MAINTAINER' });
    expect(maintainer.deprecated?.since).toBe('Docker 1.13');
  });

  it('uses US spelling (EXP-26)', () => {
    const text = Object.values(CONTENT_SOURCES).join('');
    expect(text).not.toMatch(/\b(behaviour|initialis|parameteris|colour|licence)\b/i);
  });
});

describe('registry validation (EXP-1 to EXP-8, EXP-23, EXP-30)', () => {
  const link = { label: 'Example', url: 'https://example.com/' };
  const valid: Explanation = {
    category: 'Test',
    title: 'T',
    short: ['Fine.'],
    details: [p('Body.')],
    links: [link],
  };

  it('accepts a valid explanation', () => {
    expect(() => validate(valid, 'test')).not.toThrow();
  });

  it.each<[string, Partial<Explanation>, RegExp]>([
    ['a missing category', { category: '' }, /missing category/],
    ['an empty title', { title: '' }, /title/],
    ['a long title', { title: 'x'.repeat(62) }, /title/],
    ['a short without a period', { short: ['No period'] }, /end with a period/],
    ['a long short', { short: [`${'x'.repeat(120)}.`] }, /longer than 120/],
    ['no details', { details: [] }, /1-4 blocks/],
    ['five details', { details: new Array<Block>(5).fill(p('x')) }, /1-4 blocks/],
    ['no links', { links: [] }, /at least one link/],
    ['an http link', { links: [{ label: 'x', url: 'http://example.com/' }] }, /not https/],
    ['a duplicate link', { links: [link, link] }, /duplicate link/],
    ['an unlabelled link', { links: [{ label: '', url: 'https://example.com/' }] }, /label/],
    [
      'five related refs',
      { related: new Array<ExplanationRef>(5).fill({ kind: 'instruction', instruction: 'RUN' }) },
      /at most 4 related/,
    ],
  ])('rejects %s', (_, changes, error) => {
    expect(() => validate({ ...valid, ...changes }, 'test')).toThrow(error);
  });

  const source = {
    category: 'Test',
    title: 'T',
    short: 'Fine.',
    details: 'Body.',
    syntax: 'T',
    links: [{ label: 'Reference', url: `${REFERENCE_URL}#run` }],
  };

  it('rejects a duplicate key (EXP-8)', () => {
    expect(() => register({ ...source, ref: { kind: 'instruction', instruction: 'RUN' } })).toThrow(
      /Duplicate explanation: instruction:RUN/,
    );
  });

  it('requires syntax for flags (EXP-3)', () => {
    const ref = { kind: 'flag', instruction: 'RUN', flag: '--test-no-syntax' } as const;
    expect(() => register({ ...source, ref, syntax: undefined })).toThrow(/syntax is required/);
    expect(registered().has('flag:RUN:--test-no-syntax')).toBe(false);
  });

  it('requires the Dockerfile reference as the first link (EXP-23)', () => {
    const ref = { kind: 'flag', instruction: 'RUN', flag: '--test-bad-link' } as const;
    expect(() => register({ ...source, ref, links: [link] })).toThrow(/first link/);
  });

  it('parses markup strictly when registering (EXP-30, EXP-42)', () => {
    const ref = { kind: 'flag', instruction: 'RUN', flag: '--test-bad-markup' } as const;
    expect(() => register({ ...source, ref, short: 'Bad `code.' })).toThrow(/Unbalanced/);
    expect(() => register({ ...source, ref, details: '- a\nb' })).toThrow(/mixes list/);
  });
});

describe('lookup (§4)', () => {
  it('returns null only for a null ref (EXP-10)', () => {
    expect(getExplanation(null)).toBeNull();
  });

  it('has no generic static results in the examples (EXP-20)', () => {
    for (const example of Object.values(EXAMPLES)) {
      for (const ref of allRefs(example.content)) {
        if (['instruction', 'subkeyword', 'flag', 'directive'].includes(ref.kind)) {
          expect(explain(ref).generic, JSON.stringify(ref)).toBeUndefined();
        }
      }
    }
  });

  it('is total and meets the content contract for every ref (EXP-12)', () => {
    const inputs = [
      ...Object.values(EXAMPLES).map((e) => e.content),
      ...Object.values(FIXTURES),
      'FROM ' + 'x'.repeat(300) + ':' + 'y'.repeat(300) + ' AS ' + 'z'.repeat(200),
      'COPY --bogus=1 "a b" `x` /dest/\nUSER 0:0\nEXPOSE 53/udp 8000-8010\nSTOPSIGNAL 9\nLABEL x=\n',
      'RUN ' +
        Array.from(
          { length: 40 },
          (_, i) => `cmd${i} -${'abc'.repeat(i)} --opt${i}=${'v'.repeat(i * 3)}`,
        ).join(' && '),
      'ENV A=${B:-c} D=${E:+f} G=${H?} I=${J#k}\nRUN echo ${#X} ${Y%%z} "$@" $? $1 ${TARGETARCH} $http_proxy',
    ];
    for (const input of inputs) {
      for (const ref of allRefs(input)) {
        const explanation = explain(ref);
        expect(() => validate(explanation, JSON.stringify(ref))).not.toThrow();
        expect(explanation.links[0].url).toMatch(/^https:\/\/docs\.docker\.com\//);
      }
    }
  });
});

describe('argument generators (§6.1)', () => {
  it('parses image references (EXP-37)', () => {
    expect(parseImage('node:26-alpine')).toEqual({
      registry: null,
      repository: 'node',
      tag: '26-alpine',
      digest: null,
    });
    expect(parseImage('ghcr.io/org/app:1.2@sha256:abc')).toEqual({
      registry: 'ghcr.io',
      repository: 'org/app',
      tag: '1.2',
      digest: 'sha256:abc',
    });
    expect(parseImage('localhost:5000/app')).toMatchObject({
      registry: 'localhost:5000',
      repository: 'app',
      tag: null,
    });
    expect(parseImage('node:${V:-26}-alpine')).toMatchObject({
      repository: 'node',
      tag: '${V:-26}-alpine',
    });
  });

  it('explains images, scratch and stage references', () => {
    expect(short(arg('FROM', 'image', 'node:26-alpine'))).toBe(
      'The base image node, tag 26-alpine.',
    );
    expect(short(arg('FROM', 'image', 'scratch'))).toBe(
      'scratch: an empty base image with no files.',
    );
    expect(short(arg('FROM', 'image', 'base'))).toBe(
      'The base for this stage: base, an image or an earlier stage.',
    );
    const stage = arg('FROM', 'stage-name', 'build');
    expect(short(stage)).toBe('Names this build stage build.');
    expect(stage.related).toContainEqual({ kind: 'flag', instruction: 'COPY', flag: '--from' });
  });

  it('explains sources and destinations', () => {
    expect(short(arg('ADD', 'source', 'https://example.com/a.tgz'))).toBe(
      'A URL that ADD downloads while building.',
    );
    expect(short(arg('ADD', 'source', 'app.tar.gz'))).toBe(
      'A local archive that ADD extracts into the destination.',
    );
    expect(short(arg('COPY', 'source', 'package*.json'))).toMatch(/^A pattern matching/);
    expect(short(arg('COPY', 'destination', './'))).toBe('The destination directory ./.');
  });

  it('explains users, ports, keys and signals', () => {
    expect(
      flatten(
        arg('USER', 'user', '0').details.flatMap((b) => (b.type === 'paragraph' ? b.content : [])),
      ),
    ).toMatch(/root user/);
    expect(short(arg('EXPOSE', 'port', '53/udp'))).toBe('Port 53 over UDP.');
    expect(short(arg('EXPOSE', 'port', '3000'))).toBe('Port 3000 over TCP (the default).');
    expect(short(arg('LABEL', 'key', 'org.opencontainers.image.source'))).toBe(
      'org.opencontainers.image.source: the standard OCI label for where to find the source code.',
    );
    expect(short(arg('STOPSIGNAL', 'signal', 'SIGTERM'))).toMatch(/default/);
    expect(arg('MAINTAINER', 'name', 'Jane').deprecated).toBeDefined();
    expect(arg('USER', 'word', 'x').generic).toBe(true);
  });
});

describe('variable generator (§6.2)', () => {
  const variable = (text: string, name: string, expandedBy: 'docker' | 'shell') =>
    explain({ kind: 'variable', name, text, instruction: 'RUN', expandedBy });

  it('frames Docker and shell expansion differently (EXP-38)', () => {
    expect(short(variable('$APP', 'APP', 'docker'))).toBe(
      '$APP is replaced by the value of APP while building.',
    );
    expect(short(variable('$APP', 'APP', 'shell'))).toBe(
      '$APP is replaced by the value of APP when the command runs.',
    );
  });

  it.each([
    ['${A:-x}', 'A', /Uses x if A is unset or empty/],
    ['${A-x}', 'A', /Uses x if A is unset\./],
    ['${A:+x}', 'A', /Uses x if A is set and not empty/],
    ['${A+x}', 'A', /Uses x if A is set,/],
    ['${A:?}', 'A', /Stops with an error/],
    ['${A##*/}', 'A', /longest prefix/],
    ['${A%.*}', 'A', /shortest suffix/],
    ['${#A}', 'A', /length of A/],
  ])('explains the %s modifier', (text, name, pattern) => {
    const details = variable(text, name, 'shell').details;
    expect(
      details.map((b) => (b.type === 'paragraph' ? flatten(b.content) : '')).join(' '),
    ).toMatch(pattern);
  });

  it('knows platform, proxy, environment and special variables (EXP-39)', () => {
    expect(variable('$TARGETARCH', 'TARGETARCH', 'docker').category).toBe('Build argument');
    expect(variable('$http_proxy', 'http_proxy', 'shell').category).toBe('Build argument');
    expect(variable('$PATH', 'PATH', 'shell').category).toBe('Environment variable');
    expect(short(variable('$?', '?', 'shell'))).toBe('$?: the exit status of the last command.');
    expect(short(variable('$3', '3', 'shell'))).toBe('$3: positional parameter 3.');
  });
});

describe('budget (EXP-41)', () => {
  it('keeps the serialized static content at or below 8 KB gzipped', () => {
    const size = gzipSync(JSON.stringify([...registered()])).length;
    expect(size).toBeLessThanOrEqual(8 * 1024);
  });
});
