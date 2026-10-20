import styles from './NativeSelect.module.css';

/** Shared visual treatment for native form selects, preserving native keyboard and form behavior. */
export default function NativeSelect({ className = '', children, ...props }) {
  return <select {...props} className={`${styles.select} ${className}`.trim()}>{children}</select>;
}
