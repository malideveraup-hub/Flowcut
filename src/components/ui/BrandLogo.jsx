import styles from './BrandLogo.module.css';

/** Shared temporary FlowCut mark and wordmark; replace this component when the official logo is supplied. */
export default function BrandLogo({ tone = 'dark', className = '' }) {
  return (
    <span className={`${styles.brand} ${tone === 'light' ? styles.light : ''} ${className}`.trim()}>
      <span className={styles.mark} aria-hidden="true" />
      <span className={styles.wordmark}>FLOWCUT</span>
    </span>
  );
}
