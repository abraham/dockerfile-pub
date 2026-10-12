# Spec: Explanation content model

|                 |                                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**      | Draft. Describes current behaviour; deviations and open questions are flagged inline.                                                                                            |
| **Source**      | [web/src/data/explanations.ts](../../web/src/data/explanations.ts)                                                                                                               |
| **Rendered by** | [SidePanel.tsx](../../web/src/components/SidePanel.tsx) (panel), `Token` in [DockerfileViewer.tsx](../../web/src/components/DockerfileViewer.tsx) (tooltip and accessible name)  |
| **Tests**       | [SidePanel.test.tsx](../../web/src/__tests__/SidePanel.test.tsx), [App.test.tsx](../../web/src/__tests__/App.test.tsx); there are no direct unit tests for `explanations.ts` yet |
| **Related**     | [tokenizer.md](./tokenizer.md) (where keys come from), [run-command-explanations.md](./run-command-explanations.md) (generated entries)                                          |

## 1. Purpose

This spec defines the shape, key namespace, authoring rules and rendering contract for the educational content shown when a user clicks a token. All content is static and lives in the source bundle. There is no CMS, no fetching, no localisation and no runtime editing.

## 2. Schema

```ts
interface Link {
  label: string;
  url: string;
}

interface Explanation {
  title: string;
  short: string;
  details: string;
  syntax?: string;
  links: Link[];
}
```

| Field           | Required                                                        | Constraint                                                                                                               | Rendered as                                                                                                         |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `title`         | yes                                                             | Non-empty. For static entries it **equals the key** (**EXP-1**).                                                         | Panel `<h2><code>`                                                                                                  |
| `short`         | yes                                                             | One sentence, **≤ 120 characters**, ends with `.` (**EXP-2**)                                                            | Panel lead paragraph, button `title` tooltip, and part of the button `aria-label` (`` `${token.text}: ${short}` ``) |
| `details`       | yes                                                             | Plain text in the mini-format in §5. One to three blocks.                                                                | Panel body                                                                                                          |
| `syntax`        | optional by type, but **every static entry has it** (**EXP-3**) | Plain text; may contain `\n` and a trailing `\` for wrapped lines                                                        | `<pre><code>` under a "Syntax" heading                                                                              |
| `links`         | yes                                                             | **≥ 1** link. **≥ 1** must point to `https://docs.docker.com/`. All `https://`. URLs unique within an entry (**EXP-4**). | "Learn more" list. Each link opens in a new tab with `rel="noopener noreferrer"`.                                   |
| `links[].label` | yes                                                             | Short noun phrase, e.g. `FROM reference`                                                                                 | Link text                                                                                                           |

- **EXP-5** Every field is **plain text**. The content must not contain HTML or Markdown, and the renderer must output it only as text nodes; no `dangerouslySetInnerHTML`. This matters because generated entries interpolate arbitrary Dockerfile text (see the RUN spec, RUNX-14).
- **EXP-6** The panel uses each link's `url` as its React `key`, which is why URLs must be unique within an entry.
- **EXP-7** The panel renders `details`, `syntax` and `links` only when they are truthy or non-empty. A missing optional field leaves no empty section.

## 3. Key namespace

Each explanation is stored under a key. The tokenizer produces the keys (see [tokenizer.md §4.5](./tokenizer.md)):

| Namespace    | Form                                  | Example        | Source                                                |
| ------------ | ------------------------------------- | -------------- | ----------------------------------------------------- |
| Instruction  | an uppercase member of `INSTRUCTIONS` | `FROM`         | static map                                            |
| Docker flag  | `--name`, with the value removed      | `--mount`      | static map                                            |
| RUN fragment | `RUN_CHUNK:<text>`                    | `RUN_CHUNK:&&` | generated ([RUN spec](./run-command-explanations.md)) |

- **EXP-8** These namespaces cannot overlap: instruction keys are bare uppercase, flag keys start with `--`, and the `RUN_CHUNK:` prefix is reserved and must never appear in the static map.
- **EXP-9** Flag keys are **global**, not scoped to an instruction. `--from` has one explanation, whether it appears on `COPY` or anywhere else. An entry whose meaning depends on the instruction must say so in its text. For example, the entries for `--interval`, `--timeout`, `--retries` and `--start-period` all describe `HEALTHCHECK`.

## 4. Lookup API

```js
getExplanation(key: string | null): Explanation | null
```

