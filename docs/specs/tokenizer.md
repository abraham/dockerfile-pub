# Spec: Dockerfile tokenizer

|               |                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Status**    | Draft — documents current behaviour; deviations flagged inline                                                      |
| **Source**    | [web/src/data/tokenizer.ts](../../web/src/data/tokenizer.ts)                                                        |
| **Tests**     | [web/src/\_\_tests\_\_/tokenizer.test.ts](../../web/src/__tests__/tokenizer.test.ts)                                |
| **Consumers** | `App` (via `useMemo`; attaches `getExplanation()` results to each token before passing lines to `DockerfileViewer`) |

## 1. Purpose

Convert Dockerfile source text into a flat, render-ready structure of lines and tokens so the viewer can:

1. Render the file verbatim with syntax highlighting (by token type).
2. Make individual tokens clickable when an explanation exists (via `explanationKey`).
3. Track the selected token across renders (via a stable `id`).

The tokenizer is a **line-oriented lexer for display**, not a Dockerfile parser. It does not validate, build an AST, or model BuildKit semantics.

## 2. Public API

```ts
import { tokenize, TOKEN_TYPE, LINE_TYPE, INSTRUCTIONS } from './data/tokenizer';
import type { Token, Line, TokenType, LineType } from './data/tokenizer';
```

| Export                           | Kind                  | Description                                                                                                                                                         |
| -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenize(text: string): Line[]` | function              | Pure and deterministic. Same input → deep-equal output. No I/O, no dependency on the explanation map.                                                               |
| `TOKEN_TYPE`                     | `as const` object     | `keyword`, `flag`, `string`, `variable`, `comment`, `text`. Its values form the `TokenType` union.                                                                  |
| `LINE_TYPE`                      | `as const` object     | `blank`, `comment`, `instruction`, `continuation`. Its values form the `LineType` union.                                                                            |
| `INSTRUCTIONS`                   | `ReadonlySet<string>` | The 18 Dockerfile instruction keywords: `ADD ARG CMD COPY ENTRYPOINT ENV EXPOSE FROM HEALTHCHECK LABEL MAINTAINER ONBUILD RUN SHELL STOPSIGNAL USER VOLUME WORKDIR` |
| `Token`, `Line`                  | interfaces            | See §3.                                                                                                                                                             |

These are plain objects, not TypeScript `enum`s; the project uses only erasable TypeScript syntax (ARCH-6).

`TOKEN_TYPE` values are also CSS class suffixes (`styles['type-<value>']` in `DockerfileViewer`); renaming one is a breaking change for styling.

## 3. Data model

### Line

| Field       | Type             | Rule                                                              |
| ----------- | ---------------- | ----------------------------------------------------------------- |
| `lineIndex` | `number`         | Zero-based position in the input                                  |
| `raw`       | `string`         | The original line text, unmodified                                |
| `type`      | `LineType`       | See §4.2                                                          |
| `keyword`   | `string \| null` | The instruction keyword for `instruction` lines; otherwise `null` |
| `tokens`    | `Token[]`        | Ordered, non-empty                                                |

### Token

| Field            | Type             | Rule                                        |
| ---------------- | ---------------- | ------------------------------------------- |
| `id`             | `string`         | `` `${lineIndex}-${tokenIndex}` ``          |
| `text`           | `string`         | Non-empty slice of `raw`                    |
| `type`           | `TokenType`      | See §4.4                                    |
| `lineIndex`      | `number`         | Equals the owning line's `lineIndex`        |
| `tokenIndex`     | `number`         | Zero-based, contiguous within the line      |
| `explanationKey` | `string \| null` | Lookup key for `getExplanation()`; see §4.5 |

A non-null `explanationKey` does **not** guarantee an explanation exists. Consumers must call `getExplanation(key)` and treat `null` as non-interactive.

## 4. Behaviour

### 4.1 Line splitting

- **TOK-1** Input is split on `\n` only. `N` newline characters always yield `N + 1` lines (so `''` yields one blank line, and a trailing newline yields a trailing blank line).
- **TOK-2** `\r` is not stripped. In CRLF input it stays at the end of each line as a whitespace `text` token.
- **TOK-3** Lines are tokenized independently. No state carries from one line to the next (see §6, _continuation context_).

### 4.2 Line classification

Rules are evaluated in order against `trimmed = raw.trimStart()`:

| #         | Condition                                                         | `type`         | `keyword` | Tokens                                                                                                   |
| --------- | ----------------------------------------------------------------- | -------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| **TOK-4** | `trimmed === ''`                                                  | `blank`        | `null`    | One `text` token whose text is `raw`, or `' '` if `raw` is empty (so the line keeps its rendered height) |
| **TOK-5** | `trimmed` starts with `#`                                         | `comment`      | `null`    | One `comment` token containing the whole `raw` (indentation included)                                    |
| **TOK-6** | `trimmed` matches `/^[A-Z]+/` and that match is in `INSTRUCTIONS` | `instruction`  | the match | See §4.3                                                                                                 |
| **TOK-7** | anything else                                                     | `continuation` | `null`    | `raw` tokenized per §4.4 with no instruction context                                                     |

