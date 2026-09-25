import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShops } from '../../api/shopApi';
import ShopCard from '../../components/customer/ShopCard';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './Discovery.module.css';

export default function Discovery() {
  const { data: allShops, loading, error } = useAsync(fetchPublicShops);
  const [params] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const query = (params.get('q') || '').toLowerCase();

  let shops = (allShops || []).filter((s) => s.name.toLowerCase().includes(query));
  if (filter === 'low') shops = shops.filter((s) => s.waitMin <= 15);

  return (
    <div>
      <p className={styles.sectionLabel}>Discover</p>
      <div className={styles.filters}>
        <button className={filter === 'all' ? styles.filterActive : styles.filter} onClick={() => setFilter('all')}>
          All shops
        </button>
        <button className={filter === 'low' ? styles.filterActive : styles.filter} onClick={() => setFilter('low')}>
          Low wait
        </button>
      </div>

      {loading && (
        <>
          <Skeleton height={110} style={{ marginBottom: 12 }} />
          <Skeleton height={110} style={{ marginBottom: 12 }} />
        </>
      )}

      {error && <EmptyState skin="pixel" title="Couldn't load shops" body={error.message} />}

      {!loading && !error && shops.length === 0 && (
        <EmptyState skin="pixel" title="No shops found" body="Try a different search or filter." />
      )}

      {shops.map((shop) => (
        <ShopCard shop={shop} key={shop.id} />
      ))}
    </div>
  );
}
