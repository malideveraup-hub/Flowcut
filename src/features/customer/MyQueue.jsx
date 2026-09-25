import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchMyQueue, cancelMyQueue } from '../../api/shopApi';
import { useToast } from '../../components/ui/ToastContext';
import QueueTicket from '../../components/customer/QueueTicket';
import ProgressStepper from '../../components/customer/ProgressStepper';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import Skeleton from '../../components/ui/Skeleton';
import styles from './MyQueue.module.css';

const STEP_INDEX = { JOINED: 0, WAITING: 1, CALLED: 2, IN_SERVICE: 2, DELAYED: 2, PAUSED: 2, COMPLETED: 3 };

export default function MyQueue() {
  const { data: entry, loading, error, refetch } = useAsync(fetchMyQueue);
  const navigate = useNavigate();
  const showToast = useToast();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (loading) {
    return <Skeleton height={220} />;
  }

  if (error) {
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

  return (
    <div>
      <p className={styles.sectionLabel}>My queue</p>

      <QueueTicket
        shopName={entry.shopName}
        position={entry.aheadCount + 1}
        waitMin={entry.wait.min}
        waitMax={entry.wait.max}
      />

      <ProgressStepper currentIndex={STEP_INDEX[entry.status] ?? 1} />

      <button className={styles.leaveLink} onClick={() => setLeaveOpen(true)}>
        Leave queue
      </button>

      <Modal skin="pixel" open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Leave queue?">
        <p style={{ marginBottom: 16 }}>You'll lose your spot at {entry.shopName}.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button skin="pixel" variant="secondary" onClick={() => setLeaveOpen(false)} disabled={leaving}>
            Stay in queue
          </Button>
          <Button skin="pixel" variant="destructive" onClick={handleLeave} disabled={leaving}>
            {leaving ? 'Leaving…' : 'Leave queue'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
