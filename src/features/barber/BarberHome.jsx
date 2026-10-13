import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import Modal from '../../components/ui/Modal';
import {
  fetchBarberDashboard,
  setMyAvailability,
  startService as startServiceRequest,
  finishService as finishServiceRequest,
  applyDelay as applyDelayRequest,
} from '../../api/barberApi';
import { useToast } from '../../components/ui/ToastContext';
import styles from './BarberHome.module.css';

const REFRESH_INTERVAL_MS = 15_000;
const SERVICE_TIME_STEPS = [3, 5, 10];
const TIMER_WARNING_SECONDS = 5 * 60;
const EMPTY_SERVICE_TIMER = Object.freeze({ entryId: null, sessionKey: null, elapsed: null, remaining: null, overtime: null });

function useServiceTimer(entryId, startedAt, baseMinutes, extraMinutes, serverNow) {
  const [timer, setTimer] = useState(EMPTY_SERVICE_TIMER);
  const sessionKey = JSON.stringify([entryId, startedAt, baseMinutes, extraMinutes]);

  useEffect(() => {
    if (!entryId || !startedAt) return undefined;
    const startedAtMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startedAtMs)) return undefined;
    const serverNowMs = serverNow ? new Date(serverNow).getTime() : NaN;
    const initialElapsedMs = Number.isFinite(serverNowMs)
      ? Math.max(0, serverNowMs - startedAtMs)
      : Math.max(0, Date.now() - startedAtMs);
    const monotonicStart = window.performance?.now?.() ?? Date.now();
    const totalMinutes = Number(baseMinutes) + (Number(extraMinutes) || 0);
    if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return undefined;
    const totalSeconds = totalMinutes * 60;
    const tick = () => {
      const monotonicNow = window.performance?.now?.() ?? Date.now();
      const elapsed = Math.max(0, Math.floor((initialElapsedMs + monotonicNow - monotonicStart) / 1000));
      setTimer({
        entryId,
        sessionKey,
        elapsed,
        remaining: Math.max(0, totalSeconds - elapsed),
        overtime: Math.max(0, elapsed - totalSeconds),
      });
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [entryId, startedAt, baseMinutes, extraMinutes, serverNow, sessionKey]);

  return entryId && timer.entryId === entryId && timer.sessionKey === sessionKey
    ? timer
    : EMPTY_SERVICE_TIMER;
}

