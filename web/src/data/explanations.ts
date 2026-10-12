import type { ExplanationRef } from './tokenizer';
import './content/instructions';
import './content/keywords';
import './content/directives';
import './content/flags';
import { REFERENCE_URL, instructionLink, lookup } from './content/registry';
import { code, p } from './content/rich-text';
import type { Explanation } from './content/schema';
import { explainArgument } from './content/arguments';
import { explainVariable } from './content/variables';
import { explainCommandRef } from './commands/explain';

export type { Block, Explanation, Inline, Link, RichText } from './content/schema';
export { flatten } from './content/rich-text';

type StaticRef = Extract<
  ExplanationRef,
  { kind: 'instruction' | 'subkeyword' | 'flag' | 'directive' }
>;

/** Honest fallback text for static kinds without an entry (EXP-32). */
function fallback(ref: StaticRef): Explanation {
  if (ref.kind === 'directive') {
    return {
      category: 'Parser directive',
      title: ref.directive,
      short: ['A parser directive.'],
      details: [
        p('Parser directives at the top of a Dockerfile change how the rest of it is read.'),
      ],
      links: [{ label: 'Parser directives', url: `${REFERENCE_URL}#parser-directives` }],
      generic: true,
    };
  }
  const instruction = code(ref.instruction);
  return {
    category: ref.kind === 'flag' ? `${ref.instruction} flag` : 'Instruction',
    title: ref.kind === 'flag' ? ref.flag : ref.kind === 'subkeyword' ? ref.word : ref.instruction,
    short:
      ref.kind === 'flag'
        ? ['A flag for ', instruction, '.']
        : ['Part of the ', instruction, ' instruction.'],
    details: [p('See the ', instruction, ' reference for what it accepts.')],
    links: [instructionLink(ref.instruction)],
    generic: true,
  };
}

/**
 * Resolves a token's ref to its explanation. Total: returns `null` only for a
 * `null` ref (EXP-10, EXP-12).
 */
export function getExplanation(ref: ExplanationRef | null): Explanation | null {
  if (!ref) return null;
  switch (ref.kind) {
    case 'instruction':
    case 'subkeyword':
    case 'flag':
    case 'directive':
      return lookup(ref) ?? fallback(ref);
    case 'argument':
      return explainArgument(ref);
    case 'variable':
      return explainVariable(ref);
    default:
      return explainCommandRef(ref);
  }
}
