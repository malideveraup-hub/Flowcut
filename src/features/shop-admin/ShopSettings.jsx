import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchOwnShop, updateOwnShop } from '../../api/shopAdminApi';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './Dashboard.module.css';

export default function ShopSettings() {
  const { data: shop, loading, error, refetch } = useAsync(fetchOwnShop);
  const showToast = useToast();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shop) {
      setForm({
        name: shop.name,
        address: shop.address,
        contactPhone: shop.contact?.phone || '',
        openingTime: shop.operatingHours?.openingTime || '',
        closingTime: shop.operatingHours?.closingTime || '',
      });
    }
  }, [shop]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await updateOwnShop(form);
      showToast('Settings saved');
      refetch();
    } catch (err) {
      if (err.fieldErrors) setErrors(err.fieldErrors);
      else showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) return <Skeleton height={300} />;
  if (error) return <p style={{ color: 'var(--staff-danger)' }}>{error.message}</p>;

  return (
    <div>
      <h1 className={styles.title}>Shop settings</h1>
      <p className={styles.sub}>{shop.name}</p>

      <div className={styles.panel} style={{ maxWidth: 420 }}>
        <form onSubmit={handleSave} noValidate>
          <Input
            label="Shop name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            error={errors.name}
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            error={errors.address}
          />
          <Input
            label="Contact number"
            value={form.contactPhone}
            onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
            error={errors.contactPhone}
          />
          <Input
            label="Opening time"
            type="time"
            value={form.openingTime}
            onChange={(e) => setForm((f) => ({ ...f, openingTime: e.target.value }))}
            error={errors.operatingHours}
          />
          <Input
            label="Closing time"
            type="time"
            value={form.closingTime}
            onChange={(e) => setForm((f) => ({ ...f, closingTime: e.target.value }))}
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </form>
      </div>
    </div>
  );
}
