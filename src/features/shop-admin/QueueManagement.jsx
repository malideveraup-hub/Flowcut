import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchShopQueue, fetchOwnServices, addWalkIn, skipQueueEntry, cancelQueueEntry } from '../../api/shopAdminApi';
import { QUEUE_STATUS_META } from '../../api/congestion';
import Table from '../../components/ui/Table';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './QueueManagement.module.css';

export default function QueueManagement() {
  const { data: queue, loading, error, refetch } = useAsync(fetchShopQueue);
  const { data: services } = useAsync(fetchOwnServices);
  const showToast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ walkInName: '', serviceId: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeServices = (services || []).filter((s) => s.status === 'ACTIVE');

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
      refetch();
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
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleCancel(row) {
    try {
      await cancelQueueEntry(row.id);
      showToast(`${row.customerName} cancelled`);
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const columns = [
    { key: 'customerName', header: 'Customer' },
    { key: 'serviceName', header: 'Service' },
    { key: 'barberName', header: 'Barber', render: (row) => row.barberName || '—' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const meta = QUEUE_STATUS_META[row.status] || { label: row.status, level: 'moderate' };
        return <StatusBadge skin="clean" level={meta.level} label={meta.label} />;
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.status === 'WAITING' ? (
          <div className={styles.actions}>
            <button className={styles.action} onClick={() => handleSkip(row)}>
              Skip
            </button>
            <button className={styles.actionDanger} onClick={() => handleCancel(row)}>
              Cancel
            </button>
          </div>
        ) : (
          <span className={styles.viewLink}>—</span>
        ),
    },
  ];

  if (loading) return <Skeleton height={220} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  const activeQueue = (queue || []).filter((e) => e.status === 'WAITING' || ['IN_SERVICE', 'DELAYED', 'PAUSED'].includes(e.status));

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Queue</h1>
          <p className={styles.sub}>{activeQueue.length} in queue</p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          + Add walk-in
        </Button>
      </div>

      <Table columns={columns} rows={activeQueue} emptyMessage="The queue is empty right now." />

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
            <label className={styles.label} htmlFor="service">
              Service
            </label>
            <select
              id="service"
              className={styles.select}
              value={form.serviceId}
              onChange={(e) => setForm((f) => ({ ...f, serviceId: e.target.value }))}
            >
              {activeServices.map((s) => (
                <option key={s.id || s._id} value={s.id || s._id}>
                  {s.name} · {s.estimatedDuration} min
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Adding…' : 'Add to queue'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
