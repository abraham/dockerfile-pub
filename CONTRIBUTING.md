# Contributing to dockerfile-pub

Thank you for your interest in contributing! This document explains how to add new Dockerfile examples, extend the explanation content, and submit pull requests.

## Development setup

```bash
cd web
npm install
npm run dev     # start dev server at http://localhost:5173/
npm run test:run  # run the unit/UI test suite once
npm test          # watch mode
npm run test:features  # run end-to-end feature tests (requires dev server)
npm run lint      # ESLint, Stylelint and markdownlint
npm run format    # Prettier over the whole repo
npm run typecheck # type-check JSDoc types
npm run build     # production bundle in web/dist/
npm run size      # bundle-size budget (after build)
```

## Adding a new Dockerfile example

1. Open `web/src/data/examples.js`.
2. Add a new entry to the `EXAMPLES` object. The key becomes the URL-safe identifier.

   ```js
   // web/src/data/examples.js
   export const EXAMPLES = {
     // …existing entries…
     myExample: {
       label: 'My Example', // shown in the toggle button
       description: 'Short description of the use case', // shown below the toggler
       content: `FROM ubuntu:22.04
   RUN apt-get update && apt-get install -y curl
   CMD ["bash"]`,
     },
   };
   ```

3. The toggle button and viewer will pick up the new entry automatically — no component changes needed.
4. Add a test that exercises at least one unique instruction from your example if the existing test suite does not cover it.

## Adding or updating an explanation

Explanations live in `web/src/data/explanations.js`. Each entry maps a **Dockerfile instruction keyword** or a **flag name** to an object:

```js
KEYWORD_OR_FLAG: {
  title: 'KEYWORD',          // displayed in the panel heading
  short: 'One-sentence summary shown as a tooltip on hover.',
  details:
    'First paragraph.\n\n' +
    'Second paragraph (separate with \\n\\n).',
  syntax: 'KEYWORD <arg> [<optional>]',  // shown in a monospace block
  links: [
    { label: 'Official docs', url: 'https://docs.docker.com/reference/dockerfile/#keyword' },
  ],
},
```

Guidelines:

- Keep `short` to one sentence (≤ 120 characters). It doubles as the button `title` attribute.
- Use `\n\n` to separate paragraphs in `details`.
- Always include at least one link to the official Docker documentation.
- Flag keys must match the flag name **without** its value: `--mount` (not `--mount=type=cache`).

## Tokenizer

The tokenizer in `web/src/data/tokenizer.js` converts Dockerfile text into `Line` and `Token` objects. If you encounter a valid Dockerfile construct that is not tokenised correctly:

1. Add a failing test in `web/src/__tests__/tokenizer.test.js` that describes the expected output.
2. Fix `tokenizeLine` or `tokenizeArgs` in `tokenizer.js`.
3. Verify all existing tests still pass: `npm run test:run`.

## Pull request checklist

- [ ] `npm run lint` passes with no warnings
- [ ] `npm run format:check` passes (run `npm run format` to fix)
- [ ] `npm run typecheck` passes
- [ ] `npm run test:run` passes (all tests green)
- [ ] `npm run test:features` passes (requires a running dev server)
- [ ] `npm run build` succeeds and `npm run size` is within budget
- [ ] New functionality has accompanying tests
- [ ] New explanations link to official Docker documentation
- [ ] Commit messages are concise and in the imperative mood

## Code style

- **Formatting** — Prettier is configured in the root `.prettierrc` and formats everything except generated files (`.prettierignore`), including Markdown, YAML and `.feature` files. Run `npm run format` from `web/` to auto-format.
- **Linting** — `npm run lint` runs ESLint on all JS in `web/` (with `eslint-plugin-react` and `eslint-plugin-react-hooks`; no `react/prop-types` requirement, since this is a Preact project), Stylelint on CSS and markdownlint on every Markdown file. CI also runs `actionlint` on the workflows (run `actionlint` locally from the repo root if you have it).
- **CSS** — CSS Modules for component styles; global design tokens in `web/src/styles/global.css`.
- **No new dependencies** unless strictly necessary. The bundle must stay small.

## Accessibility

All interactive elements must:

- Be reachable via keyboard (Tab / Shift+Tab)
- Have a meaningful `aria-label` or accessible name
- Support Escape to dismiss (for dialogs and panels)

Run a quick accessibility check with a browser extension (e.g. axe DevTools) before submitting. `features/accessibility.feature` also runs axe-core automatically in both colour schemes as part of `npm run test:features`.
