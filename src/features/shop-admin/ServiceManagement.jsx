import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchOwnServices, createService, setServiceStatus } from '../../api/shopAdminApi';
import Table from '../../components/ui/Table';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Dashboard.module.css';

const EMPTY_FORM = { name: '', estimatedDuration: '', price: '' };

export default function ServiceManagement() {
  const { data: services, loading, error, refetch } = useAsync(fetchOwnServices);
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      await createService({
        name: form.name,
        estimatedDuration: Number(form.estimatedDuration),
        price: Number(form.price),
      });
      showToast('Service added');
      setForm(EMPTY_FORM);
      setOpen(false);
      refetch();
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      else showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(service) {
    const nextStatus = service.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await setServiceStatus(service._id, nextStatus);
      showToast(`${service.name} marked ${nextStatus.toLowerCase()}`);
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const columns = [
    { key: 'name', header: 'Service' },
    { key: 'estimatedDuration', header: 'Duration', render: (r) => `${r.estimatedDuration} min` },
    { key: 'price', header: 'Price', render: (r) => `₱${r.price}` },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <button className={styles.linkButton} onClick={() => toggleStatus(r)}>
          {r.status === 'ACTIVE' ? 'Active' : 'Inactive'}
        </button>
      ),
    },
  ];

  if (loading) return <Skeleton height={200} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className={styles.title}>Services</h1>
          <p className={styles.sub}>{(services || []).length} services</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          + Add service
        </Button>
      </div>

      {error && <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>}

      <div className={styles.panel}>
        <Table columns={columns} rows={(services || []).map((s) => ({ ...s, id: s._id }))} emptyMessage="No services yet." />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add service">
        <form onSubmit={handleAdd} noValidate>
          <Input
            label="Service name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
                <Input
        label="Duration (minutes)"
        type="number"
        min="1"
        step="1"
        value={form.estimatedDuration}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '' || Number(value) >= 1) {
            setForm((f) => ({ ...f, estimatedDuration: value }));
          }
        }}
        error={errors.estimatedDuration}
      />

      <Input
        label="Price (₱)"
        type="number"
        min="0"
        step="0.01"
        value={form.price}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '' || Number(value) >= 0) {
            setForm((f) => ({ ...f, price: value }));
          }
        }}
        error={errors.price}
      />
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Adding…' : 'Add service'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
