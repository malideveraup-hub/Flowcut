import styles from './QuickActionChip.module.css';

export default function QuickActionChip({ children, ...rest }) {
  return (
    <button className={styles.chip} {...rest}>
      {children}
    </button>
  );
}
