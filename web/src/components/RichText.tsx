import type { Block, Inline } from '../data/explanations';
import styles from './RichText.module.css';

/** Inline content as text nodes and `<code>` elements only (EXP-5, PNL-12). */
export function InlineText({ content }: { content: readonly Inline[] }) {
  return (
    <>
      {content.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <code key={i} class={styles.code}>
            {part.code}
          </code>
        ),
      )}
    </>
  );
}

/** Paragraph blocks become `<p>`, list blocks `<ul>` (EXP-16, EXP-17). */
export function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'paragraph' ? (
          <p key={i} class={styles.para}>
            <InlineText content={block.content} />
          </p>
        ) : (
          <ul key={i} class={styles.list}>
            {block.items.map((item, j) => (
              <li key={j} class={styles.item}>
                <InlineText content={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
