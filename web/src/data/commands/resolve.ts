import { lookupCommand, normalizeCommand } from './catalog';
import type { CommandInfo, OptionInfo, SubcommandInfo } from './catalog';

export interface OptionPart {
  name: string;
  info: OptionInfo;
  value: string | null;
}

interface Context {
  /** The normalized command name. */
  name: string;
  info: CommandInfo | null;
  sub: Subcommand | null;
}

interface Subcommand {
  name: string;
  info: SubcommandInfo;
}

export type Resolution = Context &
  (
    | { kind: 'command' }
    | { kind: 'subcommand'; sub: Subcommand }
    | { kind: 'option'; parts: OptionPart[] | null }
    | { kind: 'option-value'; option: OptionPart }
    | { kind: 'end-of-options' }
    | { kind: 'argument' }
  );

/** Matches an option per CMDX-6; `null` means unknown. */
export function resolveOption(word: string, ctx: Context): OptionPart[] | null {
  const lookup = (name: string) => ctx.sub?.info.options?.get(name) ?? ctx.info?.options?.get(name);
  if (word.startsWith('--')) {
    const eq = word.indexOf('=');
    const name = eq >= 0 ? word.slice(0, eq) : word;
    const info = lookup(name);
    return info ? [{ name, info, value: eq >= 0 ? word.slice(eq + 1) : null }] : null;
  }
  const whole = lookup(word);
  if (whole) return [{ name: word, info: whole, value: null }];
  const parts: OptionPart[] = [];
  for (let i = 1; i < word.length; i++) {
    const name = `-${word[i]}`;
    const info = lookup(name);
    if (!info) return null;
    if (info.value) {
      parts.push({ name, info, value: word.slice(i + 1) || null });
      return parts;
    }
    parts.push({ name, info, value: null });
  }
  return parts.length ? parts : null;
}

/** Works out what `words[wordIndex]` means for its tool (CMDX-4, CMDX-7). */
export function resolve(words: readonly string[], wordIndex: number): Resolution {
  const name = normalizeCommand(words[0] ?? '');
  const ctx: Context = { name, info: lookupCommand(name), sub: null };
  if (wordIndex <= 0) return { ...ctx, kind: 'command' };

  let pending: OptionPart | null = null;
  let endOfOptions = false;
  let positional = false;
  for (let i = 1; i <= wordIndex && i < words.length; i++) {
    const word = words[i];
    const isTarget = i === wordIndex;
    if (pending) {
      if (isTarget) return { ...ctx, kind: 'option-value', option: pending };
      pending = null;
      continue;
    }
    if (!endOfOptions && word === '--') {
      if (isTarget) return { ...ctx, kind: 'end-of-options' };
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && word.startsWith('-') && word !== '-') {
      const parts = resolveOption(word, ctx);
      if (isTarget) return { ...ctx, kind: 'option', parts };
      const last = parts?.[parts.length - 1];
      if (last?.info.value && last.value === null) pending = last;
      continue;
    }
    const sub = !positional ? ctx.info?.subcommands?.get(word) : undefined;
    positional = true;
    if (sub) {
      const found: Subcommand = { name: word, info: sub };
      ctx.sub = found;
      if (isTarget) return { ...ctx, kind: 'subcommand', sub: found };
      continue;
    }
    if (isTarget) return { ...ctx, kind: 'argument' };
  }
  return { ...ctx, kind: 'argument' };
}
