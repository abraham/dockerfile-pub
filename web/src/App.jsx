import { useState, useMemo, useCallback } from 'preact/hooks';
import { ExampleToggler } from './components/ExampleToggler';
import { DockerfileViewer } from './components/DockerfileViewer';
import { SidePanel } from './components/SidePanel';
import { CopyButton } from './components/CopyButton';
import { tokenize } from './data/tokenizer';
import { EXAMPLES } from './data/examples';
import { getExplanation } from './data/explanations';
import styles from './App.module.css';

/** @typedef {import('./components/DockerfileViewer').ResolvedToken} ResolvedToken */

const EXAMPLE_KEYS = Object.keys(EXAMPLES);

function loadSavedExample() {
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
  const [activeToken, setActiveToken] = useState(/** @type {ResolvedToken | null} */ (null));
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const lines = useMemo(
    () =>
      tokenize(EXAMPLES[activeExample].content).map((line) => ({
        ...line,
        tokens: line.tokens.map((token) => ({
          ...token,
          explanation: getExplanation(token.explanationKey),
        })),
      })),
    [activeExample],
  );

  const handleTokenClick = useCallback((/** @type {ResolvedToken} */ token) => {
    if (!token.explanation) return;
    setActiveToken(token);
    setIsPanelOpen(true);
  }, []);

  const handlePanelClose = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  const handleExampleChange = useCallback((/** @type {string} */ key) => {
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
            {isPanelOpen ? '' : 'Click a keyword, flag, or command fragment to explore'}
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

          <SidePanel token={activeToken} isOpen={isPanelOpen} onClose={handlePanelClose} />
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
