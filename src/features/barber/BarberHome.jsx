import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import {
  fetchBarberDashboard,
  setMyAvailability,
  startService as startServiceRequest,
  finishService as finishServiceRequest,
  applyDelay as applyDelayRequest,
} from '../../api/barberApi';
import { useToast } from '../../components/ui/ToastContext';
import Button from '../../components/ui/Button';
import Timer from '../../components/staff/Timer';
import QuickActionChip from '../../components/staff/QuickActionChip';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './BarberHome.module.css';

function useElapsedSeconds(startedAtIso) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!startedAtIso) {
      setSeconds(0);
      return;
    }
    const startedAt = new Date(startedAtIso).getTime();
    function tick() {
      setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  return seconds;
}

export default function BarberHome() {
  const { data, loading, error, refetch } = useAsync(fetchBarberDashboard);
  const showToast = useToast();
  const elapsed = useElapsedSeconds(data?.current?.startedAt);

  async function runAction(action, successMessage) {
    try {
      await action();
      if (successMessage) showToast(successMessage);
      await refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton height={16} width={160} style={{ marginBottom: 16 }} />
        <Skeleton height={160} style={{ marginBottom: 16 }} />
        <Skeleton height={48} />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Couldn't load your dashboard" body={error.message} />;
  }

  const { barber, current, upNext } = data;
  const onBreak = barber?.availability === 'ON_BREAK';

  if (onBreak) {
    return (
      <div className={styles.breakScreen}>
        <p className={styles.breakLabel}>On break</p>
        <p className={styles.breakSub}>Back in a few minutes</p>
        <Button
          size="lg"
          fullWidth
          skin="clean"
          variant="success"
          onClick={() => runAction(() => setMyAvailability('AVAILABLE'), 'Back on the floor')}
        >
          Resume
        </Button>
      </div>
    );
  }

  if (!current) {
    const next = upNext[0];
    return (
      <div>
        <p className={styles.greeting}>Good afternoon, {barber?.name}</p>
        {next ? (
          <div className={styles.nextCard}>
            <p className={styles.nextLabel}>Next customer</p>
            <p className={styles.nextName}>{next.customerName}</p>
            <p className={styles.nextService}>{next.serviceName}</p>
            <Button
              size="lg"
              fullWidth
              skin="clean"
              onClick={() =>
                runAction(() => startServiceRequest(next.id), `Service started for ${next.customerName}`)
              }
            >
              Start service
            </Button>
          </div>
        ) : (
          <EmptyState title="Queue is empty" body="No one is waiting right now." />
        )}
        <button
          className={styles.breakLink}
          onClick={() => runAction(() => setMyAvailability('ON_BREAK'), 'Marked as on break')}
        >
          Take a break
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className={styles.greeting}>Good afternoon, {barber?.name}</p>
      <div className={styles.currentCard}>
        <p className={styles.currentLabel}>Current customer</p>
        <p className={styles.currentName}>{current.customerName}</p>
        <p className={styles.currentService}>{current.serviceName}</p>
        <Timer seconds={elapsed} />
        <Button
          size="lg"
          fullWidth
          skin="clean"
          variant="success"
          onClick={() =>
            runAction(() => finishServiceRequest(current.id), `Marked ${current.customerName} as finished`)
          }
        >
          Finish service
        </Button>
      </div>

      <div className={styles.quickRow}>
        <QuickActionChip onClick={() => runAction(() => applyDelayRequest(current.id, 5), '+5 min delay logged')}>
          +5 min
        </QuickActionChip>
        <QuickActionChip onClick={() => runAction(() => applyDelayRequest(current.id, 10), '+10 min delay logged')}>
          +10 min
        </QuickActionChip>
        <QuickActionChip onClick={() => runAction(() => applyDelayRequest(current.id, 15), '+15 min delay logged')}>
          +15 min
        </QuickActionChip>
      </div>

      <p className={styles.upNextLabel}>Up next</p>
      {upNext.length === 0 && <p className={styles.noneWaiting}>No one waiting yet.</p>}
      {upNext.map((entry) => (
        <div className={styles.row} key={entry.id}>
          <div>
            <div className={styles.rowName}>{entry.customerName}</div>
            <div className={styles.rowService}>{entry.serviceName}</div>
          </div>
          <div className={styles.rowBadge}>{entry.source === 'reservation' ? 'Reserved' : 'Walk-in'}</div>
        </div>
      ))}
    </div>
  );
}
