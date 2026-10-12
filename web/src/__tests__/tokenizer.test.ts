// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { tokenize, refKey, INSTRUCTIONS, LINE_TYPE, TOKEN_TYPE } from '../data/tokenizer';
import type { ExplanationRef, Line } from '../data/tokenizer';
import { unquote } from '../data/tokenizer/shell';
import { EXAMPLES } from '../data/examples';

const FIXTURES = import.meta.glob<string>('./fixtures/*.Dockerfile', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Compact ref notation, close to the tokenizer spec's §8. */
function describeRef(ref: ExplanationRef | null): string {
  if (!ref) return '—';
  switch (ref.kind) {
    case 'instruction':
      return `instruction ${ref.instruction}`;
    case 'subkeyword':
      return `subkeyword ${ref.instruction} ${ref.word}`;
    case 'flag':
      return `flag ${ref.instruction} ${ref.flag}`;
    case 'argument':
      return `argument ${ref.instruction} ${ref.role} text=${ref.text}`;
    case 'json-array':
      return `json-array ${ref.instruction}`;
    case 'exec-form':
      return `exec-form ${ref.instruction} ${ref.role} [${ref.wordIndex}] text=${ref.text}`;
    case 'shell': {
      const cmd = ref.command === null ? '' : ` cmd=${ref.command}`;
      const around = ref.role === 'operator' ? ` (${ref.before ?? '∅'} → ${ref.after ?? '∅'})` : '';
      return `shell ${ref.instruction} ${ref.role}${cmd} [${ref.wordIndex}] text=${ref.text}${around}`;
    }
    case 'variable':
      return `variable ${ref.name} (${ref.instruction}, ${ref.expandedBy}) text=${ref.text}`;
    case 'heredoc':
      return `heredoc ${ref.instruction} ${ref.delimiter}`;
    case 'directive':
      return `directive ${ref.directive}`;
    case 'line-continuation':
      return `line-continuation ${ref.escape}`;
  }
}

function render(lines: Line[]): string {
  return lines
    .map((line) => {
      const ctx = line.instruction
        ? ` (${line.instruction.keyword}, start ${line.instruction.startLine}, ${line.instruction.form ?? '-'})`
        : '';
      const header = `line ${line.lineIndex}  ${line.type}${ctx}`;
      const rows = line.tokens.map(
        (t) => `  ${JSON.stringify(t.text)}  ${t.type}  ${describeRef(t.ref)}`,
      );
      return [header, ...rows].join('\n');
    })
    .join('\n');
}

type Row = [text: string, type: string, ref: string];

function rows(line: Line): Row[] {
  return line.tokens.map((t) => [t.text, t.type, describeRef(t.ref)]);
}

function nonSpace(line: Line): Row[] {
  return rows(line).filter(([, type]) => type !== 'whitespace');
}

function checkInvariants(input: string): void {
  const lines = tokenize(input);
  // INV-1 lossless
  expect(lines.map((l) => l.raw + l.eol).join('')).toBe(input);
  const ids = new Set<string>();
  for (const line of lines) {
    expect(line.tokens.map((t) => t.text).join('')).toBe(line.raw);
    // INV-3 non-empty tokens; no tokens iff raw is empty
    expect(line.tokens.length === 0).toBe(line.raw === '');
    let column = 0;
    line.tokens.forEach((t, i) => {
      expect(t.text.length).toBeGreaterThan(0);
      // INV-4 positions
      expect(t.tokenIndex).toBe(i);
      expect(t.lineIndex).toBe(line.lineIndex);
      expect(t.column).toBe(column);
      expect(t.id).toBe(`${line.lineIndex}-${i}`);
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      column += t.text.length;
      // INV-5 line-bounded
      expect(t.text).not.toContain('\n');
    });
    // INV-6 instruction context
    if (line.type === 'instruction' || line.type === 'continuation' || line.type === 'heredoc') {
      expect(line.instruction).not.toBeNull();
    }
    if (line.type === 'directive' || line.type === 'unknown') {
      expect(line.instruction).toBeNull();
    }
    if (line.instruction) {
      expect(line.instruction.startLine).toBeLessThanOrEqual(line.lineIndex);
      expect(lines[line.instruction.startLine].type).toBe('instruction');
    }
    // INV-7 one keyword per instruction line, first non-whitespace token
    if (line.type === 'instruction') {
      const keywords = line.tokens.filter((t) => t.ref?.kind === 'instruction');
      const first = line.tokens.find((t) => t.type !== 'whitespace');
      expect(first?.ref).toEqual({ kind: 'instruction', instruction: line.instruction?.keyword });
      const max = line.instruction?.keyword === 'ONBUILD' ? 2 : 1;
      expect(keywords.length).toBeGreaterThanOrEqual(1);
      expect(keywords.length).toBeLessThanOrEqual(max);
    }
  }
  // INV-8 deterministic
  expect(tokenize(input)).toEqual(lines);
}

/** Small seeded PRNG (mulberry32), so the property tests are reproducible. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = [
  '\\',
  '`',
  '"',
  "'",
  '$',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  ',',
  '<<',
  '<<-',
  '>',
  '&&',
  '|',
  ';',
  '#',
  '=',
  '-',
  '--',
  '\r',
  '\n',
  '\r\n',
  '\t',
  ' ',
  ' ',
  'a',
  'EOF',
  'RUN ',
  'FROM ',
  'COPY ',
  'CMD ',
  'ENV ',
  'ARG ',
  'ONBUILD ',
  'HEALTHCHECK ',
  ' AS ',
  ' CMD ',
  '--x=',
  '# escape=`\n',
  '# syntax=x\n',
  '$(',
  '${A',
];

describe('tokenize: invariants (§7)', () => {
  it.each(Object.keys(EXAMPLES))('holds for the %s example', (key) => {
    checkInvariants(EXAMPLES[key].content);
  });

  it.each(Object.keys(FIXTURES))('holds for fixture %s', (path) => {
    checkInvariants(FIXTURES[path]);
  });

  it('holds for 400 random Dockerfile-ish strings', () => {
    const next = random(42);
    for (let n = 0; n < 400; n++) {
      const length = Math.floor(next() * 40);
      let input = '';
      for (let i = 0; i < length; i++) input += ALPHABET[Math.floor(next() * ALPHABET.length)];
      checkInvariants(input);
    }
  });

  it('holds for edge cases', () => {
    for (const input of ['', '\n', '\r\n', '\r', '\\', 'RUN \\', 'RUN \\\n', 'RUN "', "RUN '"]) {
      checkInvariants(input);
    }
  });

  it('runs in linear time, including pathological input (INV-9)', () => {
    const time = (input: string) => {
      const start = performance.now();
      tokenize(input);
      return performance.now() - start;
    };
    const complex = EXAMPLES.complex.content + '\n';
    time(complex.repeat(20)); // warm up
    const small = time(complex.repeat(50));
    const large = time(complex.repeat(400));
    expect(large).toBeLessThan(Math.max(small, 1) * 8 * 4);
    for (const unit of ['"', "'", '$', '\\', '<<', '$(', '${', '`', '(', 'RUN \\\n', '<<A ']) {
      const input = 'RUN ' + unit.repeat(20000);
      expect(time(input)).toBeLessThan(1000);
      checkInvariants('RUN ' + unit.repeat(200));
    }
  });
});

describe('tokenize: golden fixtures (§11)', () => {
  it.each(Object.keys(FIXTURES))('matches the snapshot for %s', async (path) => {
    const name = path.replace('./fixtures/', '').replace('.Dockerfile', '');
    await expect(render(tokenize(FIXTURES[path]))).toMatchFileSnapshot(
      `./__snapshots__/fixtures/${name}.txt`,
    );
  });
});

describe('tokenize: reference examples (§8)', () => {
  it('8.1 continuation with a cache mount', () => {
    const [first, second] = tokenize(
      'RUN --mount=type=cache,target=/root/.npm \\\n    npm ci --omit=dev',
    );
    expect(first.type).toBe('instruction');
    expect(first.instruction).toEqual({ keyword: 'RUN', startLine: 0, form: 'shell' });
    expect(rows(first)).toEqual([
      ['RUN', 'keyword', 'instruction RUN'],
      [' ', 'whitespace', '—'],
      ['--mount', 'flag', 'flag RUN --mount'],
      ['=', 'punctuation', 'flag RUN --mount'],
      ['type=cache,target=/root/.npm', 'text', 'flag RUN --mount'],
      [' ', 'whitespace', '—'],
      ['\\', 'escape', 'line-continuation \\'],
    ]);
    expect(second.type).toBe('continuation');
    expect(second.instruction).toBe(first.instruction);
    expect(rows(second)).toEqual([
      ['    ', 'whitespace', '—'],
      ['npm', 'text', 'shell RUN command cmd=npm [0] text=npm'],
      [' ', 'whitespace', '—'],
      ['ci', 'text', 'shell RUN argument cmd=npm [1] text=ci'],
      [' ', 'whitespace', '—'],
      ['--omit=dev', 'text', 'shell RUN option cmd=npm [2] text=--omit=dev'],
    ]);
  });

  it('8.2 HEALTHCHECK with its CMD on the next line', () => {
    const [first, second] = tokenize(
      'HEALTHCHECK --interval=30s --timeout=5s --retries=3 \\\n    CMD wget -qO- http://localhost:3000/health || exit 1',
    );
    expect(nonSpace(first).map(([text, , ref]) => `${text} ${ref}`)).toEqual([
      'HEALTHCHECK instruction HEALTHCHECK',
      '--interval flag HEALTHCHECK --interval',
      '= flag HEALTHCHECK --interval',
      '30s flag HEALTHCHECK --interval',
      '--timeout flag HEALTHCHECK --timeout',
      '= flag HEALTHCHECK --timeout',
      '5s flag HEALTHCHECK --timeout',
      '--retries flag HEALTHCHECK --retries',
      '= flag HEALTHCHECK --retries',
      '3 flag HEALTHCHECK --retries',
      '\\ line-continuation \\',
    ]);
    expect(second.type).toBe('continuation');
    expect(second.instruction?.form).toBe('shell');
    expect(nonSpace(second)).toEqual([
      ['CMD', 'keyword', 'subkeyword HEALTHCHECK CMD'],
      ['wget', 'text', 'shell HEALTHCHECK command cmd=wget [0] text=wget'],
      ['-qO-', 'text', 'shell HEALTHCHECK option cmd=wget [1] text=-qO-'],
      [
        'http://localhost:3000/health',
        'text',
        'shell HEALTHCHECK argument cmd=wget [2] text=http://localhost:3000/health',
      ],
      ['||', 'operator', 'shell HEALTHCHECK operator [-1] text=|| (wget → exit)'],
      ['exit', 'text', 'shell HEALTHCHECK command cmd=exit [0] text=exit'],
      ['1', 'text', 'shell HEALTHCHECK argument cmd=exit [1] text=1'],
    ]);
  });

  it('8.3 FROM with a variable and a stage name', () => {
    const [line] = tokenize('FROM node:${NODE_VERSION}-alpine AS base');
    const image = 'argument FROM image text=node:${NODE_VERSION}-alpine';
    expect(nonSpace(line)).toEqual([
      ['FROM', 'keyword', 'instruction FROM'],
      ['node:', 'text', image],
      ['${NODE_VERSION}', 'variable', 'variable NODE_VERSION (FROM, docker) text=${NODE_VERSION}'],
      ['-alpine', 'text', image],
      ['AS', 'keyword', 'subkeyword FROM AS'],
      ['base', 'text', 'argument FROM stage-name text=base'],
    ]);
  });

  it('8.4 exec form, and the single-quote mistake', () => {
    const [exec, single] = tokenize(`CMD ["node", "server.js"]\nCMD ['node', 'server.js']`);
    expect(exec.instruction?.form).toBe('exec');
    expect(rows(exec)).toEqual([
      ['CMD', 'keyword', 'instruction CMD'],
      [' ', 'whitespace', '—'],
      ['[', 'punctuation', 'json-array CMD'],
      ['"node"', 'string', 'exec-form CMD executable [0] text=node'],
      [',', 'punctuation', 'json-array CMD'],
      [' ', 'whitespace', '—'],
      ['"server.js"', 'string', 'exec-form CMD argument [1] text=server.js'],
      [']', 'punctuation', 'json-array CMD'],
    ]);
    expect(single.instruction?.form).toBe('shell');
    const command = "shell CMD command cmd=[node, [0] text=['node',";
    const argument = "shell CMD argument cmd=[node, [1] text='server.js']";
    expect(nonSpace(single)).toEqual([
      ['CMD', 'keyword', 'instruction CMD'],
      ['[', 'text', command],
      ["'node'", 'string', command],
      [',', 'text', command],
      ["'server.js'", 'string', argument],
      [']', 'text', argument],
    ]);
  });

  it('8.5 unterminated quote runs to the end', () => {
    const [line] = tokenize("RUN echo it's here");
    const arg = "shell RUN argument cmd=echo [1] text=it's here";
    expect(nonSpace(line)).toEqual([
      ['RUN', 'keyword', 'instruction RUN'],
      ['echo', 'text', 'shell RUN command cmd=echo [0] text=echo'],
      ['it', 'text', arg],
      ["'s here", 'string', arg],
    ]);
  });

  it('8.6 heredoc', () => {
    const lines = tokenize('RUN <<EOF\napt-get update\nEOF');
    expect(lines.map((l) => l.type)).toEqual(['instruction', 'heredoc', 'heredoc']);
    expect(nonSpace(lines[0])).toEqual([
      ['RUN', 'keyword', 'instruction RUN'],
      ['<<EOF', 'operator', 'heredoc RUN EOF'],
    ]);
    expect(nonSpace(lines[1])).toEqual([
      ['apt-get', 'text', 'shell RUN command cmd=apt-get [0] text=apt-get'],
      ['update', 'text', 'shell RUN argument cmd=apt-get [1] text=update'],
    ]);
    expect(rows(lines[2])).toEqual([['EOF', 'operator', 'heredoc RUN EOF']]);
    expect(lines[2].instruction?.startLine).toBe(0);
  });

  it('8.7 directives and the backtick escape', () => {
    const lines = tokenize(
      '# escape=`\nFROM mcr.microsoft.com/windows/servercore\nRUN dir c:\\ `\n    && echo done',
    );
    expect(lines[0].type).toBe('directive');
    expect(rows(lines[0])).toEqual([
      ['# ', 'directive', 'directive escape'],
      ['escape', 'directive', 'directive escape'],
      ['=', 'punctuation', 'directive escape'],
      ['`', 'text', 'directive escape'],
    ]);
    expect(nonSpace(lines[2])).toEqual([
      ['RUN', 'keyword', 'instruction RUN'],
      ['dir', 'text', 'shell RUN command cmd=dir [0] text=dir'],
      ['c:\\', 'text', 'shell RUN argument cmd=dir [1] text=c:\\'],
      ['`', 'escape', 'line-continuation `'],
    ]);
    expect(lines[3].type).toBe('continuation');
    expect(nonSpace(lines[3])[0]).toEqual([
      '&&',
      'operator',
      'shell RUN operator [-1] text=&& (dir → echo)',
    ]);
  });

  it('8.8 other cases', () => {
    const [lower] = tokenize('from node');
    expect(lower.type).toBe('instruction');
    expect(rows(lower)[0]).toEqual(['from', 'keyword', 'instruction FROM']);

    const [glued] = tokenize('FROMnode');
    expect(glued.type).toBe('unknown');
    expect(rows(glued)).toEqual([['FROMnode', 'text', '—']]);

    const [onbuild] = tokenize('ONBUILD RUN make');
    expect(nonSpace(onbuild)).toEqual([
      ['ONBUILD', 'keyword', 'instruction ONBUILD'],
      ['RUN', 'keyword', 'instruction RUN'],
      ['make', 'text', 'shell RUN command cmd=make [0] text=make'],
    ]);

    const [env] = tokenize('ENV NODE_ENV=production');
    expect(nonSpace(env)).toEqual([
      ['ENV', 'keyword', 'instruction ENV'],
      ['NODE_ENV', 'text', 'argument ENV key text=NODE_ENV'],
      ['=', 'punctuation', '—'],
      ['production', 'text', 'argument ENV value text=production'],
    ]);

    const [copy] = tokenize('COPY --chown="a b" src/ /app/');
    expect(nonSpace(copy)).toEqual([
      ['COPY', 'keyword', 'instruction COPY'],
      ['--chown', 'flag', 'flag COPY --chown'],
      ['=', 'punctuation', 'flag COPY --chown'],
      ['"a b"', 'string', 'flag COPY --chown'],
      ['src/', 'text', 'argument COPY source text=src/'],
      ['/app/', 'text', 'argument COPY destination text=/app/'],
    ]);

    const [subst] = tokenize('RUN echo $(date) $1 2>&1');
    const sub = nonSpace(subst);
    expect(sub.find(([t]) => t === '$(')?.[2]).toMatch(/^shell RUN substitution/);
    expect(sub.find(([t]) => t === ')')?.[2]).toMatch(/^shell RUN substitution/);
    expect(sub.find(([t]) => t === 'date')?.[2]).toBe('shell RUN command cmd=date [0] text=date');
    expect(sub.find(([t]) => t === '$1')?.[2]).toBe('variable 1 (RUN, shell) text=$1');
    expect(sub.find(([t]) => t === '2>&1')?.[2]).toMatch(/^shell RUN redirection cmd=echo/);

    const crlf = tokenize('FROM x\r\nRUN y');
    expect(crlf.map((l) => [l.raw, l.eol])).toEqual([
      ['FROM x', '\r\n'],
      ['RUN y', ''],
    ]);

    const [empty, ...rest] = tokenize('');
    expect(rest).toHaveLength(0);
    expect(empty).toMatchObject({ type: 'blank', raw: '', eol: '', tokens: [] });
  });
});

describe('tokenize: rules', () => {
  it('has no phantom last line after a trailing newline (TOK-8)', () => {
    const lines = tokenize('FROM x\n');
    expect(lines).toHaveLength(1);
    expect(lines[0].eol).toBe('\n');
  });

  it('ends the directive section at the first non-directive line (TOK-9, TOK-10)', () => {
    const lines = tokenize('# syntax=a\n# syntax=b\n# escape=`\nFROM x');
    expect(lines.map((l) => l.type)).toEqual(['directive', 'comment', 'comment', 'instruction']);
    const late = tokenize('FROM x\n# syntax=a');
    expect(late[1].type).toBe('comment');
    const unknown = tokenize('# foo=bar\n# syntax=a');
    expect(unknown.map((l) => l.type)).toEqual(['comment', 'comment']);
  });

  it('ignores invalid escape values (TOK-11)', () => {
    const lines = tokenize('# escape=x\nRUN a \\\n  b');
    expect(lines[2].type).toBe('continuation');
  });

  it('matches keywords case-insensitively as whole words (TOK-13)', () => {
    expect(tokenize('Run x')[0].type).toBe('instruction');
    expect(tokenize('RUNNER x')[0].type).toBe('unknown');
    expect(tokenize('  RUN x')[0].tokens[0].type).toBe('whitespace');
  });

  it('keeps comment and blank lines inside a continuation (TOK-15)', () => {
    const lines = tokenize('RUN a \\\n# note\n\n  && b\nFROM x');
    expect(lines.map((l) => l.type)).toEqual([
      'instruction',
      'comment',
      'blank',
      'continuation',
      'instruction',
    ]);
    expect(lines[1].instruction?.startLine).toBe(0);
    expect(lines[2].instruction?.startLine).toBe(0);
    expect(nonSpace(lines[3])[1]).toEqual(['b', 'text', 'shell RUN command cmd=b [0] text=b']);
  });

  it('cuts words that cross a continuation (TOK-19)', () => {
    const lines = tokenize('RUN echo "a \\\nb"');
    expect(rows(lines[0]).slice(-2)).toEqual([
      ['"a ', 'string', 'shell RUN argument cmd=echo [1] text="a b"'],
      ['\\', 'escape', 'line-continuation \\'],
    ]);
    expect(rows(lines[1])).toEqual([
      ['b"', 'string', 'shell RUN argument cmd=echo [1] text="a b"'],
    ]);
  });

  it('keeps trailing whitespace after the escape character (TOK-20)', () => {
    const [line] = tokenize('RUN a \\  \n b');
    expect(rows(line).slice(-2)).toEqual([
      ['\\', 'escape', 'line-continuation \\'],
      ['  ', 'whitespace', '—'],
    ]);
  });

  it('recognizes flags only in flag position (TOK-24)', () => {
    const [line] = tokenize('COPY src --chown=x /app');
    expect(line.tokens.some((t) => t.type === 'flag')).toBe(false);
  });

  it('splits key=value pairs and the legacy ENV form (TOK-31)', () => {
    const [legacy] = tokenize('ENV KEY some value');
    expect(nonSpace(legacy).slice(1)).toEqual([
      ['KEY', 'text', 'argument ENV key text=KEY'],
      ['some', 'text', 'argument ENV value text=some value'],
      ['value', 'text', 'argument ENV value text=some value'],
    ]);
    const [arg] = tokenize('ARG A=${B} C');
    expect(nonSpace(arg).slice(1)).toEqual([
      ['A', 'text', 'argument ARG key text=A'],
      ['=', 'punctuation', '—'],
      ['${B}', 'variable', 'variable B (ARG, docker) text=${B}'],
      ['C', 'text', 'argument ARG key text=C'],
    ]);
  });

  it('falls back from invalid JSON (TOK-32)', () => {
    expect(tokenize('RUN ["a", ]')[0].instruction?.form).toBe('shell');
    expect(tokenize('RUN ["a"] x')[0].instruction?.form).toBe('shell');
    expect(tokenize('RUN []')[0].instruction?.form).toBe('exec');
    expect(tokenize('SHELL ["sh", "-c"]')[0].tokens[3].ref).toMatchObject({
      kind: 'exec-form',
      role: 'executable',
      text: 'sh',
    });
  });

  it('rejects raw control characters in JSON strings and decodes escapes (TOK-32)', () => {
    expect(tokenize('CMD ["a\tb"]')[0].instruction?.form).toBe('shell');
    expect(tokenize('CMD ["\\x"]')[0].instruction?.form).toBe('shell');
    const [line] = tokenize('CMD ["a\\tb", "\\u0041"]');
    expect(line.instruction?.form).toBe('exec');
    expect(line.tokens[3].ref).toMatchObject({ kind: 'exec-form', words: ['a\tb', 'A'] });
  });

  it('splits variables inside double quotes in Docker words, not single quotes (TOK-29)', () => {
    const [double] = tokenize('ENV A="$B c"');
    const value = 'argument ENV value text="$B c"';
    expect(nonSpace(double).slice(1)).toEqual([
      ['A', 'text', 'argument ENV key text=A'],
      ['=', 'punctuation', '—'],
      ['"', 'string', value],
      ['$B', 'variable', 'variable B (ENV, docker) text=$B'],
      [' c"', 'string', value],
    ]);
    const [single] = tokenize("ENV A='$B'");
    expect(single.tokens.some((t) => t.type === 'variable')).toBe(false);
    const [escaped] = tokenize('LABEL a="x\\"$y"');
    expect(nonSpace(escaped).map(([text, type]) => `${text}:${type}`)).toEqual([
      'LABEL:keyword',
      'a:text',
      '=:punctuation',
      '"x\\":string',
      '$y:variable',
      '":string',
    ]);
  });

  it('does not split variables in exec form (TOK-28)', () => {
    const [line] = tokenize('CMD ["echo", "$HOME"]');
    expect(line.tokens.some((t) => t.type === 'variable')).toBe(false);
  });

  it('assigns shell roles (TOK-35, TOK-36)', () => {
    const [line] = tokenize('RUN A=1 cmd -x -- -y > /dev/null; if true; then ok; fi');
    const refs = line.tokens
      .map((t) => t.ref)
      .filter((r): r is Extract<ExplanationRef, { kind: 'shell' }> => r?.kind === 'shell');
    const byText = (text: string) => refs.find((r) => r.text === text);
    expect(byText('A=1')).toMatchObject({ role: 'assignment', command: null });
    expect(byText('cmd')).toMatchObject({
      role: 'command',
      words: ['cmd', '-x', '--', '-y'],
      wordIndex: 0,
    });
    expect(byText('-x')).toMatchObject({ role: 'option', wordIndex: 1 });
    expect(byText('--')).toMatchObject({ role: 'option', wordIndex: 2 });
    expect(byText('-y')).toMatchObject({ role: 'argument', wordIndex: 3 });
    expect(byText('>')).toMatchObject({ role: 'redirection', command: 'cmd' });
    expect(byText('/dev/null')).toMatchObject({ role: 'redirect-target', wordIndex: -1 });
    expect(byText(';')).toMatchObject({ role: 'operator', before: 'cmd', after: 'true' });
    expect(byText('if')).toMatchObject({ role: 'reserved', command: null });
    expect(byText('true')).toMatchObject({ role: 'command' });
    expect(byText('then')).toMatchObject({ role: 'reserved' });
    expect(byText('ok')).toMatchObject({ role: 'command' });
    expect(byText('fi')).toMatchObject({ role: 'reserved' });
  });

  it('treats for and case words as loop arguments, not commands (TOK-35)', () => {
    const roles = (input: string) =>
      tokenize(input)[0]
        .tokens.map((t) => t.ref)
        .filter((r): r is Extract<ExplanationRef, { kind: 'shell' }> => r?.kind === 'shell')
        .map((r) => `${r.text}:${r.role}:${r.command ?? '-'}:${r.wordIndex}`);
    expect(roles('RUN for f in a b; do echo $f; done')).toEqual([
      'for:reserved:-:-1',
      'f:argument:-:-1',
      'in:reserved:-:-1',
      'a:argument:-:-1',
      'b:argument:-:-1',
      ';:operator:-:-1',
      'do:reserved:-:-1',
      'echo:command:echo:0',
      ';:operator:-:-1',
      'done:reserved:-:-1',
    ]);
    expect(roles('RUN for f do echo; done').slice(0, 4)).toEqual([
      'for:reserved:-:-1',
      'f:argument:-:-1',
      'do:reserved:-:-1',
      'echo:command:echo:0',
    ]);
    expect(roles('RUN case $x in a) echo ;; esac')).toEqual([
      'case:reserved:-:-1',
      'in:reserved:-:-1',
      'a:argument:-:-1',
      '):operator:-:-1',
      'echo:command:echo:0',
      ';;:operator:-:-1',
      'esac:reserved:-:-1',
    ]);
  });

  it.each([
    ["'a b'", 'a b'],
    ['"a\\"b\\\\c\\$d\\`e"', 'a"b\\c$d`e'],
    ['"a\\nb"', 'a\\nb'],
    ['a\\ b', 'a b'],
    ['x"y"\'z\'', 'xyz'],
    ['"$HOME"', '$HOME'],
    ["'unterminated", 'unterminated'],
    ['"unterminated', 'unterminated'],
    ['trailing\\', 'trailing\\'],
  ])('unquote(%s) is %s (TOK-36)', (raw, expected) => {
    expect(unquote(raw)).toBe(expected);
  });

  it('lexes shell comments to the end of the instruction', () => {
    const [line] = tokenize('RUN a # b c');
    expect(rows(line).at(-1)).toEqual(['# b c', 'comment', '—']);
  });

  it('honors <<- tab stripping for terminators (TOK-40)', () => {
    const lines = tokenize('COPY <<-X /f\n\tbody\n\tX\nFROM y');
    expect(lines.map((l) => l.type)).toEqual(['instruction', 'heredoc', 'heredoc', 'instruction']);
    expect(rows(lines[1])).toEqual([
      ['\t', 'whitespace', '—'],
      ['body', 'text', '—'],
    ]);
    expect(rows(lines[2])).toEqual([
      ['\t', 'whitespace', '—'],
      ['X', 'operator', 'heredoc COPY X'],
    ]);
  });

  it('runs an unterminated heredoc to the end of the file (TOK-40)', () => {
    const lines = tokenize('RUN <<EOF\necho a\nFROM x');
    expect(lines.map((l) => l.type)).toEqual(['instruction', 'heredoc', 'heredoc']);
  });

  it('exports instructions and constants', () => {
    expect(INSTRUCTIONS).toHaveLength(18);
    expect(TOKEN_TYPE.OPERATOR).toBe('operator');
    expect(LINE_TYPE.HEREDOC).toBe('heredoc');
  });
});

describe('refKey (TOK-2)', () => {
  it('builds stable keys', () => {
    expect(refKey({ kind: 'flag', instruction: 'COPY', flag: '--from' })).toBe('flag:COPY:--from');
    expect(refKey({ kind: 'instruction', instruction: 'RUN' })).toBe('instruction:RUN');
    const [line] = tokenize('RUN npm ci');
    const npm = line.tokens.find((t) => t.text === 'npm');
    expect(npm?.ref && refKey(npm.ref)).toBe('shell:RUN:command:npm');
  });

  it('gives different refs different keys', () => {
    const keys = new Map<string, string>();
    for (const example of Object.values(EXAMPLES)) {
      for (const line of tokenize(example.content)) {
        for (const token of line.tokens) {
          if (!token.ref) continue;
          const key = refKey(token.ref);
          const value = JSON.stringify({ ...token.ref, words: undefined, wordIndex: undefined });
          if (keys.has(key) && token.ref.kind !== 'shell' && token.ref.kind !== 'exec-form') {
            expect(keys.get(key)).toBe(value);
          }
          keys.set(key, value);
        }
      }
    }
  });
});
