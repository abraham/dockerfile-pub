import { useState, useRef, useCallback } from 'preact/hooks';
import styles from './CopyButton.module.css';

/**
 * A button that copies the given text to the clipboard.
 * Shows a brief "Copied!" confirmation that auto-reverts after 2 seconds.
 *
 * @param {{ text: string }} props
 */
export function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  const handleClick = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      type="button"
      class={styles.button}
      onClick={handleClick}
      aria-label={copied ? 'Copied to clipboard' : 'Copy Dockerfile to clipboard'}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
