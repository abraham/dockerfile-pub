# Spec: Explanation content model

|                   |                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**        | Implemented (2026-10-13). The design was rewritten on 2026-10-12 and builds on the tokenizer ([tokenizer.md](./tokenizer.md)) and command explanations ([run-command-explanations.md](./run-command-explanations.md)); §12 records the migration from string keys and a `details` string.          |
| **Source**        | [web/src/data/content/](../../web/src/data/content/schema.ts) (`schema.ts`, `rich-text.ts`, `registry.ts`, `instructions.ts`, `flags.ts`, `keywords.ts`, `directives.ts`, `arguments.ts`, `variables.ts`); entry point `getExplanation()` in [explanations.ts](../../web/src/data/explanations.ts) |
| **Rendered by**   | [SidePanel.tsx](../../web/src/components/SidePanel.tsx) (panel), `Token` in [DockerfileViewer.tsx](../../web/src/components/DockerfileViewer.tsx) (tooltip and accessible name)                                                                                                                    |
| **Tests**         | [web/src/\_\_tests\_\_/content.test.ts](../../web/src/__tests__/content.test.ts); plus [SidePanel.test.tsx](../../web/src/__tests__/SidePanel.test.tsx) for rendering                                                                                                                              |
| **Related specs** | [tokenizer.md](./tokenizer.md) (refs, §3.3), [run-command-explanations.md](./run-command-explanations.md) (command fragments), [explanation-panel.md](./explanation-panel.md) (how explanations are shown)                                                                                         |

## 1. Purpose and scope

This spec defines **what an explanation is**: its schema, its rich-text format, how a token's ref is resolved to one, where the content lives, and the rules authors follow.

**This spec owns** the content for these ref kinds: `instruction`, `subkeyword`, `flag`, `argument`, `variable` and `directive`.

**[run-command-explanations.md](./run-command-explanations.md) owns** the content for command fragments: `shell`, `exec-form`, `json-array`, `line-continuation` and `heredoc`. That content still follows the schema and rules here.

| #      | Goal                                                                                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C1** | **Complete.** Every token with a ref has an explanation, so the rule for whether a token is interactive is simply "it has a ref" (EXP-12).                                              |
| **C2** | **Accurate.** Every hand-written fact can be checked against the linked documentation. Generated text describes structure and never invents facts.                                      |
| **C3** | **Contextual.** Explanations reflect where the fragment appears: `--chown` on `COPY` vs. `ADD`, `$HOME` expanded by Docker vs. by the shell, `node:26-alpine` split into image and tag. |
| **C4** | **Consistent.** One schema, one rich-text format, one voice and one spelling convention, whether content is hand-written or generated.                                                  |
| **C5** | **Safe and small.** Content reaches the DOM only as text and `<code>` elements, and it stays within a size budget (EXP-41).                                                             |

## 2. Schema

```ts
interface Explanation {
  category: string; // what kind of thing this is, e.g. 'Instruction', 'COPY flag', 'npm option'
  title: string; // plain text: the canonical name or the clicked word
  short: Inline[]; // one sentence; ≤ 120 characters when flattened (EXP-2, EXP-29)
  details: RichText; // one to four blocks
  syntax?: string; // plain text, shown preformatted
  links: Link[]; // at least one
  related?: ExplanationRef[]; // "See also" (EXP-28)
  deprecated?: { since: string; instead: Inline[] }; // EXP-24
  generic?: true; // set only by fallback text (EXP-32)
}

interface Link {
  label: string; // short noun phrase, e.g. 'FROM reference'
  url: string; // https only
}

type Inline = string | { code: string };
type Block = { type: 'paragraph'; content: Inline[] } | { type: 'list'; items: Inline[][] };
type RichText = Block[];
```

