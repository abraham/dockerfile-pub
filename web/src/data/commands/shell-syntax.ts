import { clip, code, p } from '../content/rich-text';
import type { Block, Inline } from '../content/schema';

export interface SyntaxEntry {
  short: Inline[];
  details: Block[];
  syntax?: string;
}

function side(command: string | null, fallback: string): Inline {
  return command ? code(clip(command)) : fallback;
}

/** Control operators, naming the commands on each side (§7.6, CMDX-18). */
export function operator(op: string, before: string | null, after: string | null): SyntaxEntry {
  const b = side(before, 'the previous command');
  const a = side(after, 'the next command');
  switch (op) {
    case '&&':
      return {
        short: ['Runs ', a, ' only if ', b, ' succeeds.'],
        details: [
          p(
            'Chaining with ',
            code('&&'),
            ' keeps related steps in one layer and stops at the first failure.',
          ),
        ],
        syntax: '<command> && <command>',
      };
    case '||':
      return {
        short: ['Runs ', a, ' only if ', b, ' fails.'],
        details: [
          p(
            'Often used for a fallback, or to set an explicit exit status (',
            code('|| exit 1'),
            ').',
          ),
        ],
        syntax: '<command> || <command>',
      };
    case ';':
      return {
        short: ['Runs ', a, ' after ', b, ', even if it failed.'],
        details: [
          p(
            'Unless ',
            code('set -e'),
            ' is in effect, a failure before ',
            code(';'),
            ' doesn’t fail the step.',
          ),
        ],
        syntax: '<command>; <command>',
      };
    case '|':
      return {
        short: ['Sends the output of ', b, ' into ', a, '.'],
        details: [
          p(
            'In ',
            code('/bin/sh'),
            ', a pipeline’s exit status is that of its last command, so a failure in ',
            b,
            ' can go unnoticed.',
          ),
        ],
        syntax: '<command> | <command>',
      };
    case '&':
      return {
        short: ['Starts ', b, ' in the background.'],
        details: [p('Background processes don’t outlive the step that started them.')],
        syntax: '<command> &',
      };
    case '(':
    case ')':
      return {
        short: ['Runs the enclosed commands in a subshell.'],
        details: [
          p(
            'Changes inside, such as ',
            code('cd'),
            ' or variable assignments, don’t affect the commands after it.',
          ),
        ],
        syntax: '( <commands> )',
      };
    case ';;':
      return {
        short: ['Ends the commands for one ', code('case'), ' pattern.'],
        details: [p('The shell then continues after ', code('esac'), '.')],
        syntax: 'case <word> in <pattern>) <commands> ;; esac',
      };
    default:
      return {
        short: ['A shell operator.'],
        details: [p('It controls how the commands around it run.')],
      };
  }
}

/** Redirections such as `>`, `2>&1` and `<<<` (§7.7). */
export function redirection(text: string, command: string | null): SyntaxEntry {
  const cmd = side(command, 'the command');
  const [, fd, op] = /^(\d*)(.*)$/s.exec(text) ?? ['', '', text];
  const stream = fd === '' ? null : fd;
  const details = [p('Redirections change where a command reads its input or writes its output.')];
  const entry = (short: Inline[], syntax?: string): SyntaxEntry => ({ short, details, syntax });

  if (op.startsWith('>&') || op.startsWith('<&')) {
    const target = op.slice(2);
    if (target === '-')
      return entry(['Closes stream ', stream ?? (op[0] === '>' ? '1' : '0'), ' of ', cmd, '.']);
    if (stream === '2' && target === '1') {
      return entry(
        ['Sends the errors of ', cmd, ' to the same place as its normal output.'],
        '<command> 2>&1',
      );
    }
    if ((stream ?? '1') === '1' && target === '2') {
      return entry(['Sends the normal output of ', cmd, ' to the error stream.'], '<command> >&2');
    }
    return entry(['Sends stream ', stream ?? '1', ' of ', cmd, ' to stream ', target || 'N', '.']);
  }
  switch (op) {
    case '>':
    case '>>': {
      const verb = op === '>' ? 'Writes' : 'Appends';
      const end = op === '>' ? ' to a file, replacing it.' : ' to a file.';
      if (stream === null || stream === '1')
        return entry([verb, ' the output of ', cmd, end], `<command> ${op} <file>`);
      if (stream === '2')
        return entry([verb, ' the errors of ', cmd, end], `<command> 2${op} <file>`);
      return entry([verb, ' stream ', stream, ' of ', cmd, end]);
    }
    case '>|':
      return entry(['Writes to a file even if the shell’s ', code('noclobber'), ' option is set.']);
    case '<':
      return entry(['Feeds a file to ', cmd, ' as its input.'], '<command> < <file>');
    case '<<<':
      return entry(['Feeds the following word to ', cmd, ' as its input.']);
    case '<<':
    case '<<-':
      return entry([
        'Starts a shell here-document: the lines that follow are the input of ',
        cmd,
        '.',
      ]);
    case '&>':
    case '&>>':
      return entry(['Writes both the output and the errors of ', cmd, ' to a file (Bash only).']);
    case '<>':
      return entry(['Opens a file for reading and writing as the input of ', cmd, '.']);
    default:
      return entry(['Redirects the input or output of ', cmd, '.']);
  }
}

