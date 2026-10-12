// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import { tokenize } from '../data/tokenizer';
import type { ExplanationRef, Line } from '../data/tokenizer';
import { EXAMPLES } from '../data/examples';
import { getExplanation, flatten } from '../data/explanations';
import type { Explanation } from '../data/explanations';
import { CATALOG, normalizeCommand } from '../data/commands/catalog';
import { resolve } from '../data/commands/resolve';
import { RESERVED, operator, redirection } from '../data/commands/shell-syntax';

const IN_SCOPE = new Set(['shell', 'exec-form', 'json-array', 'line-continuation', 'heredoc']);

function explain(ref: ExplanationRef | null): Explanation {
  const explanation = getExplanation(ref);
  if (!explanation) throw new Error('no explanation');
  return explanation;
}

/** The `short` text for the nth token with this text in the input (0-based). */
function shortFor(input: string, text: string, nth = 0): string {
  const tokens = tokenize(input)
    .flatMap((line: Line) => line.tokens)
    .filter((t) => t.text === text && t.ref);
  const token = tokens[nth];
  if (!token) throw new Error(`no token ${text}`);
  return flatten(explain(token.ref).short);
}

describe('golden examples (§10)', () => {
  it('cache mount continuation', () => {
    const input = 'RUN --mount=type=cache,target=/root/.npm \\\n    npm ci --omit=dev';
    expect(shortFor(input, '\\')).toBe(
      'Line continuation: joins this line with the next into a single instruction.',
    );
    expect(shortFor(input, 'npm')).toBe('npm: the Node.js package manager.');
    expect(shortFor(input, 'ci')).toBe(
      'npm ci: clean install that exactly matches package-lock.json.',
    );
    expect(shortFor(input, '--omit=dev')).toBe(
      '--omit=dev: skip installing dependencies of this type; value dev.',
    );
  });

  it('addgroup && adduser', () => {
    const input = 'RUN addgroup -S appgroup && adduser -S appuser -G appgroup';
    expect(shortFor(input, 'addgroup')).toBe(
      'addgroup: create a group (BusyBox, as in Alpine images).',
    );
    expect(shortFor(input, '-S')).toBe('-S: create a system group (addgroup option).');
    expect(shortFor(input, 'appgroup')).toBe(
      'Argument to addgroup: the name of the group to create.',
    );
    expect(shortFor(input, '&&')).toBe('Runs adduser only if addgroup succeeds.');
    expect(shortFor(input, '-G')).toBe('-G: add the user to this group (adduser option).');
    expect(shortFor(input, 'appgroup', 1)).toBe('Value for -G: group name.');
  });

  it('HEALTHCHECK with wget', () => {
    const input =
      'HEALTHCHECK --interval=30s --timeout=5s --retries=3 \\\n    CMD wget -qO- http://localhost:3000/health || exit 1';
    expect(shortFor(input, 'wget')).toBe('wget: download files over HTTP, HTTPS or FTP.');
    expect(shortFor(input, '-qO-')).toBe(
      'Combined wget options: -q turn off progress output, -O - write the download to this file.',
    );
    expect(shortFor(input, '||')).toBe('Runs exit only if wget fails.');
    expect(shortFor(input, '1')).toBe(
      'Argument to exit: the exit status (0 means success, anything else failure).',
    );
    const wget = tokenize(input)[1].tokens.find((t) => t.text === 'wget');
    const details = explain(wget?.ref ?? null).details;
    expect(flatten(details.flatMap((b) => (b.type === 'paragraph' ? b.content : [])))).toMatch(
      /on a schedule/,
    );
  });

  it('exec form nginx', () => {
    const input = 'CMD ["nginx", "-g", "daemon off;"]';
    expect(shortFor(input, '[')).toBe(
      'Exec form: a JSON array that Docker runs directly, without a shell.',
    );
    expect(shortFor(input, '"nginx"')).toBe('nginx: web server and reverse proxy.');
    expect(shortFor(input, '"-g"')).toBe('-g: set global configuration directives (nginx option).');
    expect(shortFor(input, '"daemon off;"')).toBe(
      'Value for -g: configuration directives, e.g. daemon off;.',
    );
    const [line] = tokenize(input);
    const nginx = explain(line.tokens.find((t) => t.text === '"nginx"')?.ref ?? null);
    expect(nginx.links[0].url).toBe('https://docs.docker.com/reference/dockerfile/#cmd');
  });
});

