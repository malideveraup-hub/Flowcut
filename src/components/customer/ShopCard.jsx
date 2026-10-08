import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import { CONGESTION, congestionFromWait } from '../../api/congestion';
import styles from './ShopCard.module.css';

function getWaitText(shop) {
  if (shop.waitMin == null || !Number.isFinite(shop.waitMin)) return 'Wait estimate unavailable';
  if (shop.waitMin === 0 && (shop.waitMax == null || shop.waitMax === 0)) return 'No wait';
  const max = Number.isFinite(shop.waitMax) ? shop.waitMax : shop.waitMin;
  return `${shop.waitMin}–${max} min`;
}

export default function ShopCard({ shop }) {
  const level = congestionFromWait(shop.waitMin);
  const meta = CONGESTION[level];
  const statusLabel = shop.waiting > 0 ? 'Queue active' : 'Open today';

  return (
    <Link to={`/shops/${shop.id}`} className={styles.card}>
      <div className={styles.top}>
        <span className={styles.name}>{shop.name}</span>
        <StatusBadge skin="pixel" level={level} label={meta.shortLabel} />
      </div>

      <p className={styles.address}>{shop.address || 'Address unavailable'}</p>

      <div className={styles.waitRow}>
        <span className={styles.wait}>{getWaitText(shop)}</span>
        <span className={styles.status}>{statusLabel}</span>
      </div>

      <div className={styles.metaRow}>
        <span>{shop.waiting ?? 0} waiting</span>
        <span>{shop.activeBarbers ?? 0} active barbers</span>
      </div>
    </Link>
  );
}