Notes:

- Parser directives (`# syntax=…`, `# escape=…`) are classified as comments.
- Keyword matching is **case-sensitive** (`from node` → `continuation`), and the uppercase run is matched greedily (`RUNNER x` → `continuation`).
- No word boundary is required after the keyword: `FROMnode` → `FROM` + `node`. This is current behaviour, not a deliberate guarantee.
- `continuation` is a catch-all. It covers real `\`-continued lines, but also any unrecognized line.

### 4.3 Instruction lines

- **TOK-8** Leading whitespace, if any, is emitted first as a `text` token with key `null`.
- **TOK-9** The keyword is emitted as a `keyword` token with `explanationKey = keyword`.
- **TOK-10** The remainder of the line (starting with the whitespace after the keyword) is tokenized per §4.4 with `instructionKeyword = keyword`.
- **TOK-11** Only the first keyword on a line is recognized. Keywords nested inside arguments (`ONBUILD RUN …`, `HEALTHCHECK … CMD …` on the same line) are plain `text`.

### 4.4 Argument tokenization

At each position the first matching rule wins:

| Priority | Rule                     | Pattern                                                                                              | `type`     | `explanationKey`                                                         |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| 1        | **TOK-12** Long flag     | `--[a-zA-Z][a-zA-Z0-9-]*(=\S*)?`                                                                     | `flag`     | Flag name with the value stripped, e.g. `--mount=type=cache` → `--mount` |
| 2        | **TOK-13** Variable      | `${…}` (non-empty, no nested `}`) or `$NAME` (`[A-Za-z_][A-Za-z0-9_]*`)                              | `variable` | `null`                                                                   |
| 3        | **TOK-14** Quoted string | `"…"` or `'…'`; no escape handling, must close on the same line                                      | `string`   | `null`                                                                   |
| 4        | **TOK-15** Chunk         | A run of whitespace, **or** a run of characters other than whitespace/`$`/`"`/`'`, **or** a lone `$` | `text`     | See §4.5                                                                 |

Consequences that are part of the contract:

- **TOK-16** Flags, variables and strings are recognized only at token boundaries. A chunk consumes everything up to the next whitespace, `$`, or quote, so `a--b` is a single chunk, while in `node:${V}-alpine` the variable is split out.
- **TOK-17** A flag's value (`=\S*`) consumes quotes and `$` without interpreting them: `--chown="a` is one flag token.
- **TOK-18** Variables inside quoted strings are not split out (`"x $Y"` is one `string` token).
- **TOK-19** Single-dash options (`-S`) and a bare `--` are chunks, not flags.
- **TOK-20** Long flags are recognized in every context, including shell commands (`npm ci --omit=dev` → flag token with key `--omit`).
- **TOK-21** Exec-form JSON is not parsed. `["node", "server.js"]` → `[`, `"node"`, `,`, ` `, `"server.js"`, `]`.

### 4.5 Explanation keys

