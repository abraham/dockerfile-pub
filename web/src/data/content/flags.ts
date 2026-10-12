import { REFERENCE_URL, register } from './registry';

const HEALTHCHECK = { label: 'HEALTHCHECK reference', url: `${REFERENCE_URL}#healthcheck` };
const NEWER = 'This is a newer flag; the reference lists the `# syntax=` versions that support it.';

register({
  ref: { kind: 'flag', instruction: 'FROM', flag: '--platform' },
  title: '--platform',
  short: 'Picks which platform variant of a multi-platform image to use, such as `linux/amd64`.',
  details:
    'By default, `FROM` uses the variant for the platform you’re building for. `--platform` overrides that, for example to run build tools on the build machine’s own platform.\n\n' +
    'In multi-platform builds, use the predefined build arguments: `FROM --platform=$BUILDPLATFORM` runs the stage natively, and `$TARGETPLATFORM` names the platform being built for.',
  syntax: 'FROM --platform=<platform> <image> [AS <name>]',
  links: [
    { label: 'FROM reference', url: `${REFERENCE_URL}#from` },
    {
      label: 'Multi-platform builds',
      url: 'https://docs.docker.com/build/building/multi-platform/',
    },
  ],
});

register({
  ref: { kind: 'flag', instruction: 'RUN', flag: '--mount' },
  title: '--mount',
  short:
    'Mounts a cache, secret, SSH agent or files into this step without storing them in the image.',
  details:
    '- `type=bind` (the default): read-only files from the build context or another stage.\n' +
    '- `type=cache`: a directory kept between builds, such as a package manager’s cache.\n' +
    '- `type=secret`: a secret file or variable, available only during this step.\n' +
    '- `type=ssh`: access to the SSH agent, for example to clone private repositories.\n' +
    '- `type=tmpfs`: a temporary in-memory directory.\n\n' +
    'Nothing in a mount is saved into the layer, so a cache speeds up builds without making the image bigger.',
  syntax: 'RUN --mount=[type=<type>][,<option>=<value>...] <command>',
  links: [
    { label: 'RUN --mount reference', url: `${REFERENCE_URL}#run---mount` },
    {
      label: 'Cache mounts',
      url: 'https://docs.docker.com/build/cache/optimize/#use-cache-mounts',
    },
  ],
});

register({
  ref: { kind: 'flag', instruction: 'RUN', flag: '--network' },
  title: '--network',
  short: 'Controls network access for this `RUN` step.',
  details:
    '- `default`: the normal build network.\n' +
    '- `none`: no network access, so the step can only use files it already has.\n' +
    '- `host`: the build machine’s network; this needs the `network.host` entitlement.',
  syntax: 'RUN --network=<default|none|host> <command>',
  links: [{ label: 'RUN --network reference', url: `${REFERENCE_URL}#run---network` }],
});

register({
  ref: { kind: 'flag', instruction: 'RUN', flag: '--security' },
  title: '--security',
  short:
    'Runs this step without the build sandbox (`insecure`) or inside it (`sandbox`, the default).',
  details:
    'With `insecure`, the step runs with extra privileges, like `docker run --privileged`. It needs the `security.insecure` entitlement on both the builder and the build.\n\n' +
    'This flag is experimental: it’s only available in the labs channel, for example with `# syntax=docker/dockerfile:1-labs`.',
  syntax: 'RUN --security=<sandbox|insecure> <command>',
  links: [{ label: 'RUN --security reference', url: `${REFERENCE_URL}#run---security` }],
});

register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--from' },
  title: '--from',
  short: 'Copies from a build stage or another image instead of the build context.',
  details:
    'The value can be a stage name defined with `FROM … AS <name>`, a stage index, an image reference such as `nginx:latest`, or a named build context.\n\n' +
    'This is the core of multi-stage builds: compile in one stage, then copy only the results into a small final stage.',
  syntax: 'COPY --from=<stage|image|context> <src>... <dest>',
  links: [
    { label: 'COPY --from reference', url: `${REFERENCE_URL}#copy---from` },
    { label: 'Multi-stage builds', url: 'https://docs.docker.com/build/building/multi-stage/' },
  ],
  related: [{ kind: 'subkeyword', instruction: 'FROM', word: 'AS' }],
});

register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--chown' },
  appliesTo: ['COPY', 'ADD'],
  title: '--chown',
  short: 'Sets the owner of the copied files, without a separate `RUN chown`.',
  details:
    'Without it, copied files belong to `root` (user and group ID `0`). The user and group can be names or numeric IDs; names must exist in the image’s `/etc/passwd` and `/etc/group`.\n\n' +
    'Setting ownership while copying avoids a `RUN chown` step, which would store the files again in a new layer. It works only for Linux containers.',
  syntax: '--chown=<user>[:<group>]',
  links: [{ label: '--chown reference', url: `${REFERENCE_URL}#copy---chown---chmod` }],
  related: [{ kind: 'instruction', instruction: 'USER' }],
});

register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--chmod' },
  appliesTo: ['COPY', 'ADD'],
  title: '--chmod',
  short: 'Sets the permissions of the copied files, without a separate `RUN chmod`.',
  details:
    'The value is an octal mode such as `755`; newer Dockerfile frontends also accept symbolic modes such as `u+x`.\n\n' +
    'Setting permissions while copying avoids a `RUN chmod` step, which would store the files again in a new layer. It works only for Linux containers.',
  syntax: '--chmod=<perms>',
  links: [{ label: '--chmod reference', url: `${REFERENCE_URL}#copy---chown---chmod` }],
});

