import { useEffect, useRef, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { useToast } from '../ui/ToastContext';
import { validateServiceForm } from '../../utils/serviceFormValidation';
import { acquireServiceSubmission, releaseServiceSubmission } from '../../utils/serviceSubmissionLock';

const EMPTY_FORM = { name: '', estimatedDuration: '', price: '' };

export default function AddServiceModal({ open, onClose, onCreate, onUpdate, service = null, onCreated, successMessage }) {
  const showToast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const editing = Boolean(service && onUpdate);

  useEffect(() => {
    if (!open) return;
    setForm(service ? {
      name: service.name || '',
      estimatedDuration: String(service.estimatedDuration ?? ''),
      price: String(service.price ?? ''),
    } : EMPTY_FORM);
    setErrors({});
  }, [open, service]);

  function closeModal() {
    if (!submittingRef.current) onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    const validationErrors = validateServiceForm(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;

    if (!acquireServiceSubmission(submittingRef)) return;
    setSubmitting(true);
    try {
      const fields = {
        name: form.name.trim(),
        estimatedDuration: Number(form.estimatedDuration),
        price: Number(form.price),
      };
      const savedService = editing
        ? await onUpdate(service._id, fields)
        : await onCreate(fields);
      showToast(successMessage || (editing ? 'Service updated' : 'Service added'));
      setForm(EMPTY_FORM);
      setErrors({});
      onClose();
      try {
        await onCreated?.(savedService);
      } catch {
        showToast('Service saved, but the list could not refresh. Try refreshing it shortly.', 'error');
      }
    } catch (error) {
      if (error.fieldErrors) setErrors(error.fieldErrors);
      else showToast(error.message || `Could not ${editing ? 'update' : 'add'} service. Please try again.`, 'error');
    } finally {
      releaseServiceSubmission(submittingRef);
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={closeModal} title={editing ? 'Edit service' : 'Add service'}>
      <form onSubmit={handleSubmit} noValidate>
        <Input
          label="Service name"
          value={form.name}
          maxLength={100}
          required
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          error={errors.name}
        />
        <Input
          label="Duration (minutes)"
          type="number"
          min="1"
          max="480"
          step="1"
          value={form.estimatedDuration}
          required
          onChange={(event) => setForm((current) => ({ ...current, estimatedDuration: event.target.value }))}
          error={errors.estimatedDuration}
        />
        <Input
          label="Price (₱)"
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          value={form.price}
          required
          onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
          error={errors.price}
        />
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? (editing ? 'Saving…' : 'Adding…') : (editing ? 'Save changes' : 'Add service')}
        </Button>
      </form>
    </Modal>
  );
}
