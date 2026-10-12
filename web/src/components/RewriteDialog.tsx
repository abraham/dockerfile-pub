import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { RewriteError, rewriteDockerfile } from '../ai/language-model';
import type { RewriteErrorCode } from '../ai/language-model';
import { SESSION_OPTIONS } from '../ai/support';
import { diffLines } from '../data/rewrite/diff';
import { REQUEST_MAX_LENGTH } from '../data/rewrite/prompt';
import type { RewriteResult } from '../data/rewrite/validate';
import { CopyButton } from './CopyButton';
import styles from './RewriteDialog.module.css';

export const SUGGESTIONS = [
  'Make the image smaller',
  'Run as a non-root user',
  'Pin base image versions',
  'Add a health check',
  'Use a multi-stage build',
];

/** Fixed messages; raw model text and exception messages are never shown (AIR-27). */
export const ERROR_MESSAGES: Record<RewriteErrorCode, string> = {
  unavailable: "Chrome's on-device AI isn't available on this device right now.",
  prepare: "The on-device model couldn't be prepared. Try again later.",
  'too-long':
    'This Dockerfile and request are too long for the on-device model. Try a shorter request.',
  invalid: "The AI's answer wasn't a valid Dockerfile. Try again, or rephrase your request.",
  generic: 'Something went wrong with the on-device model.',
};

type Phase =
  | { kind: 'request' }
  | { kind: 'downloading'; loaded: number }
  | { kind: 'generating'; chars: number }
  | { kind: 'review'; result: RewriteResult }
  | { kind: 'error'; code: RewriteErrorCode };

/** One short announcement per state change, not per progress tick (AIR-28). */
function statusText(phase: Phase): string {
  switch (phase.kind) {
    case 'downloading':
      return phase.loaded < 1 ? "Downloading Chrome's on-device AI model" : 'Preparing the model…';
    case 'generating':
      return 'Rewriting…';
    case 'review':
      return 'Rewrite ready. Review the changes.';
    case 'error':
      return ERROR_MESSAGES[phase.code];
    default:
      return '';
  }
}

export interface RewriteDialogProps {
  model: typeof LanguageModel;
  dockerfile: string;
  onApply: (dockerfile: string, request: string) => void;
  onClose: () => void;
}