describe('resolver (§4)', () => {
  it('normalizes command names (CMDX-5)', () => {
    expect(normalizeCommand('/usr/local/bin/npm')).toBe('npm');
    expect(normalizeCommand('\\rm')).toBe('rm');
    expect(normalizeCommand('python3')).toBe('python');
    expect(resolve(['/usr/bin/python3', '-m', 'http.server'], 2)).toMatchObject({
      kind: 'option-value',
      name: 'python',
    });
  });

  it('matches options in order (CMDX-6)', () => {
    expect(resolve(['npm', 'ci', '--omit=dev'], 2)).toMatchObject({
      kind: 'option',
      parts: [{ name: '--omit', value: 'dev' }],
    });
    expect(resolve(['pip', 'install', '-r', 'req.txt'], 3)).toMatchObject({
      kind: 'option-value',
      option: { name: '-r' },
    });
    expect(resolve(['set', '-eux'], 1)).toMatchObject({
      kind: 'option',
      parts: [{ name: '-e' }, { name: '-u' }, { name: '-x' }],
    });
    expect(resolve(['tar', '-xzf', 'a.tgz'], 2)).toMatchObject({
      kind: 'option-value',
      option: { name: '-f' },
    });
    expect(resolve(['wget', '-qZ'], 1)).toMatchObject({ kind: 'option', parts: null });
    expect(resolve(['unknown', '-x'], 1)).toMatchObject({ kind: 'option', parts: null });
  });

  it('tracks subcommands, -- and arguments (CMDX-7)', () => {
    expect(resolve(['apt-get', '-y', 'install', 'curl'], 2)).toMatchObject({
      kind: 'subcommand',
      sub: { name: 'install' },
    });
    expect(resolve(['apt-get', '-y', 'install', 'curl'], 3)).toMatchObject({
      kind: 'argument',
      sub: { name: 'install' },
    });
    expect(resolve(['rm', '--', '-f'], 1)).toMatchObject({ kind: 'end-of-options' });
    expect(resolve(['rm', '--', '-f'], 2)).toMatchObject({ kind: 'argument' });
    expect(resolve(['echo', 'install'], 1)).toMatchObject({ kind: 'argument' });
  });
});