/** The target of a redirection (§7.7). */
export function redirectTarget(text: string): SyntaxEntry {
  return text === '/dev/null'
    ? {
        short: ['Discards whatever is redirected here.'],
        details: [p(code('/dev/null'), ' accepts any output and throws it away.')],
      }
    : {
        short: ['The file ', code(clip(text)), ' that the redirection reads from or writes to.'],
        details: [p('Redirections change where a command reads its input or writes its output.')],
      };
}

/** Reserved words: one sentence and a minimal example each (§7.8). */
export const RESERVED: ReadonlyMap<string, [short: string, syntax: string]> = new Map([
  [
    'if',
    [
      '`if`: runs the commands after `then` if a condition succeeds.',
      'if <condition>; then <commands>; fi',
    ],
  ],
  [
    'then',
    [
      '`then`: starts the commands that run when the `if` condition succeeds.',
      'if <condition>; then <commands>; fi',
    ],
  ],
  [
    'elif',
    [
      '`elif`: checks another condition when the earlier ones failed.',
      'if <a>; then <x>; elif <b>; then <y>; fi',
    ],
  ],
  [
    'else',
    [
      '`else`: starts the commands that run when every condition failed.',
      'if <condition>; then <x>; else <y>; fi',
    ],
  ],
  ['fi', ['`fi`: ends an `if` block.', 'if <condition>; then <commands>; fi']],
  [
    'for',
    [
      '`for`: repeats commands once for each word in a list.',
      'for <name> in <words>; do <commands>; done',
    ],
  ],
  [
    'in',
    [
      '`in`: introduces the words of a `for` loop or the patterns of a `case`.',
      'for <name> in <words>; do <commands>; done',
    ],
  ],
  ['do', ['`do`: starts the commands in a loop’s body.', 'while <condition>; do <commands>; done']],
  ['done', ['`done`: ends a loop.', 'for <name> in <words>; do <commands>; done']],
  [
    'while',
    [
      '`while`: repeats commands as long as a condition succeeds.',
      'while <condition>; do <commands>; done',
    ],
  ],
  [
    'until',
    [
      '`until`: repeats commands until a condition succeeds.',
      'until <condition>; do <commands>; done',
    ],
  ],
  [
    'case',
    [
      '`case`: runs the commands for the first pattern that matches a word.',
      'case <word> in <pattern>) <commands>;; esac',
    ],
  ],
  ['esac', ['`esac`: ends a `case` block.', 'case <word> in <pattern>) <commands>;; esac']],
  ['{', ['`{`: starts a group of commands that runs in the current shell.', '{ <commands>; }']],
  ['}', ['`}`: ends a group of commands.', '{ <commands>; }']],
  ['!', ['`!`: inverts the exit status of the command that follows.', '! <command>']],
]);

/** Substitution delimiters (§7.9). */
export function substitution(text: string): SyntaxEntry {
  return text === '$((' || text === '))'
    ? {
        short: ['Arithmetic expansion: calculates the enclosed expression.'],
        details: [p('The result replaces the whole ', code('$((…))'), ' expression.')],
        syntax: '$(( <expression> ))',
      }
    : {
        short: ['Command substitution: runs the enclosed command and inserts its output.'],
        details: [
          p(
            'The output replaces the whole ',
            code('$(…)'),
            ' expression, with trailing newlines removed.',
          ),
        ],
        syntax: '$( <command> )',
      };
}
