import styles from './StatusBadge.module.css';

/**
 * Renders the same semantic level (low/moderate/high) as either
 * a pixel tag (Customer) or a plain badge (Barber/Admin).
 * Never color-only: label text always ships with the color.
 */
export default function StatusBadge({ skin = 'clean', level = 'moderate', label }) {
  const classes = [styles.badge, styles[skin], styles[level]].join(' ');
  return <span className={classes}>{label}</span>;
}
