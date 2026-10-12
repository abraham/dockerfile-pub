import { refKey } from '../tokenizer';
import type { ExplanationRef, Instruction } from '../tokenizer';
import { flatten, parseInline, parseRichText } from './rich-text';
import type { Explanation, Link } from './schema';

type StaticRef = Extract<
  ExplanationRef,
  { kind: 'instruction' } | { kind: 'subkeyword' } | { kind: 'flag' } | { kind: 'directive' }
>;

/** A hand-written entry, in authoring markup (§5.1). */
export interface EntrySource {
  ref: StaticRef;
  /** Flags only: the instructions this flag entry is registered under (EXP-9). */
  appliesTo?: readonly Instruction[];
  /** Filled in as `<INSTRUCTION> flag` for flags. */
  category?: string;
  title: string;
  short: string;
  details: string;
  syntax?: string;
  links: Link[];
  related?: ExplanationRef[];
  deprecated?: { since: string; instead: string };
}

export const REFERENCE_URL = 'https://docs.docker.com/reference/dockerfile/';

/** The canonical reference link for an instruction (EXP-23). */
export function instructionLink(instruction: Instruction): Link {
  const anchor = instruction === 'MAINTAINER' ? 'maintainer-deprecated' : instruction.toLowerCase();
  return { label: `${instruction} reference`, url: `${REFERENCE_URL}#${anchor}` };
}

const registry = new Map<string, Explanation>();

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Checks the content contract shared by static and generated entries (EXP-1 to EXP-6, EXP-27). */
export function validate(explanation: Explanation, where: string): void {
  const fail = (message: string) => {
    throw new Error(`${where}: ${message}`);
  };
  if (!explanation.category) fail('missing category');
  if (!explanation.title || explanation.title.length > 61) fail('title must be 1-60 characters');
  const short = flatten(explanation.short);
  if (!short.endsWith('.')) fail(`short must end with a period: ${short}`);
  if (short.length > 120) fail(`short is longer than 120 characters: ${short}`);
  if (explanation.details.length < 1 || explanation.details.length > 4) {
    fail('details must have 1-4 blocks');
  }
  if (explanation.links.length < 1) fail('needs at least one link');
  const urls = new Set<string>();
  for (const link of explanation.links) {
    if (!link.url.startsWith('https://')) fail(`link is not https: ${link.url}`);
    if (urls.has(link.url)) fail(`duplicate link: ${link.url}`);
    if (!link.label) fail('link without a label');
    urls.add(link.url);
  }
  if (explanation.related && explanation.related.length > 4) fail('at most 4 related refs');
}

function build(source: EntrySource, ref: StaticRef, category: string): Explanation {
  const where = refKey(ref);
  const explanation: Explanation = {
    category,
    title: source.title,
    short: parseInline(source.short),
    details: parseRichText(source.details),
    links: source.links,
  };
  if (source.syntax) explanation.syntax = source.syntax;
  if (source.related) explanation.related = source.related;
  if (source.deprecated) {
    explanation.deprecated = {
      since: source.deprecated.since,
      instead: parseInline(source.deprecated.instead),
    };
  }
  validate(explanation, where);
  if (!source.syntax && ref.kind !== 'directive') {
    throw new Error(`${where}: syntax is required (EXP-3)`);
  }
  if (!source.links[0].url.startsWith(REFERENCE_URL)) {
    throw new Error(`${where}: the first link must be the Dockerfile reference (EXP-23)`);
  }
  return deepFreeze(explanation);
}

/** Registers a static entry; flags are registered under every `appliesTo` instruction (EXP-9). */
export function register(source: EntrySource): void {
  const base = source.ref;
  const refs: StaticRef[] =
    base.kind === 'flag'
      ? (source.appliesTo ?? [base.instruction]).map((instruction) => ({
          kind: 'flag',
          instruction,
          flag: base.flag,
        }))
      : [base];
  for (const ref of refs) {
    const key = refKey(ref);
    if (registry.has(key)) throw new Error(`Duplicate explanation: ${key} (EXP-8)`);
    const category = ref.kind === 'flag' ? `${ref.instruction} flag` : (source.category ?? '');
    registry.set(key, build(source, ref, category));
  }
}

/** The static entry for `ref`, if one is registered. */
export function lookup(ref: ExplanationRef): Explanation | undefined {
  return registry.get(refKey(ref));
}

/** Every registered entry by key, for coverage and budget tests. */
export function registered(): ReadonlyMap<string, Explanation> {
  return registry;
}