register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--link' },
  appliesTo: ['COPY', 'ADD'],
  title: '--link',
  short: 'Copies the files into an independent layer that doesn’t depend on the layers before it.',
  details:
    'With `--link`, the copied files form a layer of their own. When earlier layers change, BuildKit can reuse this layer instead of copying again, even on top of a new base image.\n\n' +
    'Use it when the copy doesn’t depend on files already in the image, such as existing symlinks in the destination path.',
  syntax: '--link[=<boolean>]',
  links: [{ label: '--link reference', url: `${REFERENCE_URL}#copy---link` }],
});

register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--parents' },
  title: '--parents',
  short: 'Keeps the source files’ parent directories when copying.',
  details:
    'Normally `COPY ./a/b/file.txt /app/` creates `/app/file.txt`. With `--parents` it creates `/app/a/b/file.txt`, which helps with wildcards that match files in several directories.\n\n' +
    NEWER,
  syntax: 'COPY --parents[=<boolean>] <src>... <dest>',
  links: [{ label: 'COPY --parents reference', url: `${REFERENCE_URL}#copy---parents` }],
});

register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--exclude' },
  appliesTo: ['COPY', 'ADD'],
  title: '--exclude',
  short: 'Leaves out source files that match a pattern.',
  details:
    'Patterns use the same syntax as `.dockerignore`, for example `--exclude=*.md`. Repeat the flag for several patterns. Unlike `.dockerignore`, it applies to this instruction only.\n\n' +
    NEWER,
  syntax: '--exclude=<path>',
  links: [{ label: '--exclude reference', url: `${REFERENCE_URL}#copy---exclude` }],
});

register({
  ref: { kind: 'flag', instruction: 'ADD', flag: '--keep-git-dir' },
  title: '--keep-git-dir',
  short: 'Keeps the `.git` directory when `ADD` clones a Git repository.',
  details:
    'By default, adding a Git repository copies its files but not its `.git` directory. Set `--keep-git-dir=true` when the build needs the history, for example to read version information.',
  syntax: 'ADD --keep-git-dir=<boolean> <git URL> <dir>',
  links: [{ label: 'ADD --keep-git-dir reference', url: `${REFERENCE_URL}#add---keep-git-dir` }],
});

register({
  ref: { kind: 'flag', instruction: 'ADD', flag: '--checksum' },
  title: '--checksum',
  short: 'Verifies the checksum of a remote file that `ADD` downloads.',
  details:
    'The value is a digest such as `sha256:…`. If the downloaded file doesn’t match, the build fails, so a changed or tampered file can’t slip into the image. It works with HTTP and HTTPS sources.',
  syntax: 'ADD --checksum=<hash> <URL> <dest>',
  links: [{ label: 'ADD --checksum reference', url: `${REFERENCE_URL}#add---checksum` }],
});

register({
  ref: { kind: 'flag', instruction: 'HEALTHCHECK', flag: '--interval' },
  title: '--interval',
  short: 'Sets how long to wait between health checks.',
  details:
    'The first check runs this long after the container starts, and each later check this long after the previous one finished. The default is `30s`.',
  syntax: 'HEALTHCHECK --interval=<duration> CMD <command>',
  links: [HEALTHCHECK],
});

register({
  ref: { kind: 'flag', instruction: 'HEALTHCHECK', flag: '--timeout' },
  title: '--timeout',
  short: 'Sets how long a single check may take before it counts as failed.',
  details:
    'A check that runs longer than this is stopped and counted as a failure. The default is `30s`.',
  syntax: 'HEALTHCHECK --timeout=<duration> CMD <command>',
  links: [HEALTHCHECK],
});

register({
  ref: { kind: 'flag', instruction: 'HEALTHCHECK', flag: '--start-period' },
  title: '--start-period',
  short: 'Gives the container time to start up before failed checks count.',
  details:
    'Failures during the start period don’t count toward `--retries`. Once a check succeeds, the container counts as started and later failures count as usual. The default is `0s`.',
  syntax: 'HEALTHCHECK --start-period=<duration> CMD <command>',
  links: [HEALTHCHECK],
});

register({
  ref: { kind: 'flag', instruction: 'HEALTHCHECK', flag: '--start-interval' },
  title: '--start-interval',
  short: 'Sets the time between checks during the start period.',
  details:
    'Checking more often while the container starts lets it become healthy sooner. The default is `5s`. It requires Docker Engine 25.0 or later.',
  syntax: 'HEALTHCHECK --start-interval=<duration> CMD <command>',
  links: [HEALTHCHECK],
});

register({
  ref: { kind: 'flag', instruction: 'HEALTHCHECK', flag: '--retries' },
  title: '--retries',
  short: 'Sets how many consecutive failed checks make the container unhealthy.',
  details:
    'The container starts in the `starting` state and becomes `healthy` after a check succeeds. This many failures in a row turn it `unhealthy`. The default is `3`.',
  syntax: 'HEALTHCHECK --retries=<number> CMD <command>',
  links: [HEALTHCHECK],
});