- **EXP-10** A `null`, `undefined` or empty key returns `null`.
- **EXP-11** A `RUN_CHUNK:` key is sent to the generator (see the RUN spec, RUNX-5).
- **EXP-12** Any other key returns the static entry, or `null` if there is none. `App` attaches the result to each token as `token.explanation` (ARCH-2). A `null` value means the token is **not interactive**: `DockerfileViewer` renders it as a plain `<span>`.
- **EXP-13** **Hardening required.** The current lookup is `EXPLANATIONS[key] ?? null` on a plain object, so inherited property names such as `constructor` or `toString` return a non-null value. The tokenizer cannot produce such keys today, but the lookup must not depend on that. Use `Object.hasOwn(EXPLANATIONS, key)` or a null-prototype object.
- **EXP-14** Returned static entries are shared references. Consumers must treat them as read-only. Freezing the map is recommended.
- **EXP-15** `getExplanation` is called once per token each time the example changes (memoised in `App`, ARCH-4); it is not called on render or on click. It must stay synchronous and cheap. A static lookup is O(1).

## 5. `details` mini-format

The panel splits `details` on `\n\n` into **blocks**. Each block is rendered as either a paragraph or a list:

- **EXP-16** A block becomes a `<ul>` when it has **two or more** non-empty lines and **every** line matches one of these:
  - a bullet: `-` or `*`, then whitespace, then text, or
  - a definition: text, whitespace, a dash (`—`, `–` or `-`), whitespace, text, e.g. `type=cache — mounts a cache`.

  Each line becomes one `<li>`, trimmed and shown verbatim, so any bullet marker remains in the text.

- **EXP-17** Every other block becomes one `<p>`. Single `\n` characters inside a paragraph are not turned into line breaks, so whether they show depends on CSS.
- **EXP-18** The format has no inline formatting: no code spans, links, bold or emphasis. Command names such as `docker run -p` appear as plain prose.

Known issues with the list rule:

- **Ambiguous with prose.** A paragraph spanning two or more lines in which every line happens to contain a spaced hyphen (`foo - bar`) will be rendered as a list.
- **Inconsistent anchoring.** The pattern is `/^([-*]\s+.+)|(.+\s[—–-]\s.+)$/`: `^` binds only to the first alternative and `$` only to the second. It works for current content but should be written as `/^(?:[-*]\s+.+|.+\s[—–-]\s.+)$/`.

Only `--mount` uses the list form today.

## 6. Authoring rules

These extend [CONTRIBUTING.md](../../CONTRIBUTING.md) and should be enforced by tests (§10).

| #          | Rule                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EXP-19** | Every keyword in `INSTRUCTIONS` has a static entry, whether or not a bundled example uses it.                                                                                                                                             |
| **EXP-20** | Every non-`RUN_CHUNK:` key produced by tokenizing the bundled `EXAMPLES` resolves to an explanation, **or** is listed in an explicit allow-list of keys that are intentionally not interactive.                                           |
| **EXP-21** | `details`: the first block says _what it does_, later blocks give _when/why_ and common pitfalls. At most three blocks.                                                                                                                   |
| **EXP-22** | `syntax` follows the notation in the Docker reference: `<placeholder>`, `[optional]`, `...` for repetition. Flag entries may show a concrete usage example instead.                                                                       |
| **EXP-23** | The first link is the canonical `docs.docker.com/reference/dockerfile/#…` anchor where one exists. Other links may point to guides or specs (e.g. OCI annotations on GitHub).                                                             |
| **EXP-24** | Deprecated instructions say so in `short` (e.g. `MAINTAINER`: "(Deprecated — use LABEL instead.)").                                                                                                                                       |
| **EXP-25** | Factual claims (defaults, version notes, BuildKit-only features) must be checkable against the linked docs. A reviewer checks this whenever an entry changes.                                                                             |
| **EXP-26** | Spelling is consistent within the product. **Open question:** the static entries use British spelling ("behaviour", "initialisation", "parameterise"), while the generated RUN entries and the UI use US spelling ("behavior"). Pick one. |

## 7. Current inventory

27 static entries. Audited 2026-10-11 by running every entry through the checks for EXP-1 to EXP-4 and EXP-19:

