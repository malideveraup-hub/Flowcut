import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchBasicAnalytics, fetchAllShops } from '../../api/adminApi';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Dashboard.module.css';

const MONTH_COUNT = 6;
const MONTH_FORMATTER = new Intl.DateTimeFormat('en', { month: 'short' });

function getMonthlyApplications(shops) {
  const now = new Date();
  const months = Array.from({ length: MONTH_COUNT }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (MONTH_COUNT - index - 1), 1);
    return { label: MONTH_FORMATTER.format(date), year: date.getFullYear(), month: date.getMonth(), count: 0 };
  });

  (shops || []).forEach((shop) => {
    const date = new Date(shop.createdAt);
    const month = months.find((item) => item.year === date.getFullYear() && item.month === date.getMonth());
    if (month && !Number.isNaN(date.getTime())) month.count += 1;
  });

  return months;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function exportDashboard(stats, shops) {
  const rows = [
    ['Metric', 'Value'],
    ['Approved shops', stats.shopsByStatus.APPROVED || 0],
    ['Pending applications', stats.shopsByStatus.PENDING || 0],
    ['Active queue entries', stats.activeQueueEntries || 0],
    ['Total customers', stats.usersByRole.customer || 0],
    [],
    ['Shop', 'Status', 'Applied'],
    ...(shops || []).map((shop) => [shop.name, shop.status, formatDate(shop.createdAt)]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'flowcut-platform-dashboard.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function SuperAdminDashboard() {
  const { data: stats, loading: statsLoading, error } = useAsync(fetchBasicAnalytics);
  const { data: shops, loading: shopsLoading, error: shopsError } = useAsync(fetchAllShops);

  if (statsLoading || shopsLoading) return <Skeleton height={220} />;
  if (error || shopsError) return <p className={styles.error}>{(error || shopsError).message}</p>;

  const allShops = shops || [];
  const pending = allShops.filter((shop) => shop.status === 'PENDING');
  const months = getMonthlyApplications(allShops);
  const maxApplications = Math.max(1, ...months.map((month) => month.count));
  const recentShops = allShops.slice(0, 6);

  return (
    <div className={styles.dashboard}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>FLOWCUT PLATFORM</p>
          <h1>Platform dashboard</h1>
          <p className={styles.sub}>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} onClick={() => exportDashboard(stats, allShops)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 20h16" /></svg>
            <span>Export</span>
          </button>
          <Link className={`${styles.button} ${styles.primary}`} to="/super-admin/approvals">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 12 2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
            <span>Review approvals</span>
          </Link>
        </div>
      </header>

      <section className={styles.metricGrid} aria-label="Platform metrics">
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Approved shops</span><span className={styles.metricIcon} aria-hidden="true">▤</span></div>
          <strong>{stats.shopsByStatus.APPROVED || 0}</strong>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Pending applications</span><span className={`${styles.metricIcon} ${styles.amberIcon}`} aria-hidden="true">◷</span></div>
          <strong className={styles.amberValue}>{stats.shopsByStatus.PENDING || 0}</strong>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Active queue entries</span><span className={`${styles.metricIcon} ${styles.blueIcon}`} aria-hidden="true">⌁</span></div>
          <strong>{stats.activeQueueEntries || 0}</strong>
        </article>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}><span>Total customers</span><span className={`${styles.metricIcon} ${styles.greenIcon}`} aria-hidden="true">♙</span></div>
          <strong>{stats.usersByRole.customer || 0}</strong>
        </article>
      </section>

      <section className={styles.overviewGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><h2>Shop applications</h2><p>New applications · Last 6 months</p></div>
            <span className={styles.legend}><i />Applications</span>
          </div>
          <div className={styles.chart} role="img" aria-label="Monthly new shop applications over the last six months">
            {months.map((month, index) => (
              <div className={styles.chartColumn} key={`${month.year}-${month.month}`}>
                <div className={`${styles.chartBar} ${index === months.length - 1 ? styles.currentBar : ''}`} style={{ height: `${Math.max(5, (month.count / maxApplications) * 100)}%` }}>
                  <span>{month.count}</span>
                </div>
                <span className={styles.monthLabel}>{month.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div><h2>Pending shop approvals</h2><p>Waiting for review</p></div>
            <span className={styles.countChip}>{pending.length} pending</span>
          </div>
          <div className={styles.pendingList}>
            {pending.length === 0 && <p className={styles.empty}>Nothing pending right now.</p>}
            {pending.slice(0, 4).map((shop) => (
              <div className={styles.pendingItem} key={shop._id}>
                <div><strong>{shop.name}</strong><span>Application submitted</span></div>
                <span className={styles.pendingBadge}>Pending</span>
              </div>
            ))}
          </div>
          <Link className={styles.panelLink} to="/super-admin/approvals">Review all applications <span aria-hidden="true">→</span></Link>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div><h2>Recent shop activity</h2><p>Latest applications across the platform</p></div>
          <Link className={styles.textLink} to="/super-admin/shops">All shops <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.activityHeader}><span>Shop</span><span>Status</span><span>Address</span><span>Applied</span></div>
        <div className={styles.activityList}>
          {recentShops.length === 0 && <p className={styles.empty}>No shop applications yet.</p>}
          {recentShops.map((shop) => (
            <div className={styles.activityRow} key={shop._id}>
              <strong><i className={styles.activityDot} />{shop.name}</strong>
              <span><span className={`${styles.statusTag} ${shop.status === 'APPROVED' ? styles.approvedTag : shop.status === 'PENDING' ? styles.pendingTag : styles.otherTag}`}>{shop.status}</span></span>
              <span className={styles.detail}>{shop.address || 'Address not provided'}</span>
              <time className={styles.time} dateTime={shop.createdAt}>{formatDate(shop.createdAt)}</time>
            </div>
          ))}
        </div>
        <div className={styles.tableFoot}><span>Showing {recentShops.length} of {allShops.length} shops</span><Link className={styles.button} to="/super-admin/shops">View shops</Link></div>
      </section>
    </div>
  );
}
