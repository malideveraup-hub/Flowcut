import styles from './ProgressStepper.module.css';

const STEPS = ['JOINED', 'WAITING', 'CALLED', 'DONE'];

export default function ProgressStepper({ currentIndex }) {
  return (
    <div className={styles.steps} role="list" aria-label="Queue progress">
      {STEPS.map((label, i) => (
        <div className={styles.step} role="listitem" key={label}>
          <div
            className={styles.dot}
            style={{
              background: i <= currentIndex ? 'var(--customer-teal)' : 'var(--customer-surface-border)',
            }}
          />
          <div className={[styles.label, i <= currentIndex ? styles.active : ''].join(' ')}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
