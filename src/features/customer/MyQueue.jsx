import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { checkInMyQueue, fetchMyQueue, cancelMyQueue } from '../../api/shopApi';
import { useToast } from '../../components/ui/ToastContext';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './MyQueue.module.css';

const QUEUE_STATUS = {
  JOINED: { label: 'Joining queue', title: 'You are checked in', progress: 18 },
  WAITING: { label: 'Live queue', title: 'You are in line', progress: 32 },
  CALLED: { label: 'You are next', title: 'Please stay nearby', progress: 68 },
  IN_SERVICE: { label: 'In service', title: 'Your service has started', progress: 90 },
  DELAYED: { label: 'Running late', title: 'Your barber is running behind', progress: 42 },
  PAUSED: { label: 'Queue paused', title: 'The queue is temporarily paused', progress: 32 },
};

const QUEUE_REFRESH_MS = 15_000;

function formatDeadline(value) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export default function MyQueue() {
  const { data: entry, loading, error, refetch } = useAsync(fetchMyQueue);
  const navigate = useNavigate();
  const showToast = useToast();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    const refreshQueue = () => {
      if (document.visibilityState === 'visible') void refetch({ quiet: true });
    };
    const timer = window.setInterval(refreshQueue, QUEUE_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshQueue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshQueue);
    };
  }, [refetch]);

  if (loading) {
    return <Skeleton height={220} />;
  }

  if (error && !entry) {
    return <EmptyState skin="pixel" title="Couldn't load your queue" body={error.message} />;
  }

  if (!entry) {
    return (
      <EmptyState
        skin="pixel"
        title="You're not in any queue"
        body="Find a shop and join a queue to see your live position here."
        actionLabel="Discover shops"
        onAction={() => navigate('/discover')}
      />
    );
  }

  const position = entry.aheadCount + 1;
  const queueStatus = QUEUE_STATUS[entry.status] || QUEUE_STATUS.WAITING;
  const shopName = entry.shopName || entry.shop?.name || 'Your shop';
  const serviceName = entry.serviceName || entry.service?.name || 'Selected service';
  const barberName = entry.barberName || entry.barber?.name || null;
  const waitLabel = entry.status === 'CALLED' || entry.status === 'IN_SERVICE'
    ? 'Ready soon'
    : `${entry.wait.min}–${entry.wait.max} min`;
  const positionLabel = entry.status === 'IN_SERVICE' ? 'Now' : `#${position}`;

  async function handleLeave() {
    setLeaving(true);
    try {
      await cancelMyQueue();
      setLeaveOpen(false);
      navigate('/discover');
    } catch (err) {
      setLeaveOpen(false);
      showToast(err.message, 'error');
      refetch();
    } finally {
      setLeaving(false);
    }
  }

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      await checkInMyQueue();
      await refetch({ quiet: true });
      showToast('Your arrival is confirmed.');
    } catch (err) {
      showToast(err.message, 'error');
      await refetch({ quiet: true });
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <p className={styles.eyebrow}>CUSTOMER</p>
        <h1>My queue</h1>
      </header>

      <div className={styles.stack}>
        <section className={styles.shopCard} aria-label="Checked-in shop">
          <div className={styles.shopMark} aria-hidden="true">{shopName.charAt(0)}</div>
          <div className={styles.shopCopy}>
            <h2>{shopName}</h2>
            <p>{serviceName}</p>
          </div>
          <span className={styles.checkedIn}><span aria-hidden="true" />{entry.arrivedAt || entry.status === 'IN_SERVICE' ? 'Arrived' : 'In queue'}</span>
        </section>

        <section className={styles.queueHero} aria-label="Live queue status">
          <div className={styles.heroTop}>
            <span className={styles.liveBadge}><span aria-hidden="true" />{queueStatus.label}</span>
            <span className={styles.statusWord}>{entry.status.replaceAll('_', ' ')}</span>
          </div>
          <div className={styles.stats}>
            <div>
              <p className={styles.statLabel}>Your position</p>
              <p className={styles.position}>{positionLabel}</p>
            </div>
            <div className={styles.waitStat}>
              <p className={styles.statLabel}>Estimated wait</p>
              <p className={styles.wait}>{waitLabel}</p>
            </div>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Queue progress"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={queueStatus.progress}
          >
            <span style={{ width: `${queueStatus.progress}%` }} />
          </div>
          <div className={styles.heroMessage}>
            <strong>{queueStatus.title}</strong>
            <span>
              {entry.status === 'IN_SERVICE'
                ? 'Your barber is taking care of you now.'
                : entry.status === 'CALLED'
                  ? entry.arrivedAt
                    ? 'Your arrival is confirmed. Stay nearby while the shop team prepares your service.'
                    : 'Head over to the shop and check in before your arrival deadline.'
                  : entry.aheadCount === 0
                    ? 'You are first in line. Keep an eye on your queue status.'
                    : `${entry.aheadCount} ${entry.aheadCount === 1 ? 'customer is' : 'customers are'} ahead of you.`}
            </span>
          </div>
        </section>

        <section className={styles.barberCard} aria-label="Your barber">
          <div className={styles.barberAvatar} aria-hidden="true">
            {barberName ? barberName.charAt(0) : '?'}
          </div>
          <div className={styles.barberCopy}>
            <p>Your barber</p>
            <h2>{barberName || 'Not assigned yet'}</h2>
          </div>
          <span className={styles.barberStatus}>
            {entry.status === 'IN_SERVICE' ? 'In service' : barberName ? 'Assigned' : 'Pending'}
          </span>
        </section>

        <section className={styles.detailsCard} aria-label="Queue details">
          <div className={styles.detailsHeading}>
            <h2>Queue details</h2>
            <span className={styles.statusPill}>{queueStatus.label}</span>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>Service</dt>
              <dd>{serviceName}</dd>
            </div>
            <div>
              <dt>People ahead</dt>
              <dd>{entry.aheadCount}</dd>
            </div>
            <div>
              <dt>Wait range</dt>
              <dd>{entry.wait.min}–{entry.wait.max} min</dd>
            </div>
            {entry.arrivalDeadlineAt && entry.status === 'CALLED' && (
              <div>
                <dt>Arrival deadline</dt>
                <dd><time dateTime={entry.arrivalDeadlineAt}>{formatDeadline(entry.arrivalDeadlineAt)}</time></dd>
              </div>
            )}
          </dl>
          {entry.status === 'CALLED' && (
            <div className={styles.arrivalNotice}>
              <div>
                <strong>{entry.arrivedAt ? 'Arrival confirmed' : 'Please arrive now'}</strong>
                <span>
                  {entry.arrivedAt
                    ? 'Your place is secured. Stay nearby for your turn.'
                    : entry.arrivalDeadlineAt
                    ? `Check in by ${formatDeadline(entry.arrivalDeadlineAt)} to keep your place.`
                    : 'You are next. Check in when you arrive at the shop.'}
                </span>
              </div>
              {!entry.arrivedAt && (
                <Button skin="pixel" onClick={handleCheckIn} disabled={checkingIn}>
                  {checkingIn ? 'Checking in…' : 'I’m at the shop'}
                </Button>
              )}
            </div>
          )}
        </section>

        <div className={styles.leaveRow}>
          <button className={styles.leaveButton} onClick={() => setLeaveOpen(true)}>
            Leave queue
          </button>
        </div>
      </div>

      <Modal skin="pixel" open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Leave queue?">
        <p style={{ marginBottom: 16 }}>You'll lose your spot at {shopName}.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button skin="pixel" variant="secondary" onClick={() => setLeaveOpen(false)} disabled={leaving}>
            Stay in queue
          </Button>
          <Button skin="pixel" variant="destructive" onClick={handleLeave} disabled={leaving}>
            {leaving ? 'Leaving…' : 'Leave queue'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}