| Token                                                                                                                           | Key                             |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `keyword`                                                                                                                       | The keyword, e.g. `FROM`        |
| `flag`                                                                                                                          | The flag name, e.g. `--from`    |
| `text` chunk, non-whitespace, on a line whose `keyword === 'RUN'`                                                               | `RUN_CHUNK:<text>` (**TOK-22**) |
| Everything else (`variable`, `string`, `comment`, whitespace, chunks outside `RUN`, all tokens on `continuation`/`blank` lines) | `null`                          |

`RUN_CHUNK:` keys are resolved dynamically by `getExplanation()`; they need no entry in the static explanation map.

### 4.6 Invariants

These must hold for every input. Each one should be enforced by a test (property-style over the bundled examples plus the edge cases in §5).

- **INV-1 Lossless**: for every line, `tokens.map(t => t.text).join('') === raw`. The only allowed exception is TOK-4 (an empty `raw` renders as `' '`).
  > ⚠️ **Currently violated** by unterminated quotes; see §6.1.
- **INV-2 Unique ids**: `id` is unique across the whole result.
- **INV-3 Contiguous indices**: within each line, `tokenIndex` runs `0..n-1` in order, and every `id` equals `` `${lineIndex}-${tokenIndex}` ``.
- **INV-4 Non-empty**: every line has at least one token, and every token has non-empty `text`.
- **INV-5 Keyword position**: an `instruction` line has exactly one `keyword` token. It sits at index 0, or at index 1 after an indentation token.
- **INV-6 Stability**: ids depend only on position. Re-tokenizing the same text yields the same ids, which `App` relies on to keep `activeTokenId` valid.

## 5. Reference examples

Output abbreviated as `text:type[:key]`; whitespace tokens are shown as `␠`.

<!-- Leading spaces in the Input column are significant (indented lines). -->
<!-- markdownlint-disable MD038 -->

| Input                                        | `type` / `keyword`  | Tokens                                                                                                                                    |
| -------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `FROM node:${NODE_VERSION}-alpine AS base`   | instruction / FROM  | `FROM:keyword:FROM` `␠` `node::text` `${NODE_VERSION}:variable` `-alpine:text` `␠` `AS:text` `␠` `base:text`                              |
| `COPY --from=builder /app/dist .`            | instruction / COPY  | `COPY:keyword:COPY` `␠` `--from=builder:flag:--from` `␠` `/app/dist:text` `␠` `.:text`                                                    |
| `RUN addgroup -S g && adduser x`             | instruction / RUN   | `RUN:keyword:RUN` `␠` `addgroup:text:RUN_CHUNK:addgroup` `␠` `-S:text:RUN_CHUNK:-S` `␠` `g:text:RUN_CHUNK:g` `␠` `&&:text:RUN_CHUNK:&&` … |
| `RUN --mount=type=cache,target=/root/.npm \` | instruction / RUN   | … `--mount=type=cache,target=/root/.npm:flag:--mount` `␠` `\:text:RUN_CHUNK:\`                                                            |
| `    npm ci --omit=dev`                      | continuation / null | `␠` `npm:text` `␠` `ci:text` `␠` `--omit=dev:flag:--omit`                                                                                 |
| `    CMD wget -qO- http://x \|\| exit 1`     | instruction / CMD   | `␠` `CMD:keyword:CMD` … (see §6.2)                                                                                                        |
| `CMD ["node", "server.js"]`                  | instruction / CMD   | `CMD:keyword:CMD` `␠` `[` `"node":string` `,` `␠` `"server.js":string` `]`                                                                |
| `# syntax=docker/dockerfile:1`               | comment / null      | one `comment` token                                                                                                                       |
| (empty line)                                 | blank / null        | `' ':text`                                                                                                                                |

<!-- markdownlint-enable MD038 -->

## 6. Known deviations and open questions

Each item needs a decision. Once decided, update the relevant TOK rule and add a test.

### 6.1 Unterminated quotes drop the rest of the line (bug)

When the scanner reaches a `"` or `'` that has no closing quote on the same line, no rule matches and tokenization stops. The rest of the line is never rendered.

| Input                    | Rendered            |
| ------------------------ | ------------------- |
| `RUN echo it's here`     | `RUN echo it`       |
| `COPY --chown="a b" . .` | `COPY --chown="a b` |

