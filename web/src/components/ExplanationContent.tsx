import type { ComponentChildren, Ref } from 'preact';
import type { Explanation } from '../data/explanations';
import type { ExplanationRef } from '../data/tokenizer';
import { Blocks, InlineText } from './RichText';
import styles from './ExplanationPanel.module.css';

/** A "See also" label that says which instruction a flag or keyword belongs to. */
function relatedLabel(ref: ExplanationRef): string {
  switch (ref.kind) {
    case 'instruction':
      return ref.instruction;
    case 'flag':
      return `${ref.instruction} ${ref.flag}`;
    case 'subkeyword':
      return `${ref.instruction} ${ref.word}`;
    case 'directive':
      return `# ${ref.directive}`;
    default:
      return 'text' in ref ? ref.text : ref.kind;
  }
}

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      class={styles.linkIcon}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

interface ExplanationContentProps {
  explanation: Explanation;
  /** Shown above the category: the Back button, when there is one. */
  back?: ComponentChildren;
  /** Shown beside the title: the close button. */
  close: ComponentChildren;
  headingRef?: Ref<HTMLHeadingElement>;
  bodyRef?: Ref<HTMLDivElement>;
  onNavigate: (ref: ExplanationRef) => void;
}

/** Renders one explanation: a fixed header and a scrolling body (§4). */
export function ExplanationContent({
  explanation,
  back,
  close,
  headingRef,
  bodyRef,
  onNavigate,
}: ExplanationContentProps) {
  const { category, title, short, deprecated, details, syntax, related, links } = explanation;
  return (
    <>
      <div class={styles.header}>
        {back}
        <p class={styles.category}>{category}</p>
        <div class={styles.titleRow}>
          <h2 ref={headingRef} class={styles.title} tabIndex={-1}>
            <code class={styles.titleCode}>{title}</code>
          </h2>
          {close}
        </div>
        <p class={styles.short}>
          <InlineText content={short} />
        </p>
        {deprecated && (
          <p class={styles.deprecated} role="note">
            Deprecated since {deprecated.since}. Use <InlineText content={deprecated.instead} />{' '}
            instead.
          </p>
        )}
      </div>

      <div ref={bodyRef} class={styles.body}>
        {details.length > 0 && (
          <div class={styles.section}>
            <Blocks blocks={details} />
          </div>
        )}

        {syntax && (
          <div class={styles.section}>
            <h3 class={styles.sectionTitle}>Syntax</h3>
            <pre class={styles.syntaxBlock} tabIndex={0} role="region" aria-label="Syntax">
              <code>{syntax}</code>
            </pre>
          </div>
        )}

        {related && related.length > 0 && (
          <div class={styles.section}>
            <h3 class={styles.sectionTitle}>See also</h3>
            <ul class={styles.relatedList}>
              {related.map((ref, i) => (
                <li key={i}>
                  <button
                    type="button"
                    class={styles.relatedButton}
                    onClick={() => onNavigate(ref)}
                  >
                    {relatedLabel(ref)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {links.length > 0 && (
          <div class={styles.section}>
            <h3 class={styles.sectionTitle}>Learn more</h3>
            <ul class={styles.linkList}>
              {links.map((link) => (
                <li key={link.url} class={styles.linkItem}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" class={styles.link}>
                    {link.label} <span class="sr-only">(opens in a new tab)</span>
                    <ExternalLinkIcon />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
