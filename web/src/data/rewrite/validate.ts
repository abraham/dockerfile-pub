import { tokenize, LINE_TYPE } from '../tokenizer';
import { truncate } from '../text';
import { DOCKERFILE_MAX_BYTES, DOCKERFILE_MAX_LINES, MAX_CHANGES } from './prompt';

export interface RewriteResult {
  dockerfile: string;
  changes: string[];
}

export type ParsedReply = { ok: true; value: RewriteResult } | { ok: false; reason: string };

const CHANGE_MAX_LENGTH = 200;
const FENCED = /^```[^\n]*\n([\s\S]*?)\n?```$/;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Checks a Dockerfile from the model: size, at least one FROM, no unknown lines (AIR-25). */
export function validateDockerfile(text: string): string | null {
  if (!text) return 'empty';
  if (new TextEncoder().encode(text).length > DOCKERFILE_MAX_BYTES) return 'too large';
  if (text.split('\n').length > DOCKERFILE_MAX_LINES) return 'too many lines';
  const lines = tokenize(text);
  if (lines.some((line) => line.type === LINE_TYPE.UNKNOWN)) return 'unknown line';
  if (!lines.some((line) => line.instruction?.keyword === 'FROM')) return 'no FROM';
  return null;
}

/** Parses and validates the model's JSON reply (AIR-22, AIR-25, AIR-26). */
export function parseReply(reply: string): ParsedReply {
  let data: unknown;
  try {
    data = JSON.parse(reply);
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'not an object' };
  }
  const keys = Object.keys(data).sort().join(',');
  const { dockerfile, changes } = data as Record<string, unknown>;
  if (
    keys !== 'changes,dockerfile' ||
    typeof dockerfile !== 'string' ||
    !isStringArray(changes) ||
    changes.length > MAX_CHANGES
  ) {
    return { ok: false, reason: 'schema mismatch' };
  }
  const trimmed = dockerfile.trim();
  const text = (FENCED.exec(trimmed)?.[1] ?? trimmed).trim();
  const problem = validateDockerfile(text);
  if (problem) return { ok: false, reason: problem };
  return {
    ok: true,
    value: {
      dockerfile: text,
      changes: changes
        .map((change) => truncate(change, CHANGE_MAX_LENGTH))
        .filter((change) => change.length > 0),
    },
  };
}
