import { useState, useRef, useCallback } from 'preact/hooks';
import styles from './CopyButton.module.css';

type CopyStatus = 'idle' | 'copied' | 'failed';

const LABELS: Record<CopyStatus, { text: string; ariaLabel: string }> = {
  idle: { text: 'Copy', ariaLabel: 'Copy Dockerfile to clipboard' },
  copied: { text: 'Copied!', ariaLabel: 'Copied to clipboard' },
  failed: { text: 'Copy failed', ariaLabel: 'Copy to clipboard failed' },
};

/**
 * A button that copies the given text to the clipboard.
 * Shows a brief "Copied!" or "Copy failed" message that auto-reverts after 2 seconds.
 */
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showStatus = useCallback((next: Exclude<CopyStatus, 'idle'>) => {
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

  const label = LABELS[status];

  return (
    <button
      type="button"
      class={className ?? styles.button}
      onClick={handleClick}
      aria-label={label.ariaLabel}
    >
      {label.text}
    </button>
  );
}
