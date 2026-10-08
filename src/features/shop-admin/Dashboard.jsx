import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { useAuth } from '../../hooks/useAuth';
import {
  addWalkIn,
  fetchOwnServices,
  fetchOwnShop,
  fetchShopBarbers,
  fetchShopDashboardSummary,
  fetchShopQueue,
} from '../../api/shopAdminApi';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Dashboard.module.css';

const ACTIVE_SERVICE_STATUSES = ['IN_SERVICE', 'DELAYED', 'PAUSED'];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function initials(name) {
  return (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function Icon({ name }) {
  const paths = {
    queue: <><path d="M4 6h16M4 12h16M4 18h10" /><circle cx="19" cy="18" r="2" /></>,
    barber: <><circle cx="12" cy="7" r="3.5" /><path d="M4 21c0-4.4 3.1-7 8-7s8 2.6 8 7" /></>,
    wait: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    completed: <><path d="M5 4h14v16H5zM9 9h6M9 13h3" /><path d="m14 16 2 2 4-4" /></>,
    add: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M2.5 20c0-3.5 2.4-5.5 6.5-5.5s6.5 2 6.5 5.5M16 5.5a3 3 0 0 1 0 5.8M17.5 14.5c2.5.7 4 2.4 4 5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function statusLabel(status) {
  return {
    WAITING: 'Waiting',
    CALLED: 'Called',
    IN_SERVICE: 'In service',
    DELAYED: 'Delayed',
    PAUSED: 'Paused',
  }[status] || status?.replaceAll('_', ' ').toLowerCase() || 'Active';
}

function formatCurrency(amount) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatActivityTime(timestamp) {
  const elapsedMinutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedMinutes < 1440) return `${Math.floor(elapsedMinutes / 60)}h ago`;
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Dashboard() {
  const { name: adminName } = useAuth();
  const showToast = useToast();
  const { data: shop, loading: shopLoading, error: shopError } = useAsync(fetchOwnShop);
  const { data: queue, loading: queueLoading, refetch: refetchQueue } = useAsync(fetchShopQueue);
  const { data: barbers, loading: barbersLoading } = useAsync(fetchShopBarbers);
  const { data: services } = useAsync(fetchOwnServices);
  const { data: summary } = useAsync(fetchShopDashboardSummary);
  const [sortBy, setSortBy] = useState('availability');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeQueue = queue || [];
  const activeBarbers = (barbers || []).filter((barber) => barber.status === 'ACTIVE');
  const onDutyBarbers = activeBarbers.filter((barber) => ['AVAILABLE', 'BUSY'].includes(barber.availability));
  const waitingEntries = activeQueue.filter((entry) => ['WAITING', 'CALLED'].includes(entry.status));
  const serviceById = useMemo(
    () => new Map((services || []).map((service) => [String(service.id || service._id), service])),
    [services]
  );
  const orderedBarbers = [...activeBarbers].sort((left, right) => {
    if (sortBy === 'name') return left.name.localeCompare(right.name);
    return left.availability.localeCompare(right.availability) || left.name.localeCompare(right.name);
  });

  let waitTotal = 0;
  const waitByEntry = new Map();
  waitingEntries.forEach((entry) => {
    const service = serviceById.get(String(entry.serviceId));
    if (!service) return;
    waitByEntry.set(entry.id, Math.round(waitTotal / Math.max(onDutyBarbers.length, 1)));
    waitTotal += service.estimatedDuration;
  });
  const waitEstimate = summary?.waitEstimate?.waitingCount ? summary.waitEstimate : null;
  const currentAverageWait = waitEstimate
    ? Math.round((waitEstimate.min + waitEstimate.max) / 2)
    : null;
  const location = shop?.address?.split(',').at(-1)?.trim() || shop?.address;
  const firstName = adminName?.trim().split(/\s+/)[0] || 'there';
  const availableServices = (services || []).filter((service) => service.status === 'ACTIVE');
  const activityEntries = summary?.recentActivity?.length ? summary.recentActivity : activeQueue;
  const activityItems = activityEntries
    .map((entry) => {
      const events = {
        WAITING: { title: 'Customer joined the queue', timestamp: entry.createdAt, marker: 'markGreen' },
        CALLED: { title: 'Customer called', timestamp: entry.updatedAt || entry.createdAt, marker: 'markGreen' },
        IN_SERVICE: { title: 'Barber started service', timestamp: entry.updatedAt || entry.createdAt, marker: 'markGreen' },
        DELAYED: { title: 'Wait estimate changed', timestamp: entry.updatedAt || entry.createdAt, marker: 'markOrange' },
        PAUSED: { title: 'Service paused', timestamp: entry.updatedAt || entry.createdAt, marker: 'markMuted' },
        COMPLETED: { title: 'Service completed', timestamp: entry.updatedAt || entry.createdAt, marker: 'markGreen' },
      };
      return { ...entry, ...(events[entry.status] || events.WAITING) };
    })
    .sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
    .slice(0, 4);

  async function handleAddWalkIn(event) {
    event.preventDefault();
    const chosenService = serviceId || availableServices[0]?.id || availableServices[0]?._id;
    if (!walkInName.trim() || !chosenService) return;
    setSubmitting(true);
    try {
      await addWalkIn({ walkInName: walkInName.trim(), serviceId: chosenService });
      showToast('Walk-in added to the queue');
      setWalkInName('');
      setServiceId('');
      setWalkInOpen(false);
      refetchQueue();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (shopLoading || queueLoading || barbersLoading) {
    return <div className={styles.loading}><Skeleton height={28} width={220} /><Skeleton height={120} /></div>;
  }

  if (shopError) {
    return <EmptyState title="Couldn't load your dashboard" body={shopError.message} />;
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{shop.name}{location ? ` · ${location}` : ''}</p>
          <h1>{greeting()}, {firstName}</h1>
          <p className={styles.intro}>Here's how {shop.name} is running right now.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.headerButton} to="/admin/analytics">Analytics</Link>
          <button className={`${styles.headerButton} ${styles.primaryButton}`} type="button" onClick={() => setWalkInOpen(true)}>
            <Icon name="add" /> Add walk-in
          </button>
        </div>
      </header>

      <section className={styles.statsGrid} aria-label="Today's statistics">
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Today's queue</span><span className={`${styles.statIcon} ${styles.iconPurple}`}><Icon name="queue" /></span></div>
          <strong>{activeQueue.length}</strong><small className={styles.captionPurple}>{waitingEntries.length} currently waiting</small>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Active barbers</span><span className={`${styles.statIcon} ${styles.iconGreen}`}><Icon name="barber" /></span></div>
          <strong>{onDutyBarbers.length} / {activeBarbers.length}</strong>
          <small className={styles.captionGreen}>{activeBarbers.length ? Math.round((onDutyBarbers.length / activeBarbers.length) * 100) : 0}% capacity</small>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Average wait</span><span className={`${styles.statIcon} ${styles.iconBlue}`}><Icon name="wait" /></span></div>
          <strong>{currentAverageWait === null ? '—' : `${currentAverageWait} min`}</strong>
          <small className={styles.captionGreen}>{waitEstimate ? `${waitEstimate.min}–${waitEstimate.max} min live estimate` : 'No customers waiting'}</small>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statTop}><span>Completed services</span><span className={`${styles.statIcon} ${styles.iconAmber}`}><Icon name="completed" /></span></div>
          <strong>{summary?.completedServices ?? '—'}</strong>
          <small className={styles.captionPurple}>{summary ? `${formatCurrency(summary.listedValue)} at listed prices` : 'Today'}</small>
        </article>
      </section>

      <div className={styles.contentGrid}>
        <section className={`${styles.panel} ${styles.queuePanel}`}>
          <div className={styles.panelHeader}>
            <div><h2>Today's queue</h2><p>Live customer flow</p></div>
            <Link className={styles.panelButton} to="/admin/queue">Manage queue <Icon name="arrow" /></Link>
          </div>
          {activeQueue.length ? (
            <div className={styles.queueList}>
              {activeQueue.slice(0, 6).map((entry) => (
                <div className={styles.queueRow} key={entry.id}>
                  <span className={styles.avatar}>{initials(entry.customerName)}</span>
                  <div className={styles.customer}><strong>{entry.customerName}</strong><span>{entry.serviceName || 'Service'}</span></div>
                  <span className={styles.eta}>
                    {ACTIVE_SERVICE_STATUSES.includes(entry.status)
                      ? 'In progress'
                      : waitByEntry.has(entry.id) ? (waitByEntry.get(entry.id) === 0 ? 'Next up' : `~${waitByEntry.get(entry.id)} min`) : '—'}
                  </span>
                  <span className={`${styles.status} ${styles[`status${entry.status}`] || ''}`}><i />{statusLabel(entry.status)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyQueue}><span className={styles.emptyIcon}><Icon name="queue" /></span><strong>No customers in the queue</strong><span>New arrivals will show here.</span></div>
          )}
          {activeQueue.length > 6 && <Link className={styles.queueFooter} to="/admin/queue">See all {activeQueue.length} customers <Icon name="arrow" /></Link>}
        </section>

        <div className={styles.sideStack}>
          <section className={`${styles.panel} ${styles.activityPanel}`}>
            <div className={styles.panelHeader}><div><h2>Live activity</h2><p>Current shop floor</p></div><span className={styles.livePill}><i />Live</span></div>
            <div className={styles.activityList}>
              {activityItems.length ? activityItems.map((item) => (
                <div className={styles.activityRow} key={`${item.id}-${item.status}`}>
                  <span className={`${styles.activityMark} ${styles[item.marker]}`} />
                  <div><strong>{item.title}</strong><span>{item.customerName} · {item.serviceName || 'Service'}</span></div>
                  <time className={styles.activityTime}>{formatActivityTime(item.timestamp)}</time>
                </div>
              )) : <p className={styles.noActivity}>No recent queue activity.</p>}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.actionsPanel} ${styles.quickPanel}`}>
            <div className={styles.panelHeader}><div><h2>Quick actions</h2><p>Keep the shop moving</p></div></div>
            <button className={`${styles.actionButton} ${styles.primaryAction}`} type="button" onClick={() => setWalkInOpen(true)}><Icon name="add" /><span>Add walk-in</span></button>
            <Link className={styles.actionButton} to="/admin/queue"><span className={styles.actionIcon}><Icon name="queue" /></span><span>Manage queue</span><Icon name="arrow" /></Link>
            <Link className={styles.actionButton} to="/admin/barbers"><span className={styles.actionIcon}><Icon name="team" /></span><span>Manage barbers</span><Icon name="arrow" /></Link>
          </section>
        </div>

        <section className={`${styles.panel} ${styles.barbersPanel}`}>
          <div className={styles.panelHeader}>
            <div><h2>Barbers on duty</h2><p>Status across today's shift</p></div>
            <label className={styles.sortControl}>Sort by
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="availability">Status</option><option value="name">Name</option>
              </select>
            </label>
          </div>
          {orderedBarbers.length ? (
            <div className={styles.barberGrid}>
              {orderedBarbers.map((barber) => {
                const currentEntry = activeQueue.find((entry) => entry.barberId === barber._id && ACTIVE_SERVICE_STATUSES.includes(entry.status));
                return <div className={styles.barberCard} key={barber._id}>
                  <span className={styles.barberAvatar}>{initials(barber.name)}</span>
                  <div className={styles.customer}><strong>{barber.name}</strong><span>{currentEntry ? `Serving ${currentEntry.customerName}` : barber.availability === 'AVAILABLE' ? 'Free right now' : barber.availability.replaceAll('_', ' ').toLowerCase()}</span></div>
                  <span className={`${styles.barberStatus} ${styles[`availability${barber.availability}`] || ''}`} title={barber.availability.replaceAll('_', ' ').toLowerCase()} />
                </div>;
              })}
            </div>
          ) : <p className={styles.noBarbers}>No barbers added yet.</p>}
        </section>
      </div>

      <Modal open={walkInOpen} onClose={() => setWalkInOpen(false)} title="Add walk-in">
        <form className={styles.walkInForm} onSubmit={handleAddWalkIn}>
          <Input label="Customer name" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} placeholder="Full name" />
          <label className={styles.formLabel} htmlFor="dashboard-service">Service</label>
          <select id="dashboard-service" className={styles.serviceSelect} value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            {availableServices.map((service) => <option key={service.id || service._id} value={service.id || service._id}>{service.name} · {service.estimatedDuration} min</option>)}
          </select>
          {!availableServices.length && <p className={styles.formHint}>Add an active service before creating a walk-in.</p>}
          <Button type="submit" fullWidth disabled={submitting || !availableServices.length || !walkInName.trim()}>{submitting ? 'Adding…' : 'Add to queue'}</Button>
        </form>
      </Modal>
    </div>
  );
}
