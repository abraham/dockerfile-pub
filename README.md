# dockerfile-pub

An interactive single-page developer tool that explains how Dockerfiles work.
Click any instruction or flag to see a concise explanation, syntax reference, and links to official Docker documentation.

**[Live demo →](https://dockerfile.pub/)**

## Features

- **Three Dockerfile examples** — Simple, Average, and Complex, switchable at any time
- **Interactive tokens** — click any highlighted keyword (`FROM`, `RUN`, `COPY`, …) or flag (`--from`, `--mount`, …) to open an explanation panel
- **Rich explanations** — short summary, extended details, syntax reference, and links to the official Docker docs
- **Accessible** — semantic HTML, ARIA attributes, keyboard navigation, focus management, and ESC to close
- **Responsive** — adapts from desktop side-panel layout to a mobile bottom-sheet
- **Light + dark modes** — follows the OS preference via `prefers-color-scheme`
- **Tiny bundle** — ~15 KB gzipped, built with [Preact](https://preactjs.com/) and [Vite](https://vite.dev/)

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
npm run dev
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

- **Unit tests** — tokenizer / parser and token → explanation mapping (`tokenizer.test.ts`)
- **UI tests** — example toggling, panel open/close, Escape key, documentation links, copy button behaviour (`App.test.tsx`, `SidePanel.test.tsx`, `CopyButton.test.tsx`)

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

| Feature file                      | Scenarios                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `browser.feature`                 | Headless browser smoke test                                                    |
| `site.feature`                    | Home page loads with the expected title; no Content Security Policy violations |
| `homepage.feature`                | Homepage title, heading, and intro text                                        |
| `instruction_explanation.feature` | Clicking an instruction opens the panel; closing; switching instructions       |
| `example_switcher.feature`        | Default example shown; switching examples; switching closes the panel          |
| `reduced_motion.feature`          | No transitions with `prefers-reduced-motion: reduce`; transitions otherwise    |
| `accessibility.feature`           | axe-core WCAG 2.2 AA checks in the dark and light colour schemes               |

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

Outputs a static bundle to `web/dist/`. The production build is ~41 KB JS and ~12 KB CSS before gzip (~15 KB and ~3 KB gzipped). `npm run size` fails if gzipped JS exceeds 28 KB or gzipped CSS exceeds 5 KB.

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
│   │   ├── DockerfileViewer.tsx      Renders tokenized Dockerfile
│   │   ├── DockerfileViewer.module.css
│   │   ├── ExampleToggler.tsx        Simple/Average/Complex toggle
│   │   ├── ExampleToggler.module.css
│   │   ├── SidePanel.tsx             Explanation side panel
│   │   └── SidePanel.module.css
│   ├── data/
│   │   ├── examples.ts        Three Dockerfile texts
│   │   ├── tokenizer.ts       Parses Dockerfile into Line/Token objects
│   │   └── explanations.ts    Keyword/flag → explanation content map
│   ├── styles/
│   │   └── global.css         Design tokens + CSS reset
│   └── __tests__/
│       ├── setup.ts
│       ├── tokenizer.test.ts
│       ├── App.test.tsx
│       ├── SidePanel.test.tsx
│       └── CopyButton.test.tsx
```

## Architecture overview

A static Preact + TypeScript single-page app with no backend. `App` tokenizes the selected example (`src/data/tokenizer.ts`), attaches an explanation to each token (`src/data/explanations.ts`), and owns all state. The selected example is persisted to `localStorage` under the key `df-example`.

The specs in [docs/specs/](./docs/specs/) are the source of truth:

| Spec                                                                      | Covers                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [site-architecture.md](./docs/specs/site-architecture.md)                 | Layers, state, styling, build, testing, hosting, decision log |
| [tokenizer.md](./docs/specs/tokenizer.md)                                 | `Line` / `Token` model and tokenization rules                 |
| [explanation-content-model.md](./docs/specs/explanation-content-model.md) | Explanation schema, keys and authoring rules                  |
| [run-command-explanations.md](./docs/specs/run-command-explanations.md)   | Generated explanations for `RUN` command fragments            |
| [explanation-panel.md](./docs/specs/explanation-panel.md)                 | Panel behaviour, layout, keyboard and accessibility           |
| [github-workflows.md](./docs/specs/github-workflows.md)                   | CI, deploy and Dependabot                                     |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add new Dockerfile examples, explanations, and guidelines for pull requests.

## License

[MIT](./LICENSE)