**Required**: INV-1. **Proposed fix**: emit an unmatched quote character as a single `text` chunk (add `["']` as a last-resort alternative in TOK-15). Separately, decide whether the scanner should ever be allowed to stop early at all.

### 6.2 No context across continuation lines

Because of TOK-3, the lines after a trailing `\` lose their instruction:

- `RUN` continuation lines produce no `RUN_CHUNK:` keys, so `npm ci` in the Complex example is not clickable even though the same text on a `RUN` line is.
- An indented `CMD` after `HEALTHCHECK … \` is classified as a standalone `CMD` instruction, and the panel shows the top-level `CMD` explanation.

**Open question**: should `tokenize` carry a "current instruction" from a line ending in an unescaped `\` into the next line? If yes, add a field such as `Line.contextKeyword`, and specify how a `CMD` that follows `HEALTHCHECK` is keyed.

### 6.3 Which `RUN` chunks get keys

Under TOK-22, every non-whitespace chunk on a `RUN` line gets a key, including:

- the line-continuation backslash `\`
- the exec-form punctuation `[`, `,`, `]`
- a lone `$`, `(date)`, `1` from `$(date) $1`

All of these resolve to the generic "Part of the shell command" explanation. **Open question**: should structural punctuation get a `null` key (or a dedicated key, e.g. `LINE_CONTINUATION`)?

### 6.4 Long options inside shell commands

TOK-20 classifies `--omit=dev` as a Docker `flag` with key `--omit`. That key has no explanation, so the token is not clickable. Meanwhile `-S` on a `RUN` line is clickable through `RUN_CHUNK:`. **Open question**: limit `flag` classification to known Docker flags, or to the position right after the keyword (before the first non-flag argument), and treat the rest as `RUN_CHUNK:`?

### 6.5 Instruction keyword gaps

- Docker treats instructions as case-insensitive; this tokenizer does not (TOK-6).
- There is no word-boundary check after the keyword (`FROMnode`).
- `AS` in `FROM … AS name`, nested `ONBUILD <INSTRUCTION>`, and `HEALTHCHECK … CMD` on the same line are not keywords (TOK-11).

**Open question**: which of these, if any, should be in scope?

### 6.6 CRLF input

`\r` stays inside the tokens (TOK-2). This is harmless for the bundled examples. It matters only if user-supplied Dockerfiles become a feature, in which case decide whether to normalize line endings.

## 7. Non-goals

- Validating Dockerfile syntax or reporting errors.
- Heredocs (`RUN <<EOF`), the `# escape=` directive, and backslash escapes inside strings.
- Shell parsing beyond the chunking in §4.4 (no subshells, globbing, redirections, or comments inside `RUN`).
- Variable expansion or resolving `ARG`/`ENV` values.
- Performance tuning; inputs are small, static examples.

## 8. Test coverage

| Rule / invariant                                               | Covered by an existing test?                               |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| TOK-1 line count, empty input, blank lines                     | ✅                                                         |
| TOK-5 comments, including a parser directive                   | ✅                                                         |
| TOK-6 every keyword in `INSTRUCTIONS`                          | ✅                                                         |
| TOK-9 keyword token and key                                    | ✅                                                         |
| TOK-12 flags in `COPY`/`RUN`/`HEALTHCHECK`                     | ✅                                                         |
| TOK-13 `${VAR}` and `$VAR`                                     | ✅                                                         |
| TOK-14 double-quoted strings                                   | ✅ (single quotes ❌)                                      |
| TOK-20 flags on continuation lines                             | ✅                                                         |
| TOK-22 `RUN_CHUNK:` keys                                       | ✅                                                         |
| INV-2, INV-3 (line part of the id)                             | ✅ partial                                                 |
| TOK-2, TOK-4 whitespace-only, TOK-8, TOK-11, TOK-16–19, TOK-21 | ❌                                                         |
| INV-1, INV-3 (full), INV-4, INV-5, INV-6                       | ❌ (add as properties checked over every `EXAMPLES` entry) |
| §6.1 unterminated quote                                        | ❌ (add as a failing test before the fix)                  |
