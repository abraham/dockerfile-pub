import { REFERENCE_URL, register } from './registry';

register({
  ref: { kind: 'directive', directive: 'syntax' },
  category: 'Parser directive',
  title: 'syntax',
  short:
    'Selects the Dockerfile frontend, the syntax version that BuildKit uses to build this file.',
  details:
    'BuildKit pulls the named image and uses it to parse and build the Dockerfile. `docker/dockerfile:1` means the latest stable 1.x release.\n\n' +
    'Pinning only the major version gets you new features and fixes without breaking changes; a `-labs` tag adds experimental features.\n\n' +
    'Parser directives must come first in the file, before any instruction, comment or blank line.',
  syntax: '# syntax=<frontend image>',
  links: [
    { label: 'syntax reference', url: `${REFERENCE_URL}#syntax` },
    { label: 'Dockerfile frontend', url: 'https://docs.docker.com/build/buildkit/frontend/' },
  ],
});

register({
  ref: { kind: 'directive', directive: 'escape' },
  category: 'Parser directive',
  title: 'escape',
  short: 'Sets the character that escapes characters and continues lines in this Dockerfile.',
  details:
    'The default is `\\`; the only other allowed value is the backtick.\n\n' +
    'Windows Dockerfiles often switch to the backtick, because `\\` is the Windows path separator: with the default, a path such as `C:\\` at the end of a line would continue it.',
  syntax: '# escape=\\\n# escape=`',
  links: [{ label: 'escape reference', url: `${REFERENCE_URL}#escape` }],
});

register({
  ref: { kind: 'directive', directive: 'check' },
  category: 'Parser directive',
  title: 'check',
  short: 'Configures the build checks that BuildKit runs on this Dockerfile.',
  details:
    'Use `skip=<rules>` to turn off specific checks or `skip=all` to turn off every check, and `error=true` to make check warnings fail the build. Separate settings with `;`.\n\n' +
    'Checks catch common mistakes, such as using the shell form of `CMD` (`JSONArgsRecommended`).',
  syntax: '# check=skip=<rules|all>\n# check=error=<boolean>',
  links: [
    { label: 'check reference', url: `${REFERENCE_URL}#check` },
    { label: 'Build checks', url: 'https://docs.docker.com/build/checks/' },
  ],
});
