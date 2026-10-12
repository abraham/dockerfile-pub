import type { ExecFormRef, ExplanationRef, Instruction, ShellRef } from '../tokenizer/types';
import { REFERENCE_URL, instructionLink } from '../content/registry';
import { clip, code, flatten, list, p, parseInline, parseRichText } from '../content/rich-text';
import type { Block, Explanation, Inline, Link } from '../content/schema';
import { resolve } from './resolve';
import type { OptionPart, Resolution } from './resolve';
import { RESERVED, operator, redirectTarget, redirection, substitution } from './shell-syntax';

export type CommandRef = Extract<
  ExplanationRef,
  { kind: 'shell' | 'exec-form' | 'json-array' | 'line-continuation' | 'heredoc' }
>;

const MAX_SHORT = 120;

/** The first candidate that fits the `short` limit; the last one always does (CMDX-21). */
function fit(...candidates: Inline[][]): Inline[] {
  return (
    candidates.find((c) => flatten(c).length <= MAX_SHORT) ?? candidates[candidates.length - 1]
  );
}

/** Instructions whose commands can run in exec form; each has a framing sentence. */
type CommandInstruction = 'RUN' | 'CMD' | 'ENTRYPOINT' | 'HEALTHCHECK' | 'SHELL';

const COMMAND_INSTRUCTIONS: ReadonlySet<Instruction> = new Set<CommandInstruction>([
  'RUN',
  'CMD',
  'ENTRYPOINT',
  'SHELL',
  'HEALTHCHECK',
]);

function isCommandInstruction(instruction: Instruction): instruction is CommandInstruction {
  return COMMAND_INSTRUCTIONS.has(instruction);
}

/** When and how the fragment runs, per instruction and form (CMDX-14). */
function framing(instruction: CommandInstruction, form: 'shell' | 'exec'): Block {
  const sh = code('/bin/sh -c');
  switch (instruction) {
    case 'RUN':
      return form === 'shell'
        ? p(
            'Runs at build time through ',
            sh,
            '. The result is saved as a new image layer, and a non-zero exit status fails the build.',
          )
        : p(
            'Runs at build time without a shell, so there’s no variable expansion, ',
            code('&&'),
            ' or redirection.',
          );
    case 'CMD':
      return form === 'shell'
        ? p(
            'The default command for containers, run through ',
            sh,
            '. The shell becomes the main process, so the program may not receive stop signals; prefer exec form.',
          )
        : p(
            'The default command for containers; ',
            code('docker run'),
            ' arguments replace it. With an ',
            code('ENTRYPOINT'),
            ', it supplies the entrypoint’s default arguments.',
          );
    case 'ENTRYPOINT':
      return form === 'shell'
        ? p(
            'Runs through ',
            sh,
            '. ',
            code('CMD'),
            ' and ',
            code('docker run'),
            ' arguments are ignored, and stop signals don’t reach the program; prefer exec form.',
          )
        : p(
            'The container’s main process; ',
            code('CMD'),
            ' and ',
            code('docker run'),
            ' arguments are appended to it.',
          );
    case 'HEALTHCHECK':
      return p(
        'Runs inside the running container on a schedule; exit status ',
        code('0'),
        ' means healthy and ',
        code('1'),
        ' unhealthy.',
      );
    case 'SHELL':
      return p(
        'Sets the program that runs the shell form of later ',
        code('RUN'),
        ', ',
        code('CMD'),
        ' and ',
        code('ENTRYPOINT'),
        ' instructions.',
      );
  }
}

interface Draft {
  category: string;
  short: Inline[];
  details: Block[];
  syntax?: string;
  links?: Link[];
}

