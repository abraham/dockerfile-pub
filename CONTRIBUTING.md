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
npm run typecheck # type-check with tsc
npm run build     # production bundle in web/dist/
npm run size      # bundle-size budget (after build)
```

## Adding a new Dockerfile example

1. Open `web/src/data/examples.ts`.
2. Add a new entry to the `EXAMPLES` object. The key becomes the URL-safe identifier.

   ```ts
   // web/src/data/examples.ts
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

Hand-written explanations live in `web/src/data/content/` (`instructions.ts`, `flags.ts`, `keywords.ts`, `directives.ts`). Each entry is a `register(…)` call keyed by the token's ref; the rules are in [explanation-content-model.md](./docs/specs/explanation-content-model.md):

```ts
register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--chown' },
  appliesTo: ['COPY', 'ADD'], // flags only: registered under each instruction
  title: '--chown',
  short: 'Sets the owner of the copied files, without a separate `RUN chown`.',
  details: 'First paragraph.\n\n- `a`: a list item\n- `b`: another',
  syntax: '--chown=<user>[:<group>]',
  links: [{ label: '--chown reference', url: `${REFERENCE_URL}#copy---chown---chmod` }],
  related: [{ kind: 'instruction', instruction: 'USER' }],
});
```

Guidelines:

- Keep `short` to one sentence (≤ 120 characters) ending with a period. It doubles as the button tooltip and accessible name.
- `details` is one to four blocks separated by blank lines. A block whose every line starts with a hyphen and a space is a list; backticks mark inline code. Nothing else is markup.
- The first link is the official Dockerfile reference anchor. Write in US English.
- `register` validates every entry when the module loads, so `npm run test:run` catches mistakes.

Command knowledge (what `npm ci` or `adduser -S` means) lives in the catalog in `web/src/data/commands/catalog.ts`; see [run-command-explanations.md](./docs/specs/run-command-explanations.md). Only add facts you've checked against the tool's own documentation.

## Tokenizer

The tokenizer in `web/src/data/tokenizer/` converts Dockerfile text into `Line` and `Token` objects, each token with an explanation ref; the rules are in [tokenizer.md](./docs/specs/tokenizer.md). If you encounter a valid Dockerfile construct that is not tokenized correctly:

1. Add a failing test in `web/src/__tests__/tokenizer.test.ts`, or a fixture in `web/src/__tests__/fixtures/` (run `npx vitest run -u` to write its snapshot, then review it).
2. Fix the relevant lexer module (`lines.ts`, `instructions.ts`, `words.ts`, `json-array.ts`, `shell.ts` or `heredoc.ts`).
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
- **Linting** — `npm run lint` runs ESLint on all TypeScript in `web/` (typescript-eslint's type-aware rules, plus `eslint-plugin-react` and `eslint-plugin-react-hooks`; no `react/prop-types` requirement, since this is a Preact project), Stylelint on CSS and markdownlint on every Markdown file. CI also runs `actionlint` on the workflows (run `actionlint` locally from the repo root if you have it).
- **TypeScript** — all source is TypeScript (`.tsx` for components, `.ts` otherwise). Use only erasable syntax: no `enum`, `namespace` or constructor parameter properties, so Node can run the scripts and Cucumber steps directly. Use `import type` for type-only imports.
- **CSS** — CSS Modules for component styles; global design tokens in `web/src/styles/global.css`.
- **No new dependencies** unless strictly necessary. The bundle must stay small.

## Accessibility

All interactive elements must:

- Be reachable via keyboard (Tab / Shift+Tab)
- Have a meaningful `aria-label` or accessible name
- Support Escape to dismiss (for dialogs and panels)

Run a quick accessibility check with a browser extension (e.g. axe DevTools) before submitting. `features/accessibility.feature` also runs axe-core automatically in both colour schemes as part of `npm run test:features`.
