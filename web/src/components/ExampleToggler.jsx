import styles from './ExampleToggler.module.css';

/**
 * Toggle group for switching between Dockerfile examples.
 * @param {{ examples: {key:string,label:string}[], value: string, onChange: (key:string)=>void }} props
 */
export function ExampleToggler({ examples, value, onChange }) {
  return (
    <div class={styles.toggler} role="group" aria-label="Select Dockerfile example">
      {examples.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          class={`${styles.button} ${value === key ? styles.active : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
