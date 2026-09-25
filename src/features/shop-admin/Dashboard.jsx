import { useAsync } from '../../hooks/useAsync';
import { fetchOwnShop, fetchShopQueue, fetchShopBarbers } from '../../api/shopAdminApi';
import MetricCard from '../../components/staff/MetricCard';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import styles from './Dashboard.module.css';

function statusDot(availability) {
  if (availability === 'AVAILABLE' || availability === 'BUSY') return 'var(--staff-success)';
  if (availability === 'ON_BREAK') return 'var(--staff-warning)';
  return 'var(--staff-secondary)';
}

export default function Dashboard() {
  const { data: shop, loading: shopLoading, error: shopError } = useAsync(fetchOwnShop);
  const { data: queue, loading: queueLoading } = useAsync(fetchShopQueue);
  const { data: barbers, loading: barbersLoading } = useAsync(fetchShopBarbers);

  if (shopLoading || queueLoading || barbersLoading) {
    return (
      <div>
        <Skeleton height={20} width={160} style={{ marginBottom: 16 }} />
        <Skeleton height={100} />
      </div>
    );
  }

  if (shopError) {
    return <EmptyState title="Couldn't load your dashboard" body={shopError.message} />;
  }

  const waiting = (queue || []).filter((e) => e.status === 'WAITING').length;
  const inService = (queue || []).filter((e) => ['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(e.status)).length;
  const delayedCount = (queue || []).filter((e) => e.status === 'DELAYED').length;

  return (
    <div>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.sub}>
        {shop.name} · {new Date().toLocaleDateString([], { weekday: 'long' })},{' '}
        {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>

      <div className={styles.metricGrid}>
        <MetricCard label="Waiting now" value={waiting} />
        <MetricCard label="In service" value={inService} />
        <MetricCard label="Total in queue" value={(queue || []).length} />
        <MetricCard label="Currently delayed" value={delayedCount} tone={delayedCount > 0 ? 'warning' : 'default'} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Barber workload</p>
        {(barbers || []).length === 0 && (
          <p style={{ color: 'var(--staff-secondary)', fontSize: 13 }}>No barbers added yet.</p>
        )}
        {(barbers || []).map((b) => {
          const currentEntry = (queue || []).find(
            (e) => e.barberId === b._id && ['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(e.status)
          );
          return (
            <div className={styles.row} key={b._id}>
              <span className={styles.rowLeft}>
                <span className={styles.dot} style={{ background: statusDot(b.availability) }} />
                {b.name}
              </span>
              <span className={styles.rowRight}>
                {currentEntry ? `In service · ${currentEntry.customerName}` : b.availability.replace('_', ' ')}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
