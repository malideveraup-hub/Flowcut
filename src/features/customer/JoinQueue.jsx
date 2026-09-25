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
    return <Skeleton height={220} />;
  }

  if (!shop) {
    return <EmptyState skin="pixel" title="Shop not found" body="This shop may no longer be listed." />;
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
    <div>
      <p className={styles.sectionLabel}>Join queue</p>
      <h1 className={styles.shopName}>{shop.name}</h1>

      <p className={styles.label}>Select a service</p>
      <div className={styles.serviceList}>
        {(services || []).length === 0 && (
          <p style={{ color: 'var(--customer-muted)', fontSize: 13 }}>This shop hasn't listed any services yet.</p>
        )}
        {(services || []).map((s) => (
          <button
            key={s.id}
            className={[styles.serviceOption, serviceId === s.id ? styles.serviceOptionActive : ''].join(' ')}
            onClick={() => selectService(s.id)}
          >
            <span>{s.name}</span>
            <span className={styles.serviceMeta}>
              {s.estimatedDuration} min · ₱{s.price}
            </span>
          </button>
        ))}
      </div>

      <p className={styles.explain}>
        {role === 'customer'
          ? "You'll get a queue position and an estimated wait right away. You can leave the queue at any time from My Queue."
          : "You'll need to log in or create an account to confirm — we'll bring you right back here with this service already selected."}
      </p>

      <Button skin="pixel" fullWidth onClick={handleConfirmClick} disabled={!serviceId}>
        {role === 'customer' ? 'Confirm and join' : 'Log in to join'}
      </Button>

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
