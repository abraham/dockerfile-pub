import { vi } from 'vitest';
import type {
  Availability,
  LanguageModelCreateOptions,
  LanguageModelPromptOptions,
  LanguageModelSession,
  LanguageModelStatic,
} from '../ai/types';

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

export const VALID_DOCKERFILE = `FROM node:26-alpine
WORKDIR /app
COPY . .
RUN npm install
USER node
CMD ["node", "server.js"]`;

export const VALID_REPLY = JSON.stringify({
  dockerfile: VALID_DOCKERFILE,
  changes: ['Runs the app as the non-root node user.'],
});

export interface FakeOptions {
  availability?: Availability;
  /** The whole reply, streamed in a few chunks. */
  reply?: string;
  /** Download progress values to report from create(), after `downloadGate` if given. */
  download?: number[];
  downloadGate?: Promise<void>;
  /** Streaming waits for this, so tests can observe the generating state. */
  promptGate?: Promise<void>;
  createError?: Error;
  promptError?: Error;
  /** measureContextUsage() result; the context window is 1000. */
  usage?: number;
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function untilAborted(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(abortError())));
}

/** A scripted stand-in for Chrome's `LanguageModel` (spec §11). */
export function fakeLanguageModel(options: FakeOptions = {}) {
  const sessions: { session: LanguageModelSession; destroy: ReturnType<typeof vi.fn> }[] = [];
  const prompts: string[] = [];

  function makeSession(): LanguageModelSession {
    const destroy = vi.fn();
    const session: LanguageModelSession = {
      contextUsage: 100,
      contextWindow: 1000,
      measureContextUsage: () => Promise.resolve(options.usage ?? 200),
      async *promptStreaming(input: string, { signal }: LanguageModelPromptOptions = {}) {
        prompts.push(input);
        if (options.promptGate) await Promise.race([options.promptGate, untilAborted(signal)]);
        if (options.promptError) throw options.promptError;
        const reply = options.reply ?? VALID_REPLY;
        const size = Math.ceil(reply.length / 3);
        for (let i = 0; i < reply.length; i += size) {
          if (signal?.aborted) throw abortError();
          yield reply.slice(i, i + size);
        }
      },
      clone: () => Promise.resolve(makeSession()),
      destroy,
    };
    sessions.push({ session, destroy });
    return session;
  }

  const create = vi.fn(async ({ monitor }: LanguageModelCreateOptions) => {
    const target = new EventTarget();
    monitor?.(target);
    // Chrome reports progress asynchronously, never during the create() call itself.
    await Promise.resolve();
    if (options.download) {
      const [first, ...rest] = options.download;
      target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded: first }));
      await options.downloadGate;
      for (const loaded of rest) {
        target.dispatchEvent(Object.assign(new Event('downloadprogress'), { loaded }));
      }
    }
    if (options.createError) throw options.createError;
    return makeSession();
  });

  const availability = vi.fn(() => Promise.resolve(options.availability ?? 'available'));
  const model: LanguageModelStatic = { availability, create };
  return { model, create, availability, sessions, prompts };
}
