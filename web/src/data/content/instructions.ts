import { REFERENCE_URL, register } from './registry';

const MULTI_STAGE = {
  label: 'Multi-stage builds',
  url: 'https://docs.docker.com/build/building/multi-stage/',
};

register({
  ref: { kind: 'instruction', instruction: 'FROM' },
  category: 'Instruction',
  title: 'FROM',
  short: 'Starts a new build stage from a base image.',
  details:
    'Every Dockerfile starts with `FROM`, optionally after parser directives and `ARG` instructions. Each `FROM` begins a new build stage with the given image as its base.\n\n' +
    'Add `AS <name>` to name the stage, so `COPY --from=<name>` and later `FROM <name>` lines can refer to it. Several stages make a multi-stage build: build in one, then copy only the results into a small final stage.',
  syntax: 'FROM [--platform=<platform>] <image>[:<tag>|@<digest>] [AS <name>]',
  links: [{ label: 'FROM reference', url: `${REFERENCE_URL}#from` }, MULTI_STAGE],
  related: [
    { kind: 'subkeyword', instruction: 'FROM', word: 'AS' },
    { kind: 'flag', instruction: 'COPY', flag: '--from' },
    { kind: 'flag', instruction: 'FROM', flag: '--platform' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'RUN' },
  category: 'Instruction',
  title: 'RUN',
  short: 'Runs a command while building the image and saves the result as a new layer.',
  details:
    '`RUN` executes its command on top of the image built so far, then saves the changed files as a new layer that later instructions build on.\n\n' +
    'Shell form (`RUN npm ci`) runs the command with the default shell, `/bin/sh -c` on Linux. Exec form (`RUN ["npm", "ci"]`) runs the program directly, without shell features such as `&&` or `$VARIABLE` expansion.\n\n' +
    'Chain related commands with `&&` and clean up in the same `RUN`: files deleted in a later layer still take up space in the earlier one.\n\n' +
    'Use `--mount` to give a step a cache, a secret or files from another stage without storing them in the image.',
  syntax: 'RUN [<options>] <command>\nRUN [<options>] ["<executable>", "<param>", ...]',
  links: [{ label: 'RUN reference', url: `${REFERENCE_URL}#run` }],
  related: [
    { kind: 'flag', instruction: 'RUN', flag: '--mount' },
    { kind: 'instruction', instruction: 'SHELL' },
    { kind: 'instruction', instruction: 'CMD' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'COPY' },
  category: 'Instruction',
  title: 'COPY',
  short: 'Copies files from the build context, another stage or an image into the image.',
  details:
    '`COPY <src>... <dest>` copies files and directories. Sources are relative to the build context, unless `--from` names a stage or image to copy from.\n\n' +
    'Prefer `COPY` over `ADD`: it only copies, so the result is predictable.\n\n' +
    'Copy dependency manifests such as `package.json` and install dependencies before copying the rest of the source, so code changes don’t invalidate the cached install layer.',
  syntax: 'COPY [<options>] <src>... <dest>\nCOPY [<options>] ["<src>", ... "<dest>"]',
  links: [{ label: 'COPY reference', url: `${REFERENCE_URL}#copy` }],
  related: [
    { kind: 'instruction', instruction: 'ADD' },
    { kind: 'flag', instruction: 'COPY', flag: '--from' },
    { kind: 'flag', instruction: 'COPY', flag: '--chown' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'ADD' },
  category: 'Instruction',
  title: 'ADD',
  short:
    'Copies files into the image, and can also download URLs, clone Git repositories and extract archives.',
  details:
    '`ADD` works like `COPY`, with extra behavior for some sources: a URL is downloaded, a Git repository URL is cloned, and a local tar archive (such as `app.tar.gz`) is extracted into the destination. Downloaded archives are not extracted.\n\n' +
    'Use `COPY` unless you need one of these features, because automatic extraction can surprise readers.\n\n' +
    'For downloads, add `--checksum` so a changed remote file fails the build instead of slipping in.',
  syntax: 'ADD [<options>] <src>... <dest>\nADD [<options>] ["<src>", ... "<dest>"]',
  links: [{ label: 'ADD reference', url: `${REFERENCE_URL}#add` }],
  related: [
    { kind: 'instruction', instruction: 'COPY' },
    { kind: 'flag', instruction: 'ADD', flag: '--checksum' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'WORKDIR' },
  category: 'Instruction',
  title: 'WORKDIR',
  short: 'Sets the working directory for the instructions that follow and for the container.',
  details:
    '`WORKDIR` sets the directory that later `RUN`, `CMD`, `ENTRYPOINT`, `COPY` and `ADD` instructions use, and creates it if it doesn’t exist.\n\n' +
    'A relative path is resolved against the previous `WORKDIR`, so prefer absolute paths.\n\n' +
    'Use `WORKDIR` instead of `RUN cd …`: a `cd` only lasts until the end of its `RUN`.',
  syntax: 'WORKDIR <path>',
  links: [{ label: 'WORKDIR reference', url: `${REFERENCE_URL}#workdir` }],
});

register({
  ref: { kind: 'instruction', instruction: 'ENV' },
  category: 'Instruction',
  title: 'ENV',
  short:
    'Sets environment variables for the rest of the build and for containers started from the image.',
  details:
    '`ENV <key>=<value>` sets a variable that later instructions can use, both in Docker’s own substitution (`$NAME` in `COPY`, `WORKDIR` and so on) and in the commands that `RUN` executes.\n\n' +
    'The value is stored in the image, so containers see it too; `docker run -e` can override it.\n\n' +
    'For values needed only while building, use `ARG`. Don’t put secrets in `ENV`, because anyone with the image can read them.',
  syntax: 'ENV <key>=<value> [<key>=<value>...]',
  links: [{ label: 'ENV reference', url: `${REFERENCE_URL}#env` }],
  related: [{ kind: 'instruction', instruction: 'ARG' }],
});

register({
  ref: { kind: 'instruction', instruction: 'ARG' },
  category: 'Instruction',
  title: 'ARG',
  short: 'Declares a build argument that can be set with `docker build --build-arg`.',
  details:
    '`ARG <name>[=<default>]` defines a variable for the build. Pass a value with `--build-arg <name>=<value>`; otherwise the default is used.\n\n' +
    'An `ARG` before the first `FROM` is global and can be used in `FROM` lines; to use it inside a stage, declare it again there without a value. An `ARG` inside a stage is available from its line to the end of that stage.\n\n' +
    'Build arguments aren’t kept as environment variables, but they can appear in the image history, so don’t use them for secrets: use `RUN --mount=type=secret` instead.',
  syntax: 'ARG <name>[=<default value>] [<name>[=<default value>]...]',
  links: [{ label: 'ARG reference', url: `${REFERENCE_URL}#arg` }],
  related: [
    { kind: 'instruction', instruction: 'ENV' },
    { kind: 'instruction', instruction: 'FROM' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'EXPOSE' },
  category: 'Instruction',
  title: 'EXPOSE',
  short: 'Documents which ports the container listens on.',
  details:
    '`EXPOSE <port>[/<protocol>]` records ports in the image metadata. The protocol defaults to `tcp`.\n\n' +
    'It doesn’t publish anything. Publish ports when you start the container, with `docker run -p` or `ports:` in Compose; `docker run -P` publishes every exposed port to a random host port.',
  syntax: 'EXPOSE <port>[/<protocol>] [<port>[/<protocol>]...]',
  links: [{ label: 'EXPOSE reference', url: `${REFERENCE_URL}#expose` }],
});

register({
  ref: { kind: 'instruction', instruction: 'CMD' },
  category: 'Instruction',
  title: 'CMD',
  short: 'Sets the default command that runs when a container starts.',
  details:
    '`CMD` provides the default command for containers started from the image. Arguments given to `docker run` after the image name replace it.\n\n' +
    'If the image also has an `ENTRYPOINT`, `CMD` supplies default arguments for it instead.\n\n' +
    'Use the exec form (`CMD ["node", "server.js"]`) so the program runs as the main process and receives stop signals. In shell form it runs under `/bin/sh -c`, which may not pass signals on.\n\n' +
    'Only the last `CMD` in a Dockerfile takes effect.',
  syntax: 'CMD ["<executable>", "<param>", ...]\nCMD ["<param>", ...]\nCMD <command> <param> ...',
  links: [{ label: 'CMD reference', url: `${REFERENCE_URL}#cmd` }],
  related: [
    { kind: 'instruction', instruction: 'ENTRYPOINT' },
    { kind: 'instruction', instruction: 'RUN' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'ENTRYPOINT' },
  category: 'Instruction',
  title: 'ENTRYPOINT',
  short: 'Sets the program that always runs when a container starts.',
  details:
    '`ENTRYPOINT` makes the container behave like an executable. Arguments to `docker run` are appended to it instead of replacing it, and `CMD` supplies default arguments.\n\n' +
    'Use the exec form so the program is the main process and receives stop signals. The shell form ignores both `CMD` and `docker run` arguments.\n\n' +
    'Override it when starting a container with `docker run --entrypoint`.',
  syntax: 'ENTRYPOINT ["<executable>", "<param>", ...]\nENTRYPOINT <command> <param> ...',
  links: [{ label: 'ENTRYPOINT reference', url: `${REFERENCE_URL}#entrypoint` }],
  related: [{ kind: 'instruction', instruction: 'CMD' }],
});

register({
  ref: { kind: 'instruction', instruction: 'HEALTHCHECK' },
  category: 'Instruction',
  title: 'HEALTHCHECK',
  short: 'Tells Docker how to check that the container is still working.',
  details:
    '`HEALTHCHECK CMD <command>` runs a command inside the container at an interval. Exit status `0` means healthy and `1` means unhealthy.\n\n' +
    'After `--retries` consecutive failures, the container’s status becomes `unhealthy`. Docker Compose (`condition: service_healthy`) and Docker Swarm act on this status.\n\n' +
    '`HEALTHCHECK NONE` turns off a check inherited from the base image. Only the last `HEALTHCHECK` takes effect.',
  syntax: 'HEALTHCHECK [<options>] CMD <command>\nHEALTHCHECK NONE',
  links: [{ label: 'HEALTHCHECK reference', url: `${REFERENCE_URL}#healthcheck` }],
  related: [
    { kind: 'subkeyword', instruction: 'HEALTHCHECK', word: 'CMD' },
    { kind: 'flag', instruction: 'HEALTHCHECK', flag: '--interval' },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'USER' },
  category: 'Instruction',
  title: 'USER',
  short: 'Sets the user (and optionally group) for later instructions and for the container.',
  details:
    '`USER <user>[:<group>]` sets who runs the `RUN`, `CMD` and `ENTRYPOINT` instructions that follow, and the default user for containers.\n\n' +
    'Containers run as `root` unless told otherwise. Switch to a non-root user so a compromised process has fewer privileges.\n\n' +
    'A user name must exist in the image, so create it first, for example with `adduser` in a `RUN` step; a numeric ID works without one.',
  syntax: 'USER <user>[:<group>]\nUSER <UID>[:<GID>]',
  links: [
    { label: 'USER reference', url: `${REFERENCE_URL}#user` },
    {
      label: 'Best practices: USER',
      url: 'https://docs.docker.com/build/building/best-practices/#user',
    },
  ],
  related: [{ kind: 'flag', instruction: 'COPY', flag: '--chown' }],
});

register({
  ref: { kind: 'instruction', instruction: 'VOLUME' },
  category: 'Instruction',
  title: 'VOLUME',
  short: 'Marks a directory as a mount point for data that should outlive the container.',
  details:
    '`VOLUME <path>` declares that the directory holds external data. If nothing is mounted there when a container starts, Docker creates an anonymous volume for it.\n\n' +
    'Choose where the data lives when you start the container, with a named volume or bind mount (`docker run -v`).',
  syntax: 'VOLUME <path> [<path>...]\nVOLUME ["<path>", ...]',
  links: [{ label: 'VOLUME reference', url: `${REFERENCE_URL}#volume` }],
});

register({
  ref: { kind: 'instruction', instruction: 'LABEL' },
  category: 'Instruction',
  title: 'LABEL',
  short: 'Adds key-value metadata to the image.',
  details:
    '`LABEL <key>=<value>` stores metadata that `docker inspect` and other tools can read. Labels from the base image are inherited.\n\n' +
    'Use the standard OCI keys where they fit, such as `org.opencontainers.image.source` and `org.opencontainers.image.version`.\n\n' +
    'Quote values that contain spaces: `LABEL description="My app"`.',
  syntax: 'LABEL <key>=<value> [<key>=<value>...]',
  links: [
    { label: 'LABEL reference', url: `${REFERENCE_URL}#label` },
    {
      label: 'OCI image annotations',
      url: 'https://github.com/opencontainers/image-spec/blob/main/annotations.md',
    },
  ],
});

register({
  ref: { kind: 'instruction', instruction: 'SHELL' },
  category: 'Instruction',
  title: 'SHELL',
  short: 'Changes the shell used by the shell form of `RUN`, `CMD` and `ENTRYPOINT`.',
  details:
    '`SHELL` takes a JSON array such as `["/bin/bash", "-c"]`. The default is `["/bin/sh", "-c"]` on Linux and `["cmd", "/S", "/C"]` on Windows.\n\n' +
    'It applies to the instructions after it and can appear more than once. It’s most useful on Windows, to switch between `cmd` and PowerShell.',
  syntax: 'SHELL ["<executable>", "<param>", ...]',
  links: [{ label: 'SHELL reference', url: `${REFERENCE_URL}#shell` }],
  related: [{ kind: 'instruction', instruction: 'RUN' }],
});

register({
  ref: { kind: 'instruction', instruction: 'STOPSIGNAL' },
  category: 'Instruction',
  title: 'STOPSIGNAL',
  short: 'Sets the signal that asks the container to stop.',
  details:
    '`docker stop` sends this signal to the container’s main process, waits for a grace period and then kills it. The default is `SIGTERM`.\n\n' +
    'Change it if your program shuts down cleanly on a different signal; the official nginx image, for example, uses `SIGQUIT`.',
  syntax: 'STOPSIGNAL <signal>',
  links: [{ label: 'STOPSIGNAL reference', url: `${REFERENCE_URL}#stopsignal` }],
});

register({
  ref: { kind: 'instruction', instruction: 'MAINTAINER' },
  category: 'Instruction',
  title: 'MAINTAINER',
  short: 'Sets the author field of the image.',
  details:
    '`MAINTAINER <name>` records who maintains the image.\n\n' +
    'A label does the same job, and any tool that reads labels can find it.',
  syntax: 'MAINTAINER <name>',
  links: [{ label: 'MAINTAINER reference', url: `${REFERENCE_URL}#maintainer-deprecated` }],
  related: [{ kind: 'instruction', instruction: 'LABEL' }],
  deprecated: {
    since: 'Docker 1.13',
    instead: '`LABEL org.opencontainers.image.authors="<name>"`',
  },
});

register({
  ref: { kind: 'instruction', instruction: 'ONBUILD' },
  category: 'Instruction',
  title: 'ONBUILD',
  short: 'Adds an instruction that runs later, when another build uses this image as its base.',
  details:
    '`ONBUILD <INSTRUCTION>` stores a trigger in the image. When another Dockerfile uses this image in its `FROM`, the triggers run right after that `FROM`.\n\n' +
    'It suits base images for a family of similar apps, for example to copy and build each app’s source in a standard way.\n\n' +
    '`ONBUILD` can’t wrap `ONBUILD`, `FROM` or `MAINTAINER`.',
  syntax: 'ONBUILD <INSTRUCTION>',
  links: [{ label: 'ONBUILD reference', url: `${REFERENCE_URL}#onbuild` }],
  related: [{ kind: 'instruction', instruction: 'FROM' }],
});
