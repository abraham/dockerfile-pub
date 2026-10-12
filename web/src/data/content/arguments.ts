import type { ArgumentRef, Instruction } from '../tokenizer/types';
import { instructionLink } from './registry';
import { clip, code, list, p } from './rich-text';
import type { Block, Explanation, Inline, Link } from './schema';
import { knownVariable } from './variables';

interface Parts {
  short: Inline[];
  details: Block[];
  links?: Link[];
  related?: Explanation['related'];
  deprecated?: Explanation['deprecated'];
  generic?: true;
}

const OCI_KEYS = new Map<string, string>([
  ['created', 'when the image was built'],
  ['authors', 'who maintains the image'],
  ['url', 'where to find more information about the image'],
  ['documentation', 'where to find documentation'],
  ['source', 'where to find the source code'],
  ['version', 'the version of the packaged software'],
  ['revision', 'the source control revision'],
  ['vendor', 'who distributes the image'],
  ['licenses', 'the licenses, as an SPDX expression'],
  ['ref.name', 'the name of the image reference'],
  ['title', 'a human-readable title'],
  ['description', 'a human-readable description'],
  ['base.digest', 'the digest of the base image'],
  ['base.name', 'the reference of the base image'],
]);

const OCI_PREFIX = 'org.opencontainers.image.';
const OCI_LINK: Link = {
  label: 'OCI image annotations',
  url: 'https://github.com/opencontainers/image-spec/blob/main/annotations.md',
};

const SIGNALS = new Map<string, string>([
  ['SIGTERM', 'asks the process to shut down; this is the default'],
  ['SIGINT', 'interrupts the process, like pressing Ctrl+C'],
  ['SIGQUIT', 'asks the process to quit; nginx shuts down gracefully on it'],
  ['SIGKILL', 'kills the process at once, with no chance to clean up'],
  ['SIGHUP', 'hangs up; many daemons reload their configuration on it'],
  ['SIGUSR1', 'a user-defined signal; its meaning depends on the program'],
  ['SIGUSR2', 'a user-defined signal; its meaning depends on the program'],
  ['SIGWINCH', 'a window-size change; Apache httpd stops gracefully on it'],
]);

/** Splits `[registry/]repo[:tag][@digest]`, ignoring `:` inside `${…}` (EXP-37). */
export function parseImage(text: string): {
  registry: string | null;
  repository: string;
  tag: string | null;
  digest: string | null;
} {
  let rest = text;
  let digest: string | null = null;
  const at = rest.indexOf('@');
  if (at >= 0) {
    digest = rest.slice(at + 1);
    rest = rest.slice(0, at);
  }
  let tag: string | null = null;
  let depth = 0;
  const lastSlash = rest.lastIndexOf('/');
  for (let i = lastSlash + 1; i < rest.length; i++) {
    if (rest[i] === '{') depth++;
    else if (rest[i] === '}') depth--;
    else if (rest[i] === ':' && depth === 0) {
      tag = rest.slice(i + 1);
      rest = rest.slice(0, i);
      break;
    }
  }
  const slash = rest.indexOf('/');
  const first = slash > 0 ? rest.slice(0, slash) : '';
  const hasRegistry = /[.:]/.test(first) || first === 'localhost';
  return {
    registry: hasRegistry ? first : null,
    repository: hasRegistry ? rest.slice(slash + 1) : rest,
    tag,
    digest,
  };
}

function image(text: string): Parts {
  if (text.toLowerCase() === 'scratch') {
    return {
      short: [code('scratch'), ': an empty base image with no files.'],
      details: [
        p(
          'Start from ',
          code('scratch'),
          ' to build a minimal image that contains only what you copy into it, such as a static binary.',
        ),
      ],
    };
  }
  const { registry, repository, tag, digest } = parseImage(text);
  const pin = digest
    ? p('The digest pins the exact image, so every build uses the same one.')
    : p(
        'Pin a tag, and for full reproducibility a digest (',
        code('@sha256:…'),
        '): tags such as ',
        code('latest'),
        ' can move to newer images.',
      );
  if (!registry && !tag && !digest && !repository.includes('/')) {
    return {
      short: ['The base for this stage: ', code(clip(text)), ', an image or an earlier stage.'],
      details: [
        p(
          'If an earlier stage is named ',
          code(clip(text)),
          ' with ',
          code('AS'),
          ', this stage builds on it. Otherwise Docker pulls the image ',
          code(`${clip(text)}:latest`),
          ' from Docker Hub.',
        ),
        pin,
      ],
    };
  }
  const items: Inline[][] = [
    registry ? ['Registry: ', code(clip(registry))] : ['Registry: Docker Hub (the default)'],
    ['Repository: ', code(clip(repository))],
    tag ? ['Tag: ', code(clip(tag))] : ['Tag: none, so ', code('latest'), ' is used'],
  ];
  if (digest) items.push(['Digest: ', code(clip(digest))]);
  const details = [list(...items), pin];
  if (text.includes('$')) {
    details.push(p('Docker substitutes the variables before it pulls the image.'));
  }
  return {
    short: tag
      ? ['The base image ', code(clip(repository)), ', tag ', code(clip(tag)), '.']
      : ['The base image ', code(clip(repository)), '.'],
    details,
  };
}

