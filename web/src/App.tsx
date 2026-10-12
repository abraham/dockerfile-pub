import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { ExampleToggler } from './components/ExampleToggler';
import { DockerfileViewer, revealToken, tokenElementId } from './components/DockerfileViewer';
import { ExplanationPanel, PANEL_ID } from './components/ExplanationPanel';
import type { PanelEntry } from './components/ExplanationPanel';
import { CopyButton } from './components/CopyButton';
import { tokenize, refKey } from './data/tokenizer';
import type { ExplanationRef } from './data/tokenizer';
import { EXAMPLES } from './data/examples';
import { getExplanation, flatten } from './data/explanations';
import type { Explanation } from './data/explanations';
import type { ResolvedToken } from './components/DockerfileViewer';
import styles from './App.module.css';

const EXAMPLE_KEYS = Object.keys(EXAMPLES);
const MAX_STACK = 20;

/** The open panel: the token that opened it and the explanations shown since (§3). */
type PanelState = { sourceTokenId: string; stack: PanelEntry[] } | null;

function entryFor(ref: ExplanationRef, explanation: Explanation): PanelEntry {
  return { key: refKey(ref), ref, explanation };
}

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
  const [panel, setPanel] = useState<PanelState>(null);
  const panelRef = useRef(panel);
  useLayoutEffect(() => {
    panelRef.current = panel;
  }, [panel]);
  const viewerSectionRef = useRef<HTMLElement>(null);

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

  const handleTokenSelect = useCallback((token: ResolvedToken) => {
    const { ref, explanation } = token;
    if (!ref || !explanation) return;
    setPanel((prev) =>
      prev?.sourceTokenId === token.id
        ? prev
        : { sourceTokenId: token.id, stack: [entryFor(ref, explanation)] },
    );
  }, []);

  const handleNavigate = useCallback((ref: ExplanationRef) => {
    const explanation = getExplanation(ref);
    if (!explanation) return;
    const entry = entryFor(ref, explanation);
    setPanel((prev) => {
      if (!prev || prev.stack[prev.stack.length - 1].key === entry.key) return prev;
      return { ...prev, stack: [...prev.stack, entry].slice(-MAX_STACK) };
    });
  }, []);

  const handleBack = useCallback(() => {
    setPanel((prev) =>
      prev && prev.stack.length > 1 ? { ...prev, stack: prev.stack.slice(0, -1) } : prev,
    );
  }, []);

  const handleClose = useCallback(() => {
    // Return focus before the panel turns inert, or it would fall to <body> (PNL-23, PNL-32).
    const active = document.activeElement;
    const wouldBeLost = !active || active === document.body || active.closest(`#${PANEL_ID}`);
    const source = panelRef.current?.sourceTokenId;
    if (wouldBeLost && source) document.getElementById(tokenElementId(source))?.focus();
    setPanel(null);
  }, []);

  const handleExampleChange = useCallback((key: string) => {
    setActiveExample(key);
    setPanel(null);
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

  const entry = panel ? panel.stack[panel.stack.length - 1] : null;
  const previous = panel && panel.stack.length > 1 ? panel.stack[panel.stack.length - 2] : null;
  const activeTokenId = panel?.stack.length === 1 ? panel.sourceTokenId : null;
  const status = entry ? `${entry.explanation.title}: ${flatten(entry.explanation.short)}` : '';
  const sourceTokenId = panel?.sourceTokenId ?? null;

  // Keep the source token visible as the viewer narrows or the sheet grows (PNL-28).
  useEffect(() => {
    if (!sourceTokenId) return;
    const reveal = () => revealToken(sourceTokenId, document.getElementById(PANEL_ID));
    const frame = requestAnimationFrame(reveal);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    for (const el of [viewerSectionRef.current, document.getElementById(PANEL_ID), document.body]) {
      if (el) observer?.observe(el);
    }
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [sourceTokenId]);

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
          <span class={styles.hint}>
            {entry ? '' : 'Click any highlighted part of the Dockerfile to explore'}
          </span>
        </div>

        <div role="status" class="sr-only">
          {status}
        </div>

        <div class={styles.workspace}>
          <section
            ref={viewerSectionRef}
            class={styles.viewerSection}
            aria-label="Dockerfile viewer"
          >
            <div class={styles.viewerHeader}>
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.dot} aria-hidden="true" />
              <span class={styles.fileName}>Dockerfile</span>
              <CopyButton text={EXAMPLES[activeExample].content} />
            </div>
            <DockerfileViewer
              lines={lines}
              activeTokenId={activeTokenId}
              onTokenSelect={handleTokenSelect}
            />
          </section>

          <ExplanationPanel
            entry={entry}
            previousTitle={previous?.explanation.title ?? null}
            onBack={handleBack}
            onClose={handleClose}
            onNavigate={handleNavigate}
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
