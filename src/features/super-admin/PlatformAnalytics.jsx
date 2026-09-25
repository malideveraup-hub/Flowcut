import { useAsync } from '../../hooks/useAsync';
import { fetchBasicAnalytics } from '../../api/adminApi';
import MetricCard from '../../components/staff/MetricCard';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Dashboard.module.css';

/**
 * Deliberately "basic" analytics only (Section 22 of the Phase 4 brief
 * forbids "advanced analytics" here) — live counts computed on request,
 * nothing historical or predictive. Historical trends/prediction accuracy
 * are Phase 5's job once ServiceLog is actually being written to.
 */
export default function PlatformAnalytics() {
  const { data: stats, loading, error } = useAsync(fetchBasicAnalytics);

  if (loading) return <Skeleton height={160} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  return (
    <div>
      <h1 className={styles.title}>Platform analytics</h1>
      <p className={styles.sub}>Live snapshot — not historical</p>

      <div className={styles.metricGrid}>
        <MetricCard label="Approved shops" value={stats.shopsByStatus.APPROVED || 0} />
        <MetricCard label="Pending shops" value={stats.shopsByStatus.PENDING || 0} />
        <MetricCard label="Active queue entries" value={stats.activeQueueEntries} />
        <MetricCard label="Total customers" value={stats.usersByRole.customer || 0} />
      </div>

      <div className={styles.panel}>
        <p className={styles.panelTitle}>Accounts by role</p>
        {Object.entries(stats.usersByRole).map(([role, count]) => (
          <div className={styles.row} key={role}>
            <span>{role}</span>
            <span className={styles.strong}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
