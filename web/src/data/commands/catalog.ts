import type { Link } from '../content/schema';

export interface OptionInfo {
  /** ≤ 80 characters, in authoring markup (CMDX-9). */
  summary: string;
  /** Present if the option takes a value; describes it. */
  value?: string;
}

export interface SubcommandInfo {
  summary: string;
  options?: ReadonlyMap<string, OptionInfo>;
  argumentsHint?: string;
  tips?: readonly string[];
}

export interface CommandInfo {
  name: string;
  aliases?: readonly string[];
  summary: string;
  details?: string;
  docs: Link;
  options?: ReadonlyMap<string, OptionInfo>;
  subcommands?: ReadonlyMap<string, SubcommandInfo>;
  argumentsHint?: string;
  tips?: readonly string[];
}

type OptionSource = [name: string, summary: string, value?: string];

function options(...entries: OptionSource[]): ReadonlyMap<string, OptionInfo> {
  return new Map(
    entries.map(([name, summary, value]) => [name, value ? { summary, value } : { summary }]),
  );
}

function man(page: string, section = 1): Link {
  return {
    label: `${page}(${section}) manual`,
    url: `https://man7.org/linux/man-pages/man${section}/${page}.${section}.html`,
  };
}

const POSIX_SHELL: Link = {
  label: 'POSIX shell command language',
  url: 'https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html',
};

const SHELL_OPTIONS: OptionSource[] = [
  ['-c', 'run the next argument as a command string', 'the command string'],
  ['-e', 'exit as soon as a command fails'],
  ['-x', 'print each command before running it'],
];

