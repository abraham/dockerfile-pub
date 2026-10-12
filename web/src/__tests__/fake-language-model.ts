import { vi } from 'vitest';

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

/** A reply in the format the system prompt asks for (AIR-22). */
export function markdownReply(dockerfile: string, changes: string[] = []): string {
  return `\`\`\`dockerfile\n${dockerfile}\n\`\`\`\n\nChanges:\n${changes.map((c) => `- ${c}`).join('\n')}`;
}

export const VALID_REPLY = markdownReply(VALID_DOCKERFILE, [
  'Runs the app as the non-root node user.',
]);

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
  const sessions: { session: LanguageModel; destroy: ReturnType<typeof vi.fn> }[] = [];
  const prompts: string[] = [];

  function makeSession(): LanguageModel {
    const destroy = vi.fn();
    // Only the members the app uses; an async generator stands in for the ReadableStream.
    const session = {
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
    } as unknown as LanguageModel;
    sessions.push({ session, destroy });
    return session;
  }

  const create = vi.fn(async ({ monitor }: LanguageModelCreateOptions) => {
    const target = new EventTarget();
    monitor?.(target as CreateMonitor);
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
  // Like Chrome's, a class whose constructor throws, so code that calls it fails here too.
  const model = class {
    static availability = availability;
    static create = create;
    constructor() {
      throw new TypeError('Illegal constructor');
    }
  } as unknown as typeof LanguageModel;
  return { model, create, availability, sessions, prompts };
}
