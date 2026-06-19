/**
 * Explanation content store.
 * Maps instruction keywords and flag names to rich explanation objects.
 */

/**
 * @typedef {Object} Link
 * @property {string} label
 * @property {string} url
 */

/**
 * @typedef {Object} Explanation
 * @property {string} title       - Display title
 * @property {string} short       - One-sentence summary
 * @property {string} details     - Longer explanation (plain text, newlines for paragraphs)
 * @property {string} [syntax]    - Syntax snippet
 * @property {Link[]} links       - Related documentation links
 */

/** @type {Record<string, Explanation>} */
const EXPLANATIONS = {
  // ─── Instruction keywords ────────────────────────────────────────────────

  FROM: {
    title: 'FROM',
    short: 'Sets the base image for subsequent build instructions.',
    details:
      'Every Dockerfile must start with FROM (or ARG before FROM). It initializes a new build ' +
      'stage and sets the base image.\n\n' +
      'Use the AS keyword to name the stage for use in later COPY --from= instructions. You can ' +
      'have multiple FROM instructions in a single Dockerfile for multi-stage builds.',
    syntax: 'FROM [--platform=<platform>] <image>[:<tag>] [AS <name>]',
    links: [
      { label: 'FROM reference', url: 'https://docs.docker.com/reference/dockerfile/#from' },
      {
        label: 'Multi-stage builds',
        url: 'https://docs.docker.com/build/building/multi-stage/',
      },
    ],
  },

  RUN: {
    title: 'RUN',
    short: 'Executes a shell command in a new image layer.',
    details:
      'RUN executes commands during the image build. Each RUN creates a new layer. To keep ' +
      'images small, chain related commands with && and clean up in the same layer.\n\n' +
      'Use the --mount flag (BuildKit) to mount caches or secrets without writing them into the ' +
      'image layer.',
    syntax: 'RUN [--mount=<options>] <command>\nRUN ["executable", "param1", "param2"]',
    links: [
      { label: 'RUN reference', url: 'https://docs.docker.com/reference/dockerfile/#run' },
      {
        label: 'RUN --mount',
        url: 'https://docs.docker.com/reference/dockerfile/#run---mount',
      },
    ],
  },

  COPY: {
    title: 'COPY',
    short: 'Copies files or directories from the build context (or another stage) into the image.',
    details:
      'COPY is the preferred way to add files into an image. Unlike ADD it has no special ' +
      'behaviour for archives or URLs — what you see is what you get.\n\n' +
      'Use --from=<stage> to copy artifacts from an earlier build stage (multi-stage builds). ' +
      'Use --chown or --chmod to control file ownership.',
    syntax: 'COPY [--from=<stage>] [--chown=<user>:<group>] <src>... <dest>',
    links: [
      { label: 'COPY reference', url: 'https://docs.docker.com/reference/dockerfile/#copy' },
    ],
  },

  ADD: {
    title: 'ADD',
    short: 'Copies files, directories, URLs, or auto-extracts archives into the image.',
    details:
      'ADD is a superset of COPY. It can fetch remote URLs and automatically extract compressed ' +
      'archives (.tar, .gz, etc.). Prefer COPY when you do not need those features to keep your ' +
      'Dockerfile transparent and predictable.',
    syntax: 'ADD [--chown=<user>:<group>] <src>... <dest>',
    links: [
      { label: 'ADD reference', url: 'https://docs.docker.com/reference/dockerfile/#add' },
    ],
  },

  WORKDIR: {
    title: 'WORKDIR',
    short: 'Sets the working directory for all subsequent instructions.',
    details:
      'WORKDIR creates the directory if it does not exist and sets it as the current working ' +
      'directory for RUN, CMD, ENTRYPOINT, COPY, and ADD instructions that follow.\n\n' +
      'Prefer absolute paths over relative ones. You can use WORKDIR multiple times in a ' +
      'Dockerfile; each call is relative to the previous.',
    syntax: 'WORKDIR /path/to/workdir',
    links: [
      { label: 'WORKDIR reference', url: 'https://docs.docker.com/reference/dockerfile/#workdir' },
    ],
  },

  ENV: {
    title: 'ENV',
    short: 'Sets an environment variable that persists in the running container.',
    details:
      'ENV sets environment variables that are available both during the build and in the ' +
      'running container. Variables set with ENV persist when a container is run from the ' +
      'resulting image.\n\n' +
      'For build-time-only variables use ARG instead. Note that ENV variables can be ' +
      'overridden at runtime with docker run -e.',
    syntax: 'ENV <key>=<value> ...',
    links: [
      { label: 'ENV reference', url: 'https://docs.docker.com/reference/dockerfile/#env' },
    ],
  },

  ARG: {
    title: 'ARG',
    short: 'Defines a build-time variable that can be passed via --build-arg.',
    details:
      'ARG declares a variable that users can set at build time with docker build --build-arg ' +
      'KEY=value. Unlike ENV, ARG values do not persist in the final image.\n\n' +
      'You can place an ARG before FROM to parameterise the base image tag. ARG values are ' +
      'available from the line where they are declared through the end of the build stage.',
    syntax: 'ARG <name>[=<default value>]',
    links: [
      { label: 'ARG reference', url: 'https://docs.docker.com/reference/dockerfile/#arg' },
    ],
  },

  EXPOSE: {
    title: 'EXPOSE',
    short: 'Documents the port(s) the container listens on at runtime.',
    details:
      'EXPOSE is documentation only — it does not actually publish the port. To publish, use ' +
      'docker run -p or the ports key in Docker Compose.\n\n' +
      'However, EXPOSE is valuable metadata: tools like Docker Compose and orchestrators use it ' +
      'to determine which ports to forward.',
    syntax: 'EXPOSE <port>[/<protocol>] ...',
    links: [
      { label: 'EXPOSE reference', url: 'https://docs.docker.com/reference/dockerfile/#expose' },
    ],
  },

  CMD: {
    title: 'CMD',
    short: 'Provides the default command to run when a container starts.',
    details:
      'CMD sets the default command (and its arguments) to execute when a container starts. ' +
      'If docker run is given a command, CMD is ignored.\n\n' +
      'Prefer the exec form (JSON array) over the shell form to avoid shell signal handling ' +
      'issues. When used with ENTRYPOINT, CMD provides default arguments to the entrypoint.',
    syntax: 'CMD ["executable","param1","param2"]\nCMD command param1 param2',
    links: [
      { label: 'CMD reference', url: 'https://docs.docker.com/reference/dockerfile/#cmd' },
    ],
  },

  ENTRYPOINT: {
    title: 'ENTRYPOINT',
    short: 'Configures a container to run as an executable.',
    details:
      'ENTRYPOINT sets the main process of the container. Unlike CMD, it is not replaced by a ' +
      'docker run command argument — those arguments are appended instead.\n\n' +
      'Combine with CMD to provide sensible defaults that can be overridden. Use the exec form ' +
      '(JSON array) to ensure proper signal forwarding.',
    syntax: 'ENTRYPOINT ["executable", "param1"]\nENTRYPOINT command param1',
    links: [
      {
        label: 'ENTRYPOINT reference',
        url: 'https://docs.docker.com/reference/dockerfile/#entrypoint',
      },
    ],
  },

  HEALTHCHECK: {
    title: 'HEALTHCHECK',
    short: 'Tells Docker how to test whether the container is healthy.',
    details:
      'HEALTHCHECK periodically runs a command inside the container. If it exits with status 0 ' +
      'the container is healthy; status 1 means unhealthy.\n\n' +
      'Docker and orchestrators (Kubernetes, ECS) use this to decide whether to route traffic ' +
      'to the container. Configure the interval, timeout, and number of retries with flags.',
    syntax:
      'HEALTHCHECK [--interval=<duration>] [--timeout=<duration>] \\\n' +
      '            [--retries=<n>] CMD <command>',
    links: [
      {
        label: 'HEALTHCHECK reference',
        url: 'https://docs.docker.com/reference/dockerfile/#healthcheck',
      },
    ],
  },

  USER: {
    title: 'USER',
    short: 'Sets the user (and optionally group) for subsequent instructions and the container.',
    details:
      'By default containers run as root. USER switches to a non-root user to reduce the blast ' +
      'radius of a container compromise.\n\n' +
      'Create the user with RUN adduser or useradd first. USER affects RUN, CMD, and ENTRYPOINT ' +
      'instructions that follow it in the Dockerfile.',
    syntax: 'USER <user>[:<group>]',
    links: [
      { label: 'USER reference', url: 'https://docs.docker.com/reference/dockerfile/#user' },
      {
        label: 'Docker security best practices',
        url: 'https://docs.docker.com/build/building/best-practices/#user',
      },
    ],
  },

  VOLUME: {
    title: 'VOLUME',
    short: 'Creates a mount point for external persistent storage.',
    details:
      'VOLUME declares a mount point. When a container is run without an explicit -v binding, ' +
      'Docker creates an anonymous volume at the specified path.\n\n' +
      'Data written to VOLUME directories persists beyond the container lifecycle. Useful for ' +
      'databases and other stateful workloads.',
    syntax: 'VOLUME ["/data"]',
    links: [
      { label: 'VOLUME reference', url: 'https://docs.docker.com/reference/dockerfile/#volume' },
    ],
  },

  LABEL: {
    title: 'LABEL',
    short: 'Attaches key-value metadata to the image.',
    details:
      'LABEL adds arbitrary metadata to an image. Labels are visible in docker inspect and can ' +
      'be used for automation, auditing, and tooling.\n\n' +
      'Common labels follow the OCI annotation spec: org.opencontainers.image.source, ' +
      'org.opencontainers.image.version, etc.',
    syntax: 'LABEL <key>=<value> ...',
    links: [
      { label: 'LABEL reference', url: 'https://docs.docker.com/reference/dockerfile/#label' },
      {
        label: 'OCI image annotations',
        url: 'https://github.com/opencontainers/image-spec/blob/main/annotations.md',
      },
    ],
  },

  SHELL: {
    title: 'SHELL',
    short: 'Overrides the default shell used by the shell form of RUN, CMD, and ENTRYPOINT.',
    details:
      'By default the shell form uses /bin/sh -c on Linux and cmd /S /C on Windows. SHELL lets ' +
      'you change this — for example to use bash, zsh, or PowerShell.',
    syntax: 'SHELL ["executable", "parameters"]',
    links: [
      { label: 'SHELL reference', url: 'https://docs.docker.com/reference/dockerfile/#shell' },
    ],
  },

  STOPSIGNAL: {
    title: 'STOPSIGNAL',
    short: 'Sets the system signal sent to the container to initiate a graceful shutdown.',
    details:
      'STOPSIGNAL sets the signal Docker sends to the container process when docker stop is ' +
      'called. The default is SIGTERM. Change this if your process handles a different signal.',
    syntax: 'STOPSIGNAL <signal>',
    links: [
      {
        label: 'STOPSIGNAL reference',
        url: 'https://docs.docker.com/reference/dockerfile/#stopsignal',
      },
    ],
  },

  MAINTAINER: {
    title: 'MAINTAINER',
    short: 'Sets the author of the image. (Deprecated — use LABEL instead.)',
    details:
      'MAINTAINER is deprecated since Docker 1.13. Use a LABEL instruction instead:\n\n' +
      'LABEL maintainer="Your Name <you@example.com>"',
    syntax: 'MAINTAINER <name>',
    links: [
      {
        label: 'MAINTAINER reference',
        url: 'https://docs.docker.com/reference/dockerfile/#maintainer-deprecated',
      },
    ],
  },

  ONBUILD: {
    title: 'ONBUILD',
    short: 'Adds a trigger instruction executed when this image is used as a base.',
    details:
      'ONBUILD registers instructions that run later, when the image is used as the base in ' +
      'another Dockerfile. Useful for creating reusable base images that need to copy ' +
      'application code at the point of downstream use.',
    syntax: 'ONBUILD <INSTRUCTION>',
    links: [
      { label: 'ONBUILD reference', url: 'https://docs.docker.com/reference/dockerfile/#onbuild' },
    ],
  },

  // ─── Flags ───────────────────────────────────────────────────────────────

  '--mount': {
    title: '--mount',
    short: 'Mounts a filesystem into the build container without adding it to the image.',
    details:
      'Available in RUN instructions with BuildKit enabled. Supports several mount types:\n\n' +
      'type=cache — mounts a persistent cache directory, speeding up repeated builds.\n' +
      'type=secret — exposes a secret (e.g. credentials) without embedding it in a layer.\n' +
      'type=ssh — forwards an SSH agent socket.\n' +
      'type=bind — mounts from the build context (default).',
    syntax: 'RUN --mount=type=cache,target=/root/.npm npm ci',
    links: [
      {
        label: 'RUN --mount reference',
        url: 'https://docs.docker.com/reference/dockerfile/#run---mount',
      },
      {
        label: 'BuildKit cache mounts',
        url: 'https://docs.docker.com/build/cache/optimize/#use-cache-mounts',
      },
    ],
  },

  '--from': {
    title: '--from',
    short: 'Specifies the source stage or image to copy from in a multi-stage build.',
    details:
      'Used with COPY to pull files from a named build stage (defined with FROM … AS <name>) ' +
      'or from an external image.\n\n' +
      'This is the key technique in multi-stage builds: build in one stage, copy only what you ' +
      'need into the final slim image.',
    syntax: 'COPY --from=builder /app/dist ./dist',
    links: [
      {
        label: 'Multi-stage builds',
        url: 'https://docs.docker.com/build/building/multi-stage/',
      },
      {
        label: 'COPY --from',
        url: 'https://docs.docker.com/reference/dockerfile/#copy---from',
      },
    ],
  },

  '--platform': {
    title: '--platform',
    short: 'Sets the target platform for a FROM instruction in a multi-platform build.',
    details:
      'Allows pulling a specific platform variant of a multi-arch image, regardless of the ' +
      "builder's native platform. Useful for cross-compilation or CI matrix builds.",
    syntax: 'FROM --platform=linux/amd64 node:18',
    links: [
      {
        label: 'Multi-platform builds',
        url: 'https://docs.docker.com/build/building/multi-platform/',
      },
    ],
  },

  '--chown': {
    title: '--chown',
    short: 'Sets the ownership of copied files without a separate RUN chown command.',
    details:
      'Pass --chown=<user>:<group> to COPY or ADD to set file ownership in one step, keeping ' +
      'the layer count (and image size) low compared to a separate RUN chown.',
    syntax: 'COPY --chown=appuser:appgroup ./app /app',
    links: [
      {
        label: 'COPY --chown',
        url: 'https://docs.docker.com/reference/dockerfile/#copy---chown---chmod',
      },
    ],
  },

  '--chmod': {
    title: '--chmod',
    short: 'Sets file permissions for copied files (BuildKit only).',
    details:
      'Available on COPY and ADD with BuildKit. Equivalent to running chmod after copying but ' +
      'without creating an extra layer. Accepts octal or symbolic permission notation.',
    syntax: 'COPY --chmod=755 ./entrypoint.sh /usr/local/bin/',
    links: [
      {
        label: 'COPY --chmod',
        url: 'https://docs.docker.com/reference/dockerfile/#copy---chown---chmod',
      },
    ],
  },

  '--interval': {
    title: '--interval',
    short: 'Sets how often the HEALTHCHECK command is run.',
    details:
      'Accepts a duration string such as 30s, 1m30s. The health check runs this often after ' +
      "the previous check completes. Default is 30s.",
    syntax: 'HEALTHCHECK --interval=30s CMD wget -qO- http://localhost/ || exit 1',
    links: [
      {
        label: 'HEALTHCHECK reference',
        url: 'https://docs.docker.com/reference/dockerfile/#healthcheck',
      },
    ],
  },

  '--timeout': {
    title: '--timeout',
    short: 'Maximum time allowed for a single HEALTHCHECK run.',
    details:
      'If the health check command takes longer than this duration it is considered failed. ' +
      'Accepts a duration string (e.g. 5s). Default is 30s.',
    syntax: 'HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost/ || exit 1',
    links: [
      {
        label: 'HEALTHCHECK reference',
        url: 'https://docs.docker.com/reference/dockerfile/#healthcheck',
      },
    ],
  },

  '--retries': {
    title: '--retries',
    short: 'Number of consecutive failures before the container is marked unhealthy.',
    details:
      'The container starts in a "starting" state; after the first successful check it becomes ' +
      '"healthy". It takes <retries> consecutive failures to transition to "unhealthy". ' +
      'Default is 3.',
    syntax: 'HEALTHCHECK --retries=3 CMD curl -f http://localhost/ || exit 1',
    links: [
      {
        label: 'HEALTHCHECK reference',
        url: 'https://docs.docker.com/reference/dockerfile/#healthcheck',
      },
    ],
  },

  '--start-period': {
    title: '--start-period',
    short: 'Grace period for container initialisation before health checks count.',
    details:
      'During the start period, failures are not counted towards the retries limit. This gives ' +
      'slow-starting applications time to come up before health check failures are counted.',
    syntax: 'HEALTHCHECK --start-period=10s CMD curl -f http://localhost/ || exit 1',
    links: [
      {
        label: 'HEALTHCHECK reference',
        url: 'https://docs.docker.com/reference/dockerfile/#healthcheck',
      },
    ],
  },
};

/**
 * Look up an explanation by its key.
 * @param {string|null} key
 * @returns {Explanation|null}
 */
export function getExplanation(key) {
  if (!key) return null;
  return EXPLANATIONS[key] ?? null;
}
