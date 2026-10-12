/** Collapses whitespace and cuts `text` to at most `max` characters, ending with `…` when cut. */
export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
