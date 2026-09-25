import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShops } from '../../api/shopApi';
import ShopCard from '../../components/customer/ShopCard';
import Skeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import styles from './Landing.module.css';

export default function Landing() {
  const { data: shops, loading, error } = useAsync(fetchPublicShops);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function handleSearch(e) {
    e.preventDefault();
    navigate(`/discover?q=${encodeURIComponent(query)}`);
  }

  return (
    <div>
      <div className={styles.pole}>
        <span style={{ background: 'var(--customer-red)' }} />
        <span style={{ background: 'var(--customer-cream)' }} />
        <span style={{ background: 'var(--customer-blue)' }} />
        <span style={{ background: 'var(--customer-red)' }} />
        <span style={{ background: 'var(--customer-cream)' }} />
      </div>

      <h1 className={styles.hero}>FLOWCUT</h1>
      <p className={styles.sub}>See the queue before you leave the house. Skip the wait, not the cut.</p>

      <form onSubmit={handleSearch} className={styles.searchForm}>
        <input
          className={styles.search}
          placeholder="Search barbershops near you..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search barbershops"
        />
      </form>

      <Link to="/scan" className={styles.scanLink}>
        Scan to join instead →
      </Link>

      <p className={styles.sectionLabel}>Featured shops</p>

      {loading && (
        <>
          <Skeleton height={110} style={{ marginBottom: 12 }} />
          <Skeleton height={110} style={{ marginBottom: 12 }} />
        </>
      )}

      {error && <EmptyState skin="pixel" title="Couldn't load shops" body={error.message} />}

      {shops && shops.length === 0 && (
        <EmptyState skin="pixel" title="No shops yet" body="Check back soon — new shops are added regularly." />
      )}

      {shops?.slice(0, 3).map((shop) => (
        <ShopCard shop={shop} key={shop.id} />
      ))}
    </div>
  );
}
