import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShop, fetchPublicQueue } from '../../api/shopApi';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { QUEUE_STATUS_META } from '../../api/congestion';
import styles from './PublicQueueView.module.css';

export default function PublicQueueView() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const loadShop = useCallback(() => fetchPublicShop(shopId), [shopId]);
  const loadQueue = useCallback(() => fetchPublicQueue(shopId), [shopId]);
  const { data: shop, loading: shopLoading } = useAsync(loadShop, [shopId]);
  const { data: queue, loading: queueLoading, error } = useAsync(loadQueue, [shopId]);

  if (shopLoading || queueLoading) {
    return <Skeleton height={200} />;
  }

  if (!shop) {
    return <EmptyState skin="pixel" title="Shop not found" body="This shop may no longer be listed." />;
  }

  if (error) {
    return <EmptyState skin="pixel" title="Couldn't load the queue" body={error.message} />;
  }

  return (
    <div>
      <p className={styles.sectionLabel}>Public queue</p>
      <h1 className={styles.name}>{shop.name}</h1>
      <p className={styles.meta}>{queue.length} people in line right now</p>

      {queue.length === 0 ? (
        <EmptyState skin="pixel" title="No one waiting" body="This is a great time to visit." />
      ) : (
        <div className={styles.list}>
          {queue.map((entry) => {
            const meta = QUEUE_STATUS_META[entry.status] || { label: entry.status, level: 'moderate' };
            return (
              <div className={styles.row} key={entry.queuePosition}>
                <div>
                  <div className={styles.rowName}>{entry.displayName}</div>
                  <div className={styles.rowService}>{entry.serviceName}</div>
                </div>
                <StatusBadge skin="pixel" level={meta.level} label={meta.label.toUpperCase()} />
              </div>
            );
          })}
        </div>
      )}

      <Button skin="pixel" fullWidth onClick={() => navigate(`/shops/${shopId}/join`)}>
        Join this queue
      </Button>
    </div>
  );
}