/** Builds the final explanation: role text, then framing, then links (CMDX-15). */
function finish(
  ref: CommandRef,
  title: string,
  draft: Draft,
  form: 'shell' | 'exec' | null,
): Explanation {
  const details = [...draft.details];
  if ('instruction' in ref && form && isCommandInstruction(ref.instruction)) {
    details.push(framing(ref.instruction, form));
  }
  const links: Link[] = 'instruction' in ref ? [instructionLink(ref.instruction)] : [];
  for (const link of draft.links ?? []) {
    if (!links.some((l) => l.url === link.url)) links.push(link);
  }
  const explanation: Explanation = {
    category: draft.category,
    title: clip(title, 60),
    short: draft.short,
    details: details.slice(-4),
    links,
  };
  if (draft.syntax) explanation.syntax = draft.syntax;
  return explanation;
}

function markup(text: string | undefined): Inline[] {
  return text ? parseInline(text) : [];
}

function partLabel(part: OptionPart): string {
  return part.value === null ? part.name : `${part.name} ${part.value}`;
}

function commandDraft(ref: ShellRef | ExecFormRef, res: Resolution): Draft {
  const { name, info } = res;
  const cmd = code(clip(name));
  const docs = info ? [info.docs] : [];
  const category = (kind: string) => `${clip(name, 24)} ${kind}`;

  switch (res.kind) {
    case 'command': {
      if (ref.kind === 'shell' && ref.text.startsWith('[')) {
        return {
          category: 'Command',
          short: [
            'Looks like exec form, but JSON needs double quotes, so the shell runs this as text.',
          ],
          details: [
            p(
              'Write the array with double quotes, such as ',
              code('["node", "server.js"]'),
              ', so Docker runs the program directly.',
            ),
          ],
          links: [{ label: 'Exec form', url: `${REFERENCE_URL}#exec-form` }],
        };
      }
      const categoryName = ref.kind === 'exec-form' ? 'Exec-form program' : 'Command';
      if (info) {
        const body = [
          ...(info.details ? parseRichText(info.details) : []),
          ...(info.tips ?? []).map((tip) => p(...parseInline(tip))),
        ];
        return {
          category: categoryName,
          short: fit([cmd, ': ', ...markup(info.summary), '.'], [cmd, '.']),
          details: body.slice(0, 3),
          links: docs,
        };
      }
      const word = ref.words[0] ?? ref.text;
      if (ref.kind === 'exec-form' && ref.instruction === 'CMD') {
        // Without a cross-instruction view, CMD may be a program or ENTRYPOINT arguments.
        return {
          category: categoryName,
          short: [
            'The program to run, or the first argument for the ',
            code('ENTRYPOINT'),
            ': ',
            code(clip(word)),
            '.',
          ],
          details: [],
        };
      }
      if (word.includes('/')) {
        return {
          category: categoryName,
          short: ['Runs the program or script at ', code(clip(word)), '.'],
          details: [],
        };
      }
      return {
        category: categoryName,
        short: ['Runs the ', cmd, ' program.'],
        details: [
          p(
            'This explainer has no notes for ',
            cmd,
            '; its documentation (',
            code(`${clip(name)} --help`),
            ' or ',
            code(`man ${clip(name)}`),
            ') has the details.',
          ),
        ],
      };
    }

    case 'subcommand': {
      const sub = res.sub;
      const both = code(clip(`${name} ${sub.name}`));
      return {
        category: category('subcommand'),
        short: fit([both, ': ', ...markup(sub.info.summary), '.'], [both, '.']),
        details: [
          ...(sub.info.tips ?? []).map((tip) => p(...parseInline(tip))),
          p(cmd, ': ', ...markup(info?.summary), '.'),
        ],
        links: docs,
      };
    }

    case 'option': {
      const text = code(clip(ref.text));
      if (!res.parts) {
        return {
          category: category('option'),
          short: ['An option for ', cmd, '; its meaning is defined by ', cmd, '.'],
          details: [
            p('Check ', code(`${clip(name)} --help`), ' or the documentation for ', cmd, '.'),
          ],
          links: docs,
        };
      }
      const describe = (part: OptionPart): Inline[] => [
        code(clip(partLabel(part))),
        ' ',
        ...markup(part.info.summary),
      ];
      if (res.parts.length === 1) {
        const [part] = res.parts;
        const summary = markup(part.info.summary);
        return {
          category: category('option'),
          short:
            part.value === null
              ? fit(
                  [text, ': ', ...summary, ' (', cmd, ' option).'],
                  [text, ': ', ...summary, '.'],
                  [text, '.'],
                )
              : fit(
                  [text, ': ', ...summary, '; value ', code(clip(part.value)), '.'],
                  [text, ': ', ...summary, '.'],
                  [text, '.'],
                ),
          details: [],
          links: docs,
        };
      }
      const described: Inline[] = [];
      res.parts.forEach((part, i) => described.push(...(i ? [', '] : []), ...describe(part)));
      const names: Inline[] = [];
      res.parts.forEach((part, i) => names.push(...(i ? [', '] : []), code(clip(partLabel(part)))));
      return {
        category: category('options'),
        short: fit(
          ['Combined ', cmd, ' options: ', ...described, '.'],
          ['Combined ', cmd, ' options: ', ...names, '.'],
          ['Several ', cmd, ' options combined into one word.'],
        ),
        details: [
          list(
            ...res.parts.map((part) => [
              code(clip(partLabel(part))),
              ': ',
              ...markup(part.info.summary),
            ]),
          ),
        ],
        links: docs,
      };
    }

    case 'option-value': {
      const opt = code(clip(res.option.name));
      return {
        category: category('option value'),
        short: fit(
          ['Value for ', opt, ': ', ...markup(res.option.info.value), '.'],
          ['Value for ', opt, '.'],
        ),
        details: [p(opt, ': ', ...markup(res.option.info.summary), '.')],
        links: docs,
      };
    }

    case 'end-of-options':
      return {
        category: category('option'),
        short: [
          'Ends option parsing; later words are arguments even if they start with ',
          code('-'),
          '.',
        ],
        details: [],
        links: docs,
      };

    case 'argument': {
      if (ref.text === '-') {
        return {
          category: category('argument'),
          short: ['Usually means standard input or output for ', cmd, '.'],
          details: [],
          links: docs,
        };
      }
      const hint = res.sub?.info.argumentsHint ?? (res.sub ? undefined : info?.argumentsHint);
      const owner = code(clip(res.sub ? `${name} ${res.sub.name}` : name));
      return {
        category: category('argument'),
        short: hint
          ? fit(
              ['Argument to ', owner, ': ', ...markup(hint), '.'],
              ['An argument passed to ', owner, '.'],
            )
          : ['An argument passed to ', owner, '.'],
        details: [],
        links: docs,
      };
    }
  }
}

