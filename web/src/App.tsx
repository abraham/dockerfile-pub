import { useState, useMemo, useCallback } from 'preact/hooks';
import { ExampleToggler } from './components/ExampleToggler';
import { DockerfileViewer } from './components/DockerfileViewer';
import { SidePanel } from './components/SidePanel';
import { CopyButton } from './components/CopyButton';
import { tokenize, refKey } from './data/tokenizer';
import type { ExplanationRef } from './data/tokenizer';
import { EXAMPLES } from './data/examples';
import { getExplanation, flatten } from './data/explanations';
import type { ResolvedToken } from './components/DockerfileViewer';
import styles from './App.module.css';

const EXAMPLE_KEYS = Object.keys(EXAMPLES);

function loadSavedExample(): string {
  try {
    const saved = localStorage.getItem('df-example');
    if (saved && EXAMPLE_KEYS.includes(saved)) return saved;
  } catch {
    // ignore
  }
  return 'simple';
}

export function App() {
  const [activeExample, setActiveExample] = useState(loadSavedExample);
  const [activeToken, setActiveToken] = useState<ResolvedToken | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const lines = useMemo(
    () =>
      tokenize(EXAMPLES[activeExample].content).map((line) => ({
        ...line,
        tokens: line.tokens.map((token) => {
          const explanation = getExplanation(token.ref);
          return {
            ...token,
            explanation,
            summary: explanation ? flatten(explanation.short) : '',
          };
        }),
      })),
    [activeExample],
  );

  const handleTokenClick = useCallback((token: ResolvedToken) => {
    if (!token.explanation) return;
    setActiveToken(token);
    setIsPanelOpen(true);
  }, []);

  const handlePanelClose = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  // "See also" swaps the panel's content, like clicking another token (PNL-5).
  const handleRelated = useCallback((ref: ExplanationRef) => {
    const explanation = getExplanation(ref);
    if (!explanation) return;
    setActiveToken({
      id: `related:${refKey(ref)}`,
      lineIndex: -1,
      tokenIndex: -1,
      column: 0,
      text: explanation.title,
      type: 'text',
      ref,
      explanation,
      summary: flatten(explanation.short),
    });
  }, []);

  const handleExampleChange = useCallback((key: string) => {
    setActiveExample(key);
    setIsPanelOpen(false);
    setActiveToken(null);
    try {
      localStorage.setItem('df-example', key);
    } catch {
      // ignore
    }
  }, []);

  const exampleList = useMemo(
    () => EXAMPLE_KEYS.map((key) => ({ key, label: EXAMPLES[key].label })),
    [],
  );

  return (
    <div class={styles.app}>
      <header class={styles.header}>
        <div class={styles.headerInner}>
          <div class={styles.brand}>
            <span class={styles.brandIcon} aria-hidden="true">
              🐳
            </span>
            <div>
              <h1 class={styles.brandTitle}>Dockerfile Explainer</h1>
              <p class={styles.brandTagline}>
                Click any highlighted instruction to learn what it does
              </p>
            </div>
          </div>
        </div>
      </header>

      <main class={styles.main}>
        <div class={styles.toolbar}>
          <div class={styles.toolbarLeft}>
            <ExampleToggler
              value={activeExample}
              onChange={handleExampleChange}
              examples={exampleList}
            />
            <span class={styles.exampleDesc}>{EXAMPLES[activeExample].description}</span>
          </div>
          <span class={styles.hint} aria-live="polite">
            {isPanelOpen ? '' : 'Click any highlighted part of the Dockerfile to explore'}
          </span>
        </div>

        <div class={`${styles.workspace} ${isPanelOpen ? styles.workspacePanelOpen : ''}`}>
          <section class={styles.viewerSection} aria-label="Dockerfile viewer">
            <div class={styles.viewerHeader}>
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.fileName}>Dockerfile</span>
              <CopyButton text={EXAMPLES[activeExample].content} />
            </div>
            <DockerfileViewer
              lines={lines}
              activeTokenId={activeToken?.id ?? null}
              onTokenClick={handleTokenClick}
            />
          </section>

          <SidePanel
            token={activeToken}
            isOpen={isPanelOpen}
            onClose={handlePanelClose}
            onNavigate={handleRelated}
          />
        </div>
      </main>

      <footer class={styles.footer}>
        <p>
          Built with{' '}
          <a href="https://preactjs.com" target="_blank" rel="noopener noreferrer">
            Preact
          </a>
          {' · '}
          <a
            href="https://github.com/abraham/dockerfile-pub"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
