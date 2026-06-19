import { useEffect, useRef } from 'preact/hooks';
import styles from './SidePanel.module.css';

/**
 * Side panel that displays an explanation for the selected token.
 *
 * @param {{
 *   token: (import('../data/tokenizer').Token & { explanation: import('../data/explanations').Explanation }) | null,
 *   isOpen: boolean,
 *   onClose: () => void
 * }} props
 */
export function SidePanel({ token, isOpen, onClose }) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Focus the close button when the panel opens
  useEffect(() => {
    if (isOpen && closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e) {
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
    function handleKeyDown(e) {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        panel.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.disabled);
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
            <p class={styles.short}>{explanation.short}</p>
          </div>

          <div class={styles.body}>
            {explanation.details && (
              <div class={styles.section}>
                {explanation.details.split('\n\n').map((para, i) => (
                  <p key={i} class={styles.para}>
                    {para}
                  </p>
                ))}
              </div>
            )}

            {explanation.syntax && (
              <div class={styles.section}>
                <h3 class={styles.sectionTitle}>Syntax</h3>
                <pre class={styles.syntaxBlock}>
                  <code>{explanation.syntax}</code>
                </pre>
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
