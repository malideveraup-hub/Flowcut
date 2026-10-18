import { useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShop, fetchPublicQueue } from '../../api/shopApi';
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
    return <main className={styles.page}><div className={styles.content}><Skeleton height={240} /></div></main>;
  }

  if (!shop) {
    return <main className={styles.page}><div className={styles.content}><div className={styles.loadState}><h1>Shop not found</h1><p>This shop may no longer be listed.</p></div></div></main>;
  }

  if (error) {
    return <main className={styles.page}><div className={styles.content}><div className={styles.loadState} role="alert"><h1>Couldn’t load the queue</h1><p>{error.message}</p></div></div></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <div className={styles.breadcrumb}>
          <button type="button" onClick={() => navigate(`/shops/${shopId}`)}>← Shop details</button>
          <span aria-hidden="true">/</span>
          <span>Public queue</span>
        </div>

        <header className={styles.header}>
          <div className={styles.shopMark} aria-hidden="true">{shop.name.trim().charAt(0).toUpperCase() || 'F'}</div>
          <div className={styles.shopInfo}>
            <p className={styles.eyebrow}>LIVE SHOP QUEUE</p>
            <h1 className={styles.name}>{shop.name}</h1>
            <p className={styles.address}>{shop.address || 'Shop address unavailable'}</p>
          </div>
          <div className={styles.queueCount} aria-live="polite">
            <strong>{queue.length}</strong>
            <span>{queue.length === 1 ? 'person waiting' : 'people waiting'}</span>
          </div>
        </header>

        <section className={styles.queuePanel} aria-labelledby="queue-title">
          <div className={styles.panelHeading}>
            <div>
              <p className={styles.panelEyebrow}>RIGHT NOW</p>
              <h2 id="queue-title">Queue overview</h2>
            </div>
            <span className={styles.liveIndicator}><i aria-hidden="true" /> Live queue</span>
          </div>

          {queue.length === 0 ? (
            <div className={styles.emptyQueue}>
              <span className={styles.emptyIcon} aria-hidden="true">✓</span>
              <h3>No one waiting</h3>
              <p>This is a great time to visit or join the queue.</p>
            </div>
          ) : (
            <ol className={styles.list} aria-label="People currently in the queue">
              {queue.map((entry, index) => {
                const meta = QUEUE_STATUS_META[entry.status] || { label: entry.status, level: 'moderate' };
                return (
                  <li className={styles.row} key={entry.queuePosition}>
                    <span className={styles.position}>{String(index + 1).padStart(2, '0')}</span>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowName}>{entry.displayName}</span>
                      <span className={styles.rowService}>{entry.serviceName || 'Service not specified'}</span>
                    </div>
                    <span className={styles.statusBadge} data-level={meta.level}>{meta.label}</span>
                  </li>
                );
              })}
            </ol>
          )}

          <div className={styles.joinCard}>
            <div>
              <h3>Ready to take your place?</h3>
              <p>Choose a service and confirm when you’re ready to join.</p>
            </div>
            <button className={styles.joinButton} type="button" onClick={() => navigate(`/shops/${shopId}/join`)}>
              Join this queue
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </section>

        <p className={styles.privacyNote}>Public queue names are anonymized to protect customer privacy.</p>
      </div>
    </main>
  );
}
