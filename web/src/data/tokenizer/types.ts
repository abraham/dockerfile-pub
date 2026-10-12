export const INSTRUCTIONS = [
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
] as const;

export type Instruction = (typeof INSTRUCTIONS)[number];

export const TOKEN_TYPE = {
  KEYWORD: 'keyword',
  FLAG: 'flag',
  STRING: 'string',
  VARIABLE: 'variable',
  OPERATOR: 'operator',
  PUNCTUATION: 'punctuation',
  ESCAPE: 'escape',
  DIRECTIVE: 'directive',
  COMMENT: 'comment',
  WHITESPACE: 'whitespace',
  TEXT: 'text',
} as const;

export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export const LINE_TYPE = {
  DIRECTIVE: 'directive',
  INSTRUCTION: 'instruction',
  CONTINUATION: 'continuation',
  HEREDOC: 'heredoc',
  COMMENT: 'comment',
  BLANK: 'blank',
  UNKNOWN: 'unknown',
} as const;

export type LineType = (typeof LINE_TYPE)[keyof typeof LINE_TYPE];

export type ArgumentRole =
  | 'image'
  | 'stage-name'
  | 'source'
  | 'destination'
  | 'path'
  | 'user'
  | 'port'
  | 'key'
  | 'value'
  | 'signal'
  | 'name'
  | 'word';

export type ShellRole =
  | 'command'
  | 'option'
  | 'argument'
  | 'assignment'
  | 'operator'
  | 'redirection'
  | 'redirect-target'
  | 'reserved'
  | 'substitution';

export type ShellRef = {
  kind: 'shell';
  instruction: Instruction;
  role: ShellRole;
  command: string | null;
  text: string;
  words: readonly string[];
  wordIndex: number;
  before: string | null;
  after: string | null;
};

export type ExecFormRef = {
  kind: 'exec-form';
  instruction: Instruction;
  role: 'executable' | 'argument';
  text: string;
  words: readonly string[];
  wordIndex: number;
};

export type VariableRef = {
  kind: 'variable';
  name: string;
  text: string;
  instruction: Instruction;
  expandedBy: 'docker' | 'shell';
};

export type ArgumentRef = {
  kind: 'argument';
  instruction: Instruction;
  role: ArgumentRole;
  text: string;
};

export type ExplanationRef =
  | { kind: 'instruction'; instruction: Instruction }
  | { kind: 'subkeyword'; instruction: Instruction; word: 'AS' | 'CMD' | 'NONE' }
  | { kind: 'flag'; instruction: Instruction; flag: string }
  | ArgumentRef
  | { kind: 'json-array'; instruction: Instruction }
  | ExecFormRef
  | ShellRef
  | VariableRef
  | { kind: 'heredoc'; instruction: Instruction; delimiter: string }
  | { kind: 'directive'; directive: string }
  | { kind: 'line-continuation'; escape: '\\' | '`' };

export interface InstructionContext {
  keyword: Instruction;
  startLine: number;
  form: 'exec' | 'shell' | null;
}

export interface Token {
  id: string;
  lineIndex: number;
  tokenIndex: number;
  column: number;
  text: string;
  type: TokenType;
  ref: ExplanationRef | null;
}

export interface Line {
  lineIndex: number;
  raw: string;
  eol: '' | '\n' | '\r\n';
  type: LineType;
  instruction: InstructionContext | null;
  tokens: Token[];
}

/** A lexed span of logical text, before it is split onto physical lines. */
export interface Lexeme {
  start: number;
  end: number;
  type: TokenType;
  ref: ExplanationRef | null;
}

export type Escape = '\\' | '`';

const INSTRUCTION_SET: ReadonlySet<string> = new Set(INSTRUCTIONS);

export function isInstruction(word: string): word is Instruction {
  return INSTRUCTION_SET.has(word);
}

export function isBlank(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r';
}

export function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
}