| Group             | Keys                                                                   | Used by examples?    |
| ----------------- | ---------------------------------------------------------------------- | -------------------- |
| Instructions (18) | `FROM RUN COPY WORKDIR ENV ARG EXPOSE CMD ENTRYPOINT HEALTHCHECK USER` | ✅                   |
|                   | `ADD VOLUME LABEL SHELL STOPSIGNAL MAINTAINER ONBUILD`                 | ❌ (kept per EXP-19) |
| Flags (9)         | `--mount --from --interval --timeout --retries`                        | ✅                   |
|                   | `--platform --chown --chmod --start-period`                            | ❌                   |

Audit results:

- ✅ For every entry, `title` equals the key, `short` is at most 85 characters (limit 120), at least one link is on `docs.docker.com`, every link is `https`, link URLs are unique within each entry, and `syntax` is present.
- ✅ Every instruction keyword has an entry.
- ⚠️ **EXP-20 is violated:** `--omit` (from `npm ci --omit=dev` in the Complex example) is a key with no explanation, so that token is silently non-interactive. Resolve it via tokenizer.md §6.4 / RUN spec §9.3, or add it to the allow-list.

## 8. Known gaps and open questions

1. **Missing concepts.** Some things in the examples have no key at all, so they cannot be explained:
   - `AS <name>` in `FROM`,
   - `CMD` inside `HEALTHCHECK`, which today resolves to the top-level `CMD` entry,
   - the parser directive `# syntax=`,
   - variables (`${NODE_VERSION}`),
   - exec-form vs shell-form.

   Decide which ones deserve a namespace, for example `DIRECTIVE:syntax`, `KEYWORD:AS` or a context-scoped `HEALTHCHECK/CMD`.

2. **Context-dependent flags.** EXP-9 keeps flags global, but `--chown`/`--chmod` apply to both `COPY` and `ADD`, and `--from` can also take an external image. If the wording ever needs to differ by instruction, define a scoped key form (`COPY --from`) with a fallback to the global key.
3. **Richer formatting.** EXP-18 rules out inline code. Adding a minimal, safe subset (backtick code spans only) would improve readability. It would need a tiny renderer, still with no HTML sink.
4. **Content location.** All content is in one JS module (about 500 lines) bundled with the app. That is fine at the current size. Revisit, for example by splitting into JSON or lazy-loading, only if the content grows enough to threaten the bundle budget in [CONTRIBUTING.md](../../CONTRIBUTING.md) ("No new dependencies…").
5. **Localisation.** Out of scope. If it is ever added, the key namespace stays the same and only the field values vary by locale.

## 9. Non-goals

- Fetching content at runtime or reading it live from Docker docs.
- Content written by users or contributed at runtime.
- Versioned content per Dockerfile frontend version.
- Explaining image names, paths or other free-form arguments outside `RUN`.

## 10. Test coverage

| Rule                                 | Covered?   | What to add                                                                                                                           |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| EXP-5 text-only rendering            | ❌         | Render an explanation whose `details` contains `<img src=x onerror=…>`; assert it appears as literal text and no `img` element exists |
| EXP-7 optional sections omitted      | ❌         | Panel test with no `syntax` / empty `links`; assert no "Syntax" / "Learn more" heading                                                |
| EXP-10–12 lookup                     | ❌         | New `explanations.test.ts`: `null`, `''`, unknown key → `null`; known key → entry                                                     |
| EXP-13 prototype keys                | ❌         | `getExplanation('constructor')` → `null` (fails today)                                                                                |
| EXP-16 list blocks                   | ✅         | `SidePanel.test.tsx` › "renders newline-separated mount type details as a list"                                                       |
| EXP-16 prose not misdetected         | ❌         | Single-line block with `-` → `<p>`; mixed block (one list line, one prose line) → `<p>`                                               |
| EXP-17 paragraphs                    | ✅         | `SidePanel.test.tsx` › "renders detail paragraphs"                                                                                    |
| EXP-1–4 schema rules for every entry | ❌         | Table-driven test over every static key (export the map or its keys for testing)                                                      |
| EXP-19 instruction coverage          | ❌         | `for (kw of INSTRUCTIONS) expect(getExplanation(kw)).not.toBeNull()`                                                                  |
| EXP-20 example coverage              | ❌         | Tokenize every `EXAMPLES` entry; every non-`RUN_CHUNK:` key resolves or is allow-listed (fails today on `--omit`)                     |
| Links open safely                    | ✅ partial | `SidePanel.test.tsx` checks `target="_blank"`; add an assertion for `rel="noopener noreferrer"`                                       |
