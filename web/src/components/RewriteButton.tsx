import { useCallback, useRef, useState } from 'preact/hooks';
import type { RewriteDialog as RewriteDialogComponent } from './RewriteDialog';
import styles from './RewriteButton.module.css';

interface RewriteButtonProps {
  model: typeof LanguageModel;
  dockerfile: string;
  onApply: (dockerfile: string, request: string) => void;
  onClose: () => void;
}

/** Opens the rewrite dialog, loading its chunk on first use (AIR-12, AIR-16). */
export function RewriteButton({ model, dockerfile, onApply, onClose }: RewriteButtonProps) {
  const [Dialog, setDialog] = useState<typeof RewriteDialogComponent | null>(null);
  const [open, setOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function handleClick() {
    setLoadFailed(false);
    if (!Dialog) {
      try {
        const { RewriteDialog } = await import('./RewriteDialog');
        setDialog(() => RewriteDialog);
      } catch {
        // E.g. offline, or a deploy replaced the chunk; the next click retries (ARCH-28).
        setLoadFailed(true);
        return;
      }
    }
    setOpen(true);
  }

  const handleClose = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
    onClose();
  }, [onClose]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        class={styles.button}
        aria-label={
          loadFailed
            ? "Rewrite couldn't load. Try again"
            : 'Rewrite this Dockerfile with on-device AI'
        }
        aria-haspopup="dialog"
        onClick={() => void handleClick()}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          <path d="M8 0l1.8 6.2L16 8l-6.2 1.8L8 16l-1.8-6.2L0 8l6.2-1.8z" />
        </svg>
        {loadFailed ? "Rewrite couldn't load" : 'Rewrite'}
      </button>
      {open && Dialog && (
        <Dialog model={model} dockerfile={dockerfile} onApply={onApply} onClose={handleClose} />
      )}
    </>
  );
}
