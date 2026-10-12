# dockerfile-pub

An interactive single-page developer tool that explains how Dockerfiles work.
Click any part of a Dockerfile (instructions, flags, arguments, variables, shell commands and their options) to see a concise explanation, syntax reference, and links to official documentation.

**[Live demo →](https://dockerfile.pub/)**

## Features

- **Three Dockerfile examples** — Simple, Average, and Complex, switchable at any time
- **Interactive tokens** — click any highlighted part: keywords (`FROM`, `RUN`, …), flags (`--from`, `--mount`, …), image names, paths, variables, and shell commands, options and operators, explained in context (`-S` in `adduser -S` is explained as an `adduser` option)
- **Rich explanations** — short summary, details with inline code, syntax reference, "See also" links between related concepts, and links to the official docs
- **Accessible** — the Dockerfile is one tab stop with arrow-key navigation, the panel is non-modal and returns focus on close, changes are announced to screen readers, and axe checks run in CI
- **Responsive** — adapts from desktop side-panel layout to a mobile bottom-sheet
- **Light + dark modes** — follows the OS preference via `prefers-color-scheme`
- **Small bundle** — under 40 KB gzipped, built with [Preact](https://preactjs.com/) and [Vite](https://vite.dev/)

## Getting started

### Prerequisites

- Node.js 22.18+ (it runs the TypeScript scripts and Cucumber steps directly; the version CI uses is in `web/.nvmrc`)
- npm 10+

### Install

```bash
cd web
npm install
```

### Develop

```bash
npm start   # or: npm run dev
```

Opens the app at `http://localhost:5173/` with hot module replacement.

### Test

```bash
# Run tests once
npm run test:run

# Watch mode
npm test
```

The test suite covers:

- **Unit tests** — tokenizer invariants, reference examples and golden fixtures (`tokenizer.test.ts`); explanation content, rich text and generators (`content.test.ts`); command explanations and the command catalog (`commands.test.ts`)
- **UI tests** — example toggling, panel open/close, Escape, focus return, "See also" and Back, viewer keyboard navigation, documentation links, copy button behaviour (`App.test.tsx`, `ExplanationPanel.test.tsx`, `ExplanationContent.test.tsx`, `CopyButton.test.tsx`)

### Feature tests (end-to-end)

The Cucumber/Puppeteer feature tests navigate a real browser to a running instance of the site.

1. Start the dev server (or any target environment):

   ```bash
   npm run dev
   ```

2. In a second terminal, run the feature tests:

   ```bash
   npm run test:features
   ```

   By default the tests target `http://localhost:5173`. Set the `BASE_URL` environment variable to point the suite at a different environment:

   ```bash
   # staging
   BASE_URL=https://staging.example.com npm run test:features

   # production
   BASE_URL=https://dockerfile.pub npm run test:features
   ```

   Every scenario that requires the site begins with `Given the site is up`, which performs a quick health-check request to `BASE_URL` before the browser steps run. If the server is not reachable the step fails with a clear error message.

   CI runs the suite against the production build (`npm run build && npm run preview`), and `deploy.yml` runs the `smoke` profile (`npx cucumber-js --profile smoke`) against the live site after each deploy.

The feature suite currently covers:

| Feature file                      | Scenarios                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `browser.feature`                 | Headless browser smoke test                                                                                             |
| `site.feature`                    | Home page loads with the expected title; no Content Security Policy violations                                          |
| `homepage.feature`                | Homepage title, heading, and intro text                                                                                 |
| `instruction_explanation.feature` | Opening, closing and switching explanations; continuation-line fragments; keyboard-only use; desktop and mobile layouts |
| `example_switcher.feature`        | Default example shown; switching examples; switching closes the panel                                                   |
| `reduced_motion.feature`          | No transitions with `prefers-reduced-motion: reduce`; transitions otherwise                                             |
| `accessibility.feature`           | axe-core WCAG 2.2 AA checks in the dark and light colour schemes                                                        |

### Lint, format and type-check

```bash
npm run lint           # ESLint (all TypeScript), Stylelint (CSS), markdownlint (all *.md in the repo)
npm run format:check   # Prettier over the whole repo; `npm run format` to fix
npm run typecheck      # tsc --noEmit over every .ts/.tsx file
```

Everything except generated files is linted and formatted; see [site-architecture.md §8](./docs/specs/site-architecture.md#8-tooling-and-conventions). CI also lints the workflow files with `actionlint`.

### Build

```bash
npm run build
npm run size   # fails if the bundle exceeds its budget
```

Outputs a static bundle to `web/dist/`. The production build is ~117 KB JS and ~13 KB CSS before gzip (~38 KB and ~3 KB gzipped). `npm run size` fails if gzipped JS exceeds 40 KB or gzipped CSS exceeds 5 KB.

### Preview production build

```bash
npm run preview
```

## Project structure

```text
web/
├── index.html                 Entry HTML
├── vite.config.ts             Vite + Vitest configuration
├── tsconfig.json              TypeScript configuration
├── eslint.config.ts           ESLint configuration
├── scripts/
│   └── check-size.ts          Bundle-size budget check
├── features/
│   ├── browser.feature        Headless browser smoke test
│   ├── site.feature           Site navigation smoke test
│   ├── homepage.feature       Homepage content test
│   ├── instruction_explanation.feature  Instruction panel tests
│   ├── example_switcher.feature         Example toggle tests
│   ├── reduced_motion.feature           Reduced-motion tests
│   ├── accessibility.feature            axe-core WCAG checks
│   ├── step_definitions/      Cucumber step implementations
│   └── support/               World + hooks (browser lifecycle)
├── src/
│   ├── main.tsx               App entry point
│   ├── App.tsx                Root component — state, layout
│   ├── App.module.css         App-level styles
│   ├── components/
│   │   ├── CopyButton.tsx            Copy-to-clipboard button
│   │   ├── CopyButton.module.css
│   │   ├── DockerfileViewer.tsx      Tokenized Dockerfile as a keyboard-navigable grid
│   │   ├── DockerfileViewer.module.css
│   │   ├── ExampleToggler.tsx        Simple/Average/Complex toggle
│   │   ├── ExampleToggler.module.css
│   │   ├── ExplanationPanel.tsx      Panel shell: open/close, Escape, Back, focus
│   │   ├── ExplanationPanel.module.css
│   │   ├── ExplanationContent.tsx    Renders one explanation
│   │   ├── RichText.tsx              Inline code, paragraphs and lists
│   │   └── RichText.module.css
│   ├── data/
│   │   ├── examples.ts        Three Dockerfile texts
│   │   ├── tokenizer/         Dockerfile → lines of tokens with explanation refs
│   │   ├── content/           Explanation schema, rich text, static entries, generators
│   │   ├── commands/          Command catalog, resolver and shell syntax explanations
│   │   └── explanations.ts    getExplanation(ref): the lookup entry point
│   ├── styles/
│   │   └── global.css         Design tokens + CSS reset
│   └── __tests__/
│       ├── setup.ts
│       ├── fixtures/          Dockerfiles for tokenizer golden tests
│       ├── tokenizer.test.ts
│       ├── content.test.ts
│       ├── commands.test.ts
│       ├── App.test.tsx
│       ├── ExplanationPanel.test.tsx
│       ├── ExplanationContent.test.tsx
│       └── CopyButton.test.tsx
```

## Architecture overview

A static Preact + TypeScript single-page app with no backend. `App` tokenizes the selected example (`src/data/tokenizer/`), attaches an explanation to each token with `getExplanation(token.ref)` (`src/data/explanations.ts`), and owns all state. The selected example is persisted to `localStorage` under the key `df-example`.

The specs in [docs/specs/](./docs/specs/) are the source of truth:

| Spec                                                                      | Covers                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [site-architecture.md](./docs/specs/site-architecture.md)                 | Layers, state, styling, build, testing, hosting, decision log   |
| [tokenizer.md](./docs/specs/tokenizer.md)                                 | `Line` / `Token` model, explanation refs and tokenization rules |
| [explanation-content-model.md](./docs/specs/explanation-content-model.md) | Explanation schema, rich text, lookup and authoring rules       |
| [run-command-explanations.md](./docs/specs/run-command-explanations.md)   | Explanations for shell and exec-form commands                   |
| [explanation-panel.md](./docs/specs/explanation-panel.md)                 | Panel behaviour, layout, keyboard and accessibility             |
| [github-workflows.md](./docs/specs/github-workflows.md)                   | CI, deploy and Dependabot                                       |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add new Dockerfile examples, explanations, and guidelines for pull requests.

## License

[MIT](./LICENSE)