function Icon({ name, className }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, 'aria-hidden': true };
  const paths = {
    cut: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8.5 8.5 12 12m-12-5 12-12" /></>,
    play: <path d="m8 5 11 7-11 7z" />,
    check: <path d="m5 12 5 5L20 7" />,
    coffee: <><path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z" /><path d="M17 10h2a2 2 0 0 1 0 4h-2M7 3v2m4-2v2" /></>,
    people: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-4 3-6 7-6s7 2 7 6m0-15.5a3.5 3.5 0 0 1 0 7M18 14c2.5.6 4 2.5 4 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.5-3" /></>,
  };

  return <svg {...common} className={className}>{paths[name]}</svg>;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDuration(totalSeconds) {
  if (totalSeconds === null) return '--:--';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatUpdatedAgo(value, now) {
  if (!value) return 'Live';
  const updated = new Date(value).getTime();
  if (!Number.isFinite(updated)) return 'Live';
  const seconds = Math.max(0, Math.round((now - updated) / 1000));
  return `Live · updated ${seconds < 5 ? 'just now' : `${seconds}s ago`}`;
}

function LoadingState() {
  return (
    <div className={styles.loadingGrid} aria-label="Loading barber workspace">
      <div className={styles.loadingHero} />
      <div className={styles.loadingQueue} />
    </div>
  );
}

function QueueEntryRow({ entry, index, highlighted = false }) {
  const called = entry.status === 'CALLED';
  const position = entry.queuePosition || index + 1;
  return (
    <li className={`${styles.queueRow} ${highlighted ? styles.queueRowNext : ''}`}>
      <span className={styles.position}>{`#${position}`}</span>
      <div className={styles.queueCopy}>
        <strong>{entry.customerName || 'Customer'}</strong>
        <span>{entry.serviceName || 'Service not specified'}</span>
      </div>
      <span className={`${styles.badge} ${called ? styles.badgePurple : styles.badgeAmber}`}>
        {called ? 'Called' : 'Waiting'}
      </span>
    </li>
  );
}

export default function BarberHome() {
  const { data, loading, error, updatedAt, refetch } = useAsync(fetchBarberDashboard);
  const showToast = useToast();
  const navigate = useNavigate();
  const [pendingAction, setPendingAction] = useState('');
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [wallClock, setWallClock] = useState(0);
  const [timerAnnouncement, setTimerAnnouncement] = useState('');
  const actionPendingRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const finishButtonRef = useRef(null);
  const confirmFinishRef = useRef(null);
  const previousTimerStateRef = useRef({ entryId: null, state: 'normal' });
  const current = data?.current;
  const serviceTimer = useServiceTimer(
    current?.id,
    current?.startedAt,
    current?.baseMinutes,
    current?.extraMinutes,
    data?.serverNow
  );
  const timerState = !current || serviceTimer.remaining === null
    ? 'normal'
    : serviceTimer.remaining <= 0
      ? 'over'
      : serviceTimer.remaining <= TIMER_WARNING_SECONDS
        ? 'warning'
        : 'normal';

  useEffect(() => {
    const timer = window.setInterval(() => setWallClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (previousTimerStateRef.current.entryId !== current?.id) {
      previousTimerStateRef.current = { entryId: current?.id || null, state: 'normal' };
    }
    const previous = previousTimerStateRef.current.state;
    if (timerState === 'warning' && previous !== 'warning') setTimerAnnouncement('Less than five minutes left in the estimated service time.');
    if (timerState === 'over' && previous !== 'over') setTimerAnnouncement('Estimated service time exceeded. The service is still in progress.');
    if (timerState === 'normal' && previous !== 'normal') setTimerAnnouncement('Service time returned within the estimate.');
    previousTimerStateRef.current.state = timerState;
  }, [current?.id, timerState]);

  const syncDashboard = useCallback(async ({ quiet = true } = {}) => {
    await refetch({ quiet, throwOnError: true });
  }, [refetch]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible' || actionPendingRef.current || refreshPendingRef.current) return;
      refreshPendingRef.current = true;
      void syncDashboard()
        .catch(() => {})
        .finally(() => { refreshPendingRef.current = false; });
    };
    const timer = window.setInterval(refreshWhenVisible, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [syncDashboard]);

  async function runAction(actionName, action, successMessage) {
    if (actionPendingRef.current) return;
    actionPendingRef.current = true;
    setPendingAction(actionName);

    try {
      const result = await action();
      const message = typeof successMessage === 'function' ? successMessage(result) : successMessage;
      try {
        await syncDashboard();
        showToast(message);
      } catch {
        showToast(`${message} The workspace couldn't refresh; try again shortly.`, 'error');
      }
    } catch (actionError) {
      // A failed response can arrive after the server committed a change.
      // Re-read the authoritative state before showing the error.
      try {
        await syncDashboard();
      } catch {
        // The banner below keeps the last confirmed view and offers retry.
      }
      if (actionError.status === 401) {
        navigate('/login', { replace: true });
      } else if (actionError.status === 409 && actionName !== 'break') {
        showToast('This entry was already updated. Showing the latest.', 'error');
      } else {
        showToast("That didn't go through. Please try again.", 'error');
      }
    } finally {
      actionPendingRef.current = false;
      setPendingAction('');
    }
  }

  if (loading && !data) return <LoadingState />;

  if (error?.status === 401) {
    return (
      <section className={styles.errorCard} role="alert">
        <span className={styles.errorIcon}><Icon name="refresh" /></span>
        <h1>Your session has expired</h1>
        <p>Sign in again to load your barber workspace.</p>
        <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => navigate('/login', { replace: true })}>
          Sign in again
        </button>
      </section>
    );
  }

  if (error && !data) {
    return (
      <section className={styles.errorCard} role="alert">
        <span className={styles.errorIcon}><Icon name="refresh" /></span>
        <h1>We couldn't load your workspace</h1>
        <p>{error.message || 'Check your connection and try again.'}</p>
        <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void refetch()}>
          Try again
        </button>
      </section>
    );
  }

  const barber = data?.barber;
  const upNext = data?.upNext || [];
  const onBreak = barber?.availability === 'ON_BREAK';
  const isBusy = Boolean(pendingAction);
  const next = upNext[0];
  const remainingQueue = current ? upNext : upNext.slice(1);
  const statusLabel = current
    ? current.status === 'PAUSED' ? 'Paused' : 'In service'
    : onBreak ? 'On break' : 'Available';
  const currentEstimate = current
    ? Number(current.baseMinutes) + (Number(current.extraMinutes) || 0)
    : null;
  const progress = currentEstimate && serviceTimer.elapsed !== null
    ? Math.min(100, (serviceTimer.elapsed / (currentEstimate * 60)) * 100)
    : 0;

  function finishService() {
    if (!current || actionPendingRef.current) return;
    setFinishConfirmationOpen(false);
    const customerName = current.customerName || 'Customer';
    void runAction(
      'finish',
      () => finishServiceRequest(current.id),
      (result) => `Service finished for ${customerName} · ${Number.isFinite(result?.actualMinutes) ? result.actualMinutes : '—'} min`
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.welcome}>
        <div>
          <p className={styles.eyebrow}>Barber workspace</p>
          <h1>{getGreeting()}, {barber?.name || 'Barber'}</h1>
          {data?.shopName && <p className={styles.shopName}>{data.shopName}</p>}
        </div>
        <div className={styles.welcomeActions}>
          <span className={styles.syncStatus}>
            <span className={styles.liveDot} />
            {formatUpdatedAgo(updatedAt, wallClock)}
          </span>
          <button
            className={`${styles.button} ${onBreak ? styles.buttonPrimary : styles.buttonSecondary}`}
            disabled={isBusy || Boolean(current)}
            title={current ? 'Finish the current service before taking a break.' : undefined}
            onClick={() => runAction(
              'break',
              () => setMyAvailability(onBreak ? 'AVAILABLE' : 'ON_BREAK'),
              onBreak ? 'Break ended' : 'You are on a break'
            )}
          >
            {isBusy && pendingAction === 'break' ? <span className={styles.spinner} /> : <Icon name={onBreak ? 'play' : 'coffee'} />}
            {onBreak ? 'End break' : 'Take a break'}
          </button>
        </div>
      </section>

      {error && data && (
        <div className={styles.syncWarning} role="status">
          <span>Couldn't refresh the queue. Showing the last confirmed update.</span>
          <button type="button" onClick={() => void syncDashboard().catch(() => {})}>Try again</button>
        </div>
      )}
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">{timerAnnouncement}</span>

      <div className={styles.summary} aria-label="Workspace status">
        <div className={styles.summaryPill}>
          <span>Status</span>
          <strong className={current
            ? timerState === 'over' ? styles.statusRed : timerState === 'warning' ? styles.statusAmber : styles.statusGreen
            : onBreak ? styles.statusAmber : ''}
          >
            {timerState === 'over' ? 'Estimated time exceeded' : statusLabel}
          </strong>
        </div>
        <div className={styles.summaryPill}>
          <span>In queue</span>
          <strong>{upNext.length}</strong>
        </div>
        {next && (
          <div className={styles.summaryPill}>
            <span>Next</span>
            <strong className={styles.summaryNext}>{next.customerName || 'Customer'}</strong>
          </div>
        )}
      </div>

      <div className={styles.columns}>
        <section className={`${styles.heroCard} ${current ? styles.heroActive : ''}`} aria-label={current ? 'Current customer' : 'Next customer'}>
          {current ? (
            <>
              <div className={styles.cardHeading}>
                <span className={styles.sectionLabel}><span className={styles.liveDot} />Current customer</span>
                <span className={`${styles.badge} ${timerState === 'over' ? styles.badgeRed : timerState === 'warning' || current.status === 'DELAYED' ? styles.badgeAmber : styles.badgeGreen}`}>
                  {timerState === 'over' ? 'Estimated time exceeded' : statusLabel}
                </span>
              </div>
              <h2 className={styles.customerName}>
                {current.customerName || 'Customer'}
                {current.queuePosition && <span className={styles.queueNumber}>#{String(current.queuePosition).padStart(2, '0')}</span>}
              </h2>
              <p className={styles.serviceName}><Icon name="cut" />{current.serviceName || 'Service not specified'}</p>

              <div className={styles.timerBox}>
                <span className={styles.mutedLabel}>{timerState === 'over' ? 'Estimated time exceeded' : 'Estimated time remaining'}</span>
                <strong
                  className={`${styles.timer} ${timerState === 'over' ? styles.timerOver : timerState === 'warning' ? styles.timerWarning : ''}`}
                  role="timer"
                  aria-live="off"
                >
                  {timerState === 'over' ? '00:00' : formatDuration(serviceTimer.remaining)}
                </strong>
                <div className={styles.timeMeta}>
                  <span>Started <b>{formatClock(current.startedAt)}</b></span>
                  {serviceTimer.elapsed !== null && <span>Elapsed <b>{formatDuration(serviceTimer.elapsed)}</b></span>}
                  {currentEstimate && <span>Total estimate <b>{currentEstimate} min</b></span>}
                </div>
                {currentEstimate && (
                  <>
                    <div className={`${styles.progress} ${timerState === 'over' ? styles.progressOverTrack : timerState === 'warning' ? styles.progressWarning : ''}`} aria-label={`${Math.round(progress)} percent of estimated service time elapsed`}>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    {timerState === 'warning' && <p className={styles.warningNote}>Less than 5 minutes left</p>}
                    {timerState === 'over' && <p className={styles.overNote}>Overtime: {formatDuration(serviceTimer.overtime)}</p>}
                  </>
                )}
                {!current.startedAt && <p className={styles.delayNote}>The recorded start time isn't available for this service.</p>}
              </div>

              <div className={styles.adjustTime}>
                <span className={styles.mutedLabel}>Need more time? Adjust the estimate</span>
                <div className={styles.adjustButtons}>
                  {SERVICE_TIME_STEPS.map((minutes) => (
                    <button
                      className={`${styles.button} ${styles.buttonSmall}`}
                      key={minutes}
                      type="button"
                      disabled={isBusy}
                      onClick={() => runAction('delay', () => applyDelayRequest(current.id, minutes), `Added ${minutes} min to the estimate`)}
                    >
                      {isBusy && pendingAction === 'delay' ? <span className={styles.spinner} /> : `+${minutes} min`}
                    </button>
                  ))}
                </div>
              </div>

              <button
                className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonBig}`}
                type="button"
                ref={finishButtonRef}
                disabled={isBusy}
                onClick={() => setFinishConfirmationOpen(true)}
              >
                {isBusy && pendingAction === 'finish' ? <span className={styles.spinner} /> : <Icon name="check" />}
                {isBusy && pendingAction === 'finish' ? 'Finishing…' : 'Finish service'}
              </button>
            </>
          ) : next ? (
            <>
              <div className={styles.cardHeading}>
                <span className={styles.sectionLabel}><Icon name="people" />Next customer</span>
                <span className={`${styles.badge} ${next.status === 'CALLED' ? styles.badgePurple : styles.badgeAmber}`}>
                  {next.status === 'CALLED' ? 'Called' : 'Waiting'}
                </span>
              </div>
              <p className={styles.idleHeading}>No service in progress</p>
              <p className={styles.queuePosition}>Queue position #{next.queuePosition || 1}</p>
              <h2 className={styles.customerName}>{next.customerName || 'Customer'}</h2>
              <p className={styles.serviceName}><Icon name="cut" />{next.serviceName || 'Service not specified'}</p>
              {data?.shopName && <p className={styles.assignment}><span>Assigned shop</span><b>{data.shopName}</b></p>}
              {onBreak && <p className={styles.breakHint}>End your break when you're ready to start serving.</p>}
              <button
                className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonBig}`}
                type="button"
                disabled={isBusy || onBreak}
                onClick={() => runAction('start', () => startServiceRequest(next.id), `Started service for ${next.customerName || 'Customer'}`)}
              >
                {isBusy && pendingAction === 'start' ? <span className={styles.spinner} /> : <Icon name="play" />}
                {isBusy && pendingAction === 'start' ? 'Starting…' : 'Start service'}
              </button>
            </>
          ) : (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Icon name={onBreak ? 'coffee' : 'people'} /></span>
              <h2>{onBreak ? 'You are on a break' : 'No customers waiting right now'}</h2>
              <p>{onBreak ? 'End your break when you are ready to serve customers again.' : 'New customers will appear here when they join the queue.'}</p>
            </div>
          )}
        </section>

        <section className={styles.queueCard} aria-label="Customers up next">
          <div className={styles.queueHeader}>
            <div>
              <p className={styles.sectionLabel}>{current ? 'Up next' : 'More in queue'}</p>
              <h2>{remainingQueue.length ? 'Queue' : !current && next ? 'After the next customer' : 'Queue is clear'}</h2>
            </div>
            <span className={styles.countBadge}>{upNext.length} in queue</span>
          </div>
          {remainingQueue.length ? (
            <>
              <ol className={styles.queueList}>
                {remainingQueue.map((entry, index) => (
                  <QueueEntryRow key={entry.id} entry={entry} index={current ? index : index + 1} highlighted={current ? index === 0 : false} />
                ))}
              </ol>
              <p className={styles.queueNote}>Customer turn notifications continue through the shop queue.</p>
            </>
          ) : (
            <div className={styles.queueEmpty}>
              <strong>
                {current
                  ? 'No one is waiting behind this customer'
                  : next ? 'The next customer is shown on the service card' : 'No customers waiting right now'}
              </strong>
              <span>New queue entries will show here automatically.</span>
            </div>
          )}
        </section>
      </div>
      <Modal
        skin="barber"
        open={finishConfirmationOpen}
        onClose={() => setFinishConfirmationOpen(false)}
        title={`Finish service for ${current?.customerName || 'Customer'}?`}
        initialFocusRef={confirmFinishRef}
      >
        <p className={styles.confirmCopy}>
          This ends the service and records the finish time. Elapsed so far: {formatDuration(serviceTimer.elapsed)}.
        </p>
        <div className={styles.confirmActions}>
          <button
            className={styles.button}
            type="button"
            onClick={() => setFinishConfirmationOpen(false)}
            disabled={isBusy}
          >
            Cancel
          </button>
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            type="button"
            ref={confirmFinishRef}
            onClick={finishService}
            disabled={isBusy}
          >
            {isBusy && pendingAction === 'finish' ? 'Finishing…' : 'Finish service'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