const COMMANDS: CommandInfo[] = [
  {
    name: 'npm',
    summary: 'the Node.js package manager',
    docs: { label: 'npm CLI documentation', url: 'https://docs.npmjs.com/cli/commands/npm' },
    options: options([
      '--omit',
      'skip installing dependencies of this type',
      'dependency type: `dev`, `optional` or `peer`',
    ]),
    subcommands: new Map<string, SubcommandInfo>([
      [
        'install',
        {
          summary: 'install the dependencies listed in `package.json`',
          argumentsHint: 'packages to add; none means everything in `package.json`',
          tips: ['Prefer `npm ci` in images: it installs exactly what `package-lock.json` lists.'],
        },
      ],
      [
        'ci',
        {
          summary: 'clean install that exactly matches `package-lock.json`',
          tips: [
            'Copy `package.json` and `package-lock.json` before the source, so this layer stays cached until dependencies change.',
          ],
        },
      ],
      [
        'run',
        {
          summary: 'run a script defined in `package.json`',
          argumentsHint: 'the name of a script in `package.json`',
        },
      ],
    ]),
  },
  {
    name: 'node',
    summary: 'the Node.js runtime',
    docs: { label: 'Node.js command-line options', url: 'https://nodejs.org/api/cli.html' },
    argumentsHint: 'the script to run, then arguments for it',
    tips: [
      'Started directly in exec form, `node` is the main process and receives stop signals; handle `SIGTERM` to shut down cleanly.',
    ],
  },
  {
    name: 'nginx',
    summary: 'web server and reverse proxy',
    docs: {
      label: 'nginx command-line parameters',
      url: 'https://nginx.org/en/docs/switches.html',
    },
    options: options(
      ['-g', 'set global configuration directives', 'configuration directives, e.g. `daemon off;`'],
      ['-c', 'use this configuration file', 'file path'],
    ),
    tips: [
      '`daemon off;` keeps nginx in the foreground, which a container needs: it stops as soon as its main process exits.',
    ],
  },
  {
    name: 'wget',
    summary: 'download files over HTTP, HTTPS or FTP',
    details: 'Alpine images include the BusyBox `wget`, which supports these common options.',
    docs: { label: 'GNU Wget manual', url: 'https://www.gnu.org/software/wget/manual/wget.html' },
    options: options(
      ['-q', 'turn off progress output'],
      ['-O', 'write the download to this file', 'file name; `-` means standard output'],
    ),
    argumentsHint: 'the URL to download',
  },
  {
    name: 'exit',
    summary: 'end the shell with an exit status',
    docs: POSIX_SHELL,
    argumentsHint: 'the exit status (`0` means success, anything else failure)',
    tips: [
      'In a `HEALTHCHECK`, `|| exit 1` turns any failure into status `1`, which means unhealthy.',
    ],
  },
  {
    name: 'addgroup',
    summary: 'create a group (BusyBox, as in Alpine images)',
    docs: { label: 'BusyBox commands', url: 'https://busybox.net/downloads/BusyBox.html' },
    options: options(
      ['-S', 'create a system group'],
      ['-g', 'set the group ID', 'numeric group ID'],
    ),
    argumentsHint: 'the name of the group to create',
  },
  {
    name: 'adduser',
    summary: 'create a user (BusyBox, as in Alpine images)',
    docs: { label: 'BusyBox commands', url: 'https://busybox.net/downloads/BusyBox.html' },
    options: options(
      ['-S', 'create a system user'],
      ['-G', 'add the user to this group', 'group name'],
      ['-D', 'don’t assign a password'],
      ['-H', 'don’t create a home directory'],
      ['-u', 'set the user ID', 'numeric user ID'],
      ['-h', 'set the home directory', 'directory'],
      ['-s', 'set the login shell', 'shell path'],
    ),
    argumentsHint: 'the name of the user to create',
    tips: ['Switch to this user with `USER`, so the container doesn’t run as root.'],
  },
  {
    name: 'apt-get',
    summary: 'the Debian and Ubuntu package manager',
    docs: {
      label: 'apt-get manual',
      url: 'https://manpages.debian.org/stable/apt/apt-get.8.en.html',
    },
    options: options(
      ['-y', 'answer yes to every prompt'],
      ['-q', 'quieter output'],
      ['--no-install-recommends', 'install only required dependencies'],
    ),
    subcommands: new Map<string, SubcommandInfo>([
      [
        'update',
        {
          summary: 'download the latest package lists',
          tips: [
            'Run `apt-get update` in the same `RUN` as `apt-get install`, so the package lists are never stale in a cached layer.',
          ],
        },
      ],
      [
        'install',
        {
          summary: 'install packages',
          argumentsHint: 'package names',
          tips: [
            'End the same `RUN` with `rm -rf /var/lib/apt/lists/*` to keep the package lists out of the image.',
          ],
        },
      ],
      ['upgrade', { summary: 'upgrade the installed packages' }],
      ['remove', { summary: 'remove packages', argumentsHint: 'package names' }],
      ['clean', { summary: 'delete downloaded package files' }],
    ]),
  },
  {
    name: 'apk',
    summary: 'the Alpine Linux package manager',
    docs: {
      label: 'Alpine Package Keeper',
      url: 'https://wiki.alpinelinux.org/wiki/Alpine_Package_Keeper',
    },
    subcommands: new Map<string, SubcommandInfo>([
      [
        'add',
        {
          summary: 'install packages',
          options: options(
            ['--no-cache', 'don’t keep the package index in the image'],
            [
              '--virtual',
              'group the packages under a name, to remove them together later',
              'group name',
            ],
          ),
          argumentsHint: 'package names',
          tips: ['Use `--no-cache` so the package index doesn’t stay in the layer.'],
        },
      ],
      [
        'del',
        { summary: 'remove packages', argumentsHint: 'package names or a `--virtual` group' },
      ],
      ['update', { summary: 'refresh the package index' }],
    ]),
  },
  {
    name: 'dnf',
    aliases: ['yum'],
    summary: 'the Fedora and Red Hat package manager',
    docs: {
      label: 'DNF command reference',
      url: 'https://dnf.readthedocs.io/en/latest/command_ref.html',
    },
    options: options(['-y', 'answer yes to every prompt']),
    subcommands: new Map<string, SubcommandInfo>([
      [
        'install',
        {
          summary: 'install packages',
          argumentsHint: 'package names',
          tips: [
            'Run `dnf clean all` in the same `RUN` to keep the package cache out of the image.',
          ],
        },
      ],
      ['clean', { summary: 'delete cached data', argumentsHint: '`all` removes every cache' }],
    ]),
  },
  {
    name: 'pip',
    aliases: ['pip3'],
    summary: 'the Python package installer',
    docs: { label: 'pip documentation', url: 'https://pip.pypa.io/en/stable/cli/' },
    subcommands: new Map<string, SubcommandInfo>([
      [
        'install',
        {
          summary: 'install Python packages',
          options: options(
            ['--no-cache-dir', 'don’t keep downloaded packages in a cache'],
            ['-r', 'install the packages listed in a requirements file', 'file name'],
            ['-U', 'upgrade packages that are already installed'],
            ['--upgrade', 'upgrade packages that are already installed'],
          ),
          argumentsHint: 'package names',
          tips: ['`--no-cache-dir` keeps pip’s download cache out of the image.'],
        },
      ],
    ]),
  },
  {
    name: 'curl',
    summary: 'transfer data from or to a URL',
    docs: { label: 'curl manual', url: 'https://curl.se/docs/manpage.html' },
    options: options(
      ['-f', 'fail on HTTP errors instead of saving the error page'],
      ['-s', 'silent: no progress meter or error messages'],
      ['-S', 'show errors even with `-s`'],
      ['-L', 'follow redirects'],
      ['-o', 'write the output to this file', 'file name'],
      ['-O', 'save to a file named like the remote file'],
    ),
    argumentsHint: 'the URL',
    tips: ['Use `-fsSL`, so a failed download fails the build instead of saving an error page.'],
  },
  {
    name: 'tar',
    summary: 'create or extract archives',
    docs: { label: 'GNU tar manual', url: 'https://www.gnu.org/software/tar/manual/tar.html' },
    options: options(
      ['-x', 'extract files'],
      ['-c', 'create an archive'],
      ['-z', 'filter through gzip'],
      ['-J', 'filter through xz'],
      ['-v', 'list files as they’re processed'],
      ['-f', 'use this archive file', 'archive file; `-` means standard input or output'],
      ['-C', 'change to this directory first', 'directory'],
    ),
    argumentsHint: 'files to add or extract',
  },
  {
    name: 'rm',
    summary: 'remove files or directories',
    docs: man('rm'),
    options: options(
      ['-r', 'remove directories and their contents'],
      ['-R', 'remove directories and their contents'],
      ['-f', 'ignore missing files and never prompt'],
    ),
    argumentsHint: 'files or directories to remove',
    tips: [
      'Delete temporary files in the same `RUN` that created them; deleting them later doesn’t shrink the image.',
    ],
  },
  {
    name: 'mkdir',
    summary: 'create directories',
    docs: man('mkdir'),
    options: options(['-p', 'create parent directories as needed, with no error if it exists']),
    argumentsHint: 'directories to create',
  },
  {
    name: 'chown',
    summary: 'change the owner of files',
    docs: man('chown'),
    options: options(['-R', 'change files and directories recursively']),
    argumentsHint: 'the owner as `user[:group]`, then files',
    tips: [
      '`COPY --chown` sets ownership while copying, without storing the files again in a new layer.',
    ],
  },
  {
    name: 'chmod',
    summary: 'change file permissions',
    docs: man('chmod'),
    options: options(['-R', 'change files and directories recursively']),
    argumentsHint: 'the mode, such as `+x` or `755`, then files',
  },
  {
    name: 'cp',
    summary: 'copy files',
    docs: man('cp'),
    options: options(
      ['-r', 'copy directories recursively'],
      ['-R', 'copy directories recursively'],
      ['-a', 'copy recursively, keeping permissions and timestamps'],
    ),
    argumentsHint: 'sources, then the destination',
  },
  {
    name: 'mv',
    summary: 'move or rename files',
    docs: man('mv'),
    argumentsHint: 'sources, then the destination',
  },
  {
    name: 'ln',
    summary: 'create links between files',
    docs: man('ln'),
    options: options(['-s', 'create a symbolic link'], ['-f', 'replace an existing destination']),
    argumentsHint: 'the target, then the link name',
  },
  {
    name: 'cd',
    summary: 'change the current directory',
    docs: POSIX_SHELL,
    argumentsHint: 'the directory',
    tips: [
      'The change ends with this `RUN`; use `WORKDIR` to set the directory for later instructions.',
    ],
  },
  {
    name: 'echo',
    summary: 'print its arguments',
    docs: man('echo'),
    argumentsHint: 'the text to print',
  },
  {
    name: 'set',
    summary: 'set shell options',
    docs: POSIX_SHELL,
    options: options(
      ['-e', 'exit as soon as a command fails'],
      ['-u', 'treat unset variables as an error'],
      ['-x', 'print each command before running it'],
      ['-o', 'set an option by name', 'option name, such as `pipefail`'],
    ),
    tips: [
      '`set -eux` at the start of a long script stops at the first failure and logs each command.',
    ],
  },
  {
    name: 'sh',
    summary: 'the POSIX shell',
    docs: man('sh', 1),
    options: options(...SHELL_OPTIONS),
  },
  {
    name: 'bash',
    summary: 'the Bash shell',
    docs: { label: 'Bash manual', url: 'https://www.gnu.org/software/bash/manual/bash.html' },
    options: options(...SHELL_OPTIONS),
  },
  {
    name: 'git',
    summary: 'the Git version control system',
    docs: { label: 'Git documentation', url: 'https://git-scm.com/docs' },
    subcommands: new Map<string, SubcommandInfo>([
      [
        'clone',
        {
          summary: 'copy a repository',
          options: options(
            ['--depth', 'copy only the most recent history', 'number of commits'],
            ['-b', 'check out this branch or tag', 'branch or tag name'],
          ),
          argumentsHint: 'the repository URL, then an optional directory',
        },
      ],
      ['checkout', { summary: 'switch to a branch, tag or commit' }],
    ]),
  },
  {
    name: 'make',
    summary: 'build the targets defined in a Makefile',
    docs: { label: 'GNU make manual', url: 'https://www.gnu.org/software/make/manual/make.html' },
    options: options(
      ['-j', 'run this many jobs at once', 'number of jobs'],
      ['-C', 'change to this directory first', 'directory'],
    ),
    argumentsHint: 'the targets to build',
  },
  {
    name: 'go',
    summary: 'the Go toolchain',
    docs: { label: 'go command documentation', url: 'https://pkg.go.dev/cmd/go' },
    subcommands: new Map<string, SubcommandInfo>([
      [
        'build',
        {
          summary: 'compile packages',
          options: options(['-o', 'write the result to this file', 'output file']),
          argumentsHint: 'the packages to build',
        },
      ],
      [
        'mod',
        { summary: 'manage modules', argumentsHint: '`download` fetches the modules in `go.mod`' },
      ],
      ['test', { summary: 'run tests' }],
    ]),
  },
  {
    name: 'python',
    aliases: ['python3'],
    summary: 'the Python interpreter',
    docs: { label: 'Python command line', url: 'https://docs.python.org/3/using/cmdline.html' },
    options: options(
      ['-m', 'run a library module as a script', 'module name'],
      ['-u', 'unbuffered output, so logs appear at once'],
      ['-c', 'run this string as a program', 'program text'],
    ),
    argumentsHint: 'the script to run, then arguments for it',
  },
  {
    name: 'useradd',
    summary: 'create a user (shadow-utils, as in Debian and Red Hat images)',
    docs: man('useradd', 8),
    options: options(
      ['-r', 'create a system account'],
      ['-m', 'create the home directory'],
      ['-u', 'set the user ID', 'numeric user ID'],
      ['-g', 'set the primary group', 'group name or ID'],
      ['-s', 'set the login shell', 'shell path'],
    ),
    argumentsHint: 'the name of the user to create',
  },
  {
    name: 'groupadd',
    summary: 'create a group (shadow-utils, as in Debian and Red Hat images)',
    docs: man('groupadd', 8),
    options: options(
      ['-r', 'create a system group'],
      ['-g', 'set the group ID', 'numeric group ID'],
    ),
    argumentsHint: 'the name of the group to create',
  },
  {
    name: 'test',
    aliases: ['['],
    summary: 'check a condition; exit status `0` means true',
    docs: {
      label: 'test (POSIX)',
      url: 'https://pubs.opengroup.org/onlinepubs/9699919799/utilities/test.html',
    },
    options: options(
      ['-f', 'true if the path is a regular file'],
      ['-d', 'true if the path is a directory'],
      ['-e', 'true if the path exists'],
      ['-z', 'true if the string is empty'],
      ['-n', 'true if the string isn’t empty'],
    ),
    argumentsHint: 'the expression to test; `[` also needs a closing `]`',
  },
];

/** The catalog, keyed by canonical name, with aliases beside it (CMDX-11). */
export const CATALOG: ReadonlyMap<string, CommandInfo> = new Map(COMMANDS.map((c) => [c.name, c]));

const ALIASES: ReadonlyMap<string, string> = new Map(
  COMMANDS.flatMap((c) => (c.aliases ?? []).map((alias): [string, string] => [alias, c.name])),
);

/** Normalizes a command word: basename, no leading `\`, aliases resolved (CMDX-5). */
export function normalizeCommand(word: string): string {
  const base = word.slice(word.lastIndexOf('/') + 1).replace(/^\\/, '');
  return ALIASES.get(base) ?? base;
}

export function lookupCommand(name: string): CommandInfo | null {
  return CATALOG.get(name) ?? null;
}
