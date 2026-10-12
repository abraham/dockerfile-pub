import { REFERENCE_URL, register } from './registry';

register({
  ref: { kind: 'subkeyword', instruction: 'FROM', word: 'AS' },
  category: 'FROM keyword',
  title: 'AS',
  short: 'Names this build stage so later instructions can refer to it.',
  details:
    '`AS <name>` gives the stage a name. Use it in `COPY --from=<name>`, in `RUN --mount=from=<name>` and as the image of a later `FROM <name>`.\n\n' +
    'Without a name, a stage can only be referred to by its index, starting from `0`; names are clearer and survive reordering.\n\n' +
    'Build up to this stage only with `docker build --target <name>`.',
  syntax: 'FROM <image> AS <name>',
  links: [
    { label: 'FROM reference', url: `${REFERENCE_URL}#from` },
    { label: 'Multi-stage builds', url: 'https://docs.docker.com/build/building/multi-stage/' },
  ],
  related: [{ kind: 'flag', instruction: 'COPY', flag: '--from' }],
});

register({
  ref: { kind: 'subkeyword', instruction: 'HEALTHCHECK', word: 'CMD' },
  category: 'HEALTHCHECK keyword',
  title: 'CMD',
  short: 'Introduces the command that checks the container’s health.',
  details:
    'The command after `CMD` runs inside the container. Exit status `0` means healthy and `1` unhealthy; don’t use other values, because `2` is reserved.\n\n' +
    'It can be in shell form or exec form, like the `CMD` instruction, but it’s a separate setting: it doesn’t change the container’s main command.',
  syntax: 'HEALTHCHECK [<options>] CMD <command>',
  links: [{ label: 'HEALTHCHECK reference', url: `${REFERENCE_URL}#healthcheck` }],
  related: [{ kind: 'instruction', instruction: 'HEALTHCHECK' }],
});

register({
  ref: { kind: 'subkeyword', instruction: 'HEALTHCHECK', word: 'NONE' },
  category: 'HEALTHCHECK keyword',
  title: 'NONE',
  short: 'Turns off any health check inherited from the base image.',
  details:
    '`HEALTHCHECK NONE` removes the check, so containers from this image report no health status.',
  syntax: 'HEALTHCHECK NONE',
  links: [{ label: 'HEALTHCHECK reference', url: `${REFERENCE_URL}#healthcheck` }],
  related: [{ kind: 'instruction', instruction: 'HEALTHCHECK' }],
});
