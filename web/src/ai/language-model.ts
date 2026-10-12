import { SESSION_OPTIONS } from './support';
import { SYSTEM_PROMPT, buildUserMessage } from '../data/rewrite/prompt';
import { parseReply } from '../data/rewrite/validate';
import type { RewriteResult } from '../data/rewrite/validate';

/** The error rows of §7, except "aborted", which is not an error. */
export type RewriteErrorCode = 'unavailable' | 'prepare' | 'too-long' | 'invalid' | 'generic';

export class RewriteError extends Error {
  readonly code: RewriteErrorCode;

  constructor(code: RewriteErrorCode) {
    super(code);
    this.name = 'RewriteError';
    this.code = code;
  }
}

export type RewriteProgress =
  { phase: 'download'; loaded: number } | { phase: 'generate'; chars: number };

export interface RewriteRequest {
  request: string;
  dockerfile: string;
  signal: AbortSignal;
  onProgress: (progress: RewriteProgress) => void;
}

interface BaseSession {
  session: Promise<LanguageModel>;
  /** Download progress goes to whichever requests are waiting, even if an earlier one gave up. */
  listeners: Set<(loaded: number) => void>;
}

const bases = new WeakMap<typeof LanguageModel, BaseSession>();

/** One base session per page with the system prompt; requests clone it (AIR-15). */
function baseSession(model: typeof LanguageModel): BaseSession {
  const existing = bases.get(model);
  if (existing) return existing;
  const listeners = new Set<(loaded: number) => void>();
  const session = model.create({
    ...SESSION_OPTIONS,
    initialPrompts: [{ role: 'system', content: SYSTEM_PROMPT }],
    monitor(monitor) {
      monitor.addEventListener('downloadprogress', (event) => {
        for (const listener of listeners) listener(event.loaded);
      });
    },
  });
  const base = { session, listeners };
  bases.set(model, base);
  session.then(
    (created) =>
      addEventListener(
        'pagehide',
        () => {
          bases.delete(model);
          created.destroy();
        },
        { once: true },
      ),
    () => bases.delete(model),
  );
  return base;
}

/** Waits for `promise`, rejecting early with an AbortError if `signal` aborts. */
function unlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

/** Maps a platform error to a fixed error code; details go to the console only (AIR-27). */
function toRewriteError(error: unknown, fallback: RewriteErrorCode): unknown {
  if (error instanceof RewriteError || errorName(error) === 'AbortError') return error;
  console.debug('On-device AI error:', error);
  if (errorName(error) === 'QuotaExceededError') return new RewriteError('too-long');
  if (errorName(error) === 'NotSupportedError') return new RewriteError('generic');
  return new RewriteError(fallback);
}

/**
 * Rewrites `dockerfile` with the on-device model. Must be called from a click
 * handler: it calls `create()` before its first `await`, so a download keeps
 * the user activation it needs (AIR-17). Rejects with a `RewriteError`, or an
 * AbortError when `signal` aborts.
 */
export async function rewriteDockerfile(
  model: typeof LanguageModel,
  { request, dockerfile, signal, onProgress }: RewriteRequest,
): Promise<RewriteResult> {
  const base = baseSession(model);
  const onDownload = (loaded: number) => onProgress({ phase: 'download', loaded });
  base.listeners.add(onDownload);
  let session: LanguageModel;
  try {
    session = await unlessAborted(base.session, signal);
  } catch (error) {
    throw toRewriteError(error, 'prepare');
  } finally {
    base.listeners.delete(onDownload);
  }

  let clone: LanguageModel;
  try {
    clone = await session.clone({ signal });
  } catch (error) {
    throw toRewriteError(error, 'generic');
  }
  try {
    const input = buildUserMessage(request, dockerfile);
    const options = { signal };
    const usage = await clone.measureContextUsage(input, options);
    if (usage > clone.contextWindow - clone.contextUsage) throw new RewriteError('too-long');

    onProgress({ phase: 'generate', chars: 0 });
    let reply = '';
    for await (const chunk of clone.promptStreaming(input, options)) {
      reply += chunk;
      onProgress({ phase: 'generate', chars: reply.length });
    }
    const parsed = parseReply(reply);
    if (!parsed.ok) {
      console.debug(`Rejected the AI reply (${parsed.reason}):`, reply);
      throw new RewriteError('invalid');
    }
    return parsed.value;
  } catch (error) {
    throw toRewriteError(error, 'generic');
  } finally {
    clone.destroy();
  }
}