| Field        | Rules                                                                                                                                                                                                                                                                                             | Rendered as                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `category`   | **EXP-27** Required. Taken from a fixed vocabulary per ref kind, e.g. `Instruction`, `FROM keyword`, `COPY flag`, `FROM argument`, `Build argument`, `Environment variable`, `Shell variable`, `Parser directive`. Generated command explanations use `<cmd> option`, `Shell operator` and so on. | A small label above the title                                             |
| `title`      | **EXP-1** Non-empty plain text. Static entries use the canonical spelling (`FROM`, `--mount`, `AS`), so `from node` still shows `FROM`. Generated entries use the ref's `text` (CMDX-17). At most 60 characters plus `…`.                                                                         | Panel `<h2><code>`                                                        |
| `short`      | **EXP-2** One sentence that ends with `.`, at most **120 characters** after flattening (EXP-29).                                                                                                                                                                                                  | Lead paragraph; flattened for the button `title` tooltip and `aria-label` |
| `details`    | **EXP-21** One to four blocks. The first says _what it does_; later ones give _when, why_ and common pitfalls.                                                                                                                                                                                    | Panel body (§3)                                                           |
| `syntax`     | **EXP-3** Required for `instruction`, `subkeyword` and `flag` entries; optional elsewhere. Uses Docker reference notation (EXP-22).                                                                                                                                                               | `<pre><code>` under "Syntax"                                              |
| `links`      | **EXP-4** At least one link, all `https://`, URLs unique within an entry (**EXP-6**). The first link follows EXP-23.                                                                                                                                                                              | "Learn more" list; new tab, `rel="noopener noreferrer"`                   |
| `related`    | **EXP-28** Optional, at most 4 refs, each resolving to a non-generic explanation. Examples: `FROM … AS` ↔ `COPY --from`; `ENV` ↔ `ARG`; `CMD` ↔ `ENTRYPOINT`.                                                                                                                                     | "See also" buttons that swap the panel's content                          |
| `deprecated` | **EXP-24** Set for deprecated instructions and flags (e.g. `MAINTAINER`, since Docker 1.13, instead `` `LABEL maintainer=…` ``). Deprecation goes here, not in `short`.                                                                                                                           | A notice under the lead paragraph                                         |
| `generic`    | **EXP-32** Set only by fallback generators. It is never authored by hand.                                                                                                                                                                                                                         | Not shown; used by coverage tests (EXP-20)                                |

- **EXP-5** **Rendering safety.** An `Explanation` contains only data, never markup. The panel renders `Inline` strings as text nodes and `{ code }` as `<code>` with a text child, and nothing else; there is no `dangerouslySetInnerHTML` or any other HTML sink. Generated content interpolates arbitrary Dockerfile text, so this is a security rule (CMDX-22, PNL-12).
- **EXP-7** The panel leaves out `syntax`, `related`, `deprecated` and their headings when they are absent or empty. It never shows an empty section.

## 3. Rich text

Hand-written content is authored in a three-construct markup language. It is parsed once, when the module loads, into the `RichText` / `Inline[]` structure. Generated content builds that structure directly.

### 3.1 Authoring markup

| Construct   | Syntax                                                               | Result                                                                                                |
| ----------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Paragraph   | Lines of text; blocks are separated by one or more blank lines.      | **EXP-17** `{ type: 'paragraph' }`. Single line breaks inside a paragraph become spaces.              |
| List        | A block in which **every** line starts with `-` followed by a space. | **EXP-16** `{ type: 'list' }`, one item per line, without the marker.                                 |
| Inline code | `` `text` ``                                                         | **EXP-18** `{ code: 'text' }`. Nothing else is inline markup: `*`, `_`, `[`, `<` and `&` are literal. |

- **EXP-30** **Strict parsing.** The parser throws on:
  - a block that mixes list lines and other lines;
  - an unbalanced backtick;
  - an empty code span;
  - leading or trailing blank lines.

  Content is static, so the unit tests surface these errors (§11); they never reach users. Nothing is ever guessed: a block is a list only if its author marked it as one.

