import type { ExplanationRef } from '../tokenizer';

export interface Link {
  /** Short noun phrase, e.g. `FROM reference`. */
  label: string;
  /** `https://` only (EXP-4). */
  url: string;
}

/** Plain text, or inline code rendered as `<code>` (EXP-18). */
export type Inline = string | { code: string };

export type Block = { type: 'paragraph'; content: Inline[] } | { type: 'list'; items: Inline[][] };

export type RichText = Block[];

export interface Explanation {
  /** What kind of thing this is, e.g. `Instruction`, `COPY flag`, `npm option` (EXP-27). */
  category: string;
  /** Plain text: the canonical name or the clicked word (EXP-1). */
  title: string;
  /** One sentence, ≤ 120 characters when flattened (EXP-2, EXP-29). */
  short: Inline[];
  /** One to four blocks (EXP-21). */
  details: RichText;
  /** Plain text in Docker reference notation (EXP-3, EXP-22). */
  syntax?: string;
  links: Link[];
  /** "See also" refs (EXP-28). */
  related?: ExplanationRef[];
  deprecated?: { since: string; instead: Inline[] };
  /** Set only by fallback generators (EXP-32). */
  generic?: true;
}
