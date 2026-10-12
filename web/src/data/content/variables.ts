import type { VariableRef } from '../tokenizer/types';
import { REFERENCE_URL, instructionLink } from './registry';
import { clip, code, p, parseInline } from './rich-text';
import type { Block, Explanation, Inline, Link } from './schema';

type Group = 'platform' | 'proxy' | 'environment' | 'special';

/** Known variables and their meanings, in authoring markup (EXP-39). */
const KNOWN = new Map<string, [Group, string]>([
  ['TARGETPLATFORM', ['platform', 'the platform being built for, such as `linux/amd64`']],
  ['TARGETOS', ['platform', 'the operating system being built for, such as `linux`']],
  ['TARGETARCH', ['platform', 'the CPU architecture being built for, such as `amd64` or `arm64`']],
  ['TARGETVARIANT', ['platform', 'the architecture variant being built for, such as `v7`']],
  ['BUILDPLATFORM', ['platform', 'the platform of the machine running the build']],
  ['BUILDOS', ['platform', 'the operating system of the machine running the build']],
  ['BUILDARCH', ['platform', 'the CPU architecture of the machine running the build']],
  ['BUILDVARIANT', ['platform', 'the architecture variant of the machine running the build']],
  ['HTTP_PROXY', ['proxy', 'the proxy server for HTTP requests']],
  ['HTTPS_PROXY', ['proxy', 'the proxy server for HTTPS requests']],
  ['FTP_PROXY', ['proxy', 'the proxy server for FTP requests']],
  ['NO_PROXY', ['proxy', 'the hosts that bypass the proxy']],
  ['ALL_PROXY', ['proxy', 'the proxy server for every protocol']],
  ['PATH', ['environment', 'the directories searched for commands']],
  ['HOME', ['environment', 'the current user’s home directory']],
  [
    'NODE_ENV',
    ['environment', 'the Node.js environment; `production` turns off development-only behavior'],
  ],
  [
    'DEBIAN_FRONTEND',
    ['environment', 'how Debian package tools ask questions; `noninteractive` skips prompts'],
  ],
  ['?', ['special', 'the exit status of the last command']],
  ['0', ['special', 'the name of the shell or script']],
  ['@', ['special', 'all positional parameters, as separate words']],
  ['*', ['special', 'all positional parameters, joined into one word when quoted']],
  ['#', ['special', 'the number of positional parameters']],
  ['$', ['special', 'the process ID of the shell']],
  ['!', ['special', 'the process ID of the last background command']],
  ['-', ['special', 'the shell’s current option flags']],
]);

/** Looks up a known variable; proxy names match in either case (EXP-39). */
export function knownVariable(name: string): { group: Group; meaning: Inline[] } | null {
  const upper = name.toUpperCase();
  let entry = KNOWN.get(name);
  if (!entry && upper.endsWith('_PROXY')) {
    const proxy = KNOWN.get(upper);
    if (proxy?.[0] === 'proxy') entry = proxy;
  }
  if (!entry && /^[1-9]$/.test(name)) entry = ['special', `positional parameter ${name}`];
  return entry ? { group: entry[0], meaning: parseInline(entry[1]) } : null;
}

const CATEGORY: Record<Group, string> = {
  platform: 'Build argument',
  proxy: 'Build argument',
  environment: 'Environment variable',
  special: 'Shell parameter',
};

/** Explains `${NAME:-default}` and the other modifiers (EXP-38). */
function modifier(ref: VariableRef): Block | null {
  const { text, name } = ref;
  if (!text.startsWith('${')) return null;
  const inner = text.slice(2, text.endsWith('}') ? -1 : undefined);
  const nameCode = code(name);
  if (inner.startsWith('#') && inner.length > 1) {
    return p(code(clip(text)), ' is the length of ', nameCode, '’s value.');
  }
  const rest = inner.slice(inner.indexOf(name) + name.length);
  const match = /^(:?[-+?]|##?|%%?)(.*)$/s.exec(rest);
  if (!match) return null;
  const [, op, word] = match;
  const value = code(clip(word || '""'));
  const empty = op.startsWith(':') ? ' or empty' : '';
  switch (op.replace(':', '')) {
    case '-':
      return p('Uses ', value, ' if ', nameCode, ' is unset', empty, '.');
    case '+':
      return p(
        'Uses ',
        value,
        ' if ',
        nameCode,
        ' is set',
        empty ? ' and not empty' : '',
        ', and nothing otherwise.',
      );
    case '?':
      return p('Stops with an error if ', nameCode, ' is unset', empty, '.');
    case '#':
    case '##':
      return p(
        'Removes the ',
        op === '#' ? 'shortest' : 'longest',
        ' prefix matching ',
        value,
        ' from the value.',
      );
    default:
      return p(
        'Removes the ',
        op === '%' ? 'shortest' : 'longest',
        ' suffix matching ',
        value,
        ' from the value.',
      );
  }
}

/** Generates the explanation for a `$NAME` or `${…}` reference (§6.2). */
export function explainVariable(ref: VariableRef): Explanation {
  const known = knownVariable(ref.name);
  const text = code(clip(ref.text));
  const docker = ref.expandedBy === 'docker';
  const short: Inline[] = known
    ? [text, ': ', ...known.meaning, '.']
    : [
        text,
        ' is replaced by the value of ',
        code(clip(ref.name)),
        docker ? ' while building.' : ' when the command runs.',
      ];

  const details: Block[] = [
    docker
      ? ref.instruction === 'FROM'
        ? p(
            'Docker substitutes this while building, using an ',
            code('ARG'),
            ' declared before the first ',
            code('FROM'),
            ' (a global build argument).',
          )
        : p(
            'Docker substitutes this while building, using an ',
            code('ARG'),
            ' or ',
            code('ENV'),
            ' defined earlier in this stage.',
          )
      : p(
          'The shell expands this when the command runs, using the container’s environment: ',
          code('ENV'),
          ' values plus anything set earlier in the same command. ',
          code('ARG'),
          ' values are visible during ',
          code('RUN'),
          ' only.',
        ),
  ];
  const extra = modifier(ref);
  if (extra) details.push(extra);
  if (known?.group === 'platform') {
    details.push(
      p(
        'Docker sets this automatically. Inside a stage, declare it with ',
        code(`ARG ${ref.name}`),
        ' to use it.',
      ),
    );
  }

  const links: Link[] = docker
    ? [{ label: 'Environment replacement', url: `${REFERENCE_URL}#environment-replacement` }]
    : [instructionLink(ref.instruction)];
  if (known?.group === 'platform') {
    links.push({
      label: 'Platform build arguments',
      url: `${REFERENCE_URL}#automatic-platform-args-in-the-global-scope`,
    });
  } else if (known?.group === 'proxy') {
    links.push({ label: 'Predefined build arguments', url: `${REFERENCE_URL}#predefined-args` });
  } else if (!docker) {
    links.push({
      label: 'POSIX shell parameters',
      url: 'https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html',
    });
  }

  return {
    category: known ? CATEGORY[known.group] : docker ? 'Variable' : 'Shell variable',
    title: clip(ref.text, 60),
    short,
    details,
    links,
  };
}