function shellDraft(ref: ShellRef): Draft {
  switch (ref.role) {
    case 'command':
    case 'option':
    case 'argument':
      if (ref.wordIndex < 0) {
        return {
          category: 'Shell word',
          short: ['A word in a shell loop or ', code('case'), ' statement.'],
          details: [],
        };
      }
      return commandDraft(ref, resolve(ref.words, ref.wordIndex));
    case 'assignment': {
      const name = code(clip(ref.text.slice(0, ref.text.indexOf('=')).replace(/\+$/, '')));
      const target = ref.words[0];
      return {
        category: 'Variable assignment',
        short: target
          ? ['Sets ', name, ' only while ', code(clip(target)), ' runs.']
          : ref.instruction === 'RUN'
            ? [
                'Sets shell variable ',
                name,
                ' for the rest of this ',
                code('RUN'),
                ' step only; use ',
                code('ENV'),
                ' or ',
                code('ARG'),
                ' to keep it.',
              ]
            : ['Sets shell variable ', name, ' for the rest of this command.'],
        details: [],
        syntax: 'NAME=value [<command>]',
      };
    }
    case 'operator':
      return { category: 'Shell operator', ...operator(ref.text, ref.before, ref.after) };
    case 'redirection':
      return { category: 'Shell redirection', ...redirection(ref.text, ref.command) };
    case 'redirect-target':
      return { category: 'Shell redirection', ...redirectTarget(ref.text) };
    case 'reserved': {
      const [short, syntax] = RESERVED.get(ref.text) ?? [`\`${ref.text}\`: a shell keyword.`, ''];
      return {
        category: 'Shell keyword',
        short: parseInline(short),
        details: [p('Shell keywords build conditions and loops out of other commands.')],
        syntax: syntax || undefined,
      };
    }
    case 'substitution':
      return { category: 'Shell substitution', ...substitution(ref.text) };
  }
}

