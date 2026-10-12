import type { Instruction } from './types';

export interface HeredocMarker {
  instruction: Instruction;
  delimiter: string;
  stripTabs: boolean;
  /** The body is a shell script: a `RUN` whose only argument is this heredoc (TOK-41). */
  script: boolean;
}

const MARKER = /<<(-?)(["']?)([A-Za-z_][A-Za-z0-9_]*)\2/y;

/**
 * Matches a heredoc marker (`<<EOF`, `<<-EOF`, `<<"EOF"`, `<<'EOF'`) at `pos`
 * (TOK-39). Returns its end and parts, or `null`.
 */
export function scanHeredocMarker(
  s: string,
  pos: number,
  end: number,
): { end: number; delimiter: string; stripTabs: boolean } | null {
  MARKER.lastIndex = pos;
  const match = MARKER.exec(s);
  if (!match || pos + match[0].length > end) return null;
  return { end: pos + match[0].length, delimiter: match[3], stripTabs: match[1] === '-' };
}

/** Whether `raw` terminates the heredoc opened by `marker` (TOK-40). */
export function isTerminator(raw: string, marker: HeredocMarker): boolean {
  const line = marker.stripTabs ? raw.replace(/^\t+/, '') : raw;
  return line === marker.delimiter;
}
