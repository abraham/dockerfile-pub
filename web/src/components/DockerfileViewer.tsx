import type { Line, Token as TokenData } from '../data/tokenizer';
import type { Explanation } from '../data/explanations';
import styles from './DockerfileViewer.module.css';

/**
 * A token with its explanation resolved by `App` (ARCH-2). `summary` is the
 * flattened `short` text, used for the tooltip and accessible name (EXP-29).
 */
export type ResolvedToken = TokenData & { explanation: Explanation | null; summary: string };

export type ResolvedLine = Omit<Line, 'tokens'> & { tokens: ResolvedToken[] };

interface DockerfileViewerProps {
  lines: ResolvedLine[];
  activeTokenId: string | null;
  onTokenClick: (token: ResolvedToken) => void;
}

/** Renders a tokenized Dockerfile; every token with an explanation is a button. */
export function DockerfileViewer({ lines, activeTokenId, onTokenClick }: DockerfileViewerProps) {
  return (
    <div class={styles.viewer} role="region" aria-label="Dockerfile source">
      <pre class={styles.pre}>
        <code>
          {lines.map((line) => (
            <div
              key={line.lineIndex}
              class={`${styles.line} ${line.type === 'blank' ? styles.blank : ''}`}
              data-line={line.lineIndex + 1}
            >
              <span class={styles.lineNumber} aria-hidden="true">
                {line.lineIndex + 1}
              </span>
              <span class={styles.lineContent}>
                {line.tokens.map((token) => (
                  <Token
                    key={token.id}
                    token={token}
                    isActive={token.id === activeTokenId}
                    onTokenClick={onTokenClick}
                  />
                ))}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

interface TokenProps {
  token: ResolvedToken;
  isActive: boolean;
  onTokenClick: (token: ResolvedToken) => void;
}

/** Renders a single token, interactive if it has an explanation. */
function Token({ token, isActive, onTokenClick }: TokenProps) {
  const explanation = token.explanation;
  const isInteractive = explanation != null;

  const className = [
    styles.token,
    styles[`type-${token.type}`],
    isActive ? styles.active : '',
    isInteractive ? styles.interactive : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (isInteractive) {
    return (
      <button
        type="button"
        class={className}
        onClick={() => onTokenClick(token)}
        title={token.summary}
        aria-label={`${token.text}: ${token.summary}`}
        aria-pressed={isActive}
      >
        {token.text}
      </button>
    );
  }

  return <span class={className}>{token.text}</span>;
}