- **EXP-29** **Flattening.** `flatten(inlines)` joins `Inline[]` into plain text, with code spans contributing their text without backticks. The button `title` attribute, the `aria-label` (`` `${token.text}: ${flatten(short)}` ``) and the EXP-2 length check all use the flattened text.

### 3.2 Builder API for generated content

```ts
p(...content: (string | Inline)[]): Block // paragraph
list(...items: Inline[][]): Block
code(value: string): Inline // { code: value }
```

- **EXP-31** Generators (arguments, variables, commands) build rich text **only** through these helpers. They never assemble markup strings to be parsed. An interpolated value is always passed as a plain `string` or through `code()`, so a backtick or a leading `-` inside Dockerfile text can never change the formatting (CMDX-22).

## 4. Lookup

```ts
getExplanation(ref: ExplanationRef | null): Explanation | null;
```

| Ref kind                                                           | Resolved by                                    | Fallback when nothing matches                 |
| ------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------- |
| `instruction`                                                      | Static registry (§5)                           | none: coverage is required (EXP-19)           |
| `subkeyword`                                                       | Static registry                                | none: coverage is required (EXP-33)           |
| `flag`                                                             | Static registry, keyed per instruction (EXP-9) | Generic "a flag for `<INSTRUCTION>`" (EXP-32) |
| `directive`                                                        | Static registry                                | Generic "a parser directive"                  |
| `argument`                                                         | Argument generators (§6.1)                     | Generic "an argument to `<INSTRUCTION>`"      |
| `variable`                                                         | Variable generator (§6.2)                      | none needed; the generator handles every name |
| `shell`, `exec-form`, `json-array`, `line-continuation`, `heredoc` | `explainCommandRef` (**EXP-11**, CMDX-2)       | per run-command-explanations.md               |

- **EXP-10** `getExplanation(null)` returns `null`. That is the only case in which it returns `null`.
- **EXP-12** **Total.** For every non-null ref, `getExplanation` returns an explanation. A token is therefore interactive **if and only if** its ref is non-null. `App` still attaches the explanation once per example switch (ARCH-2, ARCH-4); `DockerfileViewer` makes a token a button exactly when `token.explanation` is set.
- **EXP-8** **Keying.** The static registry is a `Map` from `refKey(ref)` (TOK-2) to its entry. Each key has exactly one entry; registering a duplicate throws when the module loads.
- **EXP-13** Every lookup goes through a `Map` or an own-property check. Plain objects are never indexed with strings that come from Dockerfile text.
- **EXP-14** Entries are deeply frozen when they are registered. Generated explanations are fresh objects; consumers treat both as read-only.
- **EXP-15** Lookup is synchronous. Static lookups are O(1); generators are linear in the ref's text. Nothing is fetched (EXP-41).

## 5. Static content

### 5.1 Registry

```ts
register({
  ref: { kind: 'flag', instruction: 'COPY', flag: '--chown' },
  appliesTo: ['COPY', 'ADD'], // flags only: one entry, registered under each instruction (EXP-9)
  category: 'COPY flag', // `<INSTRUCTION> flag` is filled in per instruction
  title: '--chown',
  short: 'Sets the owner of the copied files, without a separate `RUN chown`.',
  details: `…`, // authoring markup (§3.1)
  syntax: 'COPY --chown=<user>:<group> <src>... <dest>',
  links: [
    {
      label: 'COPY --chown',
      url: 'https://docs.docker.com/reference/dockerfile/#copy---chown---chmod',
    },
  ],
  related: [{ kind: 'instruction', instruction: 'USER' }],
});
```

