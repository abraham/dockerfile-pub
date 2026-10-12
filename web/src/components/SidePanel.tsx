import { useEffect, useRef } from 'preact/hooks';
import type { ResolvedToken } from './DockerfileViewer';
import type { Block, Inline } from '../data/explanations';
import type { ExplanationRef } from '../data/tokenizer';
import styles from './SidePanel.module.css';

/** Inline content as text nodes and `<code>` elements only (EXP-5, PNL-12). */
function InlineText({ content }: { content: readonly Inline[] }) {
  return (
    <>
      {content.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <code key={i} class={styles.code}>
            {part.code}
          </code>
        ),
      )}
    </>
  );
}

function renderBlock(block: Block, key: number) {
  if (block.type === 'paragraph') {
    return (
      <p key={key} class={styles.para}>
        <InlineText content={block.content} />
      </p>
    );
  }
  return (
    <ul key={key} class={styles.detailList}>
      {block.items.map((item, i) => (
        <li key={i} class={styles.detailListItem}>
          <InlineText content={item} />
        </li>
      ))}
    </ul>
  );
}

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

interface SidePanelProps {
  token: ResolvedToken | null;
  isOpen: boolean;
  onClose: () => void;
  /** Shows another explanation in place, from "See also" (PNL-5). */
  onNavigate: (ref: ExplanationRef) => void;
}

/** Side panel that displays an explanation for the selected token. */
export function SidePanel({ token, isOpen, onClose, onNavigate }: SidePanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when the panel opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Trap focus within the panel while it is open
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const candidates = panel.querySelectorAll<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])',
      );
      const focusable = Array.from(candidates).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    panel.addEventListener('keydown', handleKeyDown);
    return () => panel.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const explanation = token?.explanation;

  return (
    <aside
      ref={panelRef}
      data-testid="side-panel"
      class={`${styles.panel} ${isOpen ? styles.open : ''}`}
      role="complementary"
      aria-label="Explanation panel"
      aria-hidden={isOpen ? 'false' : 'true'}
      aria-live="polite"
      onKeyDown={(e) => {
        if (isOpen && e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {isOpen && explanation && (
        <>
          <div class={styles.header}>
            <p class={styles.category}>{explanation.category}</p>
            <div class={styles.titleRow}>
              <h2 class={styles.title}>
                <code class={styles.titleCode}>{explanation.title}</code>
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                class={styles.closeButton}
                onClick={onClose}
                aria-label="Close explanation panel"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <p class={styles.short}>
              <InlineText content={explanation.short} />
            </p>
            {explanation.deprecated && (
              <p class={styles.deprecated} role="note">
                Deprecated since {explanation.deprecated.since}. Use{' '}
                <InlineText content={explanation.deprecated.instead} /> instead.
              </p>
            )}
          </div>

          <div class={styles.body}>
            {explanation.details.length > 0 && (
              <div class={styles.section}>{explanation.details.map(renderBlock)}</div>
            )}

            {explanation.syntax && (
              <div class={styles.section}>
                <h3 class={styles.sectionTitle}>Syntax</h3>
                <pre class={styles.syntaxBlock} tabIndex={0} role="region" aria-label="Syntax">
                  <code>{explanation.syntax}</code>
                </pre>
              </div>
            )}

            {explanation.related && explanation.related.length > 0 && (
              <div class={styles.section}>
                <h3 class={styles.sectionTitle}>See also</h3>
                <ul class={styles.relatedList}>
                  {explanation.related.map((ref, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        class={styles.relatedButton}
                        onClick={() => {
                          onNavigate(ref);
                          closeButtonRef.current?.focus();
                        }}
                      >
                        {relatedLabel(ref)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {explanation.links && explanation.links.length > 0 && (
              <div class={styles.section}>
                <h3 class={styles.sectionTitle}>Learn more</h3>
                <ul class={styles.linkList}>
                  {explanation.links.map((link) => (
                    <li key={link.url} class={styles.linkItem}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class={styles.link}
                      >
                        {link.label}
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
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
