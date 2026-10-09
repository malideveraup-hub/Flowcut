import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchPublicShop, fetchPublicServices, fetchMyFavorites, addMyFavorite, removeMyFavorite } from '../../api/shopApi';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/ui/ToastContext';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import { CONGESTION, congestionFromWait } from '../../api/congestion';
import styles from './ShopDetails.module.css';

function Icon({ name, className = '' }) {
  const paths = {
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-4 3-6 7-6s7 2 7 6M16 5a3.5 3.5 0 0 1 0 6.8M18 14c2.5.6 4 2.5 4 6" /></>,
    barber: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.5 8.5 11 11m-11-4 11-11" /></>,
    heart: <path d="M12 21s-7-4.5-9.3-9A5.2 5.2 0 0 1 12 6.5 5.2 5.2 0 0 1 21.3 12C19 16.5 12 21 12 21Z" />,
  };

  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function formatTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return value || '—';
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatWait(min, max) {
  if (!Number.isFinite(min)) return 'Unavailable';
  if (Number.isFinite(max) && max !== min) return `${min}–${max}`;
  return String(min);
}

export default function ShopDetails() {
  const { shopId } = useParams();
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
      <div className={styles.page}>
        <div className={styles.wrap}>
          <Skeleton height={180} style={{ marginBottom: 18 }} />
          <Skeleton height={170} style={{ marginBottom: 18 }} />
          <Skeleton height={250} />
        </div>
      </div>
    );
  }

  if (shopError || !shop) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <EmptyState
            skin="pixel"
            title="Shop not found"
            body={shopError?.status === 404 ? 'This shop may no longer be listed.' : shopError?.message}
          />
        </div>
      </div>
    );
  }

  const minWait = Number.isFinite(shop.waitMin) ? shop.waitMin : null;
  const maxWait = Number.isFinite(shop.waitMax) ? shop.waitMax : minWait;
  const congestion = minWait == null ? null : congestionFromWait(minWait);
  const congestionInfo = congestion ? CONGESTION[congestion] : null;
  const waitText = formatWait(minWait, maxWait);
  const waiting = Number.isFinite(shop.waiting) ? shop.waiting : 0;
  const activeBarbers = Number.isFinite(shop.activeBarbers) ? shop.activeBarbers : 0;
  const hours = `${formatTime(shop.openingTime)} – ${formatTime(shop.closingTime)}`;

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.layout}>
          <div className={styles.mainCol}>
            <section className={styles.hero} aria-labelledby="shop-name">
              <div className={styles.cover} aria-hidden="true">
                <span className={styles.coverMark}><Icon name="barber" /></span>
              </div>
              <div className={styles.heroBody}>
                <div className={styles.head}>
                  <div className={styles.titleCopy}>
                    <p className={styles.eyebrow}>Shop details</p>
                    <h1 className={styles.name} id="shop-name">{shop.name}</h1>
                  </div>
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
                      <Icon name="heart" />
                    </button>
                  )}
                </div>
                <div className={styles.meta}>
                  <span className={styles.chip}><Icon name="location" />{shop.address || 'Address unavailable'}</span>
                  <span className={styles.chip}><Icon name="clock" />{hours}</span>
                  {shop.contactPhone && <span className={styles.chip}>{shop.contactPhone}</span>}
                </div>
              </div>
            </section>

            <section className={styles.waitCard} aria-label="Live wait estimate">
              <div className={styles.waitPrimary}>
                <div className={styles.label}><span className={styles.liveDot} />Estimated wait</div>
                <div className={styles.big}>{waitText}<small>{minWait == null ? '' : 'min'}</small></div>
                <p className={styles.note}>Current estimate based on the live queue.</p>
              </div>
              <div className={styles.waitStatus}>
                <div className={styles.label}>Queue status</div>
                {congestionInfo ? (
                  <>
                    <span className={`${styles.pill} ${styles[congestion]}`}><i />{congestionInfo.label}</span>
                    <p className={styles.note}>{congestionInfo.hint}</p>
                  </>
                ) : <p className={styles.note}>Wait status is unavailable right now.</p>}
              </div>
            </section>

            <section className={styles.servicesSection} aria-labelledby="services-title">
              <div className={styles.sectionHeading}>
                <h2 id="services-title">Services</h2>
                <span>{servicesLoading ? 'Loading…' : `${(services || []).length} ${(services || []).length === 1 ? 'service' : 'services'}`}</span>
              </div>
              <div className={styles.services}>
                {servicesLoading && <Skeleton height={78} />}
                {!servicesLoading && (services || []).length === 0 && (
                  <p className={styles.empty}>This shop hasn’t added any services yet.</p>
                )}
                {!servicesLoading && (services || []).map((service) => (
                  <article className={styles.service} key={service.id}>
                    <span className={styles.serviceIcon}><Icon name="barber" /></span>
                    <span className={styles.serviceInfo}>
                      <strong>{service.name}</strong>
                      <small><Icon name="clock" />{service.estimatedDuration} min</small>
                      {service.description && <span className={styles.serviceDescription}>{service.description}</span>}
                    </span>
                    <span className={styles.price}>₱{Number(service.price).toLocaleString('en-PH')}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className={styles.side} aria-label="Queue summary">
            <section className={styles.summary}>
              <h2><span className={styles.liveDot} />Queue summary</h2>
              <div className={styles.tiles}>
                <div className={styles.tile}>
                  <span className={styles.tileIcon}><Icon name="people" /></span>
                  <strong>{waiting}</strong>
                  <span>Waiting</span>
                </div>
                <div className={styles.tile}>
                  <span className={styles.tileIcon}><Icon name="barber" /></span>
                  <strong>{activeBarbers}</strong>
                  <span>Barbers active</span>
                </div>
              </div>
              <Link className={styles.joinButton} to={`/shops/${shopId}/join`}>Join queue</Link>
              <Link to={`/shops/${shopId}/queue`} className={styles.queueLink}>View public queue</Link>
            </section>
          </aside>
        </div>
      </div>

      <div className={styles.mobileBar}>
        <div className={styles.mobileWait}>
          <small>Estimated wait</small>
          <strong>{waitText}{minWait == null ? '' : ' min'}</strong>
        </div>
        <Link className={styles.mobileJoin} to={`/shops/${shopId}/join`}>Join queue</Link>
      </div>
    </div>
  );
}
