import { useCallback, useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import { fetchPublicShop, fetchPublicServices, joinShopQueue } from '../../api/shopApi';
import { useToast } from '../../components/ui/ToastContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './JoinQueue.module.css';

/**
 * Public up to the point of confirming: anyone can open this page and
 * pick a service. Only "Confirm and join" requires authentication. If
 * the visitor isn't logged in, we send them to Login with `state.from`
 * set to THIS exact URL (service selection included as a query param) so
 * Login can return them right back here afterwards.
 */
export default function JoinQueue() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { role } = useAuth();
  const showToast = useToast();

  const loadShop = useCallback(() => fetchPublicShop(shopId), [shopId]);
  const loadServices = useCallback(() => fetchPublicServices(shopId), [shopId]);
  const { data: shop, loading: shopLoading } = useAsync(loadShop, [shopId]);
  const { data: services, loading: servicesLoading } = useAsync(loadServices, [shopId]);

  const preselected = params.get('serviceId');
  const [serviceId, setServiceId] = useState(preselected || '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!serviceId && services && services.length > 0) {
      setServiceId(services[0].id);
    }
  }, [services, serviceId]);

  if (shopLoading || servicesLoading) {
    return <div className={styles.page}><div className={styles.wrap}><Skeleton height={220} /></div></div>;
  }

  if (!shop) {
    return <div className={styles.page}><div className={styles.wrap}><EmptyState skin="pixel" title="Shop not found" body="This shop may no longer be listed." /></div></div>;
  }

  function selectService(id) {
    setServiceId(id);
    setParams({ serviceId: id }, { replace: true });
  }

  function handleConfirmClick() {
    if (role !== 'customer') {
      navigate('/login', {
        state: { from: { pathname: location.pathname, search: `?serviceId=${serviceId}` } },
      });
      return;
    }
    setConfirmOpen(true);
  }

  async function handleJoin() {
    setJoining(true);
    try {
      await joinShopQueue(shopId, serviceId);
      setConfirmOpen(false);
      navigate('/my-queue');
    } catch (err) {
      setConfirmOpen(false);
      showToast(err.message, 'error');
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.wrap}>
        <p className={styles.eyebrow}>Join queue</p>
        <h1 className={styles.shopName}>{shop.name}</h1>

        <div className={styles.sectionHeading}>
          <div>
            <h2>Select a service</h2>
            <span className={styles.count}>{(services || []).length ? `${services.length} ${services.length === 1 ? 'service' : 'services'}` : ''}</span>
          </div>
        </div>

        <div className={styles.serviceList} role="radiogroup" aria-label="Select a service">
        {(services || []).length === 0 && (
          <p className={styles.empty}>This shop hasn't listed any services yet.</p>
        )}
        {(services || []).map((s) => (
          <button
            key={s.id}
            type="button"
            className={[styles.serviceOption, serviceId === s.id ? styles.serviceOptionActive : ''].join(' ')}
            aria-pressed={serviceId === s.id}
            onClick={() => selectService(s.id)}
          >
            <span className={`${styles.selectionDot} ${serviceId === s.id ? styles.selectionDotActive : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 12 5 5 9-10" /></svg>
            </span>
            <span className={styles.serviceInfo}>
              <strong>{s.name}</strong>
              <small>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                {s.estimatedDuration} min
              </small>
            </span>
            <span className={styles.price}>₱{Number(s.price).toLocaleString('en-PH')}</span>
          </button>
        ))}
        </div>

        <section className={styles.confirm}>
          <div className={styles.confirmInfo}>
            <h3>Queue information</h3>
            <p className={styles.explain}>
              {role === 'customer'
                ? "You'll get a queue position and an estimated wait right away. You can leave the queue at any time from My Queue."
                : "You'll need to log in or create an account to confirm — we'll bring you right back here with this service already selected."}
            </p>
            {(() => {
              const selectedService = (services || []).find((service) => service.id === serviceId);
              return selectedService ? (
                <p className={styles.selectedService}>
                  Selected: <strong>{selectedService.name}</strong> · {selectedService.estimatedDuration} min · ₱{Number(selectedService.price).toLocaleString('en-PH')}
                </p>
              ) : null;
            })()}
          </div>
          <button className={styles.joinButton} type="button" onClick={handleConfirmClick} disabled={!serviceId || joining}>
            {joining ? <><span className={styles.spinner} aria-hidden="true" /> Joining…</> : role === 'customer' ? 'Confirm and join' : 'Log in to join'}
          </button>
        </section>
      </main>

      <Modal skin="pixel" open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm">
        <p style={{ marginBottom: 16 }}>Join the queue at {shop.name} for this service?</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button skin="pixel" variant="secondary" onClick={() => setConfirmOpen(false)} disabled={joining}>
            Cancel
          </Button>
          <Button skin="pixel" onClick={handleJoin} disabled={joining}>
            {joining ? 'Joining…' : 'Join queue'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
