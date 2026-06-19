import { getExplanation } from '../data/explanations';
import { TOKEN_TYPE } from '../data/tokenizer';
import styles from './DockerfileViewer.module.css';

/**
 * Renders a tokenized Dockerfile with interactive keyword/flag tokens.
 *
 * @param {{
 *   lines: import('../data/tokenizer').Line[],
 *   activeTokenId: string|null,
 *   onTokenClick: (token: import('../data/tokenizer').Token) => void
 * }} props
 */
export function DockerfileViewer({ lines, activeTokenId, onTokenClick }) {
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

/**
 * Renders a single token, interactive if it has an explanation.
 */
function Token({ token, isActive, onTokenClick }) {
  const explanation = getExplanation(token.explanationKey);
  const isInteractive =
    explanation !== null &&
    (token.type === TOKEN_TYPE.KEYWORD || token.type === TOKEN_TYPE.FLAG);

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
        title={explanation.short}
        aria-label={`${token.text}: ${explanation.short}`}
        aria-pressed={isActive}
      >
        {token.text}
      </button>
    );
  }

  return <span class={className}>{token.text}</span>;
}