- **EXP-9** **Flags are per instruction.** A flag entry lists every instruction it applies to in `appliesTo` and is registered under `flag:<INSTRUCTION>:<flag>` for each one. When the wording must differ between instructions (for example, `--from` on `COPY` vs. `RUN --mount=…,from=`), there are separate entries. A flag on an instruction not listed in `appliesTo` gets the generic fallback, which is correct because Docker would reject it.
- **EXP-42** Content files contain only `register(…)` calls and constants. Parsing (§3.1) and validation (EXP-1 to EXP-6, EXP-30) run inside `register`, so invalid content fails the first test that imports it.

### 5.2 Required coverage

| #          | Kind          | Entries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EXP-19** | `instruction` | All 18 instructions, whether or not an example uses them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **EXP-33** | `subkeyword`  | `FROM AS`, `HEALTHCHECK CMD`, `HEALTHCHECK NONE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **EXP-34** | `directive`   | `syntax`, `escape`, `check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **EXP-35** | `flag`        | Every flag in the Dockerfile reference at the time of writing, each marked "experimental" in `details` if the reference marks it so. That is: `FROM --platform`; `RUN --mount`, `--network`, `--security`; `COPY --from`, `--chown`, `--chmod`, `--link`, `--parents`, `--exclude`; `ADD --chown`, `--chmod`, `--link`, `--keep-git-dir`, `--checksum`, `--exclude`; `HEALTHCHECK --interval`, `--timeout`, `--start-period`, `--start-interval`, `--retries`. The list is checked against the reference whenever content changes (EXP-25). |

- **EXP-20** **Examples are fully covered.** Tokenizing every bundled `EXAMPLES` entry produces **no** explanation with `generic: true` for the kinds `instruction`, `subkeyword`, `flag` and `directive`. Command fragments follow CMDX-12.

## 6. Generated content

### 6.1 Arguments

- **EXP-36** Argument explanations are generated from templates keyed by `(instruction, role)`. They use light, structural parsing of the argument text and never look anything up over the network.

| Instruction / role          | Parsing                                                                                                                | Explanation highlights                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FROM` `image`              | **EXP-37** Split into registry, repository, tag and digest (`[registry/]repo[:tag][@sha256:…]`). `scratch` is special. | A list of the parts present; a missing tag means `latest`; a tip on pinning a tag or digest for reproducible builds; for `scratch`, "an empty image". |
| `FROM` `stage-name`         | —                                                                                                                      | Names this stage so that `COPY --from=<name>` and later `FROM <name>` can use it. `related`: `COPY --from`.                                           |
| `COPY`/`ADD` `source`       | Detect a URL, a Git URL, an archive (`.tar`, `.tar.gz`, …), a glob or a heredoc marker.                                | Relative to the build context (or to the `--from` stage); for `ADD`, URLs are downloaded and local archives are extracted; globs match several files. |
| `COPY`/`ADD` `destination`  | Trailing `/`; absolute vs. relative.                                                                                   | A trailing `/` means a directory; relative paths resolve against `WORKDIR`.                                                                           |
| `WORKDIR`/`VOLUME` `path`   | Absolute vs. relative.                                                                                                 | `WORKDIR` creates the directory and stacks relative paths; `VOLUME` declares a mount point.                                                           |
| `USER` `user`               | `name`, `uid`, `name:group`, `uid:gid`.                                                                                | Which part is the user and which the group; `root` or `0` gets a tip to run as non-root.                                                              |
| `EXPOSE` `port`             | `port`, `port/tcp`, `port/udp`, ranges.                                                                                | The protocol defaults to `tcp`; exposing only documents the port; publish with `docker run -p`.                                                       |
| `ENV`/`ARG`/`LABEL` `key`   | For `LABEL`, recognize the OCI annotation keys (`org.opencontainers.image.*`).                                         | `ENV`: kept in the image and in containers. `ARG`: build-time only (`--build-arg`). `LABEL`: image metadata, with the meaning of known OCI keys.      |
| `ENV`/`ARG`/`LABEL` `value` | Quoted vs. unquoted.                                                                                                   | The value of `<key>`; quoting rules for spaces.                                                                                                       |
| `STOPSIGNAL` `signal`       | Name (`SIGTERM`) or number.                                                                                            | The default is `SIGTERM`; which common signals mean what.                                                                                             |
| `MAINTAINER` `name`         | —                                                                                                                      | Deprecated (EXP-24); use `LABEL maintainer=…`.                                                                                                        |
| any `word`                  | —                                                                                                                      | Generic (EXP-32).                                                                                                                                     |

### 6.2 Variables

- **EXP-38** A variable explanation is built from `name`, `text` and `expandedBy` (TOK-28):

  | `expandedBy` | Framing                                                                                                                                                                                    |
  | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `docker`     | "Docker substitutes this while building, using an `ARG` or `ENV` defined earlier in this stage (or a global `ARG` for `FROM`)."                                                            |
  | `shell`      | "The shell expands this when the command runs, using the container's environment: `ENV` values plus anything set earlier in the same command. `ARG` values are visible during `RUN` only." |

  Modifiers in `text` are explained: `${NAME:-default}`, `${NAME:+alt}`, `${NAME-default}`, `${NAME+alt}`, and their `#`/`%` pattern forms under `shell`.

