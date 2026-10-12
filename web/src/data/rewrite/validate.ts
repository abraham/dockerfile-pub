import { tokenize, LINE_TYPE } from '../tokenizer';
import { truncate } from '../text';
import { DOCKERFILE_MAX_BYTES, DOCKERFILE_MAX_LINES, MAX_CHANGES } from './prompt';

export interface RewriteResult {
  dockerfile: string;
  changes: string[];
}

export type ParsedReply = { ok: true; value: RewriteResult } | { ok: false; reason: string };

const CHANGE_MAX_LENGTH = 200;
const CODE_BLOCK = /```[^\n]*\n([\s\S]*?)\n?```/;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;
// An exec form cut short (`CMD [` or `CMD ["node", "ser`) that Docker would run as shell form.
const BROKEN_EXEC_FORM = /^\s*(?:CMD|ENTRYPOINT)\s+\[\s*(?:"|$)/i;

/** Checks a Dockerfile from the model: size, at least one FROM, no unknown lines (AIR-25). */
export function validateDockerfile(text: string): string | null {
  if (!text) return 'empty';
  if (new TextEncoder().encode(text).length > DOCKERFILE_MAX_BYTES) return 'too large';
  if (text.split('\n').length > DOCKERFILE_MAX_LINES) return 'too many lines';
  const lines = tokenize(text);
  if (lines.some((line) => line.type === LINE_TYPE.UNKNOWN)) return 'unknown line';
  if (!lines.some((line) => line.instruction?.keyword === 'FROM')) return 'no FROM';
  const broken = lines.some(
    (line) =>
      line.type === LINE_TYPE.INSTRUCTION &&
      line.instruction?.form !== 'exec' &&
      BROKEN_EXEC_FORM.test(line.raw),
  );
  if (broken) return 'broken exec form';
  return null;
}

/** Parses the model's reply: a fenced Dockerfile, then a bullet list of changes (AIR-22, AIR-25, AIR-26). */
export function parseReply(reply: string): ParsedReply {
  const block = CODE_BLOCK.exec(reply);
  if (!block)
    return { ok: false, reason: reply.includes('```') ? 'unclosed code block' : 'no code block' };
  const text = block[1].trim();
  const problem = validateDockerfile(text);
  if (problem) return { ok: false, reason: problem };
  const changes = reply
    .slice(block.index + block[0].length)
    .split('\n')
    .map((line) => BULLET.exec(line)?.[1] ?? '')
    .map((change) => truncate(change, CHANGE_MAX_LENGTH))
    .filter((change) => change.length > 0)
    .slice(0, MAX_CHANGES);
  return { ok: true, value: { dockerfile: text, changes } };
}
