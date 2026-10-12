/**
 * Dockerfile tokenizer
 * Parses a Dockerfile string into an array of Line objects,
 * each containing an array of Token objects.
 */

export const TOKEN_TYPE = {
  KEYWORD: 'keyword',
  FLAG: 'flag',
  STRING: 'string',
  VARIABLE: 'variable',
  COMMENT: 'comment',
  TEXT: 'text',
} as const;

export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export const LINE_TYPE = {
  BLANK: 'blank',
  COMMENT: 'comment',
  INSTRUCTION: 'instruction',
  CONTINUATION: 'continuation',
} as const;

export type LineType = (typeof LINE_TYPE)[keyof typeof LINE_TYPE];

/** All valid Dockerfile instruction keywords */
export const INSTRUCTIONS: ReadonlySet<string> = new Set([
  'ADD',
  'ARG',
  'CMD',
  'COPY',
  'ENTRYPOINT',
  'ENV',
  'EXPOSE',
  'FROM',
  'HEALTHCHECK',
  'LABEL',
  'MAINTAINER',
  'ONBUILD',
  'RUN',
  'SHELL',
  'STOPSIGNAL',
  'USER',
  'VOLUME',
  'WORKDIR',
]);

export interface Token {
  /** Unique token id, `"<lineIndex>-<tokenIndex>"` */
  id: string;
  text: string;
  type: TokenType;
  lineIndex: number;
  tokenIndex: number;
  /** Key for looking up an explanation (null if none) */
  explanationKey: string | null;
}

export interface Line {
  lineIndex: number;
  /** Original line text */
  raw: string;
  type: LineType;
  /** Instruction keyword if applicable */
  keyword: string | null;
  tokens: Token[];
}

/** Parse a Dockerfile string into an array of Line objects. */
export function tokenize(dockerfileText: string): Line[] {
  return dockerfileText.split('\n').map((raw, lineIndex) => parseLine(raw, lineIndex));
}

function parseLine(raw: string, lineIndex: number): Line {
  const trimmed = raw.trimStart();

  if (!trimmed) {
    return {
      lineIndex,
      raw,
      type: LINE_TYPE.BLANK,
      keyword: null,
      tokens: [makeToken(`${lineIndex}-0`, raw || ' ', TOKEN_TYPE.TEXT, lineIndex, 0, null)],
    };
  }

  if (trimmed.startsWith('#')) {
    return {
      lineIndex,
      raw,
      type: LINE_TYPE.COMMENT,
      keyword: null,
      tokens: [makeToken(`${lineIndex}-0`, raw, TOKEN_TYPE.COMMENT, lineIndex, 0, null)],
    };
  }

  // Try to match a Dockerfile instruction keyword
  const keywordMatch = trimmed.match(/^([A-Z]+)(.*)/s);
  if (keywordMatch && INSTRUCTIONS.has(keywordMatch[1])) {
    const keyword = keywordMatch[1];
    const rest = keywordMatch[2];
    const indent = raw.slice(0, raw.length - trimmed.length);

    let tokenIndex = 0;
    const tokens: Token[] = [];

    if (indent) {
      tokens.push(
        makeToken(
          `${lineIndex}-${tokenIndex}`,
          indent,
          TOKEN_TYPE.TEXT,
          lineIndex,
          tokenIndex++,
          null,
        ),
      );
    }

    tokens.push(
      makeToken(
        `${lineIndex}-${tokenIndex}`,
        keyword,
        TOKEN_TYPE.KEYWORD,
        lineIndex,
        tokenIndex++,
        keyword,
      ),
    );

    const restTokens = tokenizeArgs(rest, lineIndex, tokenIndex, keyword);
    tokens.push(...restTokens);

    return { lineIndex, raw, type: LINE_TYPE.INSTRUCTION, keyword, tokens };
  }

  // Continuation line (indented shell commands, etc.)
  const contTokens = tokenizeArgs(raw, lineIndex, 0, null);
  return { lineIndex, raw, type: LINE_TYPE.CONTINUATION, keyword: null, tokens: contTokens };
}

/** Break the argument portion of a line into tokens. */
function tokenizeArgs(
  text: string,
  lineIndex: number,
  startIndex: number,
  instructionKeyword: string | null,
): Token[] {
  const tokens: Token[] = [];
  let idx = startIndex;
  let remaining = text;

  while (remaining.length > 0) {
    // -- Docker flag: --flag=value or --flag
    const flagMatch = remaining.match(/^(--[a-zA-Z][a-zA-Z0-9-]*(?:=[^\s]*)?)/);
    if (flagMatch) {
      const flagText = flagMatch[1];
      // Extract just the flag name without value for the explanation key
      const flagKey = flagText.split('=')[0];
      tokens.push(
        makeToken(`${lineIndex}-${idx}`, flagText, TOKEN_TYPE.FLAG, lineIndex, idx++, flagKey),
      );
      remaining = remaining.slice(flagText.length);
      continue;
    }

    // ${VAR} or $VAR
    const varMatch = remaining.match(/^(\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*)/);
    if (varMatch) {
      tokens.push(
        makeToken(`${lineIndex}-${idx}`, varMatch[1], TOKEN_TYPE.VARIABLE, lineIndex, idx++, null),
      );
      remaining = remaining.slice(varMatch[1].length);
      continue;
    }

    // Quoted string
    const strMatch = remaining.match(/^("[^"]*"|'[^']*')/);
    if (strMatch) {
      tokens.push(
        makeToken(`${lineIndex}-${idx}`, strMatch[1], TOKEN_TYPE.STRING, lineIndex, idx++, null),
      );
      remaining = remaining.slice(strMatch[1].length);
      continue;
    }

    // Whitespace or non-special-char text chunk (stops before $, ", ' to allow other patterns)
    const chunkMatch = remaining.match(/^(\s+|[^\s$"']+|\$)/);
    if (chunkMatch) {
      const chunkText = chunkMatch[1];
      tokens.push(
        makeToken(
          `${lineIndex}-${idx}`,
          chunkText,
          TOKEN_TYPE.TEXT,
          lineIndex,
          idx++,
          getChunkExplanationKey(chunkText, instructionKeyword),
        ),
      );
      remaining = remaining.slice(chunkText.length);
    } else {
      break;
    }
  }

  return tokens;
}

function getChunkExplanationKey(
  chunkText: string,
  instructionKeyword: string | null,
): string | null {
  if (instructionKeyword !== 'RUN') return null;
  if (!chunkText.trim()) return null;
  return `RUN_CHUNK:${chunkText}`;
}

function makeToken(
  id: string,
  text: string,
  type: TokenType,
  lineIndex: number,
  tokenIndex: number,
  explanationKey: string | null,
): Token {
  return { id, text, type, lineIndex, tokenIndex, explanationKey };
}