/** The modal rewrite dialog (§5.2): request, download, generation, review and apply. */
export function RewriteDialog({ model, dockerfile, onApply, onClose }: RewriteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // Assume a download until the check says otherwise, so early progress is never hidden.
  const availabilityRef = useRef<Availability>('downloadable');
  const [request, setRequest] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'request' });
  const [showFile, setShowFile] = useState(false);

  useLayoutEffect(() => {
    dialogRef.current?.showModal();
    return () => controllerRef.current?.abort();
  }, []);

  // The model can be removed at any time, e.g. when disk space runs low (AIR-9).
  useEffect(() => {
    let current = true;
    model.availability(SESSION_OPTIONS).then(
      (availability) => {
        availabilityRef.current = availability;
        if (current && availability === 'unavailable') {
          setPhase({ kind: 'error', code: 'unavailable' });
        }
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [model]);

  useLayoutEffect(() => {
    if (phase.kind === 'request') textareaRef.current?.focus();
    if (phase.kind === 'review' || phase.kind === 'error') resultHeadingRef.current?.focus();
  }, [phase.kind]);

  const diff = useMemo(
    () => (phase.kind === 'review' ? diffLines(dockerfile, phase.result.dockerfile) : []),
    [phase, dockerfile],
  );

  const busy = phase.kind === 'downloading' || phase.kind === 'generating';
  const blocked = phase.kind === 'error' && phase.code === 'unavailable';
  const canRewrite = request.trim().length > 0 && !busy && !blocked;

  function handleRewrite() {
    if (!canRewrite) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const download = availabilityRef.current !== 'available';
    setPhase(download ? { kind: 'downloading', loaded: 0 } : { kind: 'generating', chars: 0 });
    setShowFile(false);
    rewriteDockerfile(model, {
      request,
      dockerfile,
      signal: controller.signal,
      onProgress(progress) {
        if (controller.signal.aborted) return;
        if (progress.phase === 'generate') setPhase({ kind: 'generating', chars: progress.chars });
        else if (download) setPhase({ kind: 'downloading', loaded: progress.loaded });
      },
    }).then(
      (result) => {
        if (controller.signal.aborted) return;
        availabilityRef.current = 'available';
        setPhase({ kind: 'review', result });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setPhase({ kind: 'error', code: error instanceof RewriteError ? error.code : 'generic' });
      },
    );
  }

  function backToRequest() {
    controllerRef.current?.abort();
    setPhase({ kind: 'request' });
  }

  function addSuggestion(text: string) {
    setRequest((prev) =>
      (prev.trim() ? `${prev.trim()}\n${text}` : text).slice(0, REQUEST_MAX_LENGTH),
    );
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: JSX.TargetedKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleRewrite();
    }
  }

  function handleClose() {
    controllerRef.current?.abort();
    onClose();
  }

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      class={styles.dialog}
      aria-labelledby="rewrite-title"
      aria-describedby="rewrite-note"
      onClose={handleClose}
    >
      <div class={styles.header}>
        <h2 id="rewrite-title" class={styles.title}>
          Rewrite this Dockerfile
        </h2>
        <p id="rewrite-note" class={styles.note}>
          {"Runs on your device with Chrome's built-in AI. Nothing is sent to a server."}
        </p>
      </div>

      <div role="status" class="sr-only">
        {statusText(phase)}
      </div>

      <div class={styles.body}>
        {phase.kind === 'review' ? (
          <>
            <section class={styles.result} aria-labelledby="rewrite-changes">
              <h3
                id="rewrite-changes"
                ref={resultHeadingRef}
                tabIndex={-1}
                class={styles.resultTitle}
              >
                What changed <span class={styles.caveat}>(AI-generated, may be inaccurate)</span>
              </h3>
              {phase.result.changes.length > 0 ? (
                <ul class={styles.changes}>
                  {phase.result.changes.map((change, i) => (
                    <li key={i}>{change}</li>
                  ))}
                </ul>
              ) : (
                <p class={styles.muted}>{"The AI didn't list its changes."}</p>
              )}
            </section>
            <button
              type="button"
              class={styles.toggle}
              aria-pressed={showFile}
              onClick={() => setShowFile((prev) => !prev)}
            >
              Show full file
            </button>
            <div
              role="region"
              aria-label={showFile ? 'Rewritten Dockerfile' : 'Changes to the Dockerfile'}
              tabIndex={0}
              class={styles.code}
            >
              <pre>
                {showFile
                  ? phase.result.dockerfile
                  : diff.map((line, i) => (
                      <span
                        key={i}
                        class={
                          line.op === '+'
                            ? styles.added
                            : line.op === '-'
                              ? styles.removed
                              : undefined
                        }
                      >
                        {`${line.op} ${line.text}`}
                      </span>
                    ))}
              </pre>
            </div>
          </>
        ) : (
          <>
            <label for="rewrite-request" class={styles.label}>
              What do you need?
            </label>
            <textarea
              id="rewrite-request"
              ref={textareaRef}
              class={styles.textarea}
              rows={4}
              maxLength={REQUEST_MAX_LENGTH}
              value={request}
              readOnly={busy}
              aria-describedby="rewrite-count"
              placeholder="For example: use Python 3.13 and run as a non-root user"
              onInput={(event) => setRequest(event.currentTarget.value)}
              onKeyDown={handleKeyDown}
            />
            <p id="rewrite-count" class={styles.count}>
              {request.length}/{REQUEST_MAX_LENGTH}
              <span class="sr-only"> characters</span>
            </p>
            <ul class={styles.suggestions} aria-label="Suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    class={styles.chip}
                    disabled={busy || blocked}
                    onClick={() => addSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>

            {phase.kind === 'downloading' && (
              <div class={styles.progress}>
                {phase.loaded < 1 ? (
                  <>
                    <p>
                      {
                        "Downloading Chrome's on-device AI model. This happens once and may take a few minutes."
                      }
                    </p>
                    <progress
                      key="download"
                      value={phase.loaded}
                      max={1}
                      aria-label="Model download progress"
                    />
                    <span class={styles.muted}>{Math.round(phase.loaded * 100)}%</span>
                  </>
                ) : (
                  <>
                    <p>Preparing the model…</p>
                    <progress key="prepare" aria-label="Preparing the model" />
                  </>
                )}
              </div>
            )}

            {phase.kind === 'generating' && (
              <div class={styles.progress}>
                <p>Rewriting…</p>
                <progress aria-label="Rewriting" />
                <span class={styles.muted}>{phase.chars} characters received</span>
              </div>
            )}

            {phase.kind === 'error' && (
              <div class={styles.error}>
                <h3 ref={resultHeadingRef} tabIndex={-1} class={styles.resultTitle}>
                  {"Couldn't rewrite"}
                </h3>
                <p>{ERROR_MESSAGES[phase.code]}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div class={styles.actions}>
        {phase.kind === 'review' ? (
          <>
            <button
              type="button"
              class={styles.primary}
              onClick={() => {
                onApply(phase.result.dockerfile, request.trim());
                close();
              }}
            >
              Open in viewer
            </button>
            <CopyButton text={phase.result.dockerfile} className={styles.secondary} />
            <button type="button" class={styles.secondary} onClick={backToRequest}>
              Try again
            </button>
          </>
        ) : phase.kind === 'generating' ? (
          // Same position as Rewrite, so Preact reuses the element and focus stays on it.
          <button type="button" class={styles.secondary} onClick={backToRequest}>
            Stop
          </button>
        ) : (
          !blocked && (
            <button
              type="button"
              class={styles.primary}
              disabled={!canRewrite}
              onClick={handleRewrite}
            >
              {phase.kind === 'error' ? 'Try again' : 'Rewrite'}
            </button>
          )
        )}
        <button type="button" class={styles.secondary} onClick={close}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