function source(instruction: Instruction, text: string): Parts {
  const context = p(
    'Source paths are relative to the build context, or to the stage or image named by ',
    code('--from'),
    '. Files excluded by ',
    code('.dockerignore'),
    ' aren’t available.',
  );
  const isUrl = /^https?:\/\//i.test(text);
  const isGit = /^git@|\.git(#|$)/i.test(text);
  if (instruction === 'ADD' && (isUrl || isGit)) {
    return isGit
      ? {
          short: ['A Git repository that ', code('ADD'), ' clones into the destination.'],
          details: [
            p(
              'Docker clones the repository while building. Add ',
              code('#<ref>'),
              ' to pick a branch, tag or commit.',
            ),
          ],
        }
      : {
          short: ['A URL that ', code('ADD'), ' downloads while building.'],
          details: [
            p(
              'Docker downloads the file into the destination; downloaded archives aren’t extracted.',
            ),
            p('Add ', code('--checksum'), ' to make sure the file hasn’t changed.'),
          ],
        };
  }
  if (instruction === 'ADD' && /\.(tar|tar\.gz|tgz|tar\.bz2|tbz2?|tar\.xz|txz)$/i.test(text)) {
    return {
      short: ['A local archive that ', code('ADD'), ' extracts into the destination.'],
      details: [context, p('Use ', code('COPY'), ' instead to copy the archive file itself.')],
    };
  }
  if (text === '.') {
    return {
      short: ['The whole build context.'],
      details: [
        context,
        p('Copying everything early means any file change invalidates the cache from here on.'),
      ],
    };
  }
  if (/[*?[]/.test(text)) {
    return {
      short: ['A pattern matching files in the build context: ', code(clip(text)), '.'],
      details: [
        context,
        p(code('*'), ' matches any characters and ', code('?'), ' one character.'),
      ],
    };
  }
  return {
    short: ['A source path in the build context: ', code(clip(text)), '.'],
    details: [context],
  };
}

function destination(text: string): Parts {
  const absolute = /^([/\\]|[A-Za-z]:[/\\])/.test(text);
  const directory = /[/\\]$/.test(text) || text === '.';
  return {
    short:
      text === '.'
        ? ['The destination: the current working directory.']
        : [
            directory ? 'The destination directory ' : 'The destination path ',
            code(clip(text)),
            '.',
          ],
    details: [
      absolute
        ? p('An absolute path in the image.')
        : p('A relative path, resolved against the current ', code('WORKDIR'), '.'),
      p(
        'A trailing ',
        code('/'),
        ' makes it a directory. With several sources, the destination must be a directory.',
      ),
    ],
  };
}

function user(text: string): Parts {
  const [name, group] = text.split(':');
  const isRoot = name === 'root' || name === '0';
  const details = [
    /^\d+$/.test(name)
      ? p('A numeric user ID, which doesn’t need an entry in ', code('/etc/passwd'), '.')
      : p('A user name, which must already exist in the image.'),
  ];
  if (group) details.push(p('After the ', code(':'), ' comes the group, ', code(clip(group)), '.'));
  if (isRoot) {
    details.push(
      p(
        'This is the root user. Switch to a non-root user in the final stage, so a compromised process has fewer privileges.',
      ),
    );
  }
  return {
    short: group
      ? ['Runs as user ', code(clip(name)), ' and group ', code(clip(group)), '.']
      : ['Runs as user ', code(clip(name || text)), '.'],
    details,
  };
}

function port(text: string): Parts {
  const match = /^(\d+)(?:-(\d+))?(?:\/(tcp|udp|sctp))?$/i.exec(text);
  const publish = p(
    'Exposing only documents the port. Publish it when starting the container, with ',
    code('docker run -p <host port>:<container port>'),
    '.',
  );
  if (!match) return { short: ['The port ', code(clip(text)), '.'], details: [publish] };
  const [, from, to, protocol] = match;
  const proto = protocol ? protocol.toUpperCase() : 'TCP (the default)';
  return {
    short: to
      ? ['Ports ', code(from), ' to ', code(to), ' over ', proto, '.']
      : ['Port ', code(from), ' over ', proto, '.'],
    details: [publish],
  };
}

function key(instruction: Instruction, text: string): Parts {
  const name = code(clip(text));
  if (instruction === 'ENV') {
    return {
      short: [name, ': an environment variable, set for the rest of the build and in containers.'],
      details: [
        p(
          'Later instructions can use it as ',
          code(`$${clip(text)}`),
          ', and containers see it in their environment.',
        ),
      ],
    };
  }
  if (instruction === 'ARG') {
    const known = knownVariable(text);
    return {
      short: [name, ': a build argument, set with ', code(`--build-arg ${clip(text)}=…`), '.'],
      details: known
        ? [
            p(
              'Docker predefines it as ',
              ...known.meaning,
              '. Declaring it makes the value available in this stage.',
            ),
          ]
        : [
            p(
              'It’s available from this line to the end of the stage, and isn’t kept in the final image’s environment.',
            ),
          ],
    };
  }
  if (text.startsWith(OCI_PREFIX) && OCI_KEYS.has(text.slice(OCI_PREFIX.length))) {
    return {
      short: [
        name,
        ': the standard OCI label for ',
        OCI_KEYS.get(text.slice(OCI_PREFIX.length)) ?? '',
        '.',
      ],
      details: [
        p('Registries and tools recognize the OCI keys, so they can show this information.'),
      ],
      links: [instructionLink('LABEL'), OCI_LINK],
    };
  }
  return {
    short: [name, ': a label key, stored as image metadata.'],
    details: [
      p(
        'Use reverse-DNS names, such as ',
        code('com.example.team'),
        ', to avoid clashes with other labels.',
      ),
    ],
  };
}

function value(instruction: Instruction, text: string): Parts {
  const quoted = /^["']/.test(text);
  return {
    short: [instruction === 'ARG' ? 'The default value: ' : 'The value: ', code(clip(text)), '.'],
    details: [
      quoted
        ? p('Quotes keep spaces inside the value; Docker removes them.')
        : /\s/.test(text)
          ? p(
              'In the older ',
              code('ENV <key> <value>'),
              ' form, everything after the key is the value.',
            )
          : p('Quote the value if it contains spaces.'),
    ],
  };
}

function signal(text: string): Parts {
  const upper = text.toUpperCase();
  const name = upper.startsWith('SIG') ? upper : `SIG${upper}`;
  const meaning = SIGNALS.get(name);
  return {
    short: meaning
      ? [code(clip(text)), ': ', meaning, '.']
      : /^\d+$/.test(text)
        ? ['Signal number ', code(clip(text)), '.']
        : ['The signal ', code(clip(text)), '.'],
    details: [
      p(
        code('docker stop'),
        ' sends this signal to the main process, then kills it after a grace period.',
      ),
    ],
  };
}

function generic(instruction: Instruction): Parts {
  return {
    short: ['An argument to ', code(instruction), '.'],
    details: [p('See the ', code(instruction), ' reference for the arguments it accepts.')],
    generic: true,
  };
}

function parts(ref: ArgumentRef): Parts {
  const { instruction, role, text } = ref;
  switch (role) {
    case 'image':
      return image(text);
    case 'stage-name':
      return {
        short: ['Names this build stage ', code(clip(text)), '.'],
        details: [
          p(
            'Later instructions can use the name: ',
            code(`COPY --from=${clip(text)}`),
            ' copies files from this stage, and ',
            code(`FROM ${clip(text)}`),
            ' starts a new stage on top of it.',
          ),
        ],
        related: [
          { kind: 'subkeyword', instruction: 'FROM', word: 'AS' },
          { kind: 'flag', instruction: 'COPY', flag: '--from' },
        ],
      };
    case 'source':
      return source(instruction, text);
    case 'destination':
      return destination(text);
    case 'path':
      return instruction === 'VOLUME'
        ? {
            short: ['Declares ', code(clip(text)), ' as a mount point for a volume.'],
            details: [
              p(
                'If nothing is mounted there, Docker creates an anonymous volume when the container starts.',
              ),
            ],
          }
        : {
            short: ['The working directory: ', code(clip(text)), '.'],
            details: [
              /^([/\\]|[A-Za-z]:[/\\])/.test(text)
                ? p('Docker creates the directory if it doesn’t exist.')
                : p('A relative path is resolved against the previous ', code('WORKDIR'), '.'),
            ],
          };
    case 'user':
      return user(text);
    case 'port':
      return port(text);
    case 'key':
      return key(instruction, text);
    case 'value':
      return value(instruction, text);
    case 'signal':
      return signal(text);
    case 'name':
      return {
        short: ['The image’s author: ', clip(text), '.'],
        details: [p('Readers and tools find this information in labels instead.')],
        deprecated: {
          since: 'Docker 1.13',
          instead: [code('LABEL org.opencontainers.image.authors="…"')],
        },
      };
    case 'word':
      return generic(instruction);
  }
}

/** Generates the explanation for an instruction argument (§6.1). */
export function explainArgument(ref: ArgumentRef): Explanation {
  const result = parts(ref);
  const explanation: Explanation = {
    category: `${ref.instruction} argument`,
    title: clip(ref.text, 60) || ref.instruction,
    short: result.short,
    details: result.details,
    links: result.links ?? [instructionLink(ref.instruction)],
  };
  if (result.related) explanation.related = result.related;
  if (result.deprecated) explanation.deprecated = result.deprecated;
  if (result.generic) explanation.generic = true;
  return explanation;
}
