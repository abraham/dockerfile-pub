import { useState, useRef, useCallback } from 'preact/hooks';
import styles from './CopyButton.module.css';

/**
 * A button that copies the given text to the clipboard.
 * Shows a brief "Copied!" or "Copy failed" message that auto-reverts after 2 seconds.
 *
 * @param {{ text: string }} props
 */
export function CopyButton({ text }) {
  const [status, setStatus] = useState(/** @type {'idle' | 'copied' | 'failed'} */ ('idle'));
  const timeoutRef = useRef(/** @type {ReturnType<typeof setTimeout> | undefined} */ (undefined));

  const showStatus = useCallback((/** @type {'copied' | 'failed'} */ next) => {
    setStatus(next);
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setStatus('idle'), 2000);
  }, []);

  const handleClick = useCallback(() => {
    // navigator.clipboard is undefined in non-secure contexts and some embedded browsers.
    if (!navigator.clipboard?.writeText) {
      showStatus('failed');
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => showStatus('copied'),
      () => showStatus('failed'),
    );
  }, [text, showStatus]);

  const label = {
    idle: ['Copy', 'Copy Dockerfile to clipboard'],
    copied: ['Copied!', 'Copied to clipboard'],
    failed: ['Copy failed', 'Copy to clipboard failed'],
  }[status];

  return (
    <button type="button" class={styles.button} onClick={handleClick} aria-label={label[1]}>
      {label[0]}
    </button>
  );
}