- **EXP-39** A small table of **known variables** adds specific meanings:
  - Docker's predefined platform `ARG`s: `TARGETPLATFORM`, `TARGETOS`, `TARGETARCH`, `TARGETVARIANT`, `BUILDPLATFORM`, `BUILDOS`, `BUILDARCH`, `BUILDVARIANT`.
  - The proxy `ARG`s: `HTTP_PROXY`, `HTTPS_PROXY`, `FTP_PROXY`, `NO_PROXY`, `ALL_PROXY`, in both cases.
  - Common environment variables: `PATH`, `HOME`, `NODE_ENV`, `DEBIAN_FRONTEND`.
  - Shell special parameters: `$?`, `$1`–`$9`, `$@`, `$*`, `$#`, `$$`, `$!`, `$0`, `$-`.

  Unknown names get only the framing. That is complete, not a generic fallback.

### 6.3 Fallbacks

- **EXP-32** Fallback text is honest: it says what kind of thing the fragment is, links to the instruction's reference, and claims nothing else. It sets `generic: true` so coverage tests can find it. Fallbacks exist so that EXP-12 holds for unusual input, such as a user-supplied Dockerfile in the future (ARCH §10.3). The bundled examples must not rely on them (EXP-20).

## 7. Authoring rules

These rules apply to hand-written content. Generated templates follow them too, wherever they apply.

| #          | Rule                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **EXP-22** | `syntax` uses Docker reference notation: `<placeholder>`, `[optional]`, `...` for repetition. Flag entries may show a concrete example instead.                                                                                                                                      |
| **EXP-23** | For Docker concepts, the first link is the canonical `docs.docker.com/reference/dockerfile/#…` anchor. Further links may go to Docker guides or to specifications (e.g. OCI annotations). For command fragments, CMDX-15 applies.                                                    |
| **EXP-25** | Every factual claim (defaults, versions, experimental status, behaviour differences) must be checkable against a linked document. The reviewer checks it whenever an entry changes.                                                                                                  |
| **EXP-26** | **US English**, matching the UI and Docker's documentation: "behavior", "initialization", "parameterize". This settles the previous open question.                                                                                                                                   |
| **EXP-40** | **Voice:** second person and present tense ("Sets the base image…", "Use `COPY` unless you need…"). No "simply", "just" or "obviously". Put code identifiers in inline code; don't use quotation marks for them. A tip is phrased as advice and has its reason in the same sentence. |

## 8. Size budget

