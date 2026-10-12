import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Explanation } from '../data/explanations';
import type { ExplanationRef } from '../data/tokenizer';
import { ExplanationContent } from './ExplanationContent';
import styles from './ExplanationPanel.module.css';

export const PANEL_ID = 'explanation-panel';

export interface PanelEntry {
  /** `refKey(ref)`: identifies the entry for scroll reset (PNL-29). */
  key: string;
  ref: ExplanationRef;
  explanation: Explanation;
}

interface ExplanationPanelProps {
  /** What to show; `null` means closed (PNL-1). */
  entry: PanelEntry | null;
  /** Title of the entry Back returns to, or `null` when there is none. */
  previousTitle: string | null;
  onBack: () => void;
  onClose: () => void;
  onNavigate: (ref: ExplanationRef) => void;
}

/** The longest transition on `el`, in milliseconds. */
function transitionMs(el: Element): number {
  const style = getComputedStyle(el);
  const longest = (value: string) =>
    Math.max(
      0,
      ...value
        .split(',')
        .map((part) => parseFloat(part) * (part.trim().endsWith('ms') ? 1 : 1000))
        .filter((ms) => Number.isFinite(ms)),
    );
  return longest(style.transitionDuration) + longest(style.transitionDelay);
}

/** The non-modal explanation panel: open/close, Escape, Back and Close (§2). */
export function ExplanationPanel({
  entry,
  previousTitle,
  onBack,
  onClose,
  onNavigate,
}: ExplanationPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [lastEntry, setLastEntry] = useState(entry);
  const [exited, setExited] = useState(true);
  const isOpen = entry !== null;

  useEffect(() => {
    if (entry) setLastEntry(entry);
  }, [entry]);

  // Keep the last entry rendered until the closing transition ends (PNL-2).
  useEffect(() => {
    if (isOpen) {
      setExited(false);
      return;
    }
    const panel = panelRef.current;
    const duration = panel ? transitionMs(panel) : 0;
    if (!panel || duration === 0) {
      setExited(true);
      return;
    }
    const finish = () => setExited(true);
    const onEnd = (event: TransitionEvent) => {
      if (event.target === panel) finish();
    };
    panel.addEventListener('transitionend', onEnd);
    // Fallback for when no transitionend arrives (e.g. the tab is hidden).
    const timer = setTimeout(finish, duration + 50);
    return () => {
      panel.removeEventListener('transitionend', onEnd);
      clearTimeout(timer);
    };
  }, [isOpen]);

  // A layout effect, so Escape works from the first frame the panel is open.
  useLayoutEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // As a bottom sheet, reserve the sheet's height on the page (PNL-18).
  useEffect(() => {
    const panel = panelRef.current;
    if (!isOpen || !panel || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => {
      const isSheet = getComputedStyle(panel).position === 'fixed';
      root.style.setProperty('--panel-sheet-height', isSheet ? `${panel.offsetHeight}px` : '0px');
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--panel-sheet-height');
    };
  }, [isOpen]);

  const shown = entry ?? (exited ? null : lastEntry);
  const shownKey = shown?.key;

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [shownKey]);

  // The activated button may disappear, so focus the heading, which persists (PNL-34).
  const navigate = (ref: ExplanationRef) => {
    onNavigate(ref);
    headingRef.current?.focus();
  };
  const back = () => {
    onBack();
    headingRef.current?.focus();
  };

  return (
    <aside
      ref={panelRef}
      id={PANEL_ID}
      data-testid="side-panel"
      data-state={isOpen ? 'open' : 'closed'}
      class={`${styles.panel} ${isOpen ? styles.open : ''}`}
      aria-label="Explanation"
      inert={!isOpen}
    >
      {shown && (
        <ExplanationContent
          explanation={shown.explanation}
          headingRef={headingRef}
          bodyRef={bodyRef}
          onNavigate={navigate}
          back={
            isOpen &&
            previousTitle !== null && (
              <button
                type="button"
                class={styles.backButton}
                aria-label={`Back to ${previousTitle}`}
                onClick={back}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
            )
          }
          close={
            <button
              type="button"
              class={styles.closeButton}
              onClick={onClose}
              aria-label="Close explanation"
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
          }
        />
      )}
    </aside>
  );
}
