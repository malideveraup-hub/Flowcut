import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchShopBarbers, createBarber, updateBarberStatus } from '../../api/shopAdminApi';
import Table from '../../components/ui/Table';
import StatusBadge from '../../components/ui/StatusBadge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import { filterPhoneInput, filterNameInput } from '../../utils/inputFilters';
import styles from './Dashboard.module.css';

const AVAILABILITY_META = {
  AVAILABLE: { label: 'Available', level: 'low' },
  BUSY: { label: 'Busy', level: 'moderate' },
  ON_BREAK: { label: 'On break', level: 'moderate' },
  OFFLINE: { label: 'Offline', level: 'high' },
};

const EMPTY_FORM = { name: '', mobileNumber: '', password: '' };

export default function BarberManagement() {
  const { data: barbers, loading, error, refetch } = useAsync(fetchShopBarbers);
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
      await createBarber(form);
      showToast('Barber account created');
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

  async function handleStatusChange(barberId, status) {
    try {
      await updateBarberStatus(barberId, { status });
      refetch();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const columns = [
    { key: 'name', header: 'Barber' },
    {
      key: 'availability',
      header: 'Availability',
      render: (row) => {
        const meta = AVAILABILITY_META[row.availability] || { label: row.availability, level: 'moderate' };
        return <StatusBadge skin="clean" level={meta.level} label={meta.label} />;
      },
    },
    { key: 'status', header: 'Employment', render: (row) => (row.status === 'ACTIVE' ? 'Active' : 'Inactive') },
    {
      key: 'toggle',
      header: '',
      render: (row) => (
        <button
          className={styles.linkButton}
          onClick={() => handleStatusChange(row._id, row.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE')}
        >
          {row.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        </button>
      ),
    },
  ];

  if (loading) return <Skeleton height={200} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className={styles.title}>Barbers</h1>
          <p className={styles.sub}>{(barbers || []).length} staff</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          + Add barber
        </Button>
      </div>

      {error && <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>}

      <div className={styles.panel}>
        <Table columns={columns} rows={(barbers || []).map((b) => ({ ...b, id: b._id }))} emptyMessage="No barbers added yet." />
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add barber">
        <p style={{ fontSize: 13, color: 'var(--staff-secondary)', marginTop: -8, marginBottom: 16 }}>
          This creates a real login account for your barber, using a Philippine mobile number (09XXXXXXXXX).
        </p>
        <form onSubmit={handleAdd} noValidate>
          <Input
            label="Barber name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: filterNameInput(e.target.value) }))}
            error={errors.name}
          />
          <Input
            label="Mobile number"
            placeholder="09171234567"
            value={form.mobileNumber}
            onChange={(e) => setForm((f) => ({ ...f, mobileNumber: filterPhoneInput(e.target.value) }))}
            error={errors.mobileNumber}
          />
          <Input
            label="Temporary password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            error={errors.password}
          />
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Creating…' : 'Create barber account'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