/** Generates the explanation for a command fragment (CMDX-2); never `null`. */
export function explainCommandRef(ref: CommandRef): Explanation {
  switch (ref.kind) {
    case 'shell':
      return finish(ref, ref.text, shellDraft(ref), 'shell');
    case 'exec-form':
      return finish(ref, ref.text, commandDraft(ref, resolve(ref.words, ref.wordIndex)), 'exec');
    case 'json-array': {
      const exec = isCommandInstruction(ref.instruction);
      const prefix = ref.instruction === 'HEALTHCHECK' ? 'HEALTHCHECK CMD' : ref.instruction;
      return finish(
        ref,
        '[ ]',
        exec
          ? {
              category: 'Exec form',
              short: ['Exec form: a JSON array that Docker runs directly, without a shell.'],
              details: [
                p(
                  'The first element is the program and the rest are its arguments. Strings need double quotes, and there’s no variable expansion, ',
                  code('&&'),
                  ' or redirection.',
                ),
              ],
              syntax: `${prefix} ["executable", "arg1", "arg2"]`,
              links: [
                { label: 'Shell and exec form', url: `${REFERENCE_URL}#shell-and-exec-form` },
              ],
            }
          : {
              category: 'JSON array',
              short: ['A JSON array of paths, which allows paths that contain spaces.'],
              details: [p('Each element is a double-quoted string.')],
              syntax: `${prefix} ["<path>", ...]`,
            },
        exec ? 'exec' : null,
      );
    }
    case 'line-continuation':
      return finish(
        ref,
        ref.escape,
        {
          category: 'Line continuation',
          short: ['Line continuation: joins this line with the next into a single instruction.'],
          details: [
            p(
              'The escape character is ',
              code('\\'),
              ' unless a ',
              code('# escape='),
              ' directive changes it. Comment lines between continued lines are dropped.',
            ),
            p('A continued ', code('RUN'), ' is still one step and one layer.'),
          ],
          links: [{ label: 'escape reference', url: `${REFERENCE_URL}#escape` }],
        },
        null,
      );
    case 'heredoc': {
      const delimiter = code(clip(ref.delimiter));
      const run = ref.instruction === 'RUN';
      return finish(
        ref,
        ref.delimiter,
        {
          category: 'Heredoc',
          short: run
            ? ['Heredoc: the lines up to ', delimiter, ' are a script, or input for the command.']
            : ['Heredoc: the lines up to ', delimiter, ' become the contents of a file.'],
          details: [
            run
              ? p(
                  'On its own (',
                  code('RUN <<EOF'),
                  '), the heredoc is run as a script. After a command, it becomes that command’s input.',
                )
              : p(
                  'The text between the marker and the line ',
                  delimiter,
                  ' is written to the destination as a file.',
                ),
          ],
          syntax: run
            ? 'RUN <<EOF\n<commands>\nEOF'
            : `${ref.instruction} <<EOF <dest>\n<contents>\nEOF`,
          links: [{ label: 'Here-documents', url: `${REFERENCE_URL}#here-documents` }],
        },
        run ? 'shell' : null,
      );
    }
  }
}
