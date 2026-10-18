import styles from './Skeleton.module.css';

export default function Skeleton({ height = 16, width = '100%', style }) {
  return (
    <div
      className={styles.bone}
      style={{ height, width, ...style }}
      aria-hidden="true"
    />
  );
}
