import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useAsync } from '../../hooks/useAsync';
import { fetchOwnShop, updateOwnShop } from '../../api/shopAdminApi';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/ToastContext';
import styles from './ShopAdminManagement.module.css';

const toForm = (shop) => ({
  name: shop.name || '',
  address: shop.address || '',
  contactPhone: shop.contact?.phone || '',
  openingTime: shop.operatingHours?.openingTime || '',
  closingTime: shop.operatingHours?.closingTime || '',
});

function validate(form) {
  const errors = {};
  const name = form.name.trim();
  const address = form.address.trim();
  const phone = form.contactPhone.trim();
  if (!name) errors.name = 'Shop name is required.';
  else if (name.length < 2 || name.length > 100) errors.name = 'Shop name must be 2-100 characters.';
  if (!address) errors.address = 'Address is required.';
  else if (address.length > 200) errors.address = 'Address is too long.';
  if (!phone) errors.contactPhone = 'Contact number is required.';
  else if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) errors.contactPhone = 'Enter a valid contact number.';
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(form.openingTime) || !timePattern.test(form.closingTime)) errors.operatingHours = 'Set valid opening and closing times in 24-hour format.';
  else if (form.openingTime >= form.closingTime) errors.operatingHours = 'Closing time must be after opening time.';
  return errors;
}

export default function ShopSettings() {
  const { data: shop, loading, error } = useAsync(fetchOwnShop);
  const showToast = useToast();
  const [form, setForm] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!shop) return;
    const initial = toForm(shop);
    setForm(initial);
    setSavedForm(initial);
  }, [shop]);

  const isDirty = useMemo(() => Boolean(form && savedForm && JSON.stringify(form) !== JSON.stringify(savedForm)), [form, savedForm]);
  const blocker = useBlocker(isDirty && !saving);

  useEffect(() => {
    if (!isDirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  const updateField = useCallback((field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({
      ...current,
      [field]: undefined,
      ...(field === 'openingTime' || field === 'closingTime' ? { openingTime: undefined, closingTime: undefined, operatingHours: undefined } : {}),
    }));
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    if (!form || savingRef.current) return;
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await updateOwnShop({
        name: form.name.trim(),
        address: form.address.trim(),
        contactPhone: form.contactPhone.trim(),
        openingTime: form.openingTime,
        closingTime: form.closingTime,
      });
      const nextForm = toForm(updated);
      setForm(nextForm);
      setSavedForm(nextForm);
      setErrors({});
      showToast('Settings saved');
    } catch (err) {
      if (err.fieldErrors) {
        const nextErrors = { ...err.fieldErrors };
        if (nextErrors.operatingHours) {
          nextErrors.closingTime = nextErrors.operatingHours;
          delete nextErrors.operatingHours;
        }
        setErrors(nextErrors);
      } else showToast(err.message || 'Could not save settings.', 'error');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function resetForm() {
    if (!savedForm || saving) return;
    setForm({ ...savedForm });
    setErrors({});
  }

  if (loading || !form) return <Skeleton height={300} />;
  if (error) return <p className={`${styles.notice} ${styles.errorNotice}`} role="alert">{error.message || 'Could not load shop settings.'}</p>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>Workspace</p>
          <h1 className={styles.title}>Shop settings</h1>
          <p className={styles.sub}>{shop.name}</p>
        </div>
      </header>
      <form className={`${styles.panel} ${styles.form}`} onSubmit={handleSave} noValidate>
        <div className={styles.settingsGrid}>
          <section className={styles.settingsGroup} aria-labelledby="shop-details-heading">
            <h2 className={styles.groupTitle} id="shop-details-heading">Shop details</h2>
            <Input label="Shop name" value={form.name} maxLength={100} onChange={(event) => updateField('name', event.target.value)} error={errors.name} />
            <Input label="Address" value={form.address} maxLength={200} onChange={(event) => updateField('address', event.target.value)} error={errors.address} />
            <Input label="Contact number" type="tel" value={form.contactPhone} onChange={(event) => updateField('contactPhone', event.target.value)} error={errors.contactPhone} />
          </section>
          <section className={styles.settingsGroup} aria-labelledby="operating-hours-heading">
            <h2 className={styles.groupTitle} id="operating-hours-heading">Operating hours</h2>
            <Input label="Opening time" type="time" value={form.openingTime} onChange={(event) => updateField('openingTime', event.target.value)} error={errors.openingTime} />
            <Input label="Closing time" type="time" value={form.closingTime} onChange={(event) => updateField('closingTime', event.target.value)} error={errors.closingTime || errors.operatingHours} />
            <p className={styles.cardSub}>Use 24-hour time. Closing time must be later than opening time.</p>
          </section>
        </div>
        <div className={styles.saveBar}>
          <span className={isDirty ? styles.dirtyLabel : styles.cleanLabel} role="status">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
          <div className={styles.formActions}>
            <button className={styles.actionButton} type="button" onClick={resetForm} disabled={!isDirty || saving}>Reset</button>
            <Button type="submit" disabled={saving || !isDirty}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </div>
      </form>

      <Modal open={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title="Discard unsaved changes?">
        <p className={styles.modalCopy}>Your shop settings have unsaved changes. Leave this page and discard them?</p>
        <div className={styles.formActions}>
          <button className={styles.actionButton} type="button" onClick={() => blocker.reset?.()}>Stay on page</button>
          <button className={`${styles.actionButton} ${styles.dangerButton}`} type="button" onClick={() => blocker.proceed?.()}>Leave without saving</button>
        </div>
      </Modal>
    </div>
  );
}
