import { useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShop, fetchPublicServices } from '../../api/shopApi';
import WaitMeter from '../../components/ui/WaitMeter';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './ShopDetails.module.css';

export default function ShopDetails() {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const loadShop = useCallback(() => fetchPublicShop(shopId), [shopId]);
  const loadServices = useCallback(() => fetchPublicServices(shopId), [shopId]);
  const { data: shop, loading: shopLoading, error: shopError } = useAsync(loadShop, [shopId]);
  const { data: services, loading: servicesLoading } = useAsync(loadServices, [shopId]);

  if (shopLoading) {
    return (
      <div>
        <Skeleton height={20} width={120} style={{ marginBottom: 12 }} />
        <Skeleton height={140} />
      </div>
    );
  }

  if (shopError || !shop) {
    return (
      <EmptyState
        skin="pixel"
        title="Shop not found"
        body={shopError?.status === 404 ? 'This shop may no longer be listed.' : shopError?.message}
      />
    );
  }

  return (
    <div>
      <p className={styles.sectionLabel}>Shop details</p>
      <h1 className={styles.name}>{shop.name}</h1>
      <p className={styles.meta}>{shop.address}</p>
      <p className={styles.meta}>
        Open {shop.openingTime} - {shop.closingTime}
      </p>

      <div className={styles.waitBlock}>
        <WaitMeter skin="pixel" minMinutes={shop.waitMin} maxMinutes={shop.waitMax} />
        <p className={styles.metaSmall}>
          {shop.waiting} waiting · {shop.activeBarbers} barbers active
        </p>
        <Link to={`/shops/${shopId}/queue`} className={styles.queueLink}>
          View public queue
        </Link>
      </div>

      <p className={styles.sectionLabel}>Services</p>
      <div className={styles.serviceList}>
        {servicesLoading && <Skeleton height={60} />}
        {!servicesLoading && (services || []).length === 0 && (
          <p style={{ color: 'var(--customer-muted)', fontSize: 13 }}>No services listed yet.</p>
        )}
        {(services || []).map((s) => (
          <div className={styles.serviceRow} key={s.id}>
            <div>
              <div className={styles.serviceName}>{s.name}</div>
              <div className={styles.serviceMeta}>{s.estimatedDuration} min</div>
            </div>
            <div className={styles.servicePrice}>₱{s.price}</div>
          </div>
        ))}
      </div>

      <div className={styles.stickyButton}>
        <Button skin="pixel" fullWidth onClick={() => navigate(`/shops/${shopId}/join`)}>
          Join queue
        </Button>
      </div>
    </div>
  );
}
