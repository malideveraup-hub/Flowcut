import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import {
  addWalkIn,
  cancelQueueEntry,
  completeShopQueueEntry,
  fetchOwnServices,
  fetchOwnShop,
  fetchShopBarbers,
  fetchShopDashboardSummary,
  fetchShopQueueBoard,
  moveShopQueueEntry,
  setShopQueueOpen,
  skipQueueEntry,
  updateShopQueueEntry,
} from '../../api/shopAdminApi';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/ui/ToastContext';
import styles from './QueueManagement.module.css';

const PAGE_SIZE = 12;

function Icon({ name }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" /></>,
    add: <path d="M12 5v14M5 12h14" />,
    dots: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    person: <><circle cx="9" cy="8" r="3" /><path d="M2.5 20c0-3.5 2.4-5.5 6.5-5.5s6.5 2 6.5 5.5M16 5.5a3 3 0 0 1 0 5.8M17.5 14.5c2.5.7 4 2.4 4 5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function statusText(status) {
  if (status === 'JOINED' || status === 'WAITING') return 'Waiting';
  if (status === 'CALLED') return 'Almost up';
  if (['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(status)) return 'In service';
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'CANCELLED') return 'Cancelled';
  if (status === 'SKIPPED') return 'Left queue';
  return status.replaceAll('_', ' ').toLowerCase();
}

function joinedTime(timestamp) {
  if (!timestamp) return 'Time unavailable';
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function relativeAge(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function activityDescription(entry) {
  if (entry.status === 'COMPLETED') return `${entry.barberName || 'Barber'} completed service for ${entry.customerName}`;
  if (entry.status === 'IN_SERVICE' || entry.status === 'DELAYED' || entry.status === 'PAUSED') return `${entry.barberName || 'Barber'} started ${entry.customerName}'s ${entry.serviceName || 'service'}`;
  if (entry.status === 'CALLED') return `${entry.customerName} is almost up`;
  if (entry.status === 'CANCELLED') return `${entry.customerName} cancelled their queue entry`;
  if (entry.status === 'SKIPPED') return `${entry.customerName} left the queue`;
  return `${entry.customerName} joined the queue`;
}

export default function QueueManagement() {
  const { data: shop } = useAsync(fetchOwnShop);
  const { data: services } = useAsync(fetchOwnServices);
  const { data: barbers } = useAsync(fetchShopBarbers);
  const { data: dashboardSummary } = useAsync(fetchShopDashboardSummary);
  const showToast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ walkInName: '', serviceId: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [queueData, setQueueData] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [boardError, setBoardError] = useState('');
  const [boardLoading, setBoardLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [historyFilter, setHistoryFilter] = useState('HISTORY');
  const [barberFilter, setBarberFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [sort, setSort] = useState('queue');
  const [historySort, setHistorySort] = useState('newest');
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({ barberId: '', serviceId: '' });
  const [detailEntry, setDetailEntry] = useState(null);

  const activeServices = (services || []).filter((s) => s.status === 'ACTIVE');
  const activeBarbers = (barbers || []).filter((barber) => barber.status === 'ACTIVE');
  const serviceById = useMemo(() => new Map((services || []).map((service) => [String(service.id || service._id), service])), [services]);
  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    let current = true;
    Promise.all([
      fetchShopQueueBoard({ search, status: statusFilter, barberId: barberFilter, serviceId: serviceFilter, sort, limit: PAGE_SIZE, page }),
      fetchShopQueueBoard({ search, status: historyFilter, barberId: barberFilter, serviceId: serviceFilter, sort: historySort, limit: PAGE_SIZE, page: historyPage }),
    ]).then(([activeResult, historyResult]) => {
      if (current) {
        setQueueData(activeResult);
        setHistoryData(historyResult);
        setBoardError('');
      }
    }).catch((error) => {
      if (current) setBoardError(error.message);
    }).finally(() => {
      if (current) setBoardLoading(false);
    });
    return () => { current = false; };
  }, [search, statusFilter, barberFilter, serviceFilter, sort, page, historyFilter, historySort, historyPage, refreshKey]);

  function refreshBoard() {
    setBoardLoading(true);
    setRefreshKey((key) => key + 1);
  }

  function resetPages() {
    setPage(1);
    setHistoryPage(1);
  }

  async function handleAddWalkIn(e) {
    e.preventDefault();
    if (!form.walkInName.trim()) {
      setFormError('Enter a customer name.');
      return;
    }
    const serviceId = form.serviceId || activeServices[0]?.id || activeServices[0]?._id;
    if (!serviceId) {
      setFormError('Add a service before adding walk-ins.');
      return;
    }
    setSubmitting(true);
    try {
      await addWalkIn({ walkInName: form.walkInName, serviceId });
      showToast('Walk-in added');
      setForm({ walkInName: '', serviceId: '' });
      setFormError('');
      setModalOpen(false);
      refreshBoard();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip(row) {
    try {
      await skipQueueEntry(row.id);
      showToast(`${row.customerName} skipped`);
      refreshBoard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleCancel(row) {
    try {
      await cancelQueueEntry(row.id);
      showToast(`${row.customerName} cancelled`);
      refreshBoard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function updateQueueEntry(entry, fields, message) {
    try {
      await updateShopQueueEntry(entry.id, fields);
      showToast(message);
      refreshBoard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleComplete(entry) {
    try {
      await completeShopQueueEntry(entry.id);
      showToast(`${entry.customerName} marked completed`);
      refreshBoard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleMove(entry, position) {
    try {
      await moveShopQueueEntry(entry.id, position);
      refreshBoard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function toggleQueue() {
    try {
      await setShopQueueOpen(!queueData.queueOpen);
      showToast(`Queue ${queueData.queueOpen ? 'closed' : 'opened'}`);
      refreshBoard();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function openEdit(entry) {
    setEditEntry(entry);
    setEditForm({ barberId: entry.barberId || '', serviceId: entry.serviceId || '' });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editEntry) return;
    await updateQueueEntry(editEntry, {
      barberId: editForm.barberId || null,
      serviceId: editForm.serviceId,
    }, 'Queue entry updated');
    setEditEntry(null);
  }

  function estimateWait(entry) {
    if (['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(entry.status)) return 'In service now';
    if (entry.status === 'CALLED') return 'Almost up';
    const duration = serviceById.get(String(entry.serviceId))?.estimatedDuration || 25;
    const workingBarbers = Math.max(activeBarbers.filter((barber) => ['AVAILABLE', 'BUSY'].includes(barber.availability)).length, 1);
    const minutes = Math.max(0, Math.round(((entry.queuePosition || 1) - 1) * duration / workingBarbers));
    return `Approx. ${minutes} min`;
  }

  const queueEntries = queueData?.entries || [];
  const historyEntries = historyData?.entries || [];
  const counts = queueData?.counts || {};
  const activityEntries = (dashboardSummary?.recentActivity?.length ? dashboardSummary.recentActivity : queueEntries)
    .slice().sort((left, right) => new Date(right.updatedAt || right.createdAt) - new Date(left.updatedAt || left.createdAt)).slice(0, 4);
  const firstQueueRow = queueData?.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastQueueRow = Math.min(page * PAGE_SIZE, queueData?.total || 0);
  const firstHistoryRow = historyData?.total ? (historyPage - 1) * PAGE_SIZE + 1 : 0;
  const lastHistoryRow = Math.min(historyPage * PAGE_SIZE, historyData?.total || 0);

  return (
    <div className={styles.queuePage}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Queue management</h1>
          <p className={styles.sub}>Monitor and manage customers currently waiting for service.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={`${styles.toggleButton} ${queueData?.queueOpen ? styles.queueOpen : styles.queueClosed}`} onClick={toggleQueue} disabled={!queueData}>
            <span className={styles.dot} />Queue {queueData?.queueOpen ? 'Open' : 'Closed'}
          </button>
          <button className={styles.secondaryButton} onClick={refreshBoard} disabled={boardLoading}><Icon name="refresh" />Refresh</button>
          <Button size="sm" disabled={queueData?.queueOpen === false} onClick={() => setModalOpen(true)}><Icon name="add" />Add walk-in</Button>
        </div>
      </header>

      <div className={styles.summaryStrip} aria-label="Queue summary">
        <div className={styles.summaryChip}><span>Waiting</span><b>{counts.waiting || 0}</b></div>
        <div className={styles.summaryChip}><span>Almost up</span><b>{counts.almostUp || 0}</b></div>
        <div className={styles.summaryChip}><span>In service</span><b>{counts.inService || 0}</b></div>
        <div className={styles.summaryChip}><span>Completed</span><b>{counts.completed || 0}</b></div>
        <div className={styles.summaryChip}><span>Cancelled / Left</span><b>{(counts.cancelled || 0) + (counts.left || 0)}</b></div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Icon name="search" />
          <input value={searchInput} onChange={(event) => { setSearchInput(event.target.value); resetPages(); }} placeholder="Search customer, queue #, or service" aria-label="Search queue" />
        </label>
        <div className={styles.filters}>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); resetPages(); }}>
            <option value="ALL">All statuses</option>
            <option value="WAITING">Waiting</option>
            <option value="ALMOST_UP">Almost up</option>
            <option value="IN_SERVICE">In service</option>
          </select>
          <select value={barberFilter} onChange={(event) => { setBarberFilter(event.target.value); resetPages(); }}>
            <option value="">All barbers</option>
            {activeBarbers.map((barber) => <option key={barber._id} value={barber._id}>{barber.name}</option>)}
          </select>
          <select value={serviceFilter} onChange={(event) => { setServiceFilter(event.target.value); resetPages(); }}>
            <option value="">All services</option>
            {activeServices.map((service) => <option key={service.id || service._id} value={service.id || service._id}>{service.name}</option>)}
          </select>
          <select value={sort} onChange={(event) => { setSort(event.target.value); resetPages(); }}>
            <option value="queue">Queue position</option>
            <option value="joined">Time joined</option>
            <option value="wait">Estimated wait</option>
            <option value="status">Status</option>
            <option value="service">Service</option>
            <option value="barber">Barber</option>
          </select>
        </div>
      </div>

      {boardError && <p className={styles.error}>{boardError}</p>}
      {boardLoading && !queueData ? <div className={styles.loading}>Loading queue…</div> : null}

      {queueData && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Live queue</h2>
          </div>
          <div className={styles.queueTableWrap}>
            <div className={styles.tableHead}><span>Queue</span><span>Customer</span><span>Service</span><span>Wait</span><span>Barber</span><span>Status</span><span style={{ textAlign: 'right' }}>Actions</span></div>
            {queueEntries.length ? queueEntries.map((entry) => (
              <div className={`${styles.queueRow} ${entry.status === 'CALLED' ? styles.rowAlmost : ''}`} key={entry.id}>
                <span className={styles.queueNumber}>#{String(entry.queuePosition).padStart(2, '0')}</span>
                <span className={styles.customerCell}><strong>{entry.customerName}</strong><small>Joined {joinedTime(entry.createdAt)}</small></span>
                <span>{entry.serviceName || 'Service'}</span>
                <strong className={styles.waitCell}>{estimateWait(entry)}</strong>
                <span className={entry.barberName ? '' : styles.unassigned}>{entry.barberName || 'Unassigned'}</span>
                <span className={`${styles.statusBadge} ${styles[`status${entry.status}`] || ''}`}>{statusText(entry.status)}</span>
                <span className={styles.rowActions}>
                  {['WAITING', 'JOINED', 'CALLED'].includes(entry.status) && (
                    <>
                      <button className={styles.primaryAction} onClick={() => openEdit(entry)}>{entry.status === 'WAITING' || entry.status === 'JOINED' ? 'Assign barber' : 'Complete'}</button>
                      <button className={styles.moreButton} aria-label={`More actions for ${entry.customerName}`} onClick={() => setDetailEntry(entry)}>•••</button>
                    </>
                  )}
                  {['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(entry.status) && (
                    <>
                      <button className={styles.primaryAction} onClick={() => handleComplete(entry)}>Complete</button>
                      <button className={styles.moreButton} aria-label={`More actions for ${entry.customerName}`} onClick={() => setDetailEntry(entry)}>•••</button>
                    </>
                  )}
                </span>
              </div>
            )) : <div className={styles.emptyTable}>No customers match.</div>}
          </div>
          <div className={styles.tableFooter}><span>Showing {firstQueueRow}–{lastQueueRow} of {queueData.total} customers</span><div className={styles.pager}><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><button className={styles.pageCurrent} disabled>{page}</button><button disabled={page >= queueData.pages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
        </section>
      )}

      {historyData && (
        <>
          <div className={styles.historyBar}>
            <div>
              <h2>Queue history</h2>
              <p>Completed, cancelled, and left-queue entries.</p>
            </div>
            <label className={styles.historySort}>Sort by
              <select value={historySort} onChange={(event) => { setHistorySort(event.target.value); setHistoryPage(1); }}>
                <option value="newest">Most recent</option>
                <option value="queue">Oldest</option>
                <option value="joined">Customer name</option>
              </select>
            </label>
          </div>
          <div className={styles.historyTabs}>
            {[['HISTORY', 'All 22'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'], ['LEFT_QUEUE', 'Left queue']].map(([value, label]) => (
              <button className={historyFilter === value ? styles.activeTab : ''} key={value} onClick={() => { setHistoryFilter(value); setHistoryPage(1); }}>
                {label}
              </button>
            ))}
          </div>

          <section className={styles.panel}>
            <div className={styles.historyTableHead}><span>Customer</span><span>Queue</span><span>Service</span><span>Barber</span><span>Joined</span><span>Ended</span><span>Status</span><span></span></div>
            {historyEntries.length ? historyEntries.map((entry) => (
              <div className={styles.historyRow} key={entry.id}>
                <span className={styles.customerCell}><strong>{entry.customerName}</strong></span>
                <span className={styles.queueMark}>#{String(entry.queuePosition).padStart(2, '0')}</span>
                <span>{entry.serviceName || 'Service'}</span>
                <span>{entry.barberName || 'Unassigned'}</span>
                <span>{joinedTime(entry.createdAt)}</span>
                <span>{joinedTime(entry.updatedAt)}</span>
                <span className={`${styles.statusBadge} ${styles[`status${entry.status}`] || ''}`}>{statusText(entry.status)}</span>
                <span className={styles.historyAction}><button className={styles.viewButton} onClick={() => setDetailEntry(entry)}>View</button></span>
              </div>
            )) : <div className={styles.emptyTable}>No history entries for this filter.</div>}
            <div className={styles.tableFooter}><span>Showing {firstHistoryRow}–{lastHistoryRow} of {historyData.total} entries</span><div className={styles.pager}><button disabled={historyPage <= 1} onClick={() => setHistoryPage((current) => current - 1)}>Previous</button><button className={styles.pageCurrent} disabled>{historyPage}</button><button disabled={historyPage >= historyData.pages} onClick={() => setHistoryPage((current) => current + 1)}>Next</button></div></div>
          </section>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add walk-in">
        <form onSubmit={handleAddWalkIn} noValidate>
          <Input
            label="Customer name"
            value={form.walkInName}
            onChange={(e) => setForm((f) => ({ ...f, walkInName: e.target.value }))}
            placeholder="Full name"
            error={formError}
          />
          <div className={styles.field}>
            <label className={styles.label} htmlFor="service">Service</label>
            <select id="service" className={styles.select} value={form.serviceId} onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}>
              {activeServices.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>{s.name} · {s.estimatedDuration} min</option>
              ))}
            </select>
          </div>
          <Button type="submit" fullWidth disabled={submitting}>{submitting ? 'Adding…' : 'Add to queue'}</Button>
        </form>
      </Modal>

      <Modal open={Boolean(editEntry)} onClose={() => setEditEntry(null)} title="Update queue entry">
        <form onSubmit={saveEdit}>
          <div className={styles.field}><label className={styles.label} htmlFor="queue-barber">Barber</label><select id="queue-barber" className={styles.select} value={editForm.barberId} onChange={(event) => setEditForm((current) => ({ ...current, barberId: event.target.value }))}><option value="">Unassigned</option>{activeBarbers.map((barber) => <option key={barber._id} value={barber._id}>{barber.name}</option>)}</select></div>
          <div className={styles.field}><label className={styles.label} htmlFor="queue-service">Service</label><select id="queue-service" className={styles.select} value={editForm.serviceId} onChange={(event) => setEditForm((current) => ({ ...current, serviceId: event.target.value }))}>{activeServices.map((service) => <option key={service.id || service._id} value={service.id || service._id}>{service.name}</option>)}</select></div>
          <Button type="submit" fullWidth disabled={submitting || !editForm.serviceId}>Save changes</Button>
        </form>
      </Modal>

      <Modal open={Boolean(detailEntry)} onClose={() => setDetailEntry(null)} title={detailEntry ? detailEntry.customerName : 'Queue details'}>
        {detailEntry && <div className={styles.detailList}>
          <p><span>Queue number</span><strong>#{String(detailEntry.queuePosition).padStart(2, '0')}</strong></p>
          <p><span>Service</span><strong>{detailEntry.serviceName || 'Service'}</strong></p>
          <p><span>Barber</span><strong>{detailEntry.barberName || 'Unassigned'}</strong></p>
          <p><span>Status</span><strong>{statusText(detailEntry.status)}</strong></p>
          <p><span>Joined</span><strong>{detailEntry.createdAt ? new Date(detailEntry.createdAt).toLocaleString() : 'Unavailable'}</strong></p>
          <p><span>Last updated</span><strong>{detailEntry.updatedAt ? new Date(detailEntry.updatedAt).toLocaleString() : 'Unavailable'}</strong></p>
        </div>}
      </Modal>
    </div>
  );
}
