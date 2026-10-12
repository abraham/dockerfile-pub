import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { Line, Token as TokenData } from '../data/tokenizer';
import type { Explanation } from '../data/explanations';
import styles from './DockerfileViewer.module.css';

/**
 * A token with its explanation resolved by `App` (ARCH-2). `summary` is the
 * flattened `short` text, used for the tooltip and accessible name (EXP-29).
 */
export type ResolvedToken = TokenData & { explanation: Explanation | null; summary: string };

export type ResolvedLine = Omit<Line, 'tokens'> & { tokens: ResolvedToken[] };

/** The DOM id of a token's button, for focus return and scrolling (PNL-23, PNL-28). */
export function tokenElementId(id: string): string {
  return `df-token-${id}`;
}

/**
 * Scrolls a token into view if any part is hidden, including behind a bottom
 * sheet (PNL-28). `nearest` keeps a visible token where it is.
 */
export function revealToken(id: string, sheet: HTMLElement | null): void {
  const el = document.getElementById(tokenElementId(id));
  if (!el) return;
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  if (!sheet || getComputedStyle(sheet).position !== 'fixed') return;
  // Measure against the sheet's resting position, not a mid-animation transform.
  const sheetTop = window.innerHeight - sheet.offsetHeight;
  const overlap = el.getBoundingClientRect().bottom - sheetTop;
  if (overlap > 0) window.scrollBy({ top: overlap + 8 });
}

interface NavToken {
  id: string;
  start: number;
  end: number;
}

function distance(token: NavToken, column: number): number {
  if (column < token.start) return token.start - column;
  if (column >= token.end) return column - token.end + 1;
  return 0;
}

/** The token in `row` that overlaps `column`, or else the closest one (PNL-24). */
function closest(row: NavToken[] | undefined, column: number): NavToken | undefined {
  return row?.reduce((best, token) =>
    distance(token, column) < distance(best, column) ? token : best,
  );
}

interface Cell {
  selectable: boolean;
  tokens: ResolvedToken[];
}

/** One cell per selectable token; runs of plain tokens share a cell. Every row gets one. */
function cells(tokens: ResolvedToken[]): Cell[] {
  const result: Cell[] = [];
  for (const token of tokens) {
    const selectable = token.explanation !== null;
    const last = result[result.length - 1];
    if (!selectable && last && !last.selectable) last.tokens.push(token);
    else result.push({ selectable, tokens: [token] });
  }
  return result.length ? result : [{ selectable: false, tokens: [] }];
}

interface DockerfileViewerProps {
  lines: ResolvedLine[];
  /** The token whose own explanation the open panel shows (PNL-33). */
  activeTokenId: string | null;
  onTokenSelect: (token: ResolvedToken) => void;
}

/**
 * Renders a tokenized Dockerfile as a layout grid: one tab stop, arrow keys
 * between selectable tokens (PNL-24).
 */
export function DockerfileViewer({ lines, activeTokenId, onTokenSelect }: DockerfileViewerProps) {
  const rows = useMemo(
    () =>
      lines
        .map((line) =>
          line.tokens
            .filter((token) => token.explanation)
            .map((token) => ({
              id: token.id,
              start: token.column,
              end: token.column + token.text.length,
            })),
        )
        .filter((row) => row.length > 0),
    [lines],
  );
  const flat = useMemo(() => rows.flat(), [rows]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const tabStopId = flat.some((t) => t.id === focusedId) ? focusedId : (flat[0]?.id ?? null);

  function handleKeyDown(event: JSX.TargetedKeyboardEvent<HTMLElement>) {
    const id = (event.target as HTMLElement).dataset.tokenId;
    const index = flat.findIndex((t) => t.id === id);
    if (index < 0) return;
    const current = flat[index];
    const rowIndex = rows.findIndex((row) => row.includes(current));
    const row = rows[rowIndex];
    const ctrl = event.ctrlKey || event.metaKey;
    let next: NavToken | undefined;
    switch (event.key) {
      case 'ArrowRight':
        next = flat[index + 1];
        break;
      case 'ArrowLeft':
        next = flat[index - 1];
        break;
      case 'ArrowDown':
        next = closest(rows[rowIndex + 1], current.start);
        break;
      case 'ArrowUp':
        next = closest(rows[rowIndex - 1], current.start);
        break;
      case 'Home':
        next = ctrl ? flat[0] : row[0];
        break;
      case 'End':
        next = ctrl ? flat[flat.length - 1] : row[row.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next) document.getElementById(tokenElementId(next.id))?.focus();
  }

  return (
    <div class={styles.viewer}>
      <pre class={styles.pre}>
        <code
          role="grid"
          aria-label="Dockerfile source"
          class={styles.grid}
          onKeyDown={handleKeyDown}
        >
          {lines.map((line) => (
            <div
              key={line.lineIndex}
              role="row"
              class={`${styles.line} ${line.type === 'blank' ? styles.blank : ''}`}
              data-line={line.lineIndex + 1}
            >
              <span class={styles.lineNumber} aria-hidden="true">
                {line.lineIndex + 1}
              </span>
              <span class={styles.lineContent}>
                {cells(line.tokens).map((cell, i) =>
                  cell.selectable ? (
                    <span key={i} role="gridcell">
                      <TokenButton
                        token={cell.tokens[0]}
                        isActive={cell.tokens[0].id === activeTokenId}
                        isTabStop={cell.tokens[0].id === tabStopId}
                        onSelect={onTokenSelect}
                        onFocus={setFocusedId}
                      />
                    </span>
                  ) : (
                    <span key={i} role="gridcell">
                      {cell.tokens.map((token) => (
                        <span
                          key={token.id}
                          class={`${styles.token} ${styles[`type-${token.type}`]}`}
                        >
                          {token.text}
                        </span>
                      ))}
                    </span>
                  ),
                )}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

interface TokenButtonProps {
  token: ResolvedToken;
  isActive: boolean;
  isTabStop: boolean;
  onSelect: (token: ResolvedToken) => void;
  onFocus: (id: string) => void;
}

function TokenButton({ token, isActive, isTabStop, onSelect, onFocus }: TokenButtonProps) {
  const className = [
    styles.token,
    styles[`type-${token.type}`],
    styles.interactive,
    isActive ? styles.active : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      id={tokenElementId(token.id)}
      data-token-id={token.id}
      class={className}
      tabIndex={isTabStop ? 0 : -1}
      onClick={() => {
        // Safari doesn't focus buttons on click, so move the tab stop here too.
        onFocus(token.id);
        onSelect(token);
      }}
      onFocus={() => onFocus(token.id)}
      title={token.summary}
      aria-label={`${token.text}: ${token.summary}`}
      aria-current={isActive ? 'true' : undefined}
    >
      {token.text}
    </button>
  );
}