describe('syntax tables (§7.6 to §7.9)', () => {
  const firstShort = (input: string, text: string) => shortFor(input, text);

  it.each([
    ['RUN a && b', '&&', 'Runs b only if a succeeds.'],
    ['RUN a || b', '||', 'Runs b only if a fails.'],
    ['RUN a ; b', ';', 'Runs b after a, even if it failed.'],
    ['RUN a | b', '|', 'Sends the output of a into b.'],
    ['RUN a & b', '&', 'Starts a in the background.'],
    ['RUN (a)', '(', 'Runs the enclosed commands in a subshell.'],
    ['RUN && b', '&&', 'Runs b only if the previous command succeeds.'],
    ['RUN a &&', '&&', 'Runs the next command only if a succeeds.'],
  ])('%s: %s', (input, text, expected) => {
    expect(firstShort(input, text)).toBe(expected);
  });

  it.each([
    ['RUN a > f', '>', 'Writes the output of a to a file, replacing it.'],
    ['RUN a >> f', '>>', 'Appends the output of a to a file.'],
    ['RUN a < f', '<', 'Feeds a file to a as its input.'],
    ['RUN a 2> f', '2>', 'Writes the errors of a to a file, replacing it.'],
    ['RUN a 2>&1', '2>&1', 'Sends the errors of a to the same place as its normal output.'],
    ['RUN a >&2', '>&2', 'Sends the normal output of a to the error stream.'],
    ['RUN a 1>&2', '1>&2', 'Sends the normal output of a to the error stream.'],
    ['RUN a <<< w', '<<<', 'Feeds the following word to a as its input.'],
    ['RUN a >| f', '>|', 'Writes to a file even if the shell’s noclobber option is set.'],
    ['RUN a 3> f', '3>', 'Writes stream 3 of a to a file, replacing it.'],
    ['RUN a > /dev/null', '/dev/null', 'Discards whatever is redirected here.'],
    [
      'RUN a > out.txt',
      'out.txt',
      'The file out.txt that the redirection reads from or writes to.',
    ],
  ])('%s: %s', (input, text, expected) => {
    expect(firstShort(input, text)).toBe(expected);
  });

  it.each([
    ['>&-', 'a', 'Closes stream 1 of a.'],
    ['<&-', 'a', 'Closes stream 0 of a.'],
    ['2>&-', 'a', 'Closes stream 2 of a.'],
    ['3>&4', 'a', 'Sends stream 3 of a to stream 4.'],
    ['2>>', 'a', 'Appends the errors of a to a file.'],
    ['3>>', 'a', 'Appends stream 3 of a to a file.'],
    ['&>', 'a', 'Writes both the output and the errors of a to a file (Bash only).'],
    ['&>>', 'a', 'Writes both the output and the errors of a to a file (Bash only).'],
    ['<>', 'a', 'Opens a file for reading and writing as the input of a.'],
    ['<<', 'a', 'Starts a shell here-document: the lines that follow are the input of a.'],
    ['<<-', 'a', 'Starts a shell here-document: the lines that follow are the input of a.'],
    ['>', null, 'Writes the output of the command to a file, replacing it.'],
    ['7', 'a', 'Redirects the input or output of a.'],
  ])('redirection %s', (text, command, expected) => {
    expect(flatten(redirection(text, command).short)).toBe(expected);
  });

  it('tokenizes and explains closing and duplicating streams', () => {
    expect(firstShort('RUN a >&-', '>&-')).toBe('Closes stream 1 of a.');
    expect(firstShort('RUN a 3>&4', '3>&4')).toBe('Sends stream 3 of a to stream 4.');
  });

  it('explains the case terminator and unknown operators', () => {
    expect(flatten(operator(';;', null, null).short)).toBe(
      'Ends the commands for one case pattern.',
    );
    expect(flatten(operator('|&', 'a', 'b').short)).toBe('A shell operator.');
    expect(firstShort('RUN case $x in a) echo ;; esac', ';;')).toBe(
      'Ends the commands for one case pattern.',
    );
  });

  it('explains -- and loop words (§7.3, TOK-35)', () => {
    expect(firstShort('RUN rm -- -f', '--')).toBe(
      'Ends option parsing; later words are arguments even if they start with -.',
    );
    expect(firstShort('RUN for f in a b; do echo $f; done', 'f')).toBe(
      'A word in a shell loop or case statement.',
    );
  });

  it('explains every reserved word', () => {
    for (const word of RESERVED.keys()) {
      const input = `RUN ${word}`;
      const explanation = explain(
        tokenize(input)[0].tokens.find((t) => t.text === word)?.ref ?? null,
      );
      expect(explanation.category).toBe(
        word === 'in' || word === 'do' ? explanation.category : 'Shell keyword',
      );
    }
    expect(firstShort('RUN if a; then b; fi', 'then')).toBe(
      'then: starts the commands that run when the if condition succeeds.',
    );
  });

  it('explains substitutions', () => {
    expect(firstShort('RUN echo $(date)', '$(')).toBe(
      'Command substitution: runs the enclosed command and inserts its output.',
    );
    expect(firstShort('RUN echo $((1 + 2))', '$((')).toBe(
      'Arithmetic expansion: calculates the enclosed expression.',
    );
  });

  it('explains assignments (§7.5)', () => {
    expect(
      firstShort(
        'RUN DEBIAN_FRONTEND=noninteractive apt-get install -y x',
        'DEBIAN_FRONTEND=noninteractive',
      ),
    ).toBe('Sets DEBIAN_FRONTEND only while apt-get runs.');
    expect(firstShort('RUN A=1', 'A=1')).toBe(
      'Sets shell variable A for the rest of this RUN step only; use ENV or ARG to keep it.',
    );
    expect(firstShort('CMD A=1', 'A=1')).toBe(
      'Sets shell variable A for the rest of this command.',
    );
  });

  it('explains heredocs and single-quoted "JSON"', () => {
    expect(firstShort('RUN <<EOF\necho\nEOF', '<<EOF')).toMatch(/^Heredoc: the lines up to EOF/);
    expect(firstShort("CMD ['node', 'x']", '[')).toBe(
      'Looks like exec form, but JSON needs double quotes, so the shell runs this as text.',
    );
  });

  it('describes unknown commands and options without guessing (G3)', () => {
    expect(firstShort('RUN frobnicate --wibble', 'frobnicate')).toBe(
      'Runs the frobnicate program.',
    );
    expect(firstShort('RUN frobnicate --wibble', '--wibble')).toBe(
      'An option for frobnicate; its meaning is defined by frobnicate.',
    );
    expect(firstShort('RUN ./build.sh', './build.sh')).toBe(
      'Runs the program or script at ./build.sh.',
    );
  });
});

