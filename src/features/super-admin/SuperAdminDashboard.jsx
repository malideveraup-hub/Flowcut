import { useAsync } from '../../hooks/useAsync';
import { fetchBasicAnalytics, fetchAllShops } from '../../api/adminApi';
import MetricCard from '../../components/staff/MetricCard';
import StatusBadge from '../../components/ui/StatusBadge';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Dashboard.module.css';

export default function SuperAdminDashboard() {
  const { data: stats, loading: statsLoading, error } = useAsync(fetchBasicAnalytics);
  const { data: shops, loading: shopsLoading } = useAsync(fetchAllShops);

  if (statsLoading || shopsLoading) return <Skeleton height={220} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  const pending = (shops || []).filter((s) => s.status === 'PENDING');

  return (
    <div>
      <h1 className={styles.title}>Platform dashboard</h1>
      <p className={styles.sub}>
        {new Date().toLocaleDateString([], { weekday: 'long' })},{' '}
        {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </p>

      <div className={styles.metricGrid}>
        <MetricCard label="Approved shops" value={stats.shopsByStatus.APPROVED || 0} />
        <MetricCard label="Pending applications" value={stats.shopsByStatus.PENDING || 0} tone="warning" />
        <MetricCard label="Active queue entries" value={stats.activeQueueEntries} />
        <MetricCard label="Total customers" value={stats.usersByRole.customer || 0} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Pending shop approvals</p>
        {pending.length === 0 && <p style={{ color: 'var(--staff-secondary)', fontSize: 13 }}>Nothing pending.</p>}
        {pending.map((s) => (
          <div className={styles.row} key={s._id}>
            <span>{s.name}</span>
            <StatusBadge skin="clean" level="moderate" label="Pending" />
          </div>
        ))}
      </div>
    </div>
  );
}