- **EXP-41** The serialized static entries (every registered explanation, as JSON) stay at or below **8 KB gzipped**, and the serialized command catalog at or below 4 KB (CMDX-20). Unit tests measure both. The code that generates content (argument templates, the known-variable table, the rich-text runtime) is covered by the total JS budget.
  - Content is bundled, not lazy-loaded, so lookup stays synchronous (EXP-15, ARCH-14). Every token's tooltip and accessible name use `short`, so content is needed at first render.
  - The main JS budget (ARCH-15) is 40 KB gzipped (D16), raised from 28 KB once the tokenizer, content and catalog were implemented and measured.
  - If content later outgrows these budgets, the fallback is to lazy-load the panel's `details` after first render while keeping `short` in the main bundle.

## 9. Inventory

All targets below were reached on 2026-10-13.

| Kind          | Before                                                       | Now                             | Added                                                                                                                                 |
| ------------- | ------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `instruction` | 18 entries                                                   | 18                              | `category`, `related`; `deprecated` on `MAINTAINER`; convert `details` to markup; US spelling (EXP-26)                                |
| `flag`        | 9 global entries                                             | 21 instruction-scoped (EXP-35)  | `--network`, `--security`, `--link`, `--parents`, `--exclude`, `--keep-git-dir`, `--checksum`, `--start-interval`; `appliesTo` on all |
| `subkeyword`  | none (`HEALTHCHECK … CMD` resolved to the `CMD` instruction) | 3                               | `FROM AS`, `HEALTHCHECK CMD`, `HEALTHCHECK NONE`                                                                                      |
| `directive`   | none (shown as comments)                                     | 3                               | `syntax`, `escape`, `check`                                                                                                           |
| `argument`    | none                                                         | templates for every row of §6.1 | all                                                                                                                                   |
| `variable`    | none                                                         | generator plus the EXP-39 table | all                                                                                                                                   |
| command kinds | `RUN_CHUNK:` generator                                       | per run-command-explanations.md | per that spec                                                                                                                         |

## 10. Non-goals and future extensions

### 10.1 Non-goals

- Fetching content at runtime, or reading it live from the Docker docs.
- Content written or edited by users at runtime.
- Markup beyond paragraphs, lists and inline code: no links inside text, no emphasis, no tables.

### 10.2 Future extensions

