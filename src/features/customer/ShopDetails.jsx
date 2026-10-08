import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShop, fetchPublicServices, fetchMyFavorites, addMyFavorite, removeMyFavorite } from '../../api/shopApi';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/ToastContext';
import WaitMeter from '../../components/ui/WaitMeter';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './ShopDetails.module.css';

export default function ShopDetails() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const showToast = useToast();
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const isCustomer = user?.role === 'customer';

  const loadShop = useCallback(() => fetchPublicShop(shopId), [shopId]);
  const loadServices = useCallback(() => fetchPublicServices(shopId), [shopId]);
  const { data: shop, loading: shopLoading, error: shopError } = useAsync(loadShop, [shopId]);
  const { data: services, loading: servicesLoading } = useAsync(loadServices, [shopId]);

  useEffect(() => {
    if (!isCustomer) return undefined;
    let active = true;
    fetchMyFavorites().then((favorites) => {
      if (active) setIsFavorite(favorites.some((favorite) => favorite.id === shopId));
    }).catch(() => {
      if (active) setIsFavorite(false);
    });
    return () => { active = false; };
  }, [isCustomer, shopId, user?.id]);

  async function toggleFavorite() {
    setFavoriteLoading(true);
    try {
      if (isFavorite) {
        await removeMyFavorite(shopId);
        setIsFavorite(false);
        showToast('Removed from favorites');
      } else {
        await addMyFavorite(shopId);
        setIsFavorite(true);
        showToast('Added to favorites');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setFavoriteLoading(false);
    }
  }

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
      <div className={styles.titleRow}>
        <h1 className={styles.name}>{shop.name}</h1>
        {isCustomer && !authLoading && (
          <button
            className={`${styles.favoriteButton} ${isFavorite ? styles.isFavorite : ''}`}
            type="button"
            aria-label={isFavorite ? `Remove ${shop.name} from favorites` : `Add ${shop.name} to favorites`}
            aria-pressed={isFavorite}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            disabled={favoriteLoading}
            onClick={toggleFavorite}
          >
            <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s-7-4.5-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12C19 16.5 12 21 12 21Z" />
            </svg>
          </button>
        )}
      </div>
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
