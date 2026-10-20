import { useEffect, useMemo, useRef, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchOwnServices, createService, updateService, setServiceStatus } from '../../api/shopAdminApi';
import AddServiceModal from '../../components/services/AddServiceModal';
import Modal from '../../components/ui/Modal';
import CardPagination from '../../components/ui/CardPagination';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import { paginateItems } from '../../utils/clientPagination';
import styles from './ShopAdminManagement.module.css';

export default function ServiceManagement() {
  const { data: services, loading, error, refetch } = useAsync(fetchOwnServices);
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingStatus, setPendingStatus] = useState(null);
  const [servicePage, setServicePage] = useState(1);
  const [busyId, setBusyId] = useState(null);
  const busyRef = useRef(false);
  const servicePagination = useMemo(() => paginateItems(services || [], servicePage), [services, servicePage]);

  useEffect(() => {
    if (servicePage !== servicePagination.page) setServicePage(servicePagination.page);
  }, [servicePage, servicePagination.page]);

  async function toggleStatus() {
    if (!pendingStatus || busyRef.current) return;
    const service = pendingStatus;
    busyRef.current = true;
    setBusyId(service._id);
    const nextStatus = service.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await setServiceStatus(service._id, nextStatus);
      showToast(`${service.name} marked ${nextStatus.toLowerCase()}`);
      setPendingStatus(null);
      await refetch();
    } catch (err) {
      showToast(err.message || 'Could not update service status.', 'error');
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  if (loading && !services) return <Skeleton height={220} />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Menu</p>
          <h1 className={styles.title}>Services</h1>
          <p className={styles.sub}>{(services || []).length} services</p>
        </div>
        <button className={`${styles.actionButton} ${styles.primaryButton}`} type="button" onClick={() => setOpen(true)}>+ Add service</button>
      </header>

      {error && <p className={`${styles.notice} ${styles.errorNotice}`} role="alert">{error.message || 'Could not load services.'} <button className={`${styles.actionButton} ${styles.smallButton}`} type="button" onClick={() => void refetch()}>Try again</button></p>}

      {services?.length ? (
        <section className={styles.cardGrid} aria-label="Shop services">
          {servicePagination.items.map((service) => (
            <article className={styles.serviceCard} key={service._id}>
              <div className={styles.cardTop}>
                <div>
                  <h2 className={styles.cardTitle}>{service.name}</h2>
                  <p className={styles.cardSub}>Service offering</p>
                </div>
                <span className={`${styles.badge} ${service.status === 'ACTIVE' ? styles.badgeGreen : styles.badgeMuted}`}>{service.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
              </div>
              <div className={styles.metaGrid}>
                <div className={styles.meta}><span>Duration</span><strong>{service.estimatedDuration} min</strong></div>
                <div className={styles.meta}><span>Price</span><strong>₱{Number(service.price).toLocaleString('en-PH')}</strong></div>
              </div>
              <div className={styles.cardActions}>
                <button className={`${styles.actionButton} ${styles.smallButton}`} type="button" disabled={Boolean(busyId)} onClick={() => setEditing(service)}>Edit</button>
                <button className={`${styles.actionButton} ${service.status === 'ACTIVE' ? styles.dangerButton : ''} ${styles.smallButton}`} type="button" disabled={Boolean(busyId)} onClick={() => setPendingStatus(service)}>
                  {busyId === service._id ? 'Updating…' : service.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.panel}><p className={styles.empty}>{error ? 'Services could not be loaded.' : 'No services yet. Add a service to make it available to customers.'}</p></section>
      )}
      <CardPagination pagination={servicePagination} onPageChange={setServicePage} itemLabel="services" />

      <AddServiceModal
        open={open || Boolean(editing)}
        onClose={() => { setOpen(false); setEditing(null); }}
        onCreate={createService}
        onUpdate={updateService}
        service={editing}
        onCreated={() => refetch()}
      />

      <Modal open={Boolean(pendingStatus)} onClose={() => { if (!busyId) setPendingStatus(null); }} title={pendingStatus?.status === 'ACTIVE' ? 'Deactivate service?' : 'Reactivate service?'}>
        {pendingStatus && <>
          <p className={styles.modalCopy}>{pendingStatus.status === 'ACTIVE'
            ? `Deactivating ${pendingStatus.name} prevents new bookings and queue entries. Existing queue entries and completed service history are kept.`
            : `Reactivating ${pendingStatus.name} makes it available for new bookings and queue entries again.`}</p>
          <div className={styles.formActions}>
            <button className={styles.actionButton} type="button" disabled={Boolean(busyId)} onClick={() => setPendingStatus(null)}>Cancel</button>
            <button className={`${styles.actionButton} ${pendingStatus.status === 'ACTIVE' ? styles.dangerButton : styles.primaryButton}`} type="button" disabled={Boolean(busyId)} onClick={() => void toggleStatus()}>{busyId ? 'Updating…' : pendingStatus.status === 'ACTIVE' ? 'Deactivate service' : 'Reactivate service'}</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