- **Localization:** refs and `refKey`s are language-neutral, so translations would replace field values per locale without touching the tokenizer.
- **Versioned content:** mark flags and directives with the Dockerfile frontend version that introduced them, and show it when `# syntax=` pins an older version.
- **Link checking:** a scheduled workflow that requests every `links[].url` and opens an issue for broken ones (not in PR CI, so a slow site can't block a merge).
- **Variable origins:** once the tokenizer resolves where a variable is declared (tokenizer.md §10), add "set by `ARG` on line N" to §6.2.

## 11. Testing

| Layer             | What                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry contract | For every registered entry: EXP-1 to EXP-4, EXP-6, EXP-21 to EXP-23 and EXP-27. `related` refs resolve to non-generic entries (EXP-28). There are no duplicate keys (EXP-8).                                |
| Coverage          | EXP-19, EXP-33, EXP-34, EXP-35 (the full lists), and EXP-20 (tokenize every `EXAMPLES` entry; no `generic` result for the static kinds).                                                                    |
| Totality          | Property test: tokenize random Dockerfile-like input; for every token with a ref, `getExplanation` is non-null and passes the content contract (EXP-12). `getExplanation(null)` is `null` (EXP-10).         |
| Rich-text parser  | Paragraphs, lists, inline code and line joining; every EXP-30 error case throws; literal `*`, `_`, `<` and `&`.                                                                                             |
| Builder safety    | Generated content built from values containing `` ` ``, a leading `-` and space, `<img src=x onerror=…>` and newlines renders as literal text, with no extra list, code or HTML element (EXP-5, EXP-31).    |
| Generators        | §6.1 rows: image references with and without registry, tag and digest; `scratch`; `USER 0`; `EXPOSE 53/udp`; OCI label keys. §6.2: both `expandedBy` values, each modifier, and every known-variable group. |
| Budgets           | EXP-41 and CMDX-20 (gzip measured in a Node-environment test).                                                                                                                                              |
| Rendering         | `SidePanel.test.tsx`: `<code>` for inline code, lists only for list blocks, `category`, `deprecated` notice and "See also" rendering, and omitted sections (EXP-7).                                         |

## 12. Migration from the previous implementation

The migration below is complete (2026-10-13); it is kept as a record.

### 12.1 Breaking changes

| Current                                                                           | Target                                                                               | Who must update                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `getExplanation(key: string \| null)`; keys like `FROM`, `--mount`, `RUN_CHUNK:…` | `getExplanation(ref: ExplanationRef \| null)`, keyed by `refKey`                     | `App`, `explanations.ts`, tests                                                                            |
| `short: string`, `details: string` (`\n\n` blocks, list detection by heuristic)   | `short: Inline[]`, `details: RichText` (strict markup, §3)                           | `SidePanel` (render blocks and `<code>`; remove `isListDetailBlock`), `DockerfileViewer` (flatten `short`) |
| No `category`, `related`, `deprecated` or `generic`                               | All four added (§2)                                                                  | `SidePanel` (label, notice, "See also"); explanation-panel.md §4                                           |
| `null` for unknown keys, so some tokens weren't interactive                       | Total for non-null refs (EXP-12)                                                     | `DockerfileViewer`: none (it already keys on `token.explanation`)                                          |
| A plain object indexed by key (EXP-13 issue)                                      | A frozen `Map` registry                                                              | `explanations.ts`                                                                                          |
| One file, `explanations.ts`, about 500 lines                                      | `web/src/data/content/*` (§1 header), with `explanations.ts` kept as the entry point | Imports                                                                                                    |
| British spelling in static entries                                                | US English (EXP-26)                                                                  | Content                                                                                                    |

### 12.2 Rule mapping

Rule numbers EXP-1 to EXP-26 are **kept** so that references in other specs stay valid. Where a rule's meaning changed, the rule itself says so. EXP-27 to EXP-42 are new.

| Rule             | Change                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| EXP-1            | Static titles are canonical spellings rather than "equal to the key".                                           |
| EXP-2, EXP-29    | The length check uses flattened `short`.                                                                        |
| EXP-8            | Key namespaces (`RUN_CHUNK:` etc.) are replaced by `refKey` uniqueness.                                         |
| EXP-9            | Global flag keys become per-instruction entries via `appliesTo`.                                                |
| EXP-11           | Routing goes to `explainCommandRef` (CMDX-2) instead of the `RUN_CHUNK:` generator.                             |
| EXP-12           | `getExplanation` is total for non-null refs; interactive means having a ref.                                    |
| EXP-13           | The hardening requirement is now the design (a `Map` registry).                                                 |
| EXP-16 to EXP-18 | The heuristic list detection and the "no inline formatting" rule become the strict three-construct markup (§3). |
| EXP-20           | "Resolves or allow-listed" becomes "no generic results for the static kinds".                                   |
| EXP-24           | Deprecation moves from `short` to the `deprecated` field.                                                       |
| EXP-26           | The open question is settled: US English.                                                                       |

### 12.3 Other documents to update in the same change

- [explanation-panel.md](./explanation-panel.md) §4: the content layout gains `category`, the `deprecated` notice, rich-text rendering with `<code>`, and "See also" buttons (which swap content like clicking another token, PNL-5). The list-detection notes go away.
- [site-architecture.md](./site-architecture.md):
  - ARCH-24: cite CMDX-22 instead of RUNX-14.
- README.md: the specs table entry for this file becomes "Explanation schema, rich text, lookup and authoring rules".
- [tokenizer.md](./tokenizer.md) §12.2 and [run-command-explanations.md](./run-command-explanations.md) §13.2 list this spec's old key namespaces; once this spec is accepted, those notes are done.
