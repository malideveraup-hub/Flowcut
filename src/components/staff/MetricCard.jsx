import styles from './MetricCard.module.css';

export default function MetricCard({ label, value, tone = 'default' }) {
  return (
    <div className={styles.card}>
      <div className={styles.label}>{label}</div>
      <div className={[styles.value, styles[tone]].join(' ')}>{value}</div>
    </div>
  );
}
