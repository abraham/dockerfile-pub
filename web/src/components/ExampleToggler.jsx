import { useRef, useLayoutEffect } from 'preact/hooks';
import styles from './ExampleToggler.module.css';

/**
 * Toggle group for switching between Dockerfile examples.
 * @param {{ examples: {key:string,label:string}[], value: string, onChange: (key:string)=>void }} props
 */
export function ExampleToggler({ examples, value, onChange }) {
  const containerRef = useRef(null);
  const indicatorRef = useRef(null);
  const buttonRefs = useRef({});
  const isFirstRenderRef = useRef(true);

  useLayoutEffect(() => {
    const activeBtn = buttonRefs.current[value];
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!activeBtn || !container || !indicator) return;

    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      indicator.style.transitionDuration = '0s';
    } else {
      indicator.style.transitionDuration = '';
    }

    indicator.style.width = `${btnRect.width}px`;
    indicator.style.transform = `translateX(${btnRect.left - containerRect.left}px)`;
  }, [value]);

  return (
    <div class={styles.toggler} ref={containerRef} role="group" aria-label="Select Dockerfile example">
      <span class={styles.indicator} ref={indicatorRef} aria-hidden="true" />
      {examples.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          ref={(el) => { buttonRefs.current[key] = el; }}
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