describe('coverage and contract (§11)', () => {
  it('explains every in-scope token in the examples, from the catalog (CMDX-2, CMDX-12)', () => {
    for (const example of Object.values(EXAMPLES)) {
      for (const line of tokenize(example.content)) {
        for (const token of line.tokens) {
          if (!token.ref || !IN_SCOPE.has(token.ref.kind)) continue;
          const ref = token.ref;
          const explanation = explain(ref);
          const isEntrypointArgs = ref.kind === 'exec-form' && ref.instruction === 'CMD';
          if (
            (ref.kind === 'shell' || ref.kind === 'exec-form') &&
            ref.wordIndex >= 0 &&
            !isEntrypointArgs
          ) {
            const res = resolve(ref.words, ref.wordIndex);
            expect(res.info, `catalog entry for ${ref.words[0]}`).not.toBeNull();
            if (res.kind === 'option') expect(res.parts, ref.text).not.toBeNull();
          }
          expect(flatten(explanation.short)).not.toMatch(/no notes|defined by/);
        }
      }
    }
  });

  it('keeps titles and shorts within limits for long, random input (CMDX-21)', () => {
    const long = 'x'.repeat(500);
    const inputs = [
      `RUN ${long} -${long} --${long}=${long} ${long} && ${long} | ${long} > ${long}`,
      `RUN npm ${long} --omit=${long} && apt-get install ${long} -o ${long}`,
      `CMD ["${long}", "-${long}", "${long}"]`,
      `RUN ${long}=${long} ${long}`,
      `RUN <<${'E'.repeat(200)}\nx\n${'E'.repeat(200)}`,
    ];
    for (const input of inputs) {
      for (const line of tokenize(input)) {
        for (const token of line.tokens) {
          if (!token.ref || !IN_SCOPE.has(token.ref.kind)) continue;
          const explanation = explain(token.ref);
          expect(explanation.title.length).toBeLessThanOrEqual(61);
          expect(flatten(explanation.short).length).toBeLessThanOrEqual(120);
          expect(explanation.links[0].url).toMatch(/^https:\/\/docs\.docker\.com\//);
        }
      }
    }
  });
});

describe('catalog integrity (§5)', () => {
  it('has docs, short summaries and unique aliases (CMDX-8, CMDX-9, CMDX-11)', () => {
    const names = new Set(CATALOG.keys());
    for (const info of CATALOG.values()) {
      expect(info.docs.url).toMatch(/^https:\/\//);
      expect(info.summary.length).toBeLessThanOrEqual(80);
      for (const alias of info.aliases ?? []) expect(names.has(alias)).toBe(false);
      const options = [
        ...(info.options?.values() ?? []),
        ...[...(info.subcommands?.values() ?? [])].flatMap((s) => [...(s.options?.values() ?? [])]),
      ];
      for (const option of options) expect(option.summary.length).toBeLessThanOrEqual(80);
      for (const sub of info.subcommands?.values() ?? [])
        expect(sub.summary.length).toBeLessThanOrEqual(80);
    }
  });

  it('stays within 4 KB gzipped (CMDX-20)', () => {
    const serialized = JSON.stringify([...CATALOG.values()], (_, value: unknown) =>
      value instanceof Map ? (Object.fromEntries(value) as Record<string, unknown>) : value,
    );
    expect(gzipSync(serialized).length).toBeLessThanOrEqual(4 * 1024);
  });
});
