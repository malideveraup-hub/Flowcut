import { useEffect, useMemo, useRef, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchShopBarbers, createBarber, updateBarberStatus } from '../../api/shopAdminApi';
import Modal from '../../components/ui/Modal';
import CardPagination from '../../components/ui/CardPagination';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import { filterPhoneInput, filterNameInput } from '../../utils/inputFilters';
import { paginateItems } from '../../utils/clientPagination';
import styles from './ShopAdminManagement.module.css';

const FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'AVAILABLE', label: 'Available' },
  { id: 'BUSY', label: 'Busy' },
  { id: 'ON_BREAK', label: 'On break' },
  { id: 'OFFLINE', label: 'Offline' },
];
const AVAILABILITY_LABELS = { AVAILABLE: 'Available', BUSY: 'Busy', ON_BREAK: 'On break', OFFLINE: 'Offline' };
const EMPTY_FORM = { name: '', mobileNumber: '', password: '' };

export default function BarberManagement() {
  const { data: barbers, loading, error, refetch } = useAsync(fetchShopBarbers);
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [filter, setFilter] = useState('ALL');
  const [barberPage, setBarberPage] = useState(1);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [pendingDeactivation, setPendingDeactivation] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  const filteredBarbers = useMemo(() => (barbers || []).filter((barber) => (
    filter === 'ALL' || barber.availability === filter
  )), [barbers, filter]);
  const barberPagination = useMemo(() => paginateItems(filteredBarbers, barberPage), [filteredBarbers, barberPage]);

  useEffect(() => {
    if (barberPage !== barberPagination.page) setBarberPage(barberPagination.page);
  }, [barberPage, barberPagination.page]);

  async function handleAdd(event) {
    event.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setErrors({});
    try {
      await createBarber(form);
      showToast('Barber account created');
      setForm(EMPTY_FORM);
      setOpen(false);
      await refetch();
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      else showToast(err.message, 'error');
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function changeEmploymentStatus() {
    if (!pendingDeactivation || updatingId) return;
    const barber = pendingDeactivation;
    setUpdatingId(barber._id);
    try {
      await updateBarberStatus(barber._id, { status: 'INACTIVE' });
      showToast(`${barber.name} deactivated`);
      setPendingDeactivation(null);
      setSelectedBarber(null);
      await refetch();
    } catch (err) {
      showToast(err.message, 'error');
      if (err.status === 409) setPendingDeactivation(null);
      await refetch({ quiet: true });
    } finally {
      setUpdatingId(null);
    }
  }

  async function reactivate(barber) {
    if (updatingId) return;
    setUpdatingId(barber._id);
    try {
      await updateBarberStatus(barber._id, { status: 'ACTIVE', availability: 'OFFLINE' });
      showToast(`${barber.name} reactivated`);
      setSelectedBarber(null);
      await refetch();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading && !barbers) return <Skeleton height={220} />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Team</p>
          <h1 className={styles.title}>Barbers</h1>
          <p className={styles.sub}>{(barbers || []).length} staff members</p>
        </div>
        <button className={`${styles.actionButton} ${styles.primaryButton}`} type="button" onClick={() => setOpen(true)}>+ Add barber</button>
      </header>

      {error && <p className={`${styles.notice} ${styles.errorNotice}`} role="alert">{error.message || 'Could not load barbers.'} <button className={`${styles.actionButton} ${styles.smallButton}`} type="button" onClick={() => void refetch()}>Try again</button></p>}

      <section className={styles.panel} aria-label="Barber availability">
        <div className={styles.toolbar}>
          <div className={styles.filters} aria-label="Filter barbers by current availability">
            {FILTERS.map((item) => (
              <button key={item.id} className={styles.filterButton} type="button" aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setBarberPage(1); }}>
                {item.label}{item.id === 'ALL' ? ` ${barbers?.length || 0}` : ` ${(barbers || []).filter((barber) => barber.availability === item.id).length}`}
              </button>
            ))}
          </div>
          <span className={styles.sub}>Availability is live; employment status is separate.</span>
        </div>
        {filteredBarbers.length ? (
          <div className={`${styles.cardGrid} ${styles.cardGridSpaced}`}>
            {barberPagination.items.map((barber) => (
              <article className={styles.personCard} key={barber._id}>
                <div className={styles.cardTop}>
                  <div className={styles.identity}>
                    <span className={styles.avatar} aria-hidden="true">{barber.name?.trim().charAt(0).toUpperCase() || '?'}</span>
                    <div>
                      <h2 className={styles.cardTitle}>{barber.name}</h2>
                      <p className={styles.cardSub}>Barber account</p>
                    </div>
                  </div>
                  <span className={`${styles.badge} ${barber.status === 'ACTIVE' ? styles.badgeGreen : styles.badgeMuted}`}>{barber.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
                </div>
                <div className={styles.metaGrid}>
                  <div className={styles.meta}><span>Availability</span><strong>{AVAILABILITY_LABELS[barber.availability] || 'Unknown'}</strong></div>
                  <div className={styles.meta}><span>Employment</span><strong>{barber.status === 'ACTIVE' ? 'Active' : 'Inactive'}</strong></div>
                </div>
                <div className={styles.cardActions}>
                  <button className={`${styles.actionButton} ${styles.smallButton}`} type="button" onClick={() => setSelectedBarber(barber)}>Details</button>
                  {barber.status === 'ACTIVE' ? (
                    <button className={`${styles.actionButton} ${styles.dangerButton} ${styles.smallButton}`} type="button" disabled={Boolean(updatingId)} onClick={() => setPendingDeactivation(barber)}>Deactivate</button>
                  ) : (
                    <button className={`${styles.actionButton} ${styles.smallButton}`} type="button" disabled={Boolean(updatingId)} onClick={() => void reactivate(barber)}>{updatingId === barber._id ? 'Reactivating…' : 'Reactivate'}</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>{barbers?.length ? 'No barbers match this availability filter.' : 'No barbers added yet.'}</p>
        )}
        <CardPagination pagination={barberPagination} onPageChange={setBarberPage} itemLabel="barbers" />
      </section>

      <Modal open={open} onClose={() => { if (!creating) setOpen(false); }} title="Add barber">
        <p className={styles.modalCopy}>Create a barber login using a Philippine mobile number (09XXXXXXXXX).</p>
        <form className={styles.form} onSubmit={handleAdd} noValidate>
          <label className={styles.field}><span className={styles.fieldLabel}>Barber name</span><input className={styles.input} value={form.name} maxLength={100} onChange={(event) => setForm((current) => ({ ...current, name: filterNameInput(event.target.value) }))} aria-invalid={Boolean(errors.name)} />{errors.name && <span className={styles.fieldError}>{errors.name}</span>}</label>
          <label className={styles.field}><span className={styles.fieldLabel}>Mobile number</span><input className={styles.input} type="tel" placeholder="09171234567" value={form.mobileNumber} onChange={(event) => setForm((current) => ({ ...current, mobileNumber: filterPhoneInput(event.target.value) }))} aria-invalid={Boolean(errors.mobileNumber)} />{errors.mobileNumber && <span className={styles.fieldError}>{errors.mobileNumber}</span>}</label>
          <label className={styles.field}><span className={styles.fieldLabel}>Temporary password</span><input className={styles.input} type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} aria-invalid={Boolean(errors.password)} />{errors.password && <span className={styles.fieldError}>{errors.password}</span>}</label>
          <div className={styles.formActions}>
            <button className={styles.actionButton} type="button" disabled={creating} onClick={() => setOpen(false)}>Cancel</button>
            <button className={`${styles.actionButton} ${styles.primaryButton}`} type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create barber account'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selectedBarber)} onClose={() => setSelectedBarber(null)} title={selectedBarber?.name || 'Barber details'}>
        {selectedBarber && <>
          <div className={styles.metaGrid}>
            <div className={styles.meta}><span>Employment status</span><strong>{selectedBarber.status === 'ACTIVE' ? 'Active' : 'Inactive'}</strong></div>
            <div className={styles.meta}><span>Current availability</span><strong>{AVAILABILITY_LABELS[selectedBarber.availability] || 'Unknown'}</strong></div>
          </div>
          <div className={styles.formActions}><button className={styles.actionButton} type="button" onClick={() => setSelectedBarber(null)}>Close</button></div>
        </>}
      </Modal>

      <Modal open={Boolean(pendingDeactivation)} onClose={() => { if (!updatingId) setPendingDeactivation(null); }} title="Deactivate barber?">
        {pendingDeactivation && <>
          <p className={styles.modalCopy}>Deactivating {pendingDeactivation.name} sets their availability to Offline and prevents them from using the barber dashboard. Existing assigned or active queue entries must be reassigned or finished first; no queue entries or service history will be removed.</p>
          <div className={styles.formActions}>
            <button className={styles.actionButton} type="button" disabled={Boolean(updatingId)} onClick={() => setPendingDeactivation(null)}>Cancel</button>
            <button className={`${styles.actionButton} ${styles.dangerButton}`} type="button" disabled={Boolean(updatingId)} onClick={() => void changeEmploymentStatus()}>{updatingId ? 'Deactivating…' : 'Deactivate barber'}</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
