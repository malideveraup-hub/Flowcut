import { Link } from 'react-router-dom';
import StatusBadge from '../ui/StatusBadge';
import { CONGESTION, congestionFromWait } from '../../api/congestion';
import styles from './ShopCard.module.css';

export default function ShopCard({ shop }) {
  const level = congestionFromWait(shop.waitMin);
  const meta = CONGESTION[level];

  return (
    <Link to={`/shops/${shop.id}`} className={styles.card}>
      <div className={styles.top}>
        <span className={styles.name}>{shop.name}</span>
        <StatusBadge skin="pixel" level={level} label={meta.shortLabel} />
      </div>
      <div className={styles.wait}>
        {shop.waitMin}–{shop.waitMax} MIN
      </div>
      <div className={styles.meta}>
        {shop.waiting} waiting · {shop.activeBarbers} barbers active
      </div>
    </Link>
  );
}
