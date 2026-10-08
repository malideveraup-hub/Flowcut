import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchAllShops } from '../../api/adminApi';
import Skeleton from '../../components/ui/Skeleton';
import styles from './ShopManagement.module.css';

const PAGE_SIZE = 8;
const FILTERS = [
  { id: 'ALL', label: 'All shops' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'SUSPENDED', label: 'Suspended' },
  { id: 'REJECTED', label: 'Rejected' },
];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatusClass(status) {
  if (status === 'APPROVED') return styles.approved;
  if (status === 'PENDING') return styles.pending;
  if (status === 'SUSPENDED') return styles.suspended;
  return styles.rejected;
}

export default function ShopManagement() {
  const { data: shops, loading, error } = useAsync(fetchAllShops);
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  if (loading) return <Skeleton height={220} />;
  if (error) return <p className={styles.error}>{error.message}</p>;

  const allShops = shops || [];
  const counts = allShops.reduce((summary, shop) => {
    summary[shop.status] = (summary[shop.status] || 0) + 1;
    return summary;
  }, {});
  const normalizedQuery = query.trim().toLowerCase();
  const filteredShops = allShops
    .filter((shop) => filter === 'ALL' || shop.status === filter)
    .filter((shop) => !normalizedQuery || `${shop.name} ${shop.address || ''}`.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => {
      if (sort === 'oldest') return new Date(left.createdAt) - new Date(right.createdAt);
      if (sort === 'name') return left.name.localeCompare(right.name);
      if (sort === 'status') return left.status.localeCompare(right.status) || left.name.localeCompare(right.name);
      return new Date(right.createdAt) - new Date(left.createdAt);
    });
  const pageCount = Math.max(1, Math.ceil(filteredShops.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleShops = filteredShops.slice(pageStart, pageStart + PAGE_SIZE);

  function changeFilter(nextFilter) {
    setFilter(nextFilter);
    setPage(1);
  }

  function changeQuery(event) {
    setQuery(event.target.value);
    setPage(1);
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <p className={styles.eyebrow}>FLOWCUT PLATFORM</p>
          <h1>Shops</h1>
          <p className={styles.sub}>Registered barbershops and account status.</p>
        </div>
        <Link className={styles.primaryButton} to="/super-admin/approvals">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m9 12 2 2 4-4" /></svg>
          Review applications
        </Link>
      </header>

      <section className={styles.cards} aria-label="Shop totals">
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Total registered shops</span><span className={styles.icon}>▤</span></div>
          <strong>{allShops.length}</strong>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Approved shops</span><span className={`${styles.icon} ${styles.greenIcon}`}>✓</span></div>
          <strong>{counts.APPROVED || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Pending review</span><span className={`${styles.icon} ${styles.amberIcon}`}>◷</span></div>
          <strong className={styles.amberValue}>{counts.PENDING || 0}</strong>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Suspended or rejected</span><span className={`${styles.icon} ${styles.redIcon}`}>!</span></div>
          <strong>{(counts.SUSPENDED || 0) + (counts.REJECTED || 0)}</strong>
        </article>
      </section>

      <div className={styles.toolbar}>
        <div className={styles.tabs} role="group" aria-label="Filter shops by status">
          {FILTERS.map((item) => {
            const count = item.id === 'ALL' ? allShops.length : counts[item.id] || 0;
            return (
              <button
                className={`${styles.tab} ${filter === item.id ? styles.activeTab : ''}`}
                type="button"
                key={item.id}
                aria-pressed={filter === item.id}
                onClick={() => changeFilter(item.id)}
              >
                {item.label}<small>{count}</small>
              </button>
            );
          })}
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
            <span className={styles.srOnly}>Search shops</span>
            <input value={query} onChange={changeQuery} placeholder="Search shops or address" />
          </label>
          <label className={styles.sortLabel}>
            <span>Sort by</span>
            <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="name">Shop name</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
      </div>

      <section className={styles.tablePanel} aria-label="Shops list">
        <div className={styles.tableHead}>
          <span>Shop</span><span>Joined date</span><span>Status</span><span className={styles.actionHeading}>Actions</span>
        </div>
        <div>
          {visibleShops.length === 0 && (
            <div className={styles.empty}>{allShops.length ? 'No shops match your search or filters.' : 'No shops have been registered yet.'}</div>
          )}
          {visibleShops.map((shop) => (
            <article className={styles.shopRow} key={shop._id}>
              <div className={styles.shopName}>
                <strong>{shop.name}</strong>
                <span>{shop.address || 'Address not provided'}</span>
              </div>
              <time className={styles.joined} dateTime={shop.createdAt}>{formatDate(shop.createdAt)}</time>
              <span><span className={`${styles.status} ${getStatusClass(shop.status)}`}>{shop.status}</span></span>
              <div className={styles.rowAction}>
                {shop.status === 'PENDING'
                  ? <Link className={`${styles.actionButton} ${styles.reviewAction}`} to="/super-admin/approvals">Review</Link>
                  : shop.status === 'APPROVED'
                    ? <Link className={styles.actionButton} to={`/shops/${shop._id}`}>View shop</Link>
                    : <span className={styles.unavailable}>No action</span>}
              </div>
            </article>
          ))}
        </div>
        <footer className={styles.pager}>
          <span>{filteredShops.length ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filteredShops.length)} of ${filteredShops.length} shops` : '0 shops'}</span>
          <div className={styles.pageButtons}>
            <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>{currentPage} / {pageCount}</span>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Next</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
