# dockerfile-pub

An interactive single-page developer tool that explains how Dockerfiles work.
Click any instruction or flag to see a concise explanation, syntax reference, and links to official Docker documentation.

**[Live demo →](https://abraham.github.io/dockerfile-pub/)**

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

- Node.js 20+
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
- **Unit tests** — tokenizer / parser and token → explanation mapping (`tokenizer.test.js`)
- **UI tests** — example toggling, panel open/close, Escape key, documentation links (`App.test.jsx`, `SidePanel.test.jsx`)

### Lint

```bash
npm run lint
```

### Build

```bash
npm run build
```

Outputs a static bundle to `web/dist/`. The production build is ~40 KB JS and ~11 KB CSS (both before gzip).

### Preview production build

```bash
npm run preview
```

## Project structure

```
web/
├── index.html                 Entry HTML
├── vite.config.js             Vite + Vitest configuration
├── src/
│   ├── main.jsx               App entry point
│   ├── App.jsx                Root component — state, layout
│   ├── App.module.css         App-level styles
│   ├── components/
│   │   ├── DockerfileViewer.jsx      Renders tokenized Dockerfile
│   │   ├── DockerfileViewer.module.css
│   │   ├── ExampleToggler.jsx        Simple/Average/Complex toggle
│   │   ├── ExampleToggler.module.css
│   │   ├── SidePanel.jsx             Explanation side panel
│   │   └── SidePanel.module.css
│   ├── data/
│   │   ├── examples.js        Three Dockerfile texts
│   │   ├── tokenizer.js       Parses Dockerfile into Line/Token objects
│   │   └── explanations.js    Keyword/flag → explanation content map
│   ├── styles/
│   │   └── global.css         Design tokens + CSS reset
│   └── __tests__/
│       ├── setup.js
│       ├── tokenizer.test.js
│       ├── App.test.jsx
│       └── SidePanel.test.jsx
```

## Architecture overview

### Tokenizer (`src/data/tokenizer.js`)

`tokenize(text)` splits a Dockerfile string into an array of **`Line`** objects. Each line holds an ordered array of **`Token`** objects with fields:

| Field | Type | Description |
|---|---|---|
| `id` | `string` | Unique id (`"<lineIndex>-<tokenIndex>"`) |
| `text` | `string` | Raw text of this token |
| `type` | `TOKEN_TYPE` | `keyword`, `flag`, `string`, `variable`, `comment`, `text` |
| `explanationKey` | `string \| null` | Lookup key into the explanations map |

### Explanations (`src/data/explanations.js`)

A static map from instruction name (e.g. `"FROM"`) or flag name (e.g. `"--mount"`) to an explanation object:

```js
{
  title: string,
  short: string,    // one-sentence summary shown as tooltip
  details: string,  // multi-paragraph expanded explanation
  syntax: string,   // syntax snippet
  links: [{ label, url }]
}
```

### State

All state lives in the top-level `App` component:

| State | Type | Description |
|---|---|---|
| `activeExample` | `string` | Currently displayed example key |
| `activeToken` | `Token \| null` | Selected token (with attached explanation) |
| `isPanelOpen` | `boolean` | Whether the side panel is visible |

The selected example is persisted to `localStorage` under the key `df-example`.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add new Dockerfile examples, explanations, and guidelines for pull requests.

## License

[MIT](./LICENSE)
