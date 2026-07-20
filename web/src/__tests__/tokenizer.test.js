import { describe, it, expect } from 'vitest';
import { tokenize, TOKEN_TYPE, LINE_TYPE, INSTRUCTIONS } from '../data/tokenizer';

describe('tokenize', () => {
  it('returns an array with one entry per line', () => {
    const lines = tokenize('FROM node:18\nRUN npm install');
    expect(lines).toHaveLength(2);
  });

  it('handles an empty string as a single blank line', () => {
    const lines = tokenize('');
    expect(lines).toHaveLength(1);
    expect(lines[0].type).toBe(LINE_TYPE.BLANK);
  });

  it('handles blank lines', () => {
    const lines = tokenize('\n\n');
    expect(lines.every((l) => l.type === LINE_TYPE.BLANK)).toBe(true);
  });

  describe('comment lines', () => {
    it('identifies comment lines starting with #', () => {
      const [line] = tokenize('# This is a comment');
      expect(line.type).toBe(LINE_TYPE.COMMENT);
      expect(line.keyword).toBeNull();
    });

    it('produces a single COMMENT token', () => {
      const [line] = tokenize('# syntax=docker/dockerfile:1');
      expect(line.tokens).toHaveLength(1);
      expect(line.tokens[0].type).toBe(TOKEN_TYPE.COMMENT);
    });
  });

  describe('instruction lines', () => {
    it('identifies FROM as an instruction', () => {
      const [line] = tokenize('FROM node:18-alpine');
      expect(line.type).toBe(LINE_TYPE.INSTRUCTION);
      expect(line.keyword).toBe('FROM');
    });

    it('extracts the keyword as the first token', () => {
      const [line] = tokenize('FROM node:18-alpine');
      const kwToken = line.tokens.find((t) => t.type === TOKEN_TYPE.KEYWORD);
      expect(kwToken).toBeDefined();
      expect(kwToken.text).toBe('FROM');
    });

    it('sets explanationKey to the keyword string', () => {
      const [line] = tokenize('RUN npm install');
      const kwToken = line.tokens.find((t) => t.type === TOKEN_TYPE.KEYWORD);
      expect(kwToken.explanationKey).toBe('RUN');
    });

    it('sets explanation keys for non-whitespace RUN command fragments', () => {
      const [line] = tokenize('RUN addgroup -S appgroup && adduser -S appuser -G appgroup');
      const addgroupToken = line.tokens.find((t) => t.text === 'addgroup');
      const flagToken = line.tokens.find((t) => t.text === '-S');
      const andToken = line.tokens.find((t) => t.text === '&&');
      expect(addgroupToken.explanationKey).toBe('RUN_CHUNK:addgroup');
      expect(flagToken.explanationKey).toBe('RUN_CHUNK:-S');
      expect(andToken.explanationKey).toBe('RUN_CHUNK:&&');
    });

    it('recognises all documented INSTRUCTIONS', () => {
      for (const kw of INSTRUCTIONS) {
        const [line] = tokenize(`${kw} something`);
        expect(line.type).toBe(LINE_TYPE.INSTRUCTION);
        expect(line.keyword).toBe(kw);
      }
    });
  });

  describe('flag tokens', () => {
    it('extracts --from flag in COPY', () => {
      const [line] = tokenize('COPY --from=builder /app/dist .');
      const flagToken = line.tokens.find((t) => t.type === TOKEN_TYPE.FLAG);
      expect(flagToken).toBeDefined();
      expect(flagToken.text).toBe('--from=builder');
      expect(flagToken.explanationKey).toBe('--from');
    });

    it('extracts --mount flag in RUN', () => {
      const [line] = tokenize('RUN --mount=type=cache,target=/root/.npm npm ci');
      const flagToken = line.tokens.find((t) => t.type === TOKEN_TYPE.FLAG);
      expect(flagToken).toBeDefined();
      expect(flagToken.explanationKey).toBe('--mount');
    });

    it('extracts multiple HEALTHCHECK flags', () => {
      const [line] = tokenize('HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD test');
      const flags = line.tokens.filter((t) => t.type === TOKEN_TYPE.FLAG);
      expect(flags.map((f) => f.explanationKey)).toEqual(['--interval', '--timeout', '--retries']);
    });
  });

  describe('variable tokens', () => {
    it('extracts ${VAR} variable syntax', () => {
      const [line] = tokenize('FROM node:${NODE_VERSION}-alpine');
      const varToken = line.tokens.find((t) => t.type === TOKEN_TYPE.VARIABLE);
      expect(varToken).toBeDefined();
      expect(varToken.text).toBe('${NODE_VERSION}');
    });

    it('extracts $VAR variable syntax', () => {
      const [line] = tokenize('ENV VALUE=$MY_VAR');
      const varToken = line.tokens.find((t) => t.type === TOKEN_TYPE.VARIABLE);
      expect(varToken).toBeDefined();
      expect(varToken.text).toBe('$MY_VAR');
    });
  });

  describe('string tokens', () => {
    it('extracts double-quoted strings', () => {
      const [line] = tokenize('CMD ["node", "server.js"]');
      const strTokens = line.tokens.filter((t) => t.type === TOKEN_TYPE.STRING);
      expect(strTokens.length).toBeGreaterThan(0);
    });
  });

  describe('token ids', () => {
    it('assigns unique ids across all tokens', () => {
      const lines = tokenize('FROM node:18\nRUN npm install\nCOPY . .');
      const ids = lines.flatMap((l) => l.tokens.map((t) => t.id));
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('encodes line index in the token id', () => {
      const lines = tokenize('FROM node:18\nRUN npm install');
      const fromKw = lines[0].tokens.find((t) => t.type === TOKEN_TYPE.KEYWORD);
      const runKw = lines[1].tokens.find((t) => t.type === TOKEN_TYPE.KEYWORD);
      expect(fromKw.id).toMatch(/^0-/);
      expect(runKw.id).toMatch(/^1-/);
    });
  });

  describe('continuation lines', () => {
    it('marks non-instruction lines as continuation', () => {
      const lines = tokenize('    npm ci --omit=dev');
      expect(lines[0].type).toBe(LINE_TYPE.CONTINUATION);
    });

    it('still extracts flags from continuation lines', () => {
      const lines = tokenize('    npm ci --omit=dev');
      const flagToken = lines[0].tokens.find((t) => t.type === TOKEN_TYPE.FLAG);
      expect(flagToken).toBeDefined();
      expect(flagToken.explanationKey).toBe('--omit');
    });
  });
});
