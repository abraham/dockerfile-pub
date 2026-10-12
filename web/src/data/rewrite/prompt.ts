/** Maximum length of the user's request, in characters (AIR-16). */
export const REQUEST_MAX_LENGTH = 500;

/** Maximum size of a Dockerfile sent to or accepted from the model, in UTF-8 bytes (AIR-24, AIR-25). */
export const DOCKERFILE_MAX_BYTES = 16 * 1024;

/** Maximum number of lines accepted from the model (AIR-25). */
export const DOCKERFILE_MAX_LINES = 400;

export const MAX_CHANGES = 8;

/** Constrains every reply to `{ dockerfile, changes }` (AIR-22). */
export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    dockerfile: { type: 'string' },
    changes: { type: 'array', items: { type: 'string' }, maxItems: MAX_CHANGES },
  },
  required: ['dockerfile', 'changes'],
  additionalProperties: false,
} as const;

/** The base session's system prompt (AIR-23). Reviewed like content. */
export const SYSTEM_PROMPT = `You rewrite Dockerfiles to meet a user's request.

Reply with JSON that has two fields:
- "dockerfile": the complete rewritten Dockerfile.
- "changes": up to ${MAX_CHANGES} short, plain-English bullet points, one per meaningful change, each saying what changed and why.

Rules:
- Keep everything the user did not ask to change.
- Do not invent files, scripts, ports or package names that the original Dockerfile does not imply. If the request needs one, use a clearly named placeholder and say so in "changes".
- Never put secrets, tokens or passwords in the Dockerfile. Suggest build secrets (RUN --mount=type=secret) instead.
- "dockerfile" must contain only valid Dockerfile syntax: no Markdown code fences and no prose. Use # comments only where they help the reader.

The user's message contains the request between <request> and </request>, and the current Dockerfile between <dockerfile> and </dockerfile>.`;

/** The user turn: the request and the current Dockerfile, each between delimiters (AIR-24). */
export function buildUserMessage(request: string, dockerfile: string): string {
  return `<request>\n${request.trim()}\n</request>\n\n<dockerfile>\n${dockerfile.trim()}\n</dockerfile>`;
}
