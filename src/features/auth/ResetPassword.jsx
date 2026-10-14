import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { rateLimitMessage, resetPasswordRequest } from '../../api/authApi';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { validateConfirmPassword, validatePassword } from '../../validation/authValidation';
import styles from './Auth.module.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current || !token) return;

    const nextErrors = {
      password: validatePassword(form.password),
      confirm: validateConfirmPassword(form.password, form.confirm),
    };
    setErrors(nextErrors);
    setError('');
    if (Object.values(nextErrors).some(Boolean)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await resetPasswordRequest({ token, password: form.password });
      setSuccess(true);
    } catch (requestError) {
      setErrors((current) => ({ ...current, ...(requestError.fieldErrors || {}) }));
      setError(rateLimitMessage(requestError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setError('');
  }

  const invalidLink = !/^[a-f\d]{64}$/i.test(token);

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>FLOWCUT</div>
        <h1 className={styles.title}>Set a new password</h1>

        {success ? (
          <div className={styles.resetSuccess} role="status">
            <p>Your password has been reset. You can now sign in with your new password.</p>
            <Link to="/login">Back to login</Link>
          </div>
        ) : invalidLink ? (
          <>
            <p className={styles.loginError} role="alert">This reset link is invalid. Request a new one to continue.</p>
            <Link to="/forgot-password">Request another reset link</Link>
          </>
        ) : (
          <>
            {error && <p className={styles.loginError} role="alert">{error}</p>}
            {error && <div className={styles.links}><Link to="/forgot-password">Request a new reset link</Link><span /></div>}
            <form onSubmit={handleSubmit} noValidate>
              <Input
                label="New password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                error={errors.password}
              />
              <Input
                label="Confirm password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => updateField('confirm', event.target.value)}
                error={errors.confirm}
              />
              <Button type="submit" fullWidth disabled={submitting}>
                {submitting ? 'Resetting...' : 'Reset password'}
              </Button>
            </form>
          </>
        )}

        {!success && (
          <div className={styles.links}>
            <Link to="/login">Back to login</Link>
            <span />
          </div>
        )}
      </div>
    </div>
  );
}
