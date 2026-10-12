// Minimal local types for the parts of Chrome's Prompt API used here (AIR-5), instead of a dependency.

export type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface LanguageModelExpected {
  type: 'text';
  languages: string[];
}

export interface LanguageModelOptions {
  expectedInputs: LanguageModelExpected[];
  expectedOutputs: LanguageModelExpected[];
}

export interface LanguageModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LanguageModelCreateOptions extends LanguageModelOptions {
  initialPrompts?: LanguageModelMessage[];
  /** Receives a target that fires `downloadprogress` events with `loaded` from 0 to 1. */
  monitor?: (monitor: EventTarget) => void;
  signal?: AbortSignal;
}

export interface LanguageModelPromptOptions {
  signal?: AbortSignal;
  responseConstraint?: object;
}

export interface LanguageModelSession {
  readonly contextUsage: number;
  readonly contextWindow: number;
  measureContextUsage(input: string, options?: LanguageModelPromptOptions): Promise<number>;
  promptStreaming(input: string, options?: LanguageModelPromptOptions): AsyncIterable<string>;
  clone(options?: { signal?: AbortSignal }): Promise<LanguageModelSession>;
  destroy(): void;
}

export interface LanguageModelStatic {
  availability(options: LanguageModelOptions): Promise<Availability>;
  create(options: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}
