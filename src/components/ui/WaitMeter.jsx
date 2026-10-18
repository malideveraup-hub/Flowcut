import StatusBadge from './StatusBadge';
import { CONGESTION, congestionFromWait } from '../../api/congestion';
import styles from './WaitMeter.module.css';

/**
 * The primary wait-time display used on Shop Details, My Queue,
 * and the Admin Dashboard. The number is always the largest,
 * most prominent element — Section 6 non-negotiable.
 */
export default function WaitMeter({ minMinutes, maxMinutes, skin = 'clean', size = 'md' }) {
  const level = congestionFromWait(minMinutes);
  const meta = CONGESTION[level];

  return (
    <div className={[styles.wrap, styles[skin]].join(' ')}>
      <div className={[styles.number, styles[size]].join(' ')}>
        {minMinutes}–{maxMinutes} <span className={styles.unit}>min</span>
      </div>
      <div className={styles.label}>Estimated wait</div>
      <div className={styles.tagRow}>
        <StatusBadge
          skin={skin}
          level={level}
          label={skin === 'pixel' ? meta.shortLabel : meta.label}
        />
        <span className={styles.hint}>{meta.hint}</span>
      </div>
    </div>
  );
}
