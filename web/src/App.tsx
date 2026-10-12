import { useState, useMemo, useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { ExampleToggler } from './components/ExampleToggler';
import { DockerfileViewer, revealToken, tokenElementId } from './components/DockerfileViewer';
import { ExplanationPanel, PANEL_ID } from './components/ExplanationPanel';
import type { PanelEntry } from './components/ExplanationPanel';
import { CopyButton } from './components/CopyButton';
import { RewriteButton } from './components/RewriteButton';
import { findLanguageModel } from './ai/support';
import type { LanguageModelStatic } from './ai/types';
import { tokenize, refKey } from './data/tokenizer';
import type { ExplanationRef } from './data/tokenizer';
import { EXAMPLES } from './data/examples';
import { truncate } from './data/text';
import { getExplanation, flatten } from './data/explanations';
import type { Explanation } from './data/explanations';
import type { ResolvedToken } from './components/DockerfileViewer';
import styles from './App.module.css';

const EXAMPLE_KEYS = Object.keys(EXAMPLES);
const MAX_STACK = 20;
/** The in-memory example added by an AI rewrite; never persisted (AIR-21). */
const REWRITTEN = 'rewritten';

interface Rewritten {
  content: string;
  request: string;
}

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
  const [rewritten, setRewritten] = useState<Rewritten | null>(null);
  const [languageModel, setLanguageModel] = useState<LanguageModelStatic | null>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const panelRef = useRef(panel);
  useLayoutEffect(() => {
    panelRef.current = panel;
  }, [panel]);
  const viewerSectionRef = useRef<HTMLElement>(null);

  const content =
    activeExample === REWRITTEN && rewritten ? rewritten.content : EXAMPLES[activeExample].content;
  const description =
    activeExample === REWRITTEN && rewritten
      ? `AI-generated, may be inaccurate: ${truncate(rewritten.request, 80)}`
      : EXAMPLES[activeExample].description;

  const checkLanguageModel = useCallback(() => {
    void findLanguageModel().then(setLanguageModel);
  }, []);
  useEffect(checkLanguageModel, [checkLanguageModel]);

  const lines = useMemo(
    () =>
      tokenize(content).map((line) => ({
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
    [content],
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
      const [own, ...rest] = [...prev.stack, entry];
      return { ...prev, stack: [own, ...rest.slice(1 - MAX_STACK)] };
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
    if (key === REWRITTEN) return;
    try {
      localStorage.setItem('df-example', key);
    } catch {
      // ignore
    }
  }, []);

  const handleRewriteApply = useCallback((dockerfile: string, request: string) => {
    setRewritten({ content: dockerfile, request });
    setActiveExample(REWRITTEN);
    setPanel(null);
  }, []);

  const hasRewritten = rewritten !== null;
  const exampleList = useMemo(() => {
    const list = EXAMPLE_KEYS.map((key) => ({ key, label: EXAMPLES[key].label }));
    return hasRewritten ? [...list, { key: REWRITTEN, label: 'Rewritten' }] : list;
  }, [hasRewritten]);

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
            <span class={styles.exampleDesc}>{description}</span>
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
              <CopyButton text={content} />
              {languageModel && (
                <RewriteButton
                  model={languageModel}
                  dockerfile={content}
                  onApply={handleRewriteApply}
                  onClose={checkLanguageModel}
                />
              )}
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
