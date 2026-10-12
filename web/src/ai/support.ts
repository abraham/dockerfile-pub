import type { LanguageModelOptions, LanguageModelStatic } from './types';

/** The options for every `availability()` and `create()` call (AIR-14). */
export const SESSION_OPTIONS: LanguageModelOptions = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

/**
 * Resolves to the Prompt API if the on-device model can be used here, now or
 * after a download; otherwise to null (AIR-7, AIR-8). Never starts a download.
 */
export async function findLanguageModel(): Promise<LanguageModelStatic | null> {
  const model = (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  if (!model) return null;
  try {
    return (await model.availability(SESSION_OPTIONS)) === 'unavailable' ? null : model;
  } catch {
    return null;
  }
}
